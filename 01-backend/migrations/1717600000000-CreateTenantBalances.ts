import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the `tenant_balances` table — the denormalised per-tenant
 * running balance that powers dashboard reads in O(1) instead of
 * SUM-over-transactions.
 *
 * No backfill performed here: `recomputeFromScratch(tenantId)` runs
 * lazily on the first read for a tenant whose row doesn't exist
 * yet (see tenantBalance.service.ts → getTenantBalance). For a
 * proper backfill before the SUM-based path is removed, run
 * `recomputeFromScratch` for every tenant via an ops script.
 */
export class CreateTenantBalances1717600000000
  implements MigrationInterface
{
  name = 'CreateTenantBalances1717600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_balances" (
        "tenantId" varchar PRIMARY KEY NOT NULL,
        "lifetimeTenantNet" decimal(14,2) NOT NULL DEFAULT (0),
        "lifetimeCommission" decimal(14,2) NOT NULL DEFAULT (0),
        "lifetimePayouts" decimal(14,2) NOT NULL DEFAULT (0),
        "pendingPayouts" decimal(14,2) NOT NULL DEFAULT (0),
        "availableBalance" decimal(14,2) NOT NULL DEFAULT (0),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_tenant_balances_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_balances"`);
  }
}
