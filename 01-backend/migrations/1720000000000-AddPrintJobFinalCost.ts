import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrintJobFinalCost1720000000000 implements MigrationInterface {
  name = 'AddPrintJobFinalCost1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. SQLite execution:
    if (queryRunner.connection.options.type === 'sqlite') {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("print_jobs")`,
      );
      if (!rows.some((r) => r.name === 'finalCost')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "finalCost" decimal(10,2)`);
      }
      if (!rows.some((r) => r.name === 'costReconciledAt')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "costReconciledAt" datetime`);
      }
    }

    // 2. Postgres execution:
    if (queryRunner.connection.options.type === 'postgres') {
      const checkCol = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'print_jobs' AND column_name = 'finalCost'
      `);
      if (checkCol.length === 0) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "finalCost" decimal(10,2)`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "costReconciledAt" timestamptz`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
