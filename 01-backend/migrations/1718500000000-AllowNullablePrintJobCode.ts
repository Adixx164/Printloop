import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make print_jobs.code column nullable and add paymentReference (Milestone 1).
 * Allows creating unpaid draft jobs in PENDING status without a release code,
 * which prevents code leakage or uniqueness collisions during draft stages.
 * On Postgres, the columns are updated inline in the PostgresBaseline migration.
 */
export class AllowNullablePrintJobCode1718500000000
  implements MigrationInterface
{
  name = 'AllowNullablePrintJobCode1718500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') return;

    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    try {
      // 1. Create print_jobs_new table with "code" nullable and add "paymentReference"
      await queryRunner.query(`
        CREATE TABLE "print_jobs_new" (
          "id" varchar PRIMARY KEY NOT NULL,
          "tenantId" varchar NOT NULL,
          "userId" varchar,
          "fileId" varchar,
          "fileName" varchar(255),
          "code" varchar(10),
          "paymentReference" varchar(255),
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

      // 2. Copy the existing data over
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

      // 3. Drop old table
      await queryRunner.query(`DROP TABLE "print_jobs"`);

      // 4. Rename new table
      await queryRunner.query(`ALTER TABLE "print_jobs_new" RENAME TO "print_jobs"`);

      // 5. Recreate indexes
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_user_idem_uniq" ON "print_jobs" ("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant" ON "print_jobs" ("tenantId")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_tenant_status" ON "print_jobs" ("tenantId", "status")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_print_job_code" ON "print_jobs" ("code")`,
      );
    } finally {
      await queryRunner.query(`PRAGMA foreign_keys = ON`);
    }
  }

  public async down(): Promise<void> {
    throw new Error('AllowNullablePrintJobCode is one-way. Restore from backup.');
  }
}
