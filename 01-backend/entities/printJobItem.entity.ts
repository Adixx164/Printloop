import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One document inside a personal-batch PrintJob. The parent PrintJob carries
 * the single release code; each item keeps its own per-document print
 * settings and file. No FK (kept simple, like GroupSession).
 */
@Entity('print_job_items')
@Index('idx_pji_tenant', ['tenantId'])
export class PrintJobItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mirrors the parent PrintJob's tenantId. Denormalised so tenant-
   *  scoped queries (e.g. "list every item this tenant has ever
   *  printed") don't need a JOIN. Nullable during the multi-tenancy
   *  cutover; backfilled to the parent's tenantId at boot. */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid' })
  @Index('idx_pji_print_job')
  printJobId: string;

  @Column({ type: 'uuid' })
  fileId: string;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ type: 'int', default: 1 })
  totalPages: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cost: number;

  @Column({ type: 'simple-json' })
  printConfiguration: {
    copies: number;
    paper: string;
    color: 'bw' | 'color';
    sided: 'single' | 'double';
    qualityDpi: 100 | 300 | 600;
  };

  @CreateDateColumn()
  createdAt: Date;
}
