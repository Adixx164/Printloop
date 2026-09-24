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
  // Paid but the cloud render worker hasn't normalised the document
  // to PWG-Raster yet. Lasts seconds to minutes depending on file
  // size. See ARCHITECTURE.md (cloud render → kiosk spool).
  RENDERING = 'rendering',
  // Paid + rendered, waiting for the shop to ACCEPT it (V2-58 —
  // Bolt-style accept window, marketplace shops only). The shop has
  // ACCEPT_WINDOW_MS to accept; the delayed accept-window job then
  // reroutes the job to the next nearest open shop or auto-accepts.
  AWAITING_ACCEPT = 'awaiting_accept',
  READY = 'ready', // paid + rendered, awaiting release at a kiosk
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
  // Document editing flow (V2-XX — Edit & Print feature)
  AWAITING_EDIT = 'awaiting_edit',
  EDIT_COMPLETE = 'edit_complete',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAID = 'paid',
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
@Index('idx_print_job_tenant', ['tenantId'])
@Index('idx_print_job_tenant_status', ['tenantId', 'status'])
export class PrintJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owning tenant. Required for SaaS reporting + commission attribution. */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

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

  @Column({ type: 'varchar', length: 10, unique: true, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentReference: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cost: number;

  /**
   * Authoritative cost after the render worker counted the real pages
   * (V2-52 pricing reconciliation). NULL until the render callback
   * lands. The difference vs `cost` (what the customer paid up front)
   * drives the auto-refund (final < paid) or the kiosk release gate
   * (final > paid — settled from the customer's wallet at pickup).
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalCost: number | null;

  /** When the render callback reconciled the price (audit). */
  @Column({ type: 'datetime', nullable: true })
  costReconciledAt: Date | null;

  @Column({ type: 'int', default: 0 })
  totalPages: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  jobType: string;

  // Document editing flow (V2-XX — Edit & Print feature)
  @Column({ type: 'boolean', default: false })
  editingRequired: boolean;

  @Column({ type: 'text', nullable: true })
  editingInstructions: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  editedDocumentUrl: string | null;

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

  /**
   * Which printer profile this job was rendered for (V2-56). Null →
   * the tenant's default profile is used at render time.
   */
  @Column({ type: 'uuid', nullable: true })
  printerProfileId: string | null;

  /**
   * V2-58 accept window: true when the paying tenant is a marketplace
   * shop (isDiscoverable) — the job must be ACCEPTED by the operator
   * (awaiting_accept) before it becomes READY, and auto-reroutes if
   * not accepted within the window.
   */
  @Column({ type: 'boolean', default: false })
  requiresAccept: boolean;

  /** V2-58: the shop this job was rerouted FROM (null until a reroute). */
  @Column({ type: 'uuid', nullable: true })
  reroutedFromTenantId: string | null;

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
   * Agent print confirmation (V2-44): "<method>:<state>", e.g.
   * "ipp-job-state:confirmed" (printer reported job-state completed),
   * "queue-drain:confirmed" (OS spooler queue drained clean),
   * "none:unconfirmed" (raw-9100 — no feedback channel). NULL on
   * legacy rows and jobs that never went through the agent.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  agentConfirmation: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  renderedKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  renderedPdfUrl: string | null;

  @Column({ type: 'simple-json', nullable: true })
  previewImageUrls: string[] | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  renderingStatus: 'pending' | 'processing' | 'ready' | 'failed';

  @Column({ type: 'text', nullable: true })
  renderingError: string | null;

  @Column({ type: 'datetime', nullable: true })
  renderingStartedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  renderingCompletedAt: Date | null;

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
