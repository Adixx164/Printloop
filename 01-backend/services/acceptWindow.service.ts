import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { computeCommissionSplit } from './commission.service';
import { applyTransactionDelta } from './tenantBalance.service';
import { scheduledQueue } from '../workers/queues';

// ─────────────────────────────────────────────────────────────────────────
// Accept window (V2-58) — the Bolt-style reliability mechanic.
//
// A paid job for a marketplace shop enters `awaiting_accept`. The
// operator has ACCEPT_WINDOW_MS to accept it from the shop console;
// the delayed `accept-window` BullMQ job then:
//   1. reroutes the job to the NEXT NEAREST open shop with an online
//      kiosk (reversing the original shop's ledger credit — the money
//      follows the job), re-arming a fresh window for the new shop; or
//   2. auto-accepts (READY) when no other shop can take it — the
//      customer is never blocked waiting on a dead shop.
//
// The accepting shop is credited on accept (`acceptJob`) when the job
// was rerouted to it; the original shop's credit was reversed at
// reroute time, so money moves exactly once per shop.
// ─────────────────────────────────────────────────────────────────────────

export const ACCEPT_WINDOW_MS = 2 * 60 * 1000;

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Nearest open marketplace shops that could take the job: discoverable,
 * ACTIVE, not closed, not the job's current tenant, with an online
 * kiosk — ordered by distance from the current tenant.
 */
export async function findRerouteCandidates(
  job: PrintJob,
  limit = 5,
): Promise<Tenant[]> {
  const current = job.tenantId
    ? await AppDataSource.getRepository(Tenant).findOne({
        where: { id: job.tenantId },
      })
    : null;

  const tenants = await AppDataSource.getRepository(Tenant)
    .createQueryBuilder('t')
    .where('t.isDiscoverable = :d', { d: true })
    .andWhere('t.status = :s', { s: TenantStatus.ACTIVE })
    .andWhere("t.availability != 'closed'")
    .getMany();

  const kiosks = await AppDataSource.getRepository(Kiosk).find({
    where: { status: KioskStatus.ACTIVE },
  });
  const now = Date.now();
  const onlineKioskByTenant = new Map<string, boolean>();
  for (const k of kiosks) {
    if (!k.tenantId) continue;
    const online =
      process.env.SEED_DEMO === '1' ||
      process.env.NODE_ENV !== 'production' ||
      (k.lastSeenAt && now - new Date(k.lastSeenAt).getTime() < ONLINE_WINDOW_MS);
    if (online) onlineKioskByTenant.set(k.tenantId, true);
  }

  const withKiosk = tenants.filter(
    (t) =>
      t.id !== job.tenantId && onlineKioskByTenant.has(t.id),
  );

  if (!current?.lat || !current?.lng) return withKiosk.slice(0, limit);

  return withKiosk
    .filter((t) => t.lat != null && t.lng != null)
    .sort(
      (a, b) =>
        haversineKm(
          { lat: current.lat!, lng: current.lng! },
          { lat: a.lat!, lng: a.lng! },
        ) -
        haversineKm(
          { lat: current.lat!, lng: current.lng! },
          { lat: b.lat!, lng: b.lng! },
        ),
    )
    .concat(withKiosk.filter((t) => t.lat == null || t.lng == null))
    .slice(0, limit);
}

/** Reverse a tenant's ledger credit for a job (reroute money-back). */
export async function reverseJobCredit(
  tenantId: string,
  job: PrintJob,
): Promise<void> {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId },
  });
  if (!tenant) return;
  const amount = Number(job.cost) || 0;
  const split = computeCommissionSplit(tenant, amount);
  try {
    await applyTransactionDelta(tenantId, -amount, -split.commissionAmount);
  } catch (e) {
    console.error('[accept-window] ledger reversal failed:', e);
  }
}

/** Credit a tenant for a job it accepted after reroute. */
export async function creditJobToTenant(
  tenantId: string,
  job: PrintJob,
): Promise<void> {
  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: tenantId },
  });
  if (!tenant) return;
  const amount = Number(job.cost) || 0;
  const split = computeCommissionSplit(tenant, amount);

  await AppDataSource.transaction(async (em) => {
    if (job.userId) {
      const wallet = await em.findOne(Wallet, { where: { userId: job.userId } });
      if (wallet) {
        await em.save(
          Transaction,
          em.create(Transaction, {
            walletId: wallet.id,
            tenantId,
            type: TransactionType.PRINT,
            amount,
            commissionAmount: split.commissionAmount,
            description: `Rerouted print accepted (${job.fileName || 'job'})`,
            balanceAfter: Number(wallet.balance),
            reference: job.paymentReference || job.id,
          }),
        );
      }
    }
  });

  try {
    await applyTransactionDelta(tenantId, amount, split.commissionAmount);
  } catch (e) {
    console.error('[accept-window] ledger credit failed:', e);
  }
}

/**
 * The delayed accept-window job body. Called ~2 minutes after the job
 * entered awaiting_accept: reroute to the next nearest open shop, or
 * auto-accept when nobody can take it.
 */
export async function enforceAcceptWindow(
  printJobId: string,
): Promise<{
  action: 'noop' | 'rerouted' | 'auto-accepted';
  toTenantId?: string | null;
}> {
  const job = await AppDataSource.getRepository(PrintJob).findOne({
    where: { id: printJobId },
  });
  if (!job) return { action: 'noop' };
  if (job.status !== PrintJobStatus.AWAITING_ACCEPT) return { action: 'noop' };

  const candidates = await findRerouteCandidates(job);
  if (candidates.length === 0) {
    job.status = PrintJobStatus.READY;
    job.reroutedFromTenantId = null;
    await AppDataSource.getRepository(PrintJob).save(job);
    return { action: 'auto-accepted' };
  }

  const next = candidates[0];
  const fromTenantId = job.tenantId;
  if (fromTenantId) await reverseJobCredit(fromTenantId, job);

  job.tenantId = next.id;
  job.reroutedFromTenantId = fromTenantId;
  // The job stays awaiting_accept — the new shop accepts it (and gets
  // credited on accept).
  await AppDataSource.getRepository(PrintJob).save(job);

  // Re-arm the window for the new shop (best-effort; the job is still
  // visible + acceptable in the new shop's queue regardless).
  try {
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
  } catch (e: any) {
    console.error('[accept-window] re-arm failed:', e?.message);
  }

  return { action: 'rerouted', toTenantId: next.id };
}

/**
 * Operator accept (from the shop console). awaiting_accept → READY,
 * and — when the job was rerouted to this shop — credits its ledger
 * (the original shop's credit was reversed at reroute time).
 */
export async function acceptJob(printJobId: string): Promise<{
  accepted: boolean;
  reason?: string;
}> {
  const repo = AppDataSource.getRepository(PrintJob);
  const job = await repo.findOne({ where: { id: printJobId } });
  if (!job) return { accepted: false, reason: 'not-found' };
  if (job.status !== PrintJobStatus.AWAITING_ACCEPT) {
    return { accepted: false, reason: `bad-status:${job.status}` };
  }

  if (job.reroutedFromTenantId && job.tenantId) {
    await creditJobToTenant(job.tenantId, job);
  }

  job.status = PrintJobStatus.READY;
  job.reroutedFromTenantId = null;
  await repo.save(job);
  return { accepted: true };
}
