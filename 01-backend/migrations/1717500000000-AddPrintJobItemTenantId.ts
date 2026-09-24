import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `tenantId` to `print_job_items` so per-tenant queries can
 * filter without joining the parent PrintJob.
 *
 * Backfill: populated from the parent PrintJob's tenantId via a
 * single correlated UPDATE. Idempotent — re-running is a no-op
 * (the column add is PRAGMA-guarded and the UPDATE filters on
 * NULL).
 */
export class AddPrintJobItemTenantId1717500000000
  implements MigrationInterface
{
  name = 'AddPrintJobItemTenantId1717500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'print_job_items',
      'tenantId',
      `ALTER TABLE "print_job_items" ADD COLUMN "tenantId" varchar`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pji_tenant" ON "print_job_items" ("tenantId")`,
    );

    // Backfill from the parent PrintJob's tenantId. SQLite's
    // correlated-subquery UPDATE syntax keeps this to one statement.
    await queryRunner.query(`
      UPDATE "print_job_items"
         SET "tenantId" = (
           SELECT pj."tenantId"
             FROM "print_jobs" pj
            WHERE pj."id" = "print_job_items"."printJobId"
         )
       WHERE "tenantId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite can't DROP COLUMN without a table rewrite; leaving the
    // column in place is harmless on rollback.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pji_tenant"`);
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
