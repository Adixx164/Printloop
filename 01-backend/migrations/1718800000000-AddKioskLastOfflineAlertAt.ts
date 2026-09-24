import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKioskLastOfflineAlertAt1718800000000 implements MigrationInterface {
  name = 'AddKioskLastOfflineAlertAt1718800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqlite') {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("kiosks")`,
      );
      if (!rows.some((r) => r.name === 'lastOfflineAlertAt')) {
        await queryRunner.query(
          `ALTER TABLE "kiosks" ADD COLUMN "lastOfflineAlertAt" datetime`,
        );
      }
    } else {
      await queryRunner.query(`
        ALTER TABLE "kiosks"
        ADD COLUMN IF NOT EXISTS "lastOfflineAlertAt" TIMESTAMPTZ DEFAULT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqlite') {
      // SQLite doesn't support DROP COLUMN — acceptable; this is a dev-only rollback.
    } else {
      await queryRunner.query(
        `ALTER TABLE "kiosks" DROP COLUMN IF EXISTS "lastOfflineAlertAt"`,
      );
    }
  }
}
