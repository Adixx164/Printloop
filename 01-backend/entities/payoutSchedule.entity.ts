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

export enum PayoutCadence {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  /** No automatic payouts — tenant must request each one. */
  MANUAL = 'manual',
}

/**
 * One per tenant. Configures cadence + bank-account destination for
 * scheduled payouts (Dimension 15). The Paystack Transfer Recipient
 * code is created during onboarding and stored here so we don't
 * recreate it on every payout.
 */
@Entity('payout_schedules')
@Index('idx_payout_schedule_tenant', ['tenantId'], { unique: true })
export class PayoutSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'simple-enum',
    enum: PayoutCadence,
    default: PayoutCadence.WEEKLY,
  })
  cadence: PayoutCadence;

  /** 0 = Sunday … 6 = Saturday. Ignored when cadence != WEEKLY. */
  @Column({ type: 'int', default: 5 })
  dayOfWeek: number;

  /** Below this balance, payout is skipped and balance rolls. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 5000 })
  minPayoutAmount: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  bankCode: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  accountNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  accountName: string | null;

  /**
   * Paystack Transfer Recipient code (`RCP_xxx`). Created via the
   * Paystack `POST /transferrecipient` API during onboarding; reused
   * on every payout. NULL until the tenant supplies a bank account.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  recipientCode: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
