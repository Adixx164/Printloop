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
import { PrintJob } from './printJob.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export enum DocumentEditStatus {
  PENDING_SHOP = 'pending_shop',
  IN_PROGRESS = 'in_progress',
  PENDING_CUSTOMER = 'pending_customer',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  AWAITING_PAYMENT = 'awaiting_payment',
}

@Entity('document_edits')
@Index('idx_document_edit_job', ['printJobId'])
@Index('idx_document_edit_shop', ['shopId'])
@Index('idx_document_edit_tenant', ['tenantId'])
@Index('idx_document_edit_status', ['status'])
export class DocumentEdit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  printJobId: string;

  @Column({ type: 'uuid' })
  shopId: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  editedBy: string;

  @Column({ type: 'simple-json' })
  editOperations: any[];

  @Column({ type: 'simple-json', nullable: true })
  originalDocumentMeta: {
    pageCount: number;
    fileSize: number;
    fileName: string;
  } | null;

  @Column({ type: 'simple-json', nullable: true })
  editedDocumentMeta: {
    pageCount: number;
    fileSize: number;
  } | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  editedDocumentUrl: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  baseEditFee: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  perPageFee: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  complexityFee: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  shopAdjustedFee: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
  })
  totalEditFee: number;

  @Column({
    type: 'simple-enum',
    enum: DocumentEditStatus,
    default: DocumentEditStatus.PENDING_SHOP,
  })
  status: DocumentEditStatus;

  @Column({ type: 'text', nullable: true })
  shopNotes: string | null;

  @Column({ type: 'text', nullable: true })
  customerRejectionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => PrintJob)
  @JoinColumn({ name: 'printJobId' })
  printJob: PrintJob;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'shopId' })
  shop: Tenant;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'editedBy' })
  editor: User;
}