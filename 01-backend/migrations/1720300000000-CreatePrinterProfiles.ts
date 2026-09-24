import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * V2-56 — printer profiles + job pinning column.
 */
export class CreatePrinterProfiles1720300000000 implements MigrationInterface {
  name = 'CreatePrinterProfiles1720300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqlite') {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='printer_profiles'`,
      );
      if (rows.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "printer_profiles" (
            "id" varchar PRIMARY KEY NOT NULL,
            "tenantId" uuid NOT NULL,
            "kioskId" varchar,
            "displayName" varchar(120) NOT NULL,
            "ippUri" varchar(500),
            "driverKind" varchar(20) NOT NULL DEFAULT ('unknown'),
            "capabilities" text NOT NULL,
            "isDefault" boolean NOT NULL DEFAULT (0),
            "isActive" boolean NOT NULL DEFAULT (1),
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
          )
        `);
        await queryRunner.query(
          `CREATE INDEX "idx_printer_profile_tenant" ON "printer_profiles" ("tenantId")`,
        );
      }
      const jobCols: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("print_jobs")`,
      );
      if (!jobCols.some((r) => r.name === 'printerProfileId')) {
        await queryRunner.query(
          `ALTER TABLE "print_jobs" ADD COLUMN "printerProfileId" varchar`,
        );
      }
    }

    if (queryRunner.connection.options.type === 'postgres') {
      const rows: Array<{ table_name: string }> = await queryRunner.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'printer_profiles'`,
      );
      if (rows.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "printer_profiles" (
            "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            "tenantId" uuid NOT NULL,
            "kioskId" uuid,
            "displayName" varchar(120) NOT NULL,
            "ippUri" varchar(500),
            "driverKind" varchar(20) NOT NULL DEFAULT ('unknown'),
            "capabilities" text NOT NULL,
            "isDefault" boolean NOT NULL DEFAULT false,
            "isActive" boolean NOT NULL DEFAULT true,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
          )
        `);
        await queryRunner.query(
          `CREATE INDEX "idx_printer_profile_tenant" ON "printer_profiles" ("tenantId")`,
        );
      }
      const jobCols = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'print_jobs' AND column_name = 'printerProfileId'
      `);
      if (jobCols.length === 0) {
        await queryRunner.query(
          `ALTER TABLE "print_jobs" ADD COLUMN "printerProfileId" uuid`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
