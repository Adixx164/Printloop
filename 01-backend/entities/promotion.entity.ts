import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type PromotionStatus = 'active' | 'inactive' | 'expired';
export type DiscountType = 'percentage' | 'fixed' | 'free_pages';

/**
 * Admin-managed promotion / discount rule.
 */
@Entity('promotions')
@Index('idx_promotion_tenant', ['tenantId'])
// Tenant-scoped uniqueness — each tenant runs their own promo codes.
@Index('UQ_promotions_code_tenant', ['code', 'tenantId'], { unique: true })
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owning tenant. Each tenant runs their own promo codes; the global
   *  UNIQUE on `code` will be widened to (tenantId, code) in a follow-up
   *  migration so two tenants can share the same code string. */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  // Uniqueness is composite (code, tenantId) — see class-level
  // @Index above.
  @Column({ type: 'varchar', length: 64 })
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
