import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn, 
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum EditComplexityTier {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
}

@Entity('edit_pricing_configs')
@Index('idx_edit_pricing_config_tenant', ['tenantId'], { unique: true })
export class EditPricingConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  tenantId: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 500,
  })
  baseFee: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 100,
  })
  perPageFee: number;

  @Column({
    type: 'simple-json',
    default: {},
  })
  complexityTierFees: Record<EditComplexityTier, number>;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  maxShopAdjustmentPct: number;

  @Column({ type: 'boolean', default: true })
  editingEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  bankAccountName: string | null;

  @Column({ type: 'text', nullable: true })
  bankAccountNumber: string | null;

  @Column({ type: 'text', nullable: true })
  bankName: string | null;

  @Column({ type: 'text', nullable: true })
  bankSortCode: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;
}