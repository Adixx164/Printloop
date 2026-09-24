import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant webhooks table (Dimension 14 — V2-14).
 *
 * Per-tenant outbound webhook endpoints. The platform POSTs each
 * subscribed event with an HMAC-SHA256 signature so the tenant
 * can verify authenticity.
 */
export class CreateTenantWebhooks1717900000000 implements MigrationInterface {
  name = 'CreateTenantWebhooks1717900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_webhooks" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "name" varchar(100) NOT NULL,
        "url" varchar(1024) NOT NULL,
        "secret" varchar(96) NOT NULL,
        "events" text NOT NULL DEFAULT ('[]'),
        "isActive" boolean NOT NULL DEFAULT (1),
        "lastSuccessAt" datetime,
        "lastFailureAt" datetime,
        "lastFailureReason" varchar(255),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_tenant_webhooks_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_tenant_webhook_tenant" ON "tenant_webhooks" ("tenantId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tenant_webhook_tenant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_webhooks"`);
  }
}
