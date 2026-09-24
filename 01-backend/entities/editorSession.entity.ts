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
import { DocumentEdit } from './documentEdit.entity';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export enum EditorSessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
  IN_PROGRESS = 'in_progress',
  PENDING_CUSTOMER = 'pending_customer',
  APPROVED = 'approved',
  AWAITING_PAYMENT = 'awaiting_payment',
}

export enum ConversionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface EditorPermissions {
  shop: 'rw' | 'r' | 'none';
  customer: 'rw' | 'r' | 'none';
}

export interface WebRTCSignalingData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  iceCandidates?: RTCIceCandidateInit[];
}

@Entity('editor_sessions')
@Index('IDX_editor_sessions_document_edit', ['documentEditId'])
@Index('IDX_editor_sessions_status', ['status'])
@Index('IDX_editor_sessions_expires_at', ['expiresAt'])
@Index('IDX_editor_sessions_shop_user', ['shopUserId'])
@Index('IDX_editor_sessions_customer_user', ['customerUserId'])
@Index('IDX_editor_sessions_tenant', ['tenantId'])
export class EditorSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  documentEditId: string;

  @Column({ type: 'uuid', nullable: true })
  shopUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  customerUserId: string | null;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'simple-json', default: {} })
  univerDocument: Record<string, any>;

  @Column({ type: 'simple-json', default: { shop: 'rw', customer: 'r' } })
  permissions: EditorPermissions;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({
    type: 'simple-enum',
    enum: EditorSessionStatus,
    default: EditorSessionStatus.ACTIVE,
  })
  status: EditorSessionStatus;

  @Column({ type: 'simple-json', default: {} })
  webrtcSignaling: WebRTCSignalingData;

  @Column({
    type: 'simple-enum',
    enum: ConversionStatus,
    default: ConversionStatus.PENDING,
  })
  conversionStatus: ConversionStatus;

  @Column({ type: 'text', nullable: true })
  conversionError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', default: () => 'now()' })
  lastActivityAt: Date;

  @ManyToOne(() => DocumentEdit, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_edit_id' })
  documentEdit: DocumentEdit;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shop_user_id' })
  shopUser: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_user_id' })
  customerUser: User | null;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;
}