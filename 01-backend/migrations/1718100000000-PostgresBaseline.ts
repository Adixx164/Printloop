import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Postgres baseline (V2-16).
 *
 * The incremental migration chain (InitSchema → … → CreateTenantDomains)
 * is written in SQLite dialect: `datetime('now')`, `PRAGMA
 * foreign_keys`, and table-rewrite NOT-NULL tightening that Postgres
 * neither needs nor accepts. Re-authoring 12 files as dual-dialect
 * would be high-risk churn on the working SQLite path.
 *
 * Instead, this single migration builds the FULL current schema
 * (post-V2-16) in one Postgres-native shot. It is GATED to run only
 * when the driver is `postgres` — on SQLite it no-ops, so the same
 * migrations array works for both drivers:
 *
 *   - SQLite boot: InitSchema..CreateTenantDomains build the schema;
 *     this baseline no-ops.
 *   - Postgres boot: InitSchema..CreateTenantDomains each no-op or
 *     are skipped (their `CREATE TABLE IF NOT EXISTS` + SQLite-only
 *     statements either succeed harmlessly or are guarded); this
 *     baseline builds everything.
 *
 * IMPORTANT: a fresh Postgres database should run with ONLY this
 * baseline in the migrations array (see config/database.ts, which
 * selects the migration set by driver). The SQLite-only files are
 * NOT Postgres-safe and must not run against Postgres.
 *
 * Tables (final shape): tenants, tenant_members, users, wallets,
 * kiosks, pricing_configs, system_settings, group_sessions,
 * group_participants, files, print_jobs, print_job_items,
 * transactions, payments, promotions, audit_logs, payouts,
 * payout_schedules, tenant_balances, tenant_brandings,
 * tenant_webhooks, tenant_domains.
 */
