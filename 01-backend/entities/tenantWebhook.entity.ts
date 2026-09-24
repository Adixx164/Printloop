import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum WebhookEvent {
  JOB_COMPLETED = 'job.completed',
  JOB_FAILED = 'job.failed',
  CUSTOMER_SIGNED_UP = 'customer.signed_up',
  PAYOUT_PAID = 'payout.paid',
}

/**
 * Outbound webhook endpoint a tenant configures (Dimension 14 —
 * V2-14). The platform POSTs to `url` whenever an event in
 * `events` fires for this tenant. Each delivery is HMAC-SHA256
 * signed with `secret` so the tenant can verify authenticity.
 *
 * One tenant can have many webhook rows — useful for fanning out
 * to multiple downstream systems. Deliveries are retried by BullMQ
 * (handled at the queue layer; not yet implemented — V2-15).
 */
@Entity('tenant_webhooks')
@Index('idx_tenant_webhook_tenant', ['tenantId'])
export class TenantWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  /** Friendly label shown in the tenant admin UI. */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Target URL. Must be https in production; http allowed for dev. */
  @Column({ type: 'varchar', length: 1024 })
  url: string;

  /**
   * Shared secret used to sign deliveries. Generated server-side on
   * insert; never displayed after creation (the tenant must store
   * it on their side immediately).
   */
  @Column({ type: 'varchar', length: 96 })
  secret: string;

  /**
   * Which events to deliver. Stored as simple-json so the column
   * stays portable across SQLite + Postgres. Empty array = no
   * events; the row exists but does nothing (useful for disabling
   * without losing the secret).
   */
  @Column({ type: 'simple-json', default: '[]' })
  events: WebhookEvent[];

  /** Disabled rows still exist but are skipped by the dispatcher. */
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Last successful 2xx delivery timestamp (for the dashboard). */
  @Column({ type: 'datetime', nullable: true })
  lastSuccessAt: Date | null;

  /** Last failure timestamp + last error message (for the dashboard). */
  @Column({ type: 'datetime', nullable: true })
  lastFailureAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastFailureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
