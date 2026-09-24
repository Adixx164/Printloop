import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrintJobRenderFields1718700000000 implements MigrationInterface {
  name = 'AddPrintJobRenderFields1718700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. SQLite execution:
    if (queryRunner.connection.options.type === 'sqlite') {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `PRAGMA table_info("print_jobs")`,
      );
      if (!rows.some((r) => r.name === 'renderedKey')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderedKey" varchar(255)`);
      }
      if (!rows.some((r) => r.name === 'renderedPdfUrl')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderedPdfUrl" varchar(255)`);
      }
      if (!rows.some((r) => r.name === 'previewImageUrls')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "previewImageUrls" text`);
      }
      if (!rows.some((r) => r.name === 'renderingStatus')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingStatus" varchar(20) NOT NULL DEFAULT 'pending'`);
      }
      if (!rows.some((r) => r.name === 'renderingError')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingError" text`);
      }
      if (!rows.some((r) => r.name === 'renderingStartedAt')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingStartedAt" datetime`);
      }
      if (!rows.some((r) => r.name === 'renderingCompletedAt')) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingCompletedAt" datetime`);
      }
    }

    // 2. Postgres execution:
    if (queryRunner.connection.options.type === 'postgres') {
      const checkCol = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'print_jobs' AND column_name = 'renderedKey'
      `);
      if (checkCol.length === 0) {
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderedKey" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderedPdfUrl" varchar(255)`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "previewImageUrls" text`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingStatus" varchar(20) NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingError" text`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingStartedAt" timestamptz`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "renderingCompletedAt" timestamptz`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
