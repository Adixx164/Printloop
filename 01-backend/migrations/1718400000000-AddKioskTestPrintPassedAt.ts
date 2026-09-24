import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Live gate (V2-32) — Kiosk.testPrintPassedAt. Set when the tenant
 * admin confirms a successful test print through this kiosk. Used by
 * the live gate on isDiscoverable to refuse marketplace opt-in until
 * the shop has proved at least one printer actually works.
 *
 * SQLite incremental; PostgresBaseline updated inline so fresh PG
 * deployments boot with the column present.
 */
export class AddKioskTestPrintPassedAt1718400000000
  implements MigrationInterface
{
  name = 'AddKioskTestPrintPassedAt1718400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') return;
    const rows: Array<{ name: string }> = await queryRunner.query(
      `PRAGMA table_info("kiosks")`,
    );
    if (!rows.some((r) => r.name === 'testPrintPassedAt')) {
      await queryRunner.query(
        `ALTER TABLE "kiosks" ADD COLUMN "testPrintPassedAt" datetime`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
