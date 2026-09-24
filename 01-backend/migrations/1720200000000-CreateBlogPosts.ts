import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * V2-54 — marketing blog. Platform-wide posts, tenant-owned, surfaced
 * publicly when PUBLISHED.
 */
export class CreateBlogPosts1720200000000 implements MigrationInterface {
  name = 'CreateBlogPosts1720200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'sqlite') {
      const rows: Array<{ name: string }> = await queryRunner.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='blog_posts'`,
      );
      if (rows.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "blog_posts" (
            "id" varchar PRIMARY KEY NOT NULL,
            "tenantId" uuid NOT NULL,
            "slug" varchar(160) NOT NULL,
            "title" varchar(200) NOT NULL,
            "excerpt" varchar(400),
            "content" text NOT NULL,
            "coverImageUrl" varchar(500),
            "authorName" varchar(120),
            "status" varchar CHECK( "status" IN ('draft','published') ) NOT NULL DEFAULT ('draft'),
            "tags" text,
            "publishedAt" datetime,
            "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
            "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
            CONSTRAINT "UQ_blog_slug" UNIQUE ("slug")
          )
        `);
        await queryRunner.query(
          `CREATE INDEX "idx_blog_tenant_status" ON "blog_posts" ("tenantId", "status")`,
        );
      }
    }

    if (queryRunner.connection.options.type === 'postgres') {
      const rows: Array<{ table_name: string }> = await queryRunner.query(
        `SELECT table_name FROM information_schema.tables WHERE table_name = 'blog_posts'`,
      );
      if (rows.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "blog_posts" (
            "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            "tenantId" uuid NOT NULL,
            "slug" varchar(160) NOT NULL,
            "title" varchar(200) NOT NULL,
            "excerpt" varchar(400),
            "content" text NOT NULL,
            "coverImageUrl" varchar(500),
            "authorName" varchar(120),
            "status" varchar CHECK( "status" IN ('draft','published') ) NOT NULL DEFAULT ('draft'),
            "tags" text,
            "publishedAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT "UQ_blog_slug" UNIQUE ("slug")
          )
        `);
        await queryRunner.query(
          `CREATE INDEX "idx_blog_tenant_status" ON "blog_posts" ("tenantId", "status")`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner;
  }
}
