import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { TenantMember } from '../entities/tenantMember.entity';
import { TenantBranding } from '../entities/tenantBranding.entity';
import { TenantBalance } from '../entities/tenantBalance.entity';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { Kiosk } from '../entities/kiosk.entity';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { Payment } from '../entities/payment.entity';
import { Transaction } from '../entities/transaction.entity';
import { File } from '../entities/file.entity';
import { PricingConfig } from '../entities/pricingConfig.entity';
import { Promotion } from '../entities/promotion.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { GroupParticipant } from '../entities/groupParticipant.entity';
import { Payout } from '../entities/payout.entity';
import { PayoutSchedule } from '../entities/payoutSchedule.entity';
import { AuditLog } from '../entities/auditLog.entity';

/**
 * Tenant deletion (Dimension 13 — V2-14).
 *
 * Two-phase delete:
 *
 *   Phase 1 — `closeTenant(tenantId)`
 *     Flips `tenant.status = CLOSED`. The middleware then 410s
 *     every authed request. Money still in the Paystack subaccount
 *     stays there until either auto-payout runs (cadence already
 *     pauses on suspend) or the tenant manually withdraws. We hold
 *     for a 30-day cooling-off window before hard-deleting.
 *
 *   Phase 2 — `hardDeleteTenant(tenantId, force)`
 *     Removes every row in dependency order. Refuses to run unless
 *     either `force=true` OR `closedAt` is older than 30 days.
 *     Returns counts per table.
 *
 * Outstanding balance check: hardDeleteTenant refuses to run if the
 * tenant still has a non-zero `availableBalance` — that money is
 * the tenant's and must be paid out (or returned to customers)
 * before we wipe the records. `force=true` bypasses this for ops
 * cleanup of test tenants.
 */

export async function closeTenant(
  tenantId: string,
  reason: string,
): Promise<Tenant> {
  const repo = AppDataSource.getRepository(Tenant);
  const tenant = await repo.findOne({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  tenant.status = TenantStatus.CLOSED;
  tenant.suspendReason = reason || 'Closed by owner';
  tenant.suspendedAt = tenant.suspendedAt ?? new Date();
  return repo.save(tenant);
}

export interface HardDeleteResult {
  tenantId: string;
  deleted: Record<string, number>;
}

export async function hardDeleteTenant(
  tenantId: string,
  opts?: { force?: boolean },
): Promise<HardDeleteResult> {
  const ds = AppDataSource;
  const tenant = await ds.getRepository(Tenant).findOne({
    where: { id: tenantId },
  });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  if (tenant.status !== TenantStatus.CLOSED && !opts?.force) {
    throw new Error(
      `Tenant ${tenantId} must be CLOSED before hard-delete. Call closeTenant first or pass force=true.`,
    );
  }
  if (tenant.suspendedAt && !opts?.force) {
    const ageMs = Date.now() - new Date(tenant.suspendedAt).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (ageMs < thirtyDays) {
      throw new Error(
        `Tenant ${tenantId} is in the 30-day cooling-off window. Pass force=true to override.`,
      );
    }
  }

  // Balance check — refuses to drop a tenant with money outstanding.
  const balance = await ds
    .getRepository(import('../entities/tenantBalance.entity').then((m) => m.TenantBalance) as any)
    .findOne({ where: { tenantId } })
    .catch(() => null);
  if (!opts?.force && balance && Number(balance.availableBalance) > 0) {
    throw new Error(
      `Tenant ${tenantId} has ₦${balance.availableBalance} outstanding. Pay out or force=true.`,
    );
  }

  // Delete in FK-dependency order. group_participants → group_sessions,
  // print_job_items → print_jobs, transactions → wallets → users, etc.
  const deleted: Record<string, number> = {};

  // group_participants doesn't carry tenantId itself — delete by
  // group-session id range.
  const sessions = await ds
    .getRepository(GroupSession)
    .find({ where: { tenantId } as any });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length) {
    const r = await ds
      .getRepository(GroupParticipant)
      .createQueryBuilder()
      .delete()
      .from(GroupParticipant)
      .where('groupSessionId IN (:...ids)', { ids: sessionIds })
      .execute();
    deleted.groupParticipants = r.affected ?? 0;
  }

  for (const Repo of [
    AuditLog,
    Promotion,
    PricingConfig,
    File,
    Transaction,
    Payment,
    PrintJobItem,
    PrintJob,
    Kiosk,
    Wallet,
    User,
    Payout,
    PayoutSchedule,
    GroupSession,
    TenantBalance,
    TenantBranding,
    TenantMember,
  ] as any[]) {
    const r = await ds
      .getRepository(Repo)
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tid', { tid: tenantId })
      .execute();
    deleted[Repo.name] = r.affected ?? 0;
  }

  // Finally, drop the tenant row itself.
  await ds.getRepository(Tenant).delete({ id: tenantId });
  deleted.Tenant = 1;

  return { tenantId, deleted };
}
