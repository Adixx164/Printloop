import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-tenant brand overrides table (Dimension 7).
 *
 * No backfill — empty branding rows are absence-of-override; the
 * frontend falls back to Tenant.name + the default palette when
 * fields are NULL.
 */
export class CreateTenantBrandings1717800000000 implements MigrationInterface {
  name = 'CreateTenantBrandings1717800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_brandings" (
        "tenantId" varchar PRIMARY KEY NOT NULL,
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
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_tenant_brandings_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_brandings"`);
  }
}
