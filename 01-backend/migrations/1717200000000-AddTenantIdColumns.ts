import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase A — Dimension 1: add `tenantId` to every customer-facing
 * table. transactions already got it in
 * CreateSaasFoundation1717100000000; this migration covers the
 * remaining ten:
 *
 *   users, wallets, kiosks, print_jobs, payments, files,
 *   pricing_configs, promotions, group_sessions, audit_logs
 *
 * Every column is added NULLABLE so existing rows stay valid; the
 * `ensureLegacyTenant` step in config/seed.ts backfills them all to
 * the legacy tenant id on next boot.
 *
 * Indexes: every table gets `idx_<table>_tenant ON (tenantId)`. A
 * few hot tables also get a compound index suited to their primary
 * query shape (print_jobs is read by tenant+status, audit_logs by
 * tenant+action).
 *
 * SQLite has no `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so each
 * column is gated on a PRAGMA table_info check (same pattern as
 * CreateSaasFoundation). Safe to re-run.
 *
 * NOT in scope (deferred):
 *   - Tightening users.email from globally-unique to (email, tenantId).
 *   - Tightening promotions.code from globally-unique to (tenantId, code).
 *   - Tightening pricing_configs(paperSize,colorType) to include tenantId.
 *
 *   Those need a SQLite table-rewrite (no `ALTER TABLE DROP CONSTRAINT`),
 *   so they ride together once the v2 cutover is verified.
 */
export class AddTenantIdColumns1717200000000 implements MigrationInterface {
  name = 'AddTenantIdColumns1717200000000';

  private static readonly TABLES: string[] = [
    'users',
    'wallets',
    'kiosks',
    'print_jobs',
    'payments',
    'files',
    'pricing_configs',
    'promotions',
    'group_sessions',
    'audit_logs',
  ];

  private static readonly EXTRA_INDEXES: Array<{ name: string; sql: string }> = [
    {
      name: 'idx_print_job_tenant_status',
      sql: `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant_status" ON "print_jobs" ("tenantId", "status")`,
    },
    {
      name: 'idx_audit_log_tenant_action',
      sql: `CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_action" ON "audit_logs" ("tenantId", "action")`,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of AddTenantIdColumns1717200000000.TABLES) {
      await this.addTenantIdIfMissing(queryRunner, table);
      await this.createTenantIndex(queryRunner, table);
    }
    for (const idx of AddTenantIdColumns1717200000000.EXTRA_INDEXES) {
      await queryRunner.query(idx.sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // As with CreateSaasFoundation: SQLite can't DROP COLUMN without a
    // table rewrite, and the column being there is harmless on rollback,
    // so we only drop the indexes. The tenantId data stays — re-running
    // up() is a no-op.
    for (const idx of AddTenantIdColumns1717200000000.EXTRA_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${idx.name}"`);
    }
    for (const table of AddTenantIdColumns1717200000000.TABLES) {
      await queryRunner.query(
        `DROP INDEX IF EXISTS "idx_${this.entityNameFromTable(table)}_tenant"`,
      );
    }
  }

  private async addTenantIdIfMissing(
    qr: QueryRunner,
    table: string,
  ): Promise<void> {
    const rows: Array<{ name: string }> = await qr.query(
      `PRAGMA table_info("${table}")`,
    );
    if (!rows.some((r) => r.name === 'tenantId')) {
      await qr.query(
        `ALTER TABLE "${table}" ADD COLUMN "tenantId" varchar`,
      );
    }
  }

  private async createTenantIndex(
    qr: QueryRunner,
    table: string,
  ): Promise<void> {
    const indexName = `idx_${this.entityNameFromTable(table)}_tenant`;
    await qr.query(
      `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" ("tenantId")`,
    );
  }

  /** users → user, group_sessions → group_session, etc. — matches the
   *  index names used in the entity decorators so they stay aligned. */
  private entityNameFromTable(table: string): string {
    const map: Record<string, string> = {
      users: 'user',
      wallets: 'wallet',
      kiosks: 'kiosk',
      print_jobs: 'print_job',
      payments: 'payment',
      files: 'file',
      pricing_configs: 'pricing',
      promotions: 'promotion',
      group_sessions: 'group_session',
      audit_logs: 'audit_log',
    };
    return map[table] ?? table;
  }
}
