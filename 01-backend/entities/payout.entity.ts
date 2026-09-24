import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum PayoutStatus {
  /** Created locally, not yet sent to Paystack. */
  PENDING = 'pending',
  /** Paystack Transfer initiated; waiting on transfer.success/failed webhook. */
  PROCESSING = 'processing',
  /** Money landed in tenant's bank account. */
  PAID = 'paid',
  /** Paystack returned an error; funds stay in tenant subaccount. */
  FAILED = 'failed',
  /** Cancelled by platform admin before processing. */
  CANCELLED = 'cancelled',
}

export enum PayoutTrigger {
  /** Scheduled by payoutSchedule cadence. */
  SCHEDULED = 'scheduled',
  /** Tenant requested instant payout (₦100 fee). */
  INSTANT = 'instant',
  /** Platform admin issued a manual payout. */
  MANUAL = 'manual',
}

/**
 * One row per outgoing transfer from PrintLoop → tenant bank account.
 * Money lives in the Paystack subaccount between charge and payout;
 * this entity is the audit trail of "what we transferred, when, and
 * with what fee."
 */
@Entity('payouts')
@Index('idx_payout_tenant_status', ['tenantId', 'status'])
@Index('idx_payout_paystack_ref', ['paystackTransferReference'], {
  unique: true,
  where: '"paystackTransferReference" IS NOT NULL',
})
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  tenantId: string;

  /** Gross transfer amount (currency units). Tenant net = amount - feeAmount. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /** Paystack's transfer fee, deducted from the amount before disbursing. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  feeAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({
    type: 'simple-enum',
    enum: PayoutStatus,
    default: PayoutStatus.PENDING,
  })
  status: PayoutStatus;

  @Column({
    type: 'simple-enum',
    enum: PayoutTrigger,
    default: PayoutTrigger.SCHEDULED,
  })
  trigger: PayoutTrigger;

  /** Paystack `data.reference` from POST /transfer response. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  paystackTransferReference: string | null;

  /** Reason set when status flips to FAILED. Comes from webhook payload. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason: string | null;

  @Column({ type: 'datetime', nullable: true })
  requestedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date | null;

  /** Free-form audit note (e.g. who triggered a manual payout). */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
