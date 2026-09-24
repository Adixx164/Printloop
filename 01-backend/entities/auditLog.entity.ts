import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('audit_logs')
@Index('idx_audit_log_tenant', ['tenantId'])
@Index('idx_audit_log_tenant_action', ['tenantId', 'action'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owning tenant of the audited event. Platform-level actions (e.g.
   *  the SaaS operator suspending a tenant) carry the targeted tenant's
   *  id here, not the platform's. NULL only for boot / migration logs. */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actorId' })
  actor: User;

  @Column({ type: 'varchar', length: 100 })
  actorName: string; // Denormalized in case user is soft-deleted

  @Column({ type: 'varchar', length: 100 })
  action: string; // e.g., 'user.promoted', 'pricing.updated'

  @Column({ type: 'varchar', length: 255, nullable: true })
  target: string; // e.g., 'user:uuid', 'pricing:global'

  @Column({ type: 'simple-json', nullable: true })
  detail: any; // Before/after JSON

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}
