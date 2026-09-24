import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisputesAndReviews1718600000000
  implements MigrationInterface
{
  name = 'CreateDisputesAndReviews1718600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') return;

    // 1. Create disputes table
    await queryRunner.query(`
      CREATE TABLE "disputes" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "printJobId" varchar NOT NULL,
        "reason" text NOT NULL,
        "status" varchar CHECK( "status" IN ('pending','resolved','rejected') ) NOT NULL DEFAULT ('pending'),
        "resolutionNotes" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 2. Create shop_reviews table
    await queryRunner.query(`
      CREATE TABLE "shop_reviews" (
        "id" varchar PRIMARY KEY NOT NULL,
        "tenantId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "rating" integer NOT NULL,
        "comment" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 3. Add photos column to tenants table
    await queryRunner.query(`
      ALTER TABLE "tenants" ADD COLUMN "photos" text
    `);

    // 4. Create indexes
    await queryRunner.query(`
      CREATE INDEX "idx_dispute_tenant" ON "disputes" ("tenantId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_dispute_user" ON "disputes" ("userId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_review_tenant" ON "shop_reviews" ("tenantId")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_review_user" ON "shop_reviews" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'postgres') return;

    await queryRunner.query(`DROP INDEX "idx_review_user"`);
    await queryRunner.query(`DROP INDEX "idx_review_tenant"`);
    await queryRunner.query(`DROP INDEX "idx_dispute_user"`);
    await queryRunner.query(`DROP INDEX "idx_dispute_tenant"`);
    
    // SQLite doesn't support DROP COLUMN easily, so we just drop the tables
    await queryRunner.query(`DROP TABLE "shop_reviews"`);
    await queryRunner.query(`DROP TABLE "disputes"`);
  }
}
