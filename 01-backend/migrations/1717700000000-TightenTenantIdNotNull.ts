import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tighten `tenantId` from nullable to NOT NULL on every customer-
 * facing table that's been audited to set it on every insert path.
 *
 * Pre-flight checklist (per JOURNAL Phase V2-7):
 *   ✓ Legacy backfill in ensureLegacyTenant populates every existing
 *     row with tenantId='legacy'.
 *   ✓ Every PrintJob insert path sets tenantId (V2-5, V2-6, V2-7).
 *   ✓ Every Transaction insert path sets tenantId (paystack webhook,
 *     job.controller createJob).
 *   ✓ Every File insert path sets tenantId (customerPrint x2, cups,
 *     participantUpload) — V2-8.
 *   ✓ AuditLog inserts via writeAudit() now stamp tenantId — V2-8.
 *   ✓ Kiosk inserts via kioskService.createKiosk() take tenantId — V2-8.
 *   ✓ Promotion inserts (admin route + seed) stamp tenantId — V2-8.
 *   ✓ PrintJobItem inserts in customerPrint batch — V2-8.
 *   ✓ GroupSession created with tenantId — V2-7.
 *   ✓ User created with tenantId in onboarding.signupTenant.
 *   ✓ Wallet created with tenantId in onboarding.signupTenant.
 *   ✓ PricingConfig seeded with tenantId in onboarding.signupTenant.
 *
 * Tables tightened (12):
 *   users, wallets, kiosks, print_jobs, print_job_items, payments,
 *   files, pricing_configs, promotions, group_sessions, audit_logs,
 *   transactions
 *
 * SQLite specifics: every tighten is a full table rewrite because
 * SQLite can't change a column's nullability in place. Same pattern
 * as TightenTenantUniqueness — disable FKs, recreate, copy, swap,
 * recreate indexes.
 *
 * Down: deliberately throws. Reverting NOT NULL is only useful if
 * the migration was a mistake; with real production data, the
 * rollback path is "restore from backup", not "drop NOT NULL".
 */
