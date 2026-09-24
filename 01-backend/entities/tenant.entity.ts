import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

/**
 * A single printing business on the SaaS. Every row in customer-facing
 * tables (kiosks, users, print_jobs, …) hangs off a tenantId. The
 * 'legacy' tenant (slug = 'legacy') is seeded on first boot to own
 * everything that pre-dates the multi-tenancy split — see
 * config/seed.ts.
 *
 * Money: PrintLoop bills via a per-transaction commission (Bolt-style,
 * not subscription). commissionPct is the slice that goes to PrintLoop
 * on every customer charge; paystackSubaccountCode is where the
 * remainder is routed via Paystack Split.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Display name, shown to tenant admins. */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /**
   * URL-safe identifier — lowercase a–z, digits, dashes, 3–30 chars.
   * Used in subdomains (`{slug}.printloop.app`), in JWT claims, and
   * as the X-Tenant-Slug header value. Globally unique.
   */
  @Column({ type: 'varchar', length: 30, unique: true })
  @Index('idx_tenant_slug')
  slug: string;

  /**
   * Tenant's own domain (e.g. print.kampala-uni.ac.ug). Optional;
   * tenants can launch on a printloop.app subdomain and add a
   * custom domain later. When set, also resolves to this tenant via
   * the tenant-resolution middleware.
   */
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  customDomain: string | null;

  @Column({
    type: 'simple-enum',
    enum: TenantStatus,
    default: TenantStatus.TRIAL,
  })
  status: TenantStatus;

  /**
   * Commission rate as a decimal fraction. 0.10 = 10%. Default lives
   * in env (`COMMISSION_PCT_DEFAULT`); negotiable per-tenant for
   * volume discounts (7%) or enterprise onboarding (up to 15%).
   * Multiplied against customer gross spend at charge time.
   */
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    default: 0.1,
  })
  commissionPct: number;

  /**
   * Paystack subaccount code (`ACCT_xxx`). Required before the
   * first customer charge can be split. Created during the
   * onboarding wizard via the Paystack Subaccount API.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  paystackSubaccountCode: string | null;

  @Column({ type: 'datetime', nullable: true })
  suspendedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  suspendReason: string | null;

  // ── Marketplace discovery (V2-30) ──────────────────────────────────────
  // Geocoded on signup (or when an admin edits the address) via
  // services/geocoding.service.ts. Stored as floats — both SQLite and
  // Postgres handle the precision we need for Haversine sorting
  // (~10m at the 6th decimal place). NULL means "not yet geocoded";
  // the tenant simply doesn't appear in nearby results.
  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @Column({ type: 'float', nullable: true })
  lng: number | null;

  /**
   * Marketplace opt-in. Default OFF so a tenant in mid-setup never
   * leaks into the public /find list. Tenant admin flips this from
   * /saas/settings once they're ready to take real customers (kiosk
   * online, pricing set, bank account added). The legacy tenant
   * stays OFF — it's the catch-all, not a real shop.
   */
  @Column({ type: 'boolean', default: false })
  isDiscoverable: boolean;

  /**
   * Operator-controlled shop availability (V2-57):
   *   open   → taking new orders (default)
   *   busy   → taking orders but flagged on the student map
   *   closed → NOT taking orders — rejected at checkout, hidden from
   *            the map list (direct shop links still resolve)
   */
  @Column({
    type: 'simple-enum',
    enum: ['open', 'busy', 'closed'],
    default: 'open',
  })
  availability: 'open' | 'busy' | 'closed';

  /**
   * Campus LMS trusted-link key (V2-44). A Moodle/Canvas admin embeds
   * `GET /api/integrations/lms/handoff?slug=…&key=…` behind a course
   * button; we validate this key and mint a short-lived handoff token.
   * NULL until the operator generates one from settings. Rotatable —
   * regenerating invalidates the old link immediately.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  lmsKey: string | null;

  /**
   * Tenant/Shop brand photos. JSON array of Cloudinary image URLs.
   */
  @Column({ type: 'simple-json', nullable: true })
  photos: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
