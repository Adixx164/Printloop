import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widen `print_jobs.status` CHECK constraint to include the new
 * `'rendering'` state introduced when the render-worker queue was
 * wired in.
 *
 * SQLite stores the CHECK as part of the table definition, so this
 * is another table-rewrite migration (same pattern as
 * TightenTenantUniqueness): create new → copy → drop → rename.
 *
 * Foreign-key drop blast radius: print_jobs is referenced from
 * group_participants.printJobId. We disable FK checks around the
 * rewrite and re-enable after.
 */
export class AddRenderingStatus1717400000000 implements MigrationInterface {
  name = 'AddRenderingStatus1717400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    try {
      await queryRunner.query(`
        CREATE TABLE "print_jobs_new" (
          "id" varchar PRIMARY KEY NOT NULL,
          "tenantId" varchar,
          "userId" varchar,
          "fileId" varchar,
          "fileName" varchar(255),
          "code" varchar(10) NOT NULL,
          "cost" decimal(10,2) NOT NULL,
          "totalPages" integer NOT NULL DEFAULT (0),
          "jobType" varchar(20),
          "status" varchar CHECK( "status" IN ('pending','rendering','ready','releasing','printing','done','failed','expired','refunded') ) NOT NULL DEFAULT ('ready'),
          "printConfiguration" text NOT NULL,
          "kioskId" varchar,
          "printerId" varchar,
          "printerName" varchar(255),
          "groupSessionId" varchar,
          "watermarkId" varchar(50),
          "pagesCompleted" integer NOT NULL DEFAULT (0),
          "idempotencyKey" varchar(128),
          "expiresAt" datetime,
          "completedAt" datetime,
          "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
          "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
          CONSTRAINT "UQ_print_jobs_code" UNIQUE ("code")
        )
      `);
      await queryRunner.query(`
        INSERT INTO "print_jobs_new" (
          "id","tenantId","userId","fileId","fileName","code","cost",
          "totalPages","jobType","status","printConfiguration","kioskId",
          "printerId","printerName","groupSessionId","watermarkId",
          "pagesCompleted","idempotencyKey","expiresAt","completedAt",
          "createdAt","updatedAt"
        )
        SELECT
          "id","tenantId","userId","fileId","fileName","code","cost",
          "totalPages","jobType","status","printConfiguration","kioskId",
          "printerId","printerName","groupSessionId","watermarkId",
          "pagesCompleted","idempotencyKey","expiresAt","completedAt",
          "createdAt","updatedAt"
        FROM "print_jobs"
      `);
      await queryRunner.query(`DROP TABLE "print_jobs"`);
      await queryRunner.query(`ALTER TABLE "print_jobs_new" RENAME TO "print_jobs"`);
      // Recreate indexes that were dropped with the old table.
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_user_idem_uniq" ON "print_jobs" ("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant" ON "print_jobs" ("tenantId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant_status" ON "print_jobs" ("tenantId", "status")`,
      );
    } finally {
      await queryRunner.query(`PRAGMA foreign_keys = ON`);
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'AddRenderingStatus is one-way: rolling back would reject any ' +
        'existing rows with status=\'rendering\'. Restore from backup.',
    );
  }
}