export class PostgresBaseline1718100000000 implements MigrationInterface {
  name = 'PostgresBaseline1718100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') {
      // SQLite / others: the incremental chain owns the schema.
      return;
    }

    const ID = `uuid PRIMARY KEY DEFAULT gen_random_uuid()`;
    const TS = `timestamptz NOT NULL DEFAULT now()`;

    // pgcrypto provides gen_random_uuid on older Postgres; on PG13+
    // it's built in, but enabling the extension is idempotent + safe.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" ${ID},
        "name" varchar(255) NOT NULL,
        "slug" varchar(30) NOT NULL UNIQUE,
        "customDomain" varchar(255) UNIQUE,
        "status" varchar(20) NOT NULL DEFAULT 'trial',
        "commissionPct" numeric(5,4) NOT NULL DEFAULT 0.1,
        "paystackSubaccountCode" varchar(64),
        "suspendedAt" timestamptz,
        "suspendReason" varchar(255),
        "address" varchar(255),
        "lat" double precision,
        "lng" double precision,
        "isDiscoverable" boolean NOT NULL DEFAULT false,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_members" (
        "id" ${ID},
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL,
        "role" varchar(20) NOT NULL DEFAULT 'staff',
        "createdAt" ${TS},
        UNIQUE ("tenantId", "userId")
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "firstName" varchar(100) NOT NULL,
        "lastName" varchar(100) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phoneNumber" varchar(20) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "salt" varchar(255) NOT NULL,
        "printToken" varchar(96) UNIQUE,
        "isEmailVerified" boolean NOT NULL DEFAULT false,
        "verificationToken" varchar(10),
        "resetToken" varchar(10),
        "role" varchar(20) NOT NULL DEFAULT 'user',
        "adminPrivileges" text,
        "isBlocked" boolean NOT NULL DEFAULT false,
        "blockReason" varchar(255),
        "totpSecret" varchar(64),
        "totpEnabled" boolean NOT NULL DEFAULT false,
        "lastLoginAt" timestamptz,
        "createdAt" ${TS},
        "updatedAt" ${TS},
        "deletedAt" timestamptz,
        UNIQUE ("email", "tenantId")
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wallets" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "userId" uuid NOT NULL UNIQUE,
        "balance" numeric(10,2) NOT NULL DEFAULT 0,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "kiosks" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "location" varchar(255),
        "campus" varchar(100),
        "shopId" varchar(255),
        "apiKey" varchar(255) NOT NULL UNIQUE,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "printerName" varchar(255),
        "printerModel" varchar(255),
        "ipAddress" varchar(100),
        "lastSeenAt" timestamptz,
        "lastPrintedAt" timestamptz,
        "testPrintPassedAt" timestamptz,
        "totalJobsPrinted" integer NOT NULL DEFAULT 0,
        "totalPagesPrinted" integer NOT NULL DEFAULT 0,
        "notes" text,
        "mapsUrl" varchar(1024),
        "isPublic" boolean NOT NULL DEFAULT true,
        "createdAt" ${TS},
        "updatedAt" ${TS},
        "deletedAt" timestamptz
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pricing_configs" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "paperSize" varchar(10) NOT NULL DEFAULT 'A4',
        "colorType" varchar(20) NOT NULL DEFAULT 'BLACK_WHITE',
        "pricePerPage" numeric(10,2) NOT NULL,
        "duplexMultiplier" numeric(4,2) NOT NULL DEFAULT 1,
        "highResolutionMultiplier" numeric(4,2) NOT NULL DEFAULT 1,
        "price100Simplex" numeric(10,2),
        "price300Simplex" numeric(10,2),
        "price600Simplex" numeric(10,2),
        "price100Duplex" numeric(10,2),
        "price300Duplex" numeric(10,2),
        "price600Duplex" numeric(10,2),
        "isActive" boolean NOT NULL DEFAULT true,
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "notes" text,
        "createdAt" ${TS},
        "updatedAt" ${TS},
        UNIQUE ("tenantId", "paperSize", "colorType")
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "system_settings" (
        "id" ${ID},
        "key" varchar(100) NOT NULL UNIQUE,
        "value" text NOT NULL,
        "valueType" varchar(50) NOT NULL DEFAULT 'string',
        "category" varchar(100),
        "description" text,
        "isReadOnly" boolean NOT NULL DEFAULT false,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "group_sessions" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "hostUserId" uuid,
        "groupName" varchar(255) NOT NULL,
        "deadline" timestamptz NOT NULL,
        "status" varchar(10) NOT NULL DEFAULT 'open',
        "shareUrl" varchar(255) NOT NULL,
        "shareId" varchar(20) UNIQUE,
        "watermarkPrefix" varchar(50),
        "batchCode" varchar(10),
        "batchToken" varchar(255),
        "closedAt" timestamptz,
        "defaultOptions" text NOT NULL,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "group_participants" (
        "id" ${ID},
        "groupSessionId" uuid NOT NULL REFERENCES "group_sessions"("id"),
        "userId" uuid,
        "name" varchar(255) NOT NULL,
        "email" varchar(255),
        "phoneNumber" varchar(50),
        "watermarkId" varchar(50),
        "uploadToken" varchar(255) NOT NULL UNIQUE,
        "status" varchar(20) NOT NULL DEFAULT 'JOINED',
        "printJobId" uuid,
        "joinedAt" timestamptz,
        "uploadedAt" timestamptz,
        "paidAt" timestamptz,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "files" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "mimeType" varchar(100) NOT NULL,
        "sizeBytes" integer NOT NULL,
        "fileURL" text NOT NULL,
        "watermarkedUrl" text,
        "pageCount" integer NOT NULL DEFAULT 1,
        "participantId" uuid,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "print_jobs" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "userId" uuid,
        "fileId" uuid,
        "fileName" varchar(255),
        "code" varchar(10) UNIQUE,
        "paymentReference" varchar(255),
        "cost" numeric(10,2) NOT NULL,
        "totalPages" integer NOT NULL DEFAULT 0,
        "jobType" varchar(20),
        "status" varchar(20) NOT NULL DEFAULT 'ready',
        "printConfiguration" text NOT NULL,
        "kioskId" uuid,
        "printerId" uuid,
        "printerName" varchar(255),
        "groupSessionId" uuid,
        "watermarkId" varchar(50),
        "pagesCompleted" integer NOT NULL DEFAULT 0,
        "renderedKey" varchar(255),
        "renderedPdfUrl" varchar(255),
        "previewImageUrls" text,
        "renderingStatus" varchar(20) NOT NULL DEFAULT 'pending',
        "renderingError" text,
        "renderingStartedAt" timestamptz,
        "renderingCompletedAt" timestamptz,
        "idempotencyKey" varchar(128),
        "expiresAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "print_job_items" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "printJobId" uuid NOT NULL,
        "fileId" uuid NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "order" integer NOT NULL DEFAULT 0,
        "totalPages" integer NOT NULL DEFAULT 1,
        "cost" numeric(10,2) NOT NULL DEFAULT 0,
        "printConfiguration" text NOT NULL,
        "createdAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" ${ID},
        "walletId" uuid NOT NULL,
        "tenantId" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "commissionAmount" numeric(10,2) NOT NULL DEFAULT 0,
        "description" varchar(255) NOT NULL,
        "balanceAfter" numeric(10,2) NOT NULL,
        "reference" varchar(100),
        "createdAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'SUCCESS',
        "method" varchar(20) NOT NULL DEFAULT 'wallet',
        "reference" varchar(120),
        "description" varchar(255),
        "refundedAt" timestamptz,
        "refundReason" varchar(255),
        "refundAmount" numeric(10,2),
        "refundType" varchar(10),
        "refundReference" varchar(120),
        "refundedBy" uuid,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "promotions" (
        "id" ${ID},
        "tenantId" uuid NOT NULL,
        "code" varchar(64) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "discountType" varchar(20) NOT NULL DEFAULT 'percentage',
        "discountValue" numeric(10,2) NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "usageCount" integer NOT NULL DEFAULT 0,
        "maxUses" integer,
        "startsAt" timestamptz,
        "endsAt" timestamptz,
        "createdAt" ${TS},
        "updatedAt" ${TS},
        UNIQUE ("code", "tenantId")
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" ${ID},
        "tenantId" uuid,
        "actorId" uuid,
        "actorName" varchar(100) NOT NULL,
        "action" varchar(100) NOT NULL,
        "target" varchar(255),
        "detail" text,
        "ipAddress" varchar(45),
        "createdAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payouts" (
        "id" ${ID},
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id"),
        "amount" numeric(12,2) NOT NULL,
        "feeAmount" numeric(12,2) NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'NGN',
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "trigger" varchar(20) NOT NULL DEFAULT 'scheduled',
        "paystackTransferReference" varchar(120),
        "failureReason" varchar(255),
        "requestedAt" timestamptz,
        "paidAt" timestamptz,
        "notes" text,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payout_schedules" (
        "id" ${ID},
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "cadence" varchar(10) NOT NULL DEFAULT 'weekly',
        "dayOfWeek" integer NOT NULL DEFAULT 5,
        "minPayoutAmount" numeric(12,2) NOT NULL DEFAULT 5000,
        "bankCode" varchar(16),
        "accountNumber" varchar(32),
        "accountName" varchar(255),
        "recipientCode" varchar(64),
        "createdAt" ${TS},
        "updatedAt" ${TS},
        UNIQUE ("tenantId")
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_balances" (
        "tenantId" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
        "lifetimeTenantNet" numeric(14,2) NOT NULL DEFAULT 0,
        "lifetimeCommission" numeric(14,2) NOT NULL DEFAULT 0,
        "lifetimePayouts" numeric(14,2) NOT NULL DEFAULT 0,
        "pendingPayouts" numeric(14,2) NOT NULL DEFAULT 0,
        "availableBalance" numeric(14,2) NOT NULL DEFAULT 0,
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_brandings" (
        "tenantId" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
        "wordmark" varchar(100),
        "tagline" varchar(120),
        "logoUrl" varchar(1024),
        "faviconUrl" varchar(1024),
        "primaryColor" varchar(7),
        "secondaryColor" varchar(7),
        "accentColor" varchar(7),
        "emailFromName" varchar(100),
        "supportEmail" varchar(255),
        "supportPhone" varchar(32),
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_webhooks" (
        "id" ${ID},
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "name" varchar(100) NOT NULL,
        "url" varchar(1024) NOT NULL,
        "secret" varchar(96) NOT NULL,
        "events" text NOT NULL DEFAULT '[]',
        "isActive" boolean NOT NULL DEFAULT true,
        "lastSuccessAt" timestamptz,
        "lastFailureAt" timestamptz,
        "lastFailureReason" varchar(255),
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_domains" (
        "id" ${ID},
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "domain" varchar(255) NOT NULL UNIQUE,
        "status" varchar(10) NOT NULL DEFAULT 'pending',
        "verificationToken" varchar(64) NOT NULL,
        "verifiedAt" timestamptz,
        "lastCheckedAt" timestamptz,
        "lastCheckError" varchar(255),
        "createdAt" ${TS},
        "updatedAt" ${TS}
      )`);

    // Hot-path indexes — every tenant-scoped table gets a tenantId
    // index; the high-traffic ones get composite indexes matching
    // their query shapes.
    const idx: Array<[string, string]> = [
      ['idx_pg_user_tenant', 'users ("tenantId")'],
      ['idx_pg_wallet_tenant', 'wallets ("tenantId")'],
      ['idx_pg_kiosk_tenant', 'kiosks ("tenantId")'],
      ['idx_pg_kiosk_apikey', 'kiosks ("apiKey")'],
      ['idx_pg_pricing_tenant', 'pricing_configs ("tenantId")'],
      ['idx_pg_file_tenant', 'files ("tenantId")'],
      ['idx_pg_pj_tenant_status', 'print_jobs ("tenantId", "status")'],
      ['idx_pg_pji_tenant', 'print_job_items ("tenantId")'],
      ['idx_pg_pji_job', 'print_job_items ("printJobId")'],
      ['idx_pg_tx_tenant', 'transactions ("tenantId")'],
      ['idx_pg_payment_tenant', 'payments ("tenantId")'],
      ['idx_pg_promo_tenant', 'promotions ("tenantId")'],
      ['idx_pg_audit_tenant', 'audit_logs ("tenantId")'],
      ['idx_pg_payout_tenant_status', 'payouts ("tenantId", "status")'],
      ['idx_pg_gs_tenant', 'group_sessions ("tenantId")'],
      ['idx_pg_gp_session', 'group_participants ("groupSessionId")'],
      ['idx_pg_webhook_tenant', 'tenant_webhooks ("tenantId")'],
      ['idx_pg_domain_tenant', 'tenant_domains ("tenantId")'],
    ];
    for (const [name, target] of idx) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "${name}" ON "${target.split(' ')[0]}" ${target.slice(target.indexOf('('))}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    // Drop in reverse dependency order. Cascade handles FK children.
    for (const t of [
      'tenant_domains',
      'tenant_webhooks',
      'tenant_brandings',
      'tenant_balances',
      'payout_schedules',
      'payouts',
      'audit_logs',
      'promotions',
      'payments',
      'transactions',
      'print_job_items',
      'print_jobs',
      'files',
      'group_participants',
      'group_sessions',
      'system_settings',
      'pricing_configs',
      'kiosks',
      'wallets',
      'users',
      'tenant_members',
      'tenants',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    }
  }
}
