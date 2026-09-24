import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase A — Dimension 1: tighten three uniqueness constraints so they
 * are scoped per-tenant instead of globally unique. Without this,
 * Tenant A and Tenant B can't both have a customer named
 * alice@example.com or a promo code WELCOME10.
 *
 *   users.email                       → (email, tenantId)
 *   promotions.code                   → (code, tenantId)
 *   pricing_configs(paperSize,colorType) → (tenantId, paperSize, colorType)
 *
 * SQLite specifics:
 *
 *   - `users` and `promotions` carry their old uniqueness as a TABLE
 *     CONSTRAINT, which can only be removed by rewriting the table
 *     (CREATE new + INSERT + DROP + RENAME + reindex).
 *   - `pricing_configs` carries its uniqueness as an INDEX, which can
 *     be dropped + recreated in place. No table rewrite needed.
 *
 * Safety:
 *   - The legacy backfill (config/seed.ts → ensureLegacyTenant) runs
 *     BEFORE migrations on every boot, so every existing row already
 *     has tenantId='legacy' when this migration runs. The new compound
 *     unique constraint therefore preserves the existing uniqueness.
 *   - Foreign-key checks are disabled around the table rewrites so
 *     dependent tables (wallets→users, etc.) don't reject the DROP.
 *     Re-enabled before the migration finishes.
 *   - TypeORM's migrations table records this migration once it
 *     succeeds, so re-running boot is a no-op.
 */
export class TightenTenantUniqueness1717300000000 implements MigrationInterface {
  name = 'TightenTenantUniqueness1717300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    try {
      await this.rewriteUsers(queryRunner);
      await this.rewritePromotions(queryRunner);
      await this.repointPricingConfigsIndex(queryRunner);
    } finally {
      await queryRunner.query(`PRAGMA foreign_keys = ON`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse direction is destructive on the data (two tenants might
    // share an email after the up migration; reverting would violate
    // the globally-unique constraint). We deliberately do NOT support
    // an automatic down here — manual recovery only.
    throw new Error(
      'TightenTenantUniqueness is one-way: rolling back would re-impose ' +
        'global uniqueness on email/code, which can fail if any pair of ' +
        'tenants share values. Restore from backup instead.',
    );
  }

  private async rewriteUsers(qr: QueryRunner): Promise<void> {
    // 1. Build the new table. Column list matches the post-V2-3 shape
    //    of `users` (Init baseline + tenantId added in V2-3). Keeps
    //    the printToken UNIQUE constraint; replaces the email UNIQUE
    //    with a composite (email, tenantId) UNIQUE.
    await qr.query(`
      CREATE TABLE "users_new" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar,
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
    await qr.query(`
      INSERT INTO "users_new" (
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
    await qr.query(`ALTER TABLE "users_new" RENAME TO "users"`);
    // Recreate the tenant index added in V2-3 — it was dropped with the
    // old table.
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_tenant" ON "users" ("tenantId")`,
    );
  }

  private async rewritePromotions(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE "promotions_new" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar,
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
      INSERT INTO "promotions_new" (
        "id","tenantId","code","name","description","discountType",
        "discountValue","status","usageCount","maxUses","startsAt",
        "endsAt","createdAt","updatedAt"
      )
      SELECT
        "id","tenantId","code","name","description","discountType",
        "discountValue","status","usageCount","maxUses","startsAt",
        "endsAt","createdAt","updatedAt"
      FROM "promotions"
    `);
    await qr.query(`DROP TABLE "promotions"`);
    await qr.query(`ALTER TABLE "promotions_new" RENAME TO "promotions"`);
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "idx_promotion_tenant" ON "promotions" ("tenantId")`,
    );
  }

  private async repointPricingConfigsIndex(qr: QueryRunner): Promise<void> {
    // pricing_configs uniqueness is an INDEX, not a constraint — no
    // table rewrite needed. Drop the old `(paperSize, colorType)`
    // unique index and replace it with `(tenantId, paperSize, colorType)`.
    await qr.query(
      `DROP INDEX IF EXISTS "IDX_8f9dab671b376d1c46cbe837ad"`,
    );
    await qr.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pricing_tenant_paper_color"
        ON "pricing_configs" ("tenantId", "paperSize", "colorType")
    `);
  }
}
