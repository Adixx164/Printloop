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
import { User } from './user.entity';

export type PaymentStatus = 'SUCCESS' | 'PENDING' | 'FAILED';
export type PaymentMethod = 'wallet' | 'card' | 'transfer' | 'ussd';

/**
 * A payment captured against a print job / wallet top-up. This is the
 * money-movement record the admin console reports on (revenue, refunds).
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('idx_payment_user_id')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'SUCCESS' })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 20, default: 'wallet' })
  method: PaymentMethod;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string;

  // Refund tracking
  @Column({ type: 'datetime', nullable: true })
  refundedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  refundReason: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  refundAmount: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  refundType: 'BANK' | 'WALLET' | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  refundReference: string | null;

  @Column({ type: 'uuid', nullable: true })
  refundedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
