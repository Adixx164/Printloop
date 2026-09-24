import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DomainStatus {
  /** Claimed; awaiting DNS TXT verification. */
  PENDING = 'pending',
  /** TXT record found + matched; tenant.customDomain set. */
  VERIFIED = 'verified',
  /** Verification attempted but the TXT record was missing/wrong. */
  FAILED = 'failed',
}

/**
 * A custom domain a tenant wants to serve their customer-facing app
 * on, e.g. `print.kampala-uni.ac.ug` (Dimension 8 — V2-16).
 *
 * Verification flow:
 *   1. Tenant POSTs the domain → row created PENDING with a random
 *      `verificationToken`. We return the TXT record they must add:
 *        `_printloop-verify.<domain>  TXT  "<token>"`
 *   2. Tenant adds the TXT at their DNS provider + a CNAME pointing
 *      the domain at `domains.printloop.app`.
 *   3. Tenant POSTs /verify → we resolve the TXT, compare, and on
 *      match flip to VERIFIED + set `tenant.customDomain`.
 *
 * Globally unique on `domain` so two tenants can't both claim the
 * same hostname (the UNIQUE also stops a verified domain being
 * re-claimed elsewhere).
 *
 * TLS issuance itself is handled by the edge (Cloudflare for SaaS /
 * Caddy on-demand-TLS) — out of scope for the API, which only owns
 * the ownership-proof half.
 */
@Entity('tenant_domains')
@Index('idx_tenant_domain_tenant', ['tenantId'])
export class TenantDomain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  /** Lowercased hostname, no scheme, no trailing dot. Globally unique. */
  @Column({ type: 'varchar', length: 255, unique: true })
  domain: string;

  @Column({
    type: 'simple-enum',
    enum: DomainStatus,
    default: DomainStatus.PENDING,
  })
  status: DomainStatus;

  /** Random token the tenant publishes in a TXT record. */
  @Column({ type: 'varchar', length: 64 })
  verificationToken: string;

  @Column({ type: 'datetime', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastCheckedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastCheckError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
