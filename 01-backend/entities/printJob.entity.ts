import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { File } from './file.entity';
import { Kiosk } from './kiosk.entity';

export enum PrintJobStatus {
  PENDING = 'pending', // created, awaiting payment (e.g. group-batch participant jobs)
  READY = 'ready', // paid, awaiting release at a kiosk
  PRINTING = 'printing',
  DONE = 'done', // printed / completed
  FAILED = 'failed',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}

export enum JobType {
  SINGLE = 'single',
  PERSONAL_BATCH = 'personal_batch',
  GROUP_BATCH = 'group_batch',
}

@Entity('print_jobs')
export class PrintJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  // Nullable: group-session participants may print as guests (no account)
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => File, { nullable: true })
  @JoinColumn({ name: 'fileId' })
  file: File;

  @Column({ type: 'uuid', nullable: true })
  fileId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string;

  @Column({ type: 'varchar', length: 10, unique: true })
  code: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cost: number;

  @Column({ type: 'int', default: 0 })
  totalPages: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  jobType: string;

  @Column({
    type: 'simple-enum',
    enum: PrintJobStatus,
    default: PrintJobStatus.READY,
  })
  status: PrintJobStatus;

  @Column({ type: 'simple-json' })
  printConfiguration: {
    copies: number;
    paper: string;
    color: 'bw' | 'color';
    sided: 'single' | 'double';
    qualityDpi: 100 | 300 | 600;
  };

  @ManyToOne(() => Kiosk, { nullable: true })
  @JoinColumn({ name: 'kioskId' })
  kiosk: Kiosk;

  @Column({ type: 'uuid', nullable: true })
  kioskId: string;

  @Column({ type: 'uuid', nullable: true })
  printerId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerName: string | null;

  @Column({ type: 'uuid', nullable: true })
  groupSessionId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  watermarkId: string | null;

  @Column({ type: 'int', default: 0 })
  pagesCompleted: number;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
