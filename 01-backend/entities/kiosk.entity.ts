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
@Index('idx_kiosk_tenant', ['tenantId'])
export class Kiosk extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owning tenant. Backfilled to 'legacy' tenant for pre-multi-tenancy rows. */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

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

  /** Timestamp of the most recent offline alert sent to the tenant owner.
   *  Used to rate-limit: we only re-alert after KIOSK_ALERT_COOLDOWN_MINUTES. */
  @Column({ type: 'datetime', nullable: true })
  lastOfflineAlertAt: Date | null;

  /**
   * Set by the tenant admin once they've run a successful test print
   * through this kiosk (V2-32). The "live gate" on
   * PATCH /api/saas/me/location refuses to flip isDiscoverable=true
   * until at least one kiosk on the tenant has a non-null value here.
   *
   * Manual marker — the kiosk software doesn't auto-detect; the
   * admin clicks "Confirm test print" after pulling a real sheet of
   * paper out of the printer. NULL = not yet verified.
   */
  @Column({ type: 'datetime', nullable: true })
  testPrintPassedAt: Date | null;

  /**
   * Hardware capabilities the agent auto-discovers via IPP
   * Get-Printer-Attributes (V2-44). NULL = unknown — non-IPP
   * transports or kiosks paired before this shipped. The discovery
   * rollup only *narrows* claims when these are known; unknown keeps
   * the pricing-derived behaviour.
   */
  @Column({ type: 'boolean', nullable: true })
  capColor: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  capDuplex: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  capA3: boolean | null;

  /** Raw media list (JSON array of IPP media keywords), for support. */
  @Column({ type: 'text', nullable: true })
  capMedia: string | null;

  @Column({ type: 'datetime', nullable: true })
  capUpdatedAt: Date | null;

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
