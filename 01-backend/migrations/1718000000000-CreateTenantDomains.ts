import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Custom-domain claims table (Dimension 8 — V2-16).
 *
 * Tracks the ownership-proof lifecycle for a tenant's custom domain.
 * `tenant.customDomain` is the resolved/active domain; this table is
 * the staging + audit area for getting there.
 */
export class CreateTenantDomains1718000000000 implements MigrationInterface {
  name = 'CreateTenantDomains1718000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_domains" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "domain" varchar(255) NOT NULL,
        "status" varchar CHECK( "status" IN ('pending','verified','failed') ) NOT NULL DEFAULT ('pending'),
        "verificationToken" varchar(64) NOT NULL,
        "verifiedAt" datetime,
        "lastCheckedAt" datetime,
        "lastCheckError" varchar(255),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "UQ_tenant_domains_domain" UNIQUE ("domain"),
        CONSTRAINT "FK_tenant_domains_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_tenant_domain_tenant" ON "tenant_domains" ("tenantId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tenant_domain_tenant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_domains"`);
  }
}
