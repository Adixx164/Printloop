import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Payment } from '../entities/payment.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Wallet } from '../entities/wallet.entity';
import { Tenant } from '../entities/tenant.entity';
import { makeCode } from '../utils/releaseCode';
import { enqueueRenderOrReady } from './renderEnqueue.service';
import { applyTransactionDelta } from './tenantBalance.service';
import { computeCommissionSplit } from './commission.service';

/**
 * Transition a print job from PENDING to READY (or RENDERING) upon payment completion.
 * Reconciles Paystack split commissions, records ledger events, and dispatches the
 * job for cloud rendering.
 */
export async function completePrintJobPayment(
  jobId: string,
  reference: string,
  opts?: { authorizationCode?: string | null },
): Promise<{ success: boolean; code?: string }> {
  const result = await AppDataSource.transaction(async (em) => {
    const job = await em.findOne(PrintJob, {
      where: { id: jobId },
      relations: ['user'],
    });

    if (!job) {
      throw new Error(`Print job ${jobId} not found`);
    }

    if (job.status !== PrintJobStatus.PENDING) {
      // Already paid or processed
      return { success: true, code: job.code || undefined };
    }

    // 1. Release code. CUPS-ingress jobs mint theirs at creation so the
    //    code is already visible in `lpq` before payment — reuse it so the
    //    user's printed instructions never change. Web jobs have none yet,
    //    so mint one here as before.
    const code = job.code || makeCode(6);
    job.code = code;

    // V2-58: marketplace shops (discoverable, not the legacy tenant) get
    // the Bolt-style accept window — the job waits in awaiting_accept
    // for the operator's OK before it becomes READY, and auto-reroutes
    // if nobody accepts in time.
    let requiresAccept = false;
    if (job.tenantId) {
      const tenant = await em.findOne(Tenant, { where: { id: job.tenantId } });
      requiresAccept = Boolean(tenant?.isDiscoverable);
    }
    job.requiresAccept = requiresAccept;
    job.paymentReference = reference;
    job.status = PrintJobStatus.PENDING; // Keep in PENDING inside the transaction so enqueueRender can promote it
    await em.save(PrintJob, job);

    // 2. Resolve tenant to compute commission splits
    let commissionAmount = 0;
    if (job.tenantId) {
      const tenant = await em.findOne(Tenant, { where: { id: job.tenantId } });
      if (tenant) {
        const split = computeCommissionSplit(tenant, Number(job.cost));
        commissionAmount = split.commissionAmount;
      }
    }

    // 3. Create Payment record (with the saved-card authorization code
    //    so the release gate can charge deltas — V2-53)
    const payment = em.create(Payment, {
      tenantId: job.tenantId,
      userId: job.userId,
      amount: job.cost,
      status: 'SUCCESS',
      method: 'card', // or card/transfer/ussd default
      reference,
      description: job.fileName || 'Direct Print Payment',
      authorizationCode: opts?.authorizationCode ?? null,
    } as any);
    await em.save(Payment, payment);

    // 4. Create Transaction record for the tenant's earnings
    if (job.userId) {
      const wallet = await em.findOne(Wallet, { where: { userId: job.userId } });
      if (wallet) {
        const transaction = em.create(Transaction, {
          walletId: wallet.id,
          tenantId: job.tenantId,
          type: TransactionType.PRINT,
          amount: job.cost, // positive for tenant earnings
          commissionAmount,
          description: `Direct Print: ${job.fileName}`,
          balanceAfter: Number(wallet.balance), // wallet balance wasn't changed
          reference,
        });
        await em.save(Transaction, transaction);
      }
    }

    // 5. Update tenant balance
    if (job.tenantId) {
      try {
        await applyTransactionDelta(job.tenantId, Number(job.cost), commissionAmount);
      } catch (e) {
        console.error('[tenant_balance] applyTransactionDelta failed in completePrintJobPayment:', e);
      }
    }

    // 6. Trigger notifications (Termii SMS or email with the code)
    if (job.user) {
      const message = `Your PrintLoop code is: ${code}. Release your print at the kiosk.`;

      // Try sending SMS best-effort
      if (job.user.phoneNumber) {
        try {
          const { SMSService } = await import('./sms.service');
          const sms = new SMSService();
          await sms.sendPrintJobCode({
            phoneNumber: job.user.phoneNumber,
            jobCode: code,
            fileName: job.fileName || 'Document',
            cost: Number(job.cost),
          });
        } catch (smsErr) {
          console.warn('[notifications] Failed to send SMS:', smsErr);
        }
      }

      // Try sending email best-effort
      if (job.user.email) {
        try {
          const { EmailService } = await import('./email.service');
          const emailService = new EmailService();
          await emailService.send({
            to: job.user.email,
            subject: 'Your PrintLoop Release Code',
            text: message,
            html: `<p>Your PrintLoop code is: <strong>${code}</strong>.</p><p>Release your print at the kiosk.</p>`,
          });
        } catch (emailErr) {
          console.warn('[notifications] Failed to send email:', emailErr);
        }
      }
    }

    return { success: true, code };
  });

  if (result.success) {
    // 7. Enqueue render pipeline outside the transaction to avoid lock holding
    try {
      await enqueueRenderOrReady(jobId);
    } catch (e) {
      console.error('Failed to enqueue render for paid job:', e);
    }
    // 8. Arm the accept window (V2-58) for marketplace-shop jobs.
    try {
      const job = await AppDataSource.getRepository(PrintJob).findOne({
        where: { id: jobId },
      });
      if (job?.requiresAccept) {
        const { scheduledQueue } = await import('../workers/queues');
        const { ACCEPT_WINDOW_MS } = await import('./acceptWindow.service');
        await scheduledQueue.add(
          'accept-window',
          { printJobId: job.id },
          {
            delay: ACCEPT_WINDOW_MS,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            jobId: `accept-window:${job.id}`,
          },
        );
      }
    } catch (e) {
      console.error('Failed to arm accept window:', e);
    }
  }

  return result;
}
