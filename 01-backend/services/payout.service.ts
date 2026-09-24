import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import {
  Payout,
  PayoutStatus,
  PayoutTrigger,
} from '../entities/payout.entity';
import {
  PayoutSchedule,
  PayoutCadence,
} from '../entities/payoutSchedule.entity';
import { PaystackService } from './paystack.service';
import { applyPayoutTransition } from './tenantBalance.service';

/**
 * Dimension 15 — Payouts.
 *
 * One row per outgoing Paystack Transfer. The available-balance
 * formula is:
 *
 *   available = Σ tenant_net(transactions) − Σ amount(payouts WHERE status IN ('pending','processing','paid'))
 *
 * where tenant_net = amount − commissionAmount. We only consider
 * TOPUP / PRINT transactions (REFUND is already a debit, CREDIT is
 * internal adjustment, both flow through `amount` naturally).
 */

/** Returns the tenant's available payout balance in NGN. */
export async function getAvailableBalance(
  tenantId: string,
): Promise<number> {
  const txRepo = AppDataSource.getRepository(Transaction);
  const payoutRepo = AppDataSource.getRepository(Payout);

  const txTotal = await txRepo
    .createQueryBuilder('tx')
    .select(
      `COALESCE(SUM(CAST(tx.amount AS REAL) - CAST(tx.commissionAmount AS REAL)), 0)`,
      'net',
    )
    .where('tx.tenantId = :tid', { tid: tenantId })
    .andWhere('tx.type IN (:...types)', {
      types: [
        TransactionType.TOPUP,
        TransactionType.PRINT,
        TransactionType.REFUND,
      ],
    })
    .getRawOne<{ net: string }>();

  const payoutTotal = await payoutRepo
    .createQueryBuilder('p')
    .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, 'total')
    .where('p.tenantId = :tid', { tid: tenantId })
    .andWhere('p.status IN (:...states)', {
      states: [
        PayoutStatus.PENDING,
        PayoutStatus.PROCESSING,
        PayoutStatus.PAID,
      ],
    })
    .getRawOne<{ total: string }>();

  const balance = Number(txTotal?.net ?? 0) - Number(payoutTotal?.total ?? 0);
  return Math.max(0, Math.round(balance * 100) / 100);
}

/**
 * Find every tenant whose schedule fires today and whose available
 * balance crosses the minimum. Run by the scheduled worker daily.
 */
export async function processDuePayouts(now: Date = new Date()): Promise<{
  considered: number;
  processed: number;
  skipped: number;
  failed: number;
}> {
  const dayOfWeek = now.getUTCDay();
  const scheduleRepo = AppDataSource.getRepository(PayoutSchedule);
  const tenantRepo = AppDataSource.getRepository(Tenant);

  // Daily schedules always fire; weekly fire when dayOfWeek matches;
  // manual schedules never auto-fire.
  const dueSchedules = await scheduleRepo
    .createQueryBuilder('s')
    .where(
      `(s.cadence = :daily) OR (s.cadence = :weekly AND s.dayOfWeek = :dow)`,
      {
        daily: PayoutCadence.DAILY,
        weekly: PayoutCadence.WEEKLY,
        dow: dayOfWeek,
      },
    )
    .getMany();

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const schedule of dueSchedules) {
    try {
      const tenant = await tenantRepo.findOne({
        where: { id: schedule.tenantId },
      });
      if (!tenant || tenant.status !== TenantStatus.ACTIVE) {
        skipped++;
        continue;
      }
      if (!schedule.recipientCode) {
        // Tenant hasn't added a bank account yet — skip silently. The
        // onboarding checklist surfaces this to the tenant.
        skipped++;
        continue;
      }
      const available = await getAvailableBalance(schedule.tenantId);
      if (available < Number(schedule.minPayoutAmount)) {
        skipped++;
        continue;
      }
      await initiatePayout({
        tenantId: schedule.tenantId,
        amount: available,
        recipientCode: schedule.recipientCode,
        trigger: PayoutTrigger.SCHEDULED,
      });
      processed++;
    } catch (err) {
      console.error(
        `[payouts] failed for tenant ${schedule.tenantId}:`,
        err,
      );
      failed++;
    }
  }

  return {
    considered: dueSchedules.length,
    processed,
    skipped,
    failed,
  };
}

