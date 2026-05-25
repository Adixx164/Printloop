import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  BaseEntity,
} from 'typeorm';

export enum KioskStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  OFFLINE = 'OFFLINE',
  DISABLED = 'DISABLED',
}

@Entity('kiosks')
export class Kiosk extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  campus: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shopId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_kiosk_api_key')
  apiKey: string;

  @Column({
    type: 'simple-enum',
    enum: KioskStatus,
    default: KioskStatus.ACTIVE,
  })
  status: KioskStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerModel: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress: string;

  @Column({ type: 'datetime', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastPrintedAt: Date;

  @Column({ type: 'int', default: 0 })
  totalJobsPrinted: number;

  @Column({ type: 'int', default: 0 })
  totalPagesPrinted: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  /**
   * Pasteable maps URL (Google Maps, OSM, Apple Maps share link) that the
   * customer-facing "Find a station" page links to from each card.
   * Optional — when null, the customer card just shows the location text
   * without a clickable "Directions" link.
   */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  mapsUrl: string | null;

  /**
   * Whether this kiosk shows on the public Stations page. Admins can use
   * this to keep a kiosk operational for queued jobs but hide it from the
   * customer-facing directory (e.g., during commissioning or a private
   * test site). Defaults to true so existing kiosks stay visible.
   */
  @Column({ type: 'boolean', default: true })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