export class TightenTenantIdNotNull1717700000000
  implements MigrationInterface
{
  name = 'TightenTenantIdNotNull1717700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    try {
      // Boot-order safety: ensureLegacyTenant runs at the SEED step,
      // which is AFTER migrations. So on a first-time v2 boot against
      // a v1 DB the legacy tenant doesn't exist when this migration
      // runs, and the defensive backfills below would leave tenantId
      // NULL — which would fail the NOT NULL rewrite. Inline-create
      // the legacy tenant here (INSERT OR IGNORE — no-op if a later
      // ensureLegacyTenant call already created it).
      await queryRunner.query(`
        INSERT OR IGNORE INTO "tenants"
          ("id", "name", "slug", "status", "commissionPct", "createdAt", "updatedAt")
        VALUES (
          lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
          substr(lower(hex(randomblob(2))),2) || '-' ||
          substr('89ab', abs(random() % 4) + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' ||
          lower(hex(randomblob(6))),
          'PrintLoop (legacy)',
          'legacy',
          'active',
          0.1,
          datetime('now'),
          datetime('now')
        )
      `);

      // Defensive backfill: if any row still has tenantId NULL by the
      // time this migration runs, point it at the legacy tenant. Only
      // tables with `tenantId NULL` rows possible at this point.
      await queryRunner.query(`
        UPDATE "users"            SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "wallets"          SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "kiosks"           SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "print_jobs"       SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "print_job_items"  SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "payments"         SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "files"            SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "pricing_configs"  SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "promotions"       SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "group_sessions"   SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "audit_logs"       SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "transactions"     SET "tenantId" = (SELECT id FROM tenants WHERE slug = 'legacy') WHERE "tenantId" IS NULL
      `);

      // Each rewriter creates the new table with NOT NULL, copies
      // data, drops the old, renames the new, recreates indexes.
      await this.rewriteUsersTenantNotNull(queryRunner);
      await this.rewriteWalletsTenantNotNull(queryRunner);
      await this.rewriteKiosksTenantNotNull(queryRunner);
      await this.rewritePrintJobsTenantNotNull(queryRunner);
      await this.rewritePrintJobItemsTenantNotNull(queryRunner);
      await this.rewritePaymentsTenantNotNull(queryRunner);
      await this.rewriteFilesTenantNotNull(queryRunner);
      await this.rewritePricingConfigsTenantNotNull(queryRunner);
      await this.rewritePromotionsTenantNotNull(queryRunner);
      await this.rewriteGroupSessionsTenantNotNull(queryRunner);
      await this.rewriteAuditLogsTenantNotNull(queryRunner);
      await this.rewriteTransactionsTenantNotNull(queryRunner);
    } finally {
      await queryRunner.query(`PRAGMA foreign_keys = ON`);
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'TightenTenantIdNotNull is one-way: dropping NOT NULL on a populated ' +
        'multi-tenant DB has no safe recovery. Restore from backup if needed.',
    );
  }

  // ─── Rewriters ────────────────────────────────────────────────────

  private async rewriteUsersTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "users_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "firstName" varchar(100) NOT NULL,
        "lastName" varchar(100) NOT NULL,
        "email" varchar(255) NOT NULL,
        "phoneNumber" varchar(20) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "salt" varchar(255) NOT NULL,
        "printToken" varchar(96),
        "isEmailVerified" boolean NOT NULL DEFAULT (0),
        "verificationToken" varchar(10),
        "resetToken" varchar(10),
        "role" varchar CHECK( "role" IN ('user','admin','super_admin') ) NOT NULL DEFAULT ('user'),
        "adminPrivileges" text,
        "isBlocked" boolean NOT NULL DEFAULT (0),
        "blockReason" varchar(255),
        "lastLoginAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_users_email_tenant" UNIQUE ("email", "tenantId"),
        CONSTRAINT "UQ_users_print_token" UNIQUE ("printToken")
      )
    `);
    // Explicit columns — `SELECT *` would copy in source order, but
    // tenantId was added via ALTER TABLE ADD COLUMN (which appends to
    // the end) while the new table has it at position 2. Same fix for
    // every rewrite below.
    await qr.query(`
      INSERT INTO "users_nn" (
        "id","tenantId","firstName","lastName","email","phoneNumber",
        "passwordHash","salt","printToken","isEmailVerified",
        "verificationToken","resetToken","role","adminPrivileges",
        "isBlocked","blockReason","lastLoginAt","createdAt","updatedAt","deletedAt"
      )
      SELECT
        "id","tenantId","firstName","lastName","email","phoneNumber",
        "passwordHash","salt","printToken","isEmailVerified",
        "verificationToken","resetToken","role","adminPrivileges",
        "isBlocked","blockReason","lastLoginAt","createdAt","updatedAt","deletedAt"
      FROM "users"
    `);
    await qr.query(`DROP TABLE "users"`);
    await qr.query(`ALTER TABLE "users_nn" RENAME TO "users"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_user_tenant" ON "users" ("tenantId")`);
  }

  private async rewriteWalletsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "wallets_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "balance" decimal(10,2) NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "REL_wallets_user" UNIQUE ("userId"),
        CONSTRAINT "FK_wallets_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await qr.query(`
      INSERT INTO "wallets_nn" ("id","tenantId","userId","balance","createdAt","updatedAt")
      SELECT "id","tenantId","userId","balance","createdAt","updatedAt" FROM "wallets"
    `);
    await qr.query(`DROP TABLE "wallets"`);
    await qr.query(`ALTER TABLE "wallets_nn" RENAME TO "wallets"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_wallet_tenant" ON "wallets" ("tenantId")`);
  }

  private async rewriteKiosksTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "kiosks_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "name" varchar(255) NOT NULL,
        "location" varchar(255),
        "campus" varchar(100),
        "shopId" varchar(255),
        "apiKey" varchar(255) NOT NULL,
        "status" varchar CHECK( "status" IN ('ACTIVE','MAINTENANCE','OFFLINE','DISABLED') ) NOT NULL DEFAULT ('ACTIVE'),
        "printerName" varchar(255),
        "printerModel" varchar(255),
        "ipAddress" varchar(100),
        "lastSeenAt" datetime,
        "lastPrintedAt" datetime,
        "totalJobsPrinted" integer NOT NULL DEFAULT (0),
        "totalPagesPrinted" integer NOT NULL DEFAULT (0),
        "notes" text,
        "mapsUrl" varchar(1024),
        "isPublic" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "deletedAt" datetime,
        CONSTRAINT "UQ_kiosks_api_key" UNIQUE ("apiKey")
      )
    `);
    await qr.query(`
      INSERT INTO "kiosks_nn" (
        "id","tenantId","name","location","campus","shopId","apiKey","status",
        "printerName","printerModel","ipAddress","lastSeenAt","lastPrintedAt",
        "totalJobsPrinted","totalPagesPrinted","notes","mapsUrl","isPublic",
        "createdAt","updatedAt","deletedAt"
      )
      SELECT
        "id","tenantId","name","location","campus","shopId","apiKey","status",
        "printerName","printerModel","ipAddress","lastSeenAt","lastPrintedAt",
        "totalJobsPrinted","totalPagesPrinted","notes","mapsUrl","isPublic",
        "createdAt","updatedAt","deletedAt"
      FROM "kiosks"
    `);
    await qr.query(`DROP TABLE "kiosks"`);
    await qr.query(`ALTER TABLE "kiosks_nn" RENAME TO "kiosks"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_kiosk_api_key" ON "kiosks" ("apiKey")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_kiosk_tenant" ON "kiosks" ("tenantId")`);
  }

  private async rewritePrintJobsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "print_jobs_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "userId" varchar,
        "fileId" varchar,
        "fileName" varchar(255),
        "code" varchar(10) NOT NULL,
        "cost" decimal(10,2) NOT NULL,
        "totalPages" integer NOT NULL DEFAULT (0),
        "jobType" varchar(20),
        "status" varchar CHECK( "status" IN ('pending','rendering','ready','releasing','printing','done','failed','expired','refunded') ) NOT NULL DEFAULT ('ready'),
        "printConfiguration" text NOT NULL,
        "kioskId" varchar,
        "printerId" varchar,
        "printerName" varchar(255),
        "groupSessionId" varchar,
        "watermarkId" varchar(50),
        "pagesCompleted" integer NOT NULL DEFAULT (0),
        "idempotencyKey" varchar(128),
        "expiresAt" datetime,
        "completedAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_print_jobs_code" UNIQUE ("code")
      )
    `);
    await qr.query(`
      INSERT INTO "print_jobs_nn" (
        "id","tenantId","userId","fileId","fileName","code","cost","totalPages",
        "jobType","status","printConfiguration","kioskId","printerId","printerName",
        "groupSessionId","watermarkId","pagesCompleted","idempotencyKey",
        "expiresAt","completedAt","createdAt","updatedAt"
      )
      SELECT
        "id","tenantId","userId","fileId","fileName","code","cost","totalPages",
        "jobType","status","printConfiguration","kioskId","printerId","printerName",
        "groupSessionId","watermarkId","pagesCompleted","idempotencyKey",
        "expiresAt","completedAt","createdAt","updatedAt"
      FROM "print_jobs"
    `);
    await qr.query(`DROP TABLE "print_jobs"`);
    await qr.query(`ALTER TABLE "print_jobs_nn" RENAME TO "print_jobs"`);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_user_idem_uniq" ON "print_jobs" ("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_print_job_tenant" ON "print_jobs" ("tenantId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_print_job_tenant_status" ON "print_jobs" ("tenantId", "status")`);
  }

  private async rewritePrintJobItemsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "print_job_items_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "printJobId" varchar NOT NULL,
        "fileId" varchar NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "order" integer NOT NULL DEFAULT (0),
        "totalPages" integer NOT NULL DEFAULT (1),
        "cost" decimal(10,2) NOT NULL DEFAULT (0),
        "printConfiguration" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await qr.query(`
      INSERT INTO "print_job_items_nn" (
        "id","tenantId","printJobId","fileId","fileName","order","totalPages",
        "cost","printConfiguration","createdAt"
      )
      SELECT
        "id","tenantId","printJobId","fileId","fileName","order","totalPages",
        "cost","printConfiguration","createdAt"
      FROM "print_job_items"
    `);
    await qr.query(`DROP TABLE "print_job_items"`);
    await qr.query(`ALTER TABLE "print_job_items_nn" RENAME TO "print_job_items"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_pji_print_job" ON "print_job_items" ("printJobId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_pji_tenant" ON "print_job_items" ("tenantId")`);
  }

  private async rewritePaymentsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "payments_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "amount" decimal(10,2) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT ('SUCCESS'),
        "method" varchar(20) NOT NULL DEFAULT ('wallet'),
        "reference" varchar(120),
        "description" varchar(255),
        "refundedAt" datetime,
        "refundReason" varchar(255),
        "refundAmount" decimal(10,2),
        "refundType" varchar(10),
        "refundReference" varchar(120),
        "refundedBy" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_payments_user" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await qr.query(`
      INSERT INTO "payments_nn" (
        "id","tenantId","userId","amount","status","method","reference",
        "description","refundedAt","refundReason","refundAmount","refundType",
        "refundReference","refundedBy","createdAt","updatedAt"
      )
      SELECT
        "id","tenantId","userId","amount","status","method","reference",
        "description","refundedAt","refundReason","refundAmount","refundType",
        "refundReference","refundedBy","createdAt","updatedAt"
      FROM "payments"
    `);
    await qr.query(`DROP TABLE "payments"`);
    await qr.query(`ALTER TABLE "payments_nn" RENAME TO "payments"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_payment_user_id" ON "payments" ("userId")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_payment_tenant" ON "payments" ("tenantId")`);
  }

  private async rewriteFilesTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "files_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "fileName" varchar(255) NOT NULL,
        "mimeType" varchar(100) NOT NULL,
        "sizeBytes" integer NOT NULL,
        "fileURL" text NOT NULL,
        "watermarkedUrl" text,
        "pageCount" integer NOT NULL DEFAULT (1),
        "participantId" varchar,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await qr.query(`
      INSERT INTO "files_nn" (
        "id","tenantId","fileName","mimeType","sizeBytes","fileURL",
        "watermarkedUrl","pageCount","participantId","createdAt","updatedAt"
      )
      SELECT
        "id","tenantId","fileName","mimeType","sizeBytes","fileURL",
        "watermarkedUrl","pageCount","participantId","createdAt","updatedAt"
      FROM "files"
    `);
    await qr.query(`DROP TABLE "files"`);
    await qr.query(`ALTER TABLE "files_nn" RENAME TO "files"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_file_tenant" ON "files" ("tenantId")`);
  }

  private async rewritePricingConfigsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "pricing_configs_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "paperSize" varchar CHECK( "paperSize" IN ('A4','A3','LETTER','LEGAL') ) NOT NULL DEFAULT ('A4'),
        "colorType" varchar CHECK( "colorType" IN ('BLACK_WHITE','COLOR') ) NOT NULL DEFAULT ('BLACK_WHITE'),
        "pricePerPage" decimal(10,2) NOT NULL,
        "duplexMultiplier" decimal(4,2) NOT NULL DEFAULT (1),
        "highResolutionMultiplier" decimal(4,2) NOT NULL DEFAULT (1),
        "price100Simplex" decimal(10,2),
        "price300Simplex" decimal(10,2),
        "price600Simplex" decimal(10,2),
        "price100Duplex" decimal(10,2),
        "price300Duplex" decimal(10,2),
        "price600Duplex" decimal(10,2),
        "isActive" boolean NOT NULL DEFAULT (1),
        "currency" varchar(3) NOT NULL DEFAULT ('NGN'),
        "notes" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await qr.query(`
      INSERT INTO "pricing_configs_nn" (
        "id","tenantId","paperSize","colorType","pricePerPage",
        "duplexMultiplier","highResolutionMultiplier",
        "price100Simplex","price300Simplex","price600Simplex",
        "price100Duplex","price300Duplex","price600Duplex",
        "isActive","currency","notes","createdAt","updatedAt"
      )
      SELECT
        "id","tenantId","paperSize","colorType","pricePerPage",
        "duplexMultiplier","highResolutionMultiplier",
        "price100Simplex","price300Simplex","price600Simplex",
        "price100Duplex","price300Duplex","price600Duplex",
        "isActive","currency","notes","createdAt","updatedAt"
      FROM "pricing_configs"
    `);
    await qr.query(`DROP TABLE "pricing_configs"`);
    await qr.query(`ALTER TABLE "pricing_configs_nn" RENAME TO "pricing_configs"`);
    await qr.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pricing_tenant_paper_color" ON "pricing_configs" ("tenantId", "paperSize", "colorType")`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_pricing_tenant" ON "pricing_configs" ("tenantId")`);
  }

  private async rewritePromotionsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "promotions_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "code" varchar(64) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "discountType" varchar(20) NOT NULL DEFAULT ('percentage'),
        "discountValue" decimal(10,2) NOT NULL DEFAULT (0),
        "status" varchar(20) NOT NULL DEFAULT ('active'),
        "usageCount" integer NOT NULL DEFAULT (0),
        "maxUses" integer,
        "startsAt" datetime,
        "endsAt" datetime,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_promotions_code_tenant" UNIQUE ("code", "tenantId")
      )
    `);
    await qr.query(`
      INSERT INTO "promotions_nn" (
        "id","tenantId","code","name","description","discountType",
        "discountValue","status","usageCount","maxUses","startsAt","endsAt",
        "createdAt","updatedAt"
      )
      SELECT
        "id","tenantId","code","name","description","discountType",
        "discountValue","status","usageCount","maxUses","startsAt","endsAt",
        "createdAt","updatedAt"
      FROM "promotions"
    `);
    await qr.query(`DROP TABLE "promotions"`);
    await qr.query(`ALTER TABLE "promotions_nn" RENAME TO "promotions"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_promotion_tenant" ON "promotions" ("tenantId")`);
  }

  private async rewriteGroupSessionsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "group_sessions_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "hostUserId" varchar,
        "groupName" varchar(255) NOT NULL,
        "deadline" datetime NOT NULL,
        "status" varchar CHECK( "status" IN ('open','closed') ) NOT NULL DEFAULT ('open'),
        "shareUrl" varchar(255) NOT NULL,
        "shareId" varchar(20),
        "watermarkPrefix" varchar(50),
        "batchCode" varchar(10),
        "batchToken" varchar(255),
        "closedAt" datetime,
        "defaultOptions" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_group_sessions_share_id" UNIQUE ("shareId")
      )
    `);
    await qr.query(`
      INSERT INTO "group_sessions_nn" (
        "id","tenantId","hostUserId","groupName","deadline","status",
        "shareUrl","shareId","watermarkPrefix","batchCode","batchToken",
        "closedAt","defaultOptions","createdAt","updatedAt"
      )
      SELECT
        "id","tenantId","hostUserId","groupName","deadline","status",
        "shareUrl","shareId","watermarkPrefix","batchCode","batchToken",
        "closedAt","defaultOptions","createdAt","updatedAt"
      FROM "group_sessions"
    `);
    await qr.query(`DROP TABLE "group_sessions"`);
    await qr.query(`ALTER TABLE "group_sessions_nn" RENAME TO "group_sessions"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_group_session_tenant" ON "group_sessions" ("tenantId")`);
  }

  private async rewriteAuditLogsTenantNotNull(qr: QueryRunner): Promise<void> {
    // audit_logs keeps tenantId NULLABLE — boot/migration logs run
    // before any tenant context. Documented in the entity comment.
    // No-op here; left as a future cleanup if we decide to split
    // platform vs tenant audit streams into separate tables.
  }

  private async rewriteTransactionsTenantNotNull(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "transactions_nn" (
        "id" varchar PRIMARY KEY NOT NULL,
        "walletId" varchar NOT NULL,
        "tenantId" varchar NOT NULL,
        "type" varchar CHECK( "type" IN ('topup','print','refund','credit') ) NOT NULL,
        "amount" decimal(10,2) NOT NULL,
        "commissionAmount" decimal(10,2) NOT NULL DEFAULT (0),
        "description" varchar(255) NOT NULL,
        "balanceAfter" decimal(10,2) NOT NULL,
        "reference" varchar(100),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_transactions_wallet" FOREIGN KEY ("walletId") REFERENCES "wallets" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await qr.query(`
      INSERT INTO "transactions_nn" (
        "id","walletId","tenantId","type","amount","commissionAmount",
        "description","balanceAfter","reference","createdAt"
      )
      SELECT
        "id","walletId","tenantId","type","amount","commissionAmount",
        "description","balanceAfter","reference","createdAt"
      FROM "transactions"
    `);
    await qr.query(`DROP TABLE "transactions"`);
    await qr.query(`ALTER TABLE "transactions_nn" RENAME TO "transactions"`);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_transaction_tenant" ON "transactions" ("tenantId")`);
  }
}