/**
 * Initiate one transfer. Writes a Payout row in PROCESSING state
 * immediately so concurrent scheduler ticks don't double-pay.
 * The webhook flips it to PAID or FAILED.
 */
export async function initiatePayout(opts: {
  tenantId: string;
  amount: number;
  recipientCode: string;
  trigger: PayoutTrigger;
  notes?: string;
}): Promise<Payout> {
  const paystack = new PaystackService();
  const payoutRepo = AppDataSource.getRepository(Payout);

  // Create the row first (PENDING). If the API call fails, the row
  // stays PENDING with a failureReason; if it succeeds, we flip to
  // PROCESSING and record the reference. Webhook does the final
  // transition.
  let payout = await payoutRepo.save(
    payoutRepo.create({
      tenantId: opts.tenantId,
      amount: opts.amount,
      feeAmount: 0,
      currency: 'NGN',
      status: PayoutStatus.PENDING,
      trigger: opts.trigger,
      paystackTransferReference: null,
      failureReason: null,
      requestedAt: new Date(),
      paidAt: null,
      notes: opts.notes ?? null,
    }),
  );

  const previousStatus = PayoutStatus.PENDING;
  try {
    const { reference, status } = await paystack.initiateTransfer({
      amountKobo: Math.floor(opts.amount * 100),
      recipientCode: opts.recipientCode,
      reason: `PrintLoop payout ${payout.id}`,
      reference: `PAY_${payout.id}`,
    });
    payout.paystackTransferReference = reference;
    payout.status =
      status === 'success' ? PayoutStatus.PAID : PayoutStatus.PROCESSING;
    if (status === 'success') payout.paidAt = new Date();
    payout = await payoutRepo.save(payout);
    // Update the denormalised rollup. Best-effort.
    try {
      await applyPayoutTransition(opts.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
  } catch (err: any) {
    payout.status = PayoutStatus.FAILED;
    payout.failureReason =
      err?.response?.data?.message || err?.message || 'Unknown error';
    payout = await payoutRepo.save(payout);
    try {
      await applyPayoutTransition(opts.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
    throw err;
  }
  return payout;
}

/**
 * Apply a `transfer.success` or `transfer.failed` webhook to the
 * matching Payout row. Idempotent on the reference.
 */
export async function applyTransferWebhook(event: {
  type: 'transfer.success' | 'transfer.failed' | 'transfer.reversed';
  reference: string;
  failureReason?: string;
}): Promise<{ updated: boolean }> {
  const payoutRepo = AppDataSource.getRepository(Payout);
  const payout = await payoutRepo.findOne({
    where: { paystackTransferReference: event.reference },
  });
  if (!payout) return { updated: false };

  const previousStatus = payout.status;

  if (event.type === 'transfer.success' && payout.status !== PayoutStatus.PAID) {
    payout.status = PayoutStatus.PAID;
    payout.paidAt = new Date();
    await payoutRepo.save(payout);
    try {
      await applyPayoutTransition(payout.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
    // payout.paid webhook (Dimension 14 — V2-15).
    try {
      const { emitTenantEvent } = await import('./tenantWebhook.service');
      const { WebhookEvent } = await import('../entities/tenantWebhook.entity');
      emitTenantEvent(payout.tenantId, WebhookEvent.PAYOUT_PAID, {
        payoutId: payout.id,
        amount: Number(payout.amount),
        feeAmount: Number(payout.feeAmount),
        currency: payout.currency,
        reference: payout.paystackTransferReference,
        paidAt: payout.paidAt,
      });
    } catch (e) {
      console.error('[webhook] payout.paid emit failed:', e);
    }
    return { updated: true };
  }
  if (
    (event.type === 'transfer.failed' || event.type === 'transfer.reversed') &&
    payout.status !== PayoutStatus.FAILED
  ) {
    payout.status = PayoutStatus.FAILED;
    payout.failureReason = event.failureReason ?? null;
    await payoutRepo.save(payout);
    try {
      await applyPayoutTransition(payout.tenantId, payout, previousStatus);
    } catch (e) {
      console.error('[tenant_balance] applyPayoutTransition failed:', e);
    }
    return { updated: true };
  }
  return { updated: false };
}
