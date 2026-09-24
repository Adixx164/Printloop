import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Wallet } from './wallet.entity';

export enum TransactionType {
  TOPUP = 'topup',
  PRINT = 'print',
  REFUND = 'refund',
  CREDIT = 'credit',
}

@Entity('transactions')
@Index('idx_transaction_tenant', ['tenantId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Wallet, wallet => wallet.transactions)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column({ type: 'uuid' })
  walletId: string;

  /**
   * Which tenant earned (or paid) this transaction. Nullable for
   * rows that pre-date the multi-tenancy migration; new rows are
   * always set. Backfilled to the 'legacy' tenant by the
   * CreateSaasFoundation migration.
   */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({
    type: 'simple-enum',
    enum: TransactionType,
  })
  type: TransactionType;

  /**
   * Gross amount the customer paid (for TOPUP/PRINT) or that we
   * refunded (REFUND). Tenant net = amount - commissionAmount.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  /**
   * Slice of `amount` that went to PrintLoop as platform commission
   * via Paystack Split. Zero on transactions that don't carry
   * commission (e.g. internal credits, legacy rows). See Dimension
   * 9 in SAAS-ROADMAP.md.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  commissionAmount: number;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string;

  @CreateDateColumn()
  createdAt: Date;
}
