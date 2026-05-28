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
import { User } from './user.entity';
import { File } from './file.entity';
import { Kiosk } from './kiosk.entity';

export enum PrintJobStatus {
  PENDING = 'pending', // created, awaiting payment (e.g. group-batch participant jobs)
  READY = 'ready', // paid, awaiting release at a kiosk
  // Kiosk-pull mode: customer typed the code at the kiosk; the cloud
  // backend has marked the job for an on-site agent to fetch the file
  // and dispatch to the printer. The agent claims it via /agent/start
  // and the status moves to PRINTING.
  RELEASING = 'releasing',
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
// Partial-unique index for CUPS idempotency: a user can only have one
// active job per (idempotencyKey). NULL idempotency keys are ignored —
// the web app / batch / group paths don't set one.
@Index('print_jobs_user_idem_uniq', ['userId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
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
    /** Page orientation. Undefined = portrait (legacy default). */
    orientation?: 'portrait' | 'landscape';
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

  /**
   * Deduplication key for CUPS retries. The CUPS backend script can
   * resubmit the same job (exit code 4 → retry-current); pairing
   * `(userId, idempotencyKey)` with a partial-unique index lets us
   * return the existing job on resubmit instead of creating a
   * duplicate + double-charging. NULL for any ingress path that
   * doesn't set one (web app, batch, group).
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
