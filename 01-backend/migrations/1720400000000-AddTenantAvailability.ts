import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * V2-57 — operator-controlled shop availability ('open'|'busy'|'closed').
 * Students see only open/busy shops on the map; closed shops reject new
 * uploads at checkout time.
 */
export class AddTenantAvailability1720400000000 implements MigrationInterface {
  name = 'AddTenantAvailability1720400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqlite') {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("tenants")`,
      );
      if (!rows.some((r) => r.name === 'availability')) {
        await queryRunner.query(
          `ALTER TABLE "tenants" ADD COLUMN "availability" varchar NOT NULL DEFAULT 'open'`,
        );
      }
    }

    if (queryRunner.connection.options.type === 'postgres') {
      const checkCol = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'availability'
      `);
      if (checkCol.length === 0) {
        await queryRunner.query(
          `ALTER TABLE "tenants" ADD COLUMN "availability" varchar NOT NULL DEFAULT 'open'`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
