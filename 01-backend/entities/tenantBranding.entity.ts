import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from 'typeorm';

/**
 * Per-tenant brand overrides (Dimension 7 — White-label branding).
 *
 * One row per tenant; `tenantId` is the PK so the frontend can fetch
 * the brand in a single read. Public endpoint surfaces the visible
 * fields anonymously so the landing page renders before login.
 *
 * Colour fields are 7-char `#RRGGBB`; the validator at the route
 * boundary enforces that format. Logo URL points at the tenant's
 * own image hosting (we never store images server-side — keeps the
 * blast radius small and avoids a content-moderation problem).
 */
@Entity('tenant_brandings')
export class TenantBranding {
  @PrimaryColumn({ type: 'uuid' })
  tenantId: string;

  /** Wordmark text — falls back to Tenant.name when null. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  wordmark: string | null;

  /** Tagline shown under the wordmark; ≤ 120 chars. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  tagline: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  faviconUrl: string | null;

  /** Primary brand colour, `#RRGGBB`. Used for buttons + accents. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  primaryColor: string | null;

  /** Secondary, `#RRGGBB`. Used for highlights + links. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  secondaryColor: string | null;

  /** Accent, `#RRGGBB`. Used for warnings / status pills. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  accentColor: string | null;

  /** Email `From` display name; falls back to wordmark / Tenant.name. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  emailFromName: string | null;

  /** Public-facing support email shown to customers. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  supportEmail: string | null;

  /** Public-facing support phone shown to customers. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  supportPhone: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
