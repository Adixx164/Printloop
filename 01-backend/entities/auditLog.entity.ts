import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { User } from './user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
