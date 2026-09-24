import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from 'typeorm';

/**
 * Denormalised per-tenant running balance, maintained by
 * `tenantBalance.service.ts`. The on-the-fly SUM in
 * `payout.service.getAvailableBalance` becomes O(transactions)
 * at scale; this row is O(1) per tenant.
 *
 * One row per tenant — primary key IS `tenantId`, no surrogate id.
 * The dashboard reads this; the payout scheduler reads this; the
 * legacy SUM-based path stays as a slow-path fallback / cross-check.
 *
 * Updated by:
 *   - applyTransactionDelta(tenantId, amount, commission) — on every
 *     Transaction insert (incremental).
 *   - applyPayoutDelta(tenantId, payout) — on every Payout status
 *     transition (PENDING→PROCESSING bumps pending; PROCESSING→PAID
 *     decrements pending; PROCESSING→FAILED decrements pending).
 *   - recomputeFromScratch(tenantId) — full SUM rebuild, called when
 *     drift is detected or by an ops command.
 */
@Entity('tenant_balances')
export class TenantBalance {
  /** Owning tenant — also the primary key. */
  @PrimaryColumn({ type: 'uuid' })
  tenantId: string;

  /** Tenant net (gross customer payments − commission) accumulated. */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  lifetimeTenantNet: number;

  /** Platform commission accumulated lifetime, in NGN. */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  lifetimeCommission: number;

  /** Total paid out to the tenant's bank account, lifetime. */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  lifetimePayouts: number;

  /**
   * Sum of payouts currently in PENDING + PROCESSING states. Funds
   * are reserved against the tenant's available balance but haven't
   * landed yet.
   */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  pendingPayouts: number;

  /**
   * Convenience: lifetimeTenantNet − lifetimePayouts − pendingPayouts.
   * Stored so dashboards don't compute it; kept in sync by the
   * service helpers. If the three lifetime+pending columns are
   * authoritative, this is derived — but storing it lets us
   * SELECT one column for the home-screen widget.
   */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  availableBalance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
