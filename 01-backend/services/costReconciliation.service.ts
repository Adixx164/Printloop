import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Payment } from '../entities/payment.entity';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { computeCost } from './pricing.service';
import { computeCommissionSplit } from './commission.service';
import { applyTransactionDelta } from './tenantBalance.service';
import { PaystackService } from './paystack.service';
import { Like, type EntityManager } from 'typeorm';

// ─────────────────────────────────────────────────────────────────────────
// Pricing reconciliation (V2-52, card-only V2-53).
//
// The customer is charged the ESTIMATE (`PrintJob.cost`) at checkout via
// Paystack. The render worker then counts the real pages and calls back
// with the authoritative count. Money settles against the SAVED CARD:
//
//   finalCost < cost  → the overage is WRITTEN OFF (V2-53: refunds are
//                       eliminated). The tenant ledger is reversed by
//                       the overage's commission slice so the tenant is
//                       only ever credited the final cost; the customer
//                       keeps the difference with us.
//   finalCost > cost  → left as a SHORTFALL on the job. The kiosk
//                       release gate (settleShortfall) charges the
//                       customer's saved Paystack card for the delta at
//                       pickup — the customer is physically present
//                       then, which is the natural moment to collect.
//   equal             → nothing to do.
//
// Jobs with NO Payment row (CUPS desktop-print ingress) skip the gate
// entirely — best-effort billing, matching the pre-V2-53 behaviour.
//
// Idempotency: the first render callback wins (`finalCost IS NULL`),
// and the gate refuses to double-charge (checks for an existing DELTA
// transaction before hitting Paystack).
// ─────────────────────────────────────────────────────────────────────────

export interface RenderCostResult {
  updated: boolean;
  reason?: string;
  finalCost?: number;
  delta?: number;
  action?: 'none' | 'write-off' | 'shortfall';
}

