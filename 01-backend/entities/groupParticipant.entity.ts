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
import { GroupSession } from './groupSession.entity';

export enum ParticipantStatus {
  INVITED = 'INVITED',
  JOINED = 'JOINED',
  UPLOADED = 'UPLOADED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('group_participants')
export class GroupParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('idx_participant_session_id')
  groupSessionId: string;

  @ManyToOne(() => GroupSession, session => session.participants)
  @JoinColumn({ name: 'groupSessionId' })
  groupSession: GroupSession;

  // Optional - participant may not have an account
  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phoneNumber: string;

  /**
   * Legacy column. Watermarking has been permanently removed from the
   * group printing flow — the service no longer populates this. Kept
   * nullable so existing rows survive a schema sync.
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  watermarkId: string | null;

  // Token used by this participant to access their upload session
  @Column({ type: 'varchar', length: 255, unique: true })
  uploadToken: string;

  @Column({
    type: 'simple-enum',
    enum: ParticipantStatus,
    default: ParticipantStatus.JOINED,
  })
  status: ParticipantStatus;

  // Linked print job (created when participant uploads)
  @Column({ type: 'uuid', nullable: true })
  printJobId: string;

  @Column({ type: 'datetime', nullable: true })
  joinedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  uploadedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
