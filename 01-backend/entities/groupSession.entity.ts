import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { GroupParticipant } from './groupParticipant.entity';

export enum GroupSessionStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Entity('group_sessions')
export class GroupSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Plain id (no FK): a host may be a signed-in user OR an anonymous
  // guest host identified by a client-held random id.
  @Column({ type: 'uuid', nullable: true })
  hostUserId: string | null;

  @Column({ type: 'varchar', length: 255 })
  groupName: string;

  @Column({ type: 'datetime' })
  deadline: Date;

  @Column({
    type: 'simple-enum',
    enum: GroupSessionStatus,
    default: GroupSessionStatus.OPEN,
  })
  status: GroupSessionStatus;

  @Column({ type: 'varchar', length: 255 })
  shareUrl: string;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  shareId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  watermarkPrefix: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  batchCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  batchToken: string | null;

  @Column({ type: 'datetime', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'simple-json' })
  defaultOptions: {
    paper: string;
    color: 'bw' | 'color';
    sided: 'single' | 'double';
    qualityDpi: 100 | 300 | 600;
    enforce: boolean;
  };

  @OneToMany(() => GroupParticipant, participant => participant.groupSession)
  participants: GroupParticipant[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