export interface ShortfallSettlement {
  settled: boolean;
  reason?: string;
  /** NGN still owed when not settled (or what was collected when settled). */
  shortfall?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Find the Payment row for a PrintJob. Paystack-path payments use
 * `job.paymentReference`; legacy wallet-path rows used the release
 * code as reference. Falls back across both.
 */
async function findPayment(em: EntityManager, job: PrintJob): Promise<Payment | null> {
  const repo = em.getRepository(Payment);
  if (job.paymentReference) {
    const p = await repo.findOne({ where: { reference: job.paymentReference } });
    if (p) return p;
  }
  if (job.code) {
    const p = await repo.findOne({ where: { reference: job.code } });
    if (p) return p;
  }
  return null;
}

/**
 * Compute the authoritative cost for a job from the renderer's page
 * count, using the same pricing engine every ingress path uses
 * (computeCost → PricingConfig matrix → flat-rate fallback).
 */
async function computeFinalCost(job: PrintJob, pageCount: number): Promise<number> {
  const cfg: any = job.printConfiguration || {};
  return computeCost({
    pageCount,
    paper: cfg.paper,
    color: cfg.color === 'color' ? 'color' : 'bw',
    sided: cfg.sided === 'double' ? 'double' : 'single',
    qualityDpi: [100, 300, 600].includes(Number(cfg.qualityDpi))
      ? (Number(cfg.qualityDpi) as 100 | 300 | 600)
      : 300,
    copies: Number(cfg.copies) || 1,
  });
}

/**
 * The render-worker success callback body: flip RENDERING → READY,
 * stamp the authoritative final cost, and — when the customer
 * overpaid — reverse the tenant ledger for the write-off slice.
 *
 * Atomic: the status flip, finalCost and reconciliation stamps commit
 * or roll back together — a mid-way failure leaves the job in
 * RENDERING so BullMQ's retry re-runs the whole callback.
 *
 * The tenant-balance reversal (best-effort, after the transaction) is
 * deliberately outside the atomic block: it maintains a denormalised
 * rollup row that `recomputeFromScratch` can rebuild from the
 * Transaction rows, so a hiccup there must not fail the callback.
 */
export async function applyRenderCostReconciliation(
  job: PrintJob,
  opts: {
    pageCount: number;
    renderedKey: string;
    renderedPdfUrl: string;
    previewImageUrls: string[];
    bytes: number;
    durationMs?: number;
  },
): Promise<RenderCostResult> {
  const isFirstCallback = job.finalCost == null;
  const finalCost = await computeFinalCost(job, opts.pageCount);
  const paid = Math.max(0, Number(job.cost) || 0);
  const delta = round2(finalCost - paid);

  await AppDataSource.transaction(async (em) => {
    job.totalPages = opts.pageCount;
    job.renderedKey = opts.renderedKey;
    job.renderedPdfUrl = opts.renderedPdfUrl;
    job.previewImageUrls = opts.previewImageUrls;
    job.renderingStatus = 'ready';
    job.renderingCompletedAt = new Date();
    // V2-58: marketplace jobs stop at awaiting_accept (the operator
    // accepts from the shop console); everyone else goes straight to
    // READY as before.
    job.status = job.requiresAccept
      ? PrintJobStatus.AWAITING_ACCEPT
      : PrintJobStatus.READY;
    if (isFirstCallback) {
      job.finalCost = finalCost;
      job.costReconciledAt = new Date();
    }
    await em.save(PrintJob, job);
  });

  // Write-off slice: reverse the tenant's ledger credit for the part
  // the customer never gets charged. Best-effort — mirrors
  // completePrintJobPayment's pattern.
  if (isFirstCallback && delta < 0 && job.tenantId) {
    const writeOff = -delta;
    try {
      const tenant = await AppDataSource.getRepository(Tenant).findOne({
        where: { id: job.tenantId },
      });
      if (tenant) {
        const split = computeCommissionSplit(tenant, writeOff);
        await applyTransactionDelta(job.tenantId, -writeOff, -split.commissionAmount);
      }
    } catch (e) {
      console.error('[reconcile] tenant ledger write-off reversal failed:', e);
    }
  }

  return {
    updated: true,
    finalCost,
    delta,
    action: delta < 0 ? 'write-off' : delta > 0 ? 'shortfall' : 'none',
  };
}

/**
 * NGN the customer still owes on a job, or 0. Positive only after the
 * render callback stamped a finalCost ABOVE what was paid. The release
 * gate uses this before dispatching to the printer.
 */
export function shortfallFor(job: PrintJob): number {
  if (job.finalCost == null) return 0;
  return Math.max(0, round2(Number(job.finalCost) - Number(job.cost || 0)));
}

/**
 * Release gate: charge the shortfall to the customer's saved Paystack
 * card.
 *
 *   - no shortfall / not reconciled           → pass through (the
 *     caller should just release)
 *   - no Payment row (CUPS ingress)           → pass through
 *     (best-effort billing — the job was never charged anything)
 *   - card on file, charge succeeds           → PRINT Transaction on
 *     the ledger bucket, tenant ledger credit, Payment bump,
 *     job.cost → finalCost. The gate never fires again.
 *   - no card on file / charge declined       → { settled: false,
 *     reason: 'no-card-on-file' | 'charge-failed', shortfall } → the
 *     caller returns 402 PAYMENT_DUE and the customer retries the
 *     release (or an admin resolves).
 *
 * Idempotent against double-charge: a successful settle writes
 * `job.cost = finalCost` (shortfall → 0), and if the crash window is
 * hit (charged but not recorded), a prior DELTA_ transaction for this
 * job is detected and treated as settled.
 */
export async function settleShortfall(printJobId: string): Promise<ShortfallSettlement> {
  const jobRepo = AppDataSource.getRepository(PrintJob);
  const job = await jobRepo.findOne({ where: { id: printJobId } });
  if (!job) return { settled: false, reason: 'not-found' };

  const shortfall = shortfallFor(job);
  if (shortfall <= 0) return { settled: false, reason: 'no-shortfall' };

  const payment = await findPayment(AppDataSource.manager, job);
  if (!payment) return { settled: false, reason: 'no-payment', shortfall };

  // Crash-window guard: if a previous attempt charged the card but
  // crashed before recording, don't charge it again.
  const deltaTxRepo = AppDataSource.getRepository(Transaction);
  const prior = await deltaTxRepo.findOne({
    where: { reference: Like(`DELTA_${job.id}_%`) },
  });
  if (prior) {
    job.cost = Number(job.finalCost);
    await jobRepo.save(job);
    return { settled: true, shortfall };
  }

  const user = job.userId
    ? await AppDataSource.getRepository(User).findOne({ where: { id: job.userId } })
    : null;
  if (!user) return { settled: false, reason: 'no-user', shortfall };
  if (!payment.authorizationCode) {
    return { settled: false, reason: 'no-card-on-file', shortfall };
  }

  const tenant = job.tenantId
    ? await AppDataSource.getRepository(Tenant).findOne({ where: { id: job.tenantId } })
    : null;
  const reference = `DELTA_${job.id}_${Date.now()}`;

  const paystack = new PaystackService();
  let charge;
  try {
    charge = await paystack.chargeAuthorization({
      authorizationCode: payment.authorizationCode,
      amountNaira: shortfall,
      email: user.email,
      reference,
      tenant,
      metadata: { jobId: job.id, printJobId: job.id },
    });
  } catch (err: any) {
    console.error('[reconcile] charge_authorization call failed:', err?.message);
    return { settled: false, reason: 'charge-failed', shortfall };
  }

  const status: string | undefined = charge?.status;
  if (status !== 'success') {
    console.error(
      `[reconcile] delta charge declined for job ${job.id}: ${status} ${
        charge?.gateway_response || charge?.message || ''
      }`,
    );
    return { settled: false, reason: 'charge-failed', shortfall };
  }

  const commissionAmount = tenant
    ? computeCommissionSplit(tenant, shortfall).commissionAmount
    : 0;

  await AppDataSource.transaction(async (em) => {
    const wallet = job.userId
      ? await em.findOne(Wallet, { where: { userId: job.userId! } })
      : null;
    if (wallet) {
      await em.save(
        Transaction,
        em.create(Transaction, {
          walletId: wallet.id,
          tenantId: job.tenantId,
          type: TransactionType.PRINT,
          amount: shortfall,
          commissionAmount,
          description: `Print price adjustment (${job.fileName || 'job'}) — final cost`,
          balanceAfter: Number(wallet.balance),
          reference,
        }),
      );
    }

    // The debt is settled: paid now equals final. finalCost stays as
    // the audit record; the gate derives the shortfall from the
    // difference, which is now 0.
    job.cost = job.finalCost!;
    await em.save(PrintJob, job);

    payment.amount = round2(Number(payment.amount) + shortfall);
    await em.save(Payment, payment);
  });

  if (tenant && job.tenantId) {
    try {
      await applyTransactionDelta(job.tenantId, shortfall, commissionAmount);
    } catch (e) {
      console.error('[reconcile] tenant ledger credit failed:', e);
    }
  }

  return { settled: true, shortfall };
}
