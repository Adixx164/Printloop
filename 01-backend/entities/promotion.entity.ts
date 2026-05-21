import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PromotionStatus = 'active' | 'inactive' | 'expired';
export type DiscountType = 'percentage' | 'fixed' | 'free_pages';

/**
 * Admin-managed promotion / discount rule.
 */
@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: 'percentage' })
  discountType: DiscountType;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountValue: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: PromotionStatus;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ type: 'int', nullable: true })
  maxUses: number;

  @Column({ type: 'datetime', nullable: true })
  startsAt: Date;

  @Column({ type: 'datetime', nullable: true })
  endsAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
