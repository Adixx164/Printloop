import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PaperSize {
  A4 = 'A4',
  A3 = 'A3',
  LETTER = 'LETTER',
  LEGAL = 'LEGAL',
}

export enum ColorType {
  BLACK_WHITE = 'BLACK_WHITE',
  COLOR = 'COLOR',
}

@Entity('pricing_configs')
@Index(['paperSize', 'colorType'], { unique: true })
export class PricingConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'simple-enum', enum: PaperSize, default: PaperSize.A4 })
  paperSize: PaperSize;

  @Column({ type: 'simple-enum', enum: ColorType, default: ColorType.BLACK_WHITE })
  colorType: ColorType;

  // Legacy fallback. Treated as the 300dpi-simplex price by `computeCost`
  // when the per-cell columns below are NULL. Kept for backward compat
  // with admin UIs / API clients that haven't been updated yet.
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerPage: number;

  // Legacy. Now ignored when per-cell prices below are populated.
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.0 })
  duplexMultiplier: number;
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.0 })
  highResolutionMultiplier: number;

  // ────────────────────────────────────────────────────────────────────────
  // Exact per-cell prices (₦ per page). 6 cells = 3 dpi × 2 sided options.
  // When a cell is non-null, `computeCost` uses it directly as
  //   total = cell × pages × copies
  // (no multipliers — the dpi/duplex factor is already baked in). NULL on a
  // cell means "fall back to the legacy multiplier path for this cell".
  // ────────────────────────────────────────────────────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price100Simplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price300Simplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price600Simplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price100Duplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price300Duplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price600Duplex: number | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
