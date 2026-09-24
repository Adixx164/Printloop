import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type PrinterCapabilities = {
  /** Render resolution cap, e.g. 300. The worker renders at
   *  min(customer quality, this) — never above what the printer can do. */
  maxDpi: 100 | 300 | 600;
  /** 'bw' = mono-only (renders are force-grayscale); 'color' = can print colour. */
  colorMode: 'bw' | 'color';
  /** Target sheet size for render-time page fitting. */
  paperSize: 'A4' | 'A3' | 'LETTER' | 'LEGAL' | null;
  /** Hardware duplex capability. */
  duplex: boolean;
};

/**
 * One physical printer attached to a shop (V2-56). The cloud render
 * worker uses a profile's capabilities to rasterize PWG-Raster at what
 * the machine can actually do — DPI cap, mono-vs-colour, paper size —
 * instead of blindly honouring the customer's settings.
 */
@Entity('printer_profiles')
@Index('idx_printer_profile_tenant', ['tenantId'])
export class PrinterProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  /** Optional link to a kiosk row; profiles can be shop-level too. */
  @Column({ type: 'uuid', nullable: true })
  kioskId: string | null;

  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  /** e.g. "ipp://localhost:60000/ipp/print" — used by the kiosk agent. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  ippUri: string | null;

  /** 'hplip' | 'gutenprint' | 'ps' | 'gs' | 'retrofit' | 'unknown'. */
  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  driverKind: string;

  @Column({ type: 'simple-json' })
  capabilities: PrinterCapabilities;

  /** The tenant's default profile drives cloud renders (fallback when a
   *  job has no explicit printerProfileId). One per tenant. */
  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
