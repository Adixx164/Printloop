import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SaaS multi-tenant foundation (Phase A of SAAS-ROADMAP.md).
 *
 * Adds:
 *   - tenants               — one row per printing business.
 *   - tenant_members        — User ↔ Tenant join with role.
 *   - payouts               — Dimension 15: outgoing transfers ledger.
 *   - payout_schedules      — per-tenant payout cadence + bank account.
 *   - transactions.tenantId — tag every transaction to a tenant.
 *   - transactions.commissionAmount — Bolt-style commission slice (₦).
 *
 * Every statement is idempotent (CREATE TABLE IF NOT EXISTS, ALTER TABLE
 * guarded by a PRAGMA check) so the migration is safe to run against a
 * fresh DB or a DB that's already been partially migrated by an older
 * synchronize run.
 *
 * Backfill: a 'legacy' tenant row is created in config/seed.ts (not
 * here) because seeding is data, not schema. Existing transactions get
 * their tenantId backfilled by the same seed once the legacy tenant
 * exists.
 */
export class CreateSaasFoundation1717100000000 implements MigrationInterface {
  name = 'CreateSaasFoundation1717100000000';

  private static readonly CREATE_TABLES: string[] = [
    `CREATE TABLE IF NOT EXISTS "tenants" (
       "id" varchar PRIMARY KEY NOT NULL,
       "name" varchar(255) NOT NULL,
       "slug" varchar(30) NOT NULL,
       "customDomain" varchar(255),
       "status" varchar CHECK( "status" IN ('trial','active','suspended','closed') ) NOT NULL DEFAULT ('trial'),
       "commissionPct" decimal(5,4) NOT NULL DEFAULT (0.1),
       "paystackSubaccountCode" varchar(64),
       "suspendedAt" datetime,
       "suspendReason" varchar(255),
       "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
       "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
       CONSTRAINT "UQ_tenants_slug" UNIQUE ("slug"),
       CONSTRAINT "UQ_tenants_custom_domain" UNIQUE ("customDomain")
     )`,
    `CREATE TABLE IF NOT EXISTS "tenant_members" (
       "id" varchar PRIMARY KEY NOT NULL,
       "tenantId" varchar NOT NULL,
       "userId" varchar NOT NULL,
       "role" varchar CHECK( "role" IN ('owner','admin','staff') ) NOT NULL DEFAULT ('staff'),
       "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
       CONSTRAINT "FK_tenant_members_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
       CONSTRAINT "FK_tenant_members_user"   FOREIGN KEY ("userId")   REFERENCES "users"   ("id") ON DELETE CASCADE ON UPDATE NO ACTION
     )`,
    `CREATE TABLE IF NOT EXISTS "payouts" (
       "id" varchar PRIMARY KEY NOT NULL,
       "tenantId" varchar NOT NULL,
       "amount" decimal(12,2) NOT NULL,
       "feeAmount" decimal(12,2) NOT NULL DEFAULT (0),
       "currency" varchar(3) NOT NULL DEFAULT ('NGN'),
       "status" varchar CHECK( "status" IN ('pending','processing','paid','failed','cancelled') ) NOT NULL DEFAULT ('pending'),
       "trigger" varchar CHECK( "trigger" IN ('scheduled','instant','manual') ) NOT NULL DEFAULT ('scheduled'),
       "paystackTransferReference" varchar(120),
       "failureReason" varchar(255),
       "requestedAt" datetime,
       "paidAt" datetime,
       "notes" text,
       "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
       "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
       CONSTRAINT "FK_payouts_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
     )`,
    `CREATE TABLE IF NOT EXISTS "payout_schedules" (
       "id" varchar PRIMARY KEY NOT NULL,
       "tenantId" varchar NOT NULL,
       "cadence" varchar CHECK( "cadence" IN ('daily','weekly','manual') ) NOT NULL DEFAULT ('weekly'),
       "dayOfWeek" integer NOT NULL DEFAULT (5),
       "minPayoutAmount" decimal(12,2) NOT NULL DEFAULT (5000),
       "bankCode" varchar(16),
       "accountNumber" varchar(32),
       "accountName" varchar(255),
       "recipientCode" varchar(64),
       "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
       "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
       CONSTRAINT "FK_payout_schedules_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
     )`,
  ];

  private static readonly CREATE_INDEXES: string[] = [
    `CREATE INDEX        IF NOT EXISTS "idx_tenant_slug"              ON "tenants" ("slug")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_member_unique"     ON "tenant_members" ("tenantId", "userId")`,
    `CREATE INDEX        IF NOT EXISTS "idx_tenant_member_user"       ON "tenant_members" ("userId")`,
    `CREATE INDEX        IF NOT EXISTS "idx_payout_tenant_status"     ON "payouts" ("tenantId", "status")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_payout_paystack_ref"      ON "payouts" ("paystackTransferReference") WHERE "paystackTransferReference" IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_payout_schedule_tenant"   ON "payout_schedules" ("tenantId")`,
    `CREATE INDEX        IF NOT EXISTS "idx_transaction_tenant"       ON "transactions" ("tenantId")`,
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of CreateSaasFoundation1717100000000.CREATE_TABLES) {
      await queryRunner.query(sql);
    }

    // SQLite has no `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so we
    // check PRAGMA table_info first. The columns are added nullable
    // (tenantId) and with default 0 (commissionAmount) so existing
    // rows are valid without a backfill — the seed step will populate
    // tenantId on legacy rows once the 'legacy' tenant exists.
    await this.addColumnIfMissing(
      queryRunner,
      'transactions',
      'tenantId',
      `ALTER TABLE "transactions" ADD COLUMN "tenantId" varchar`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'transactions',
      'commissionAmount',
      `ALTER TABLE "transactions" ADD COLUMN "commissionAmount" decimal(10,2) NOT NULL DEFAULT (0)`,
    );

    for (const sql of CreateSaasFoundation1717100000000.CREATE_INDEXES) {
      await queryRunner.query(sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reversal drops in dependency order. The ALTERs on `transactions`
    // are NOT undone — SQLite doesn't support DROP COLUMN without a
    // table rewrite, and the legacy rows depend on those columns
    // continuing to exist if we roll back the rest. Safe to leave.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_transaction_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payout_schedule_tenant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payout_paystack_ref"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_payout_tenant_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tenant_member_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tenant_member_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tenant_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payout_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payouts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }

  private async addColumnIfMissing(
    qr: QueryRunner,
    table: string,
    column: string,
    addSql: string,
  ): Promise<void> {
    const rows: Array<{ name: string }> = await qr.query(
      `PRAGMA table_info("${table}")`,
    );
    if (!rows.some((r) => r.name === column)) {
      await qr.query(addSql);
    }
  }
}
