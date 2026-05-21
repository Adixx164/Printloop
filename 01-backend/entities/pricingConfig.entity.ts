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

  // Price per single page in kobo (or smallest currency unit)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerPage: number;

  // Multiplier for duplex printing (e.g., 0.9 = 10% discount)
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.0 })
  duplexMultiplier: number;

  // Multiplier for high resolution (e.g., 600dpi vs 300dpi)
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.0 })
  highResolutionMultiplier: number;

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
