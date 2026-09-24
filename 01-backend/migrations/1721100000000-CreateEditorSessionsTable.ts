import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEditorSessionsTable1721100000000 implements MigrationInterface {
    name = 'CreateEditorSessionsTable1721100000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create editor_sessions table for tracking collaborative editing sessions
        // SQLite-compatible schema with inline foreign keys
        await queryRunner.query(`
            CREATE TABLE "editor_sessions" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "document_edit_id" TEXT NOT NULL,
                "shop_user_id" TEXT,
                "customer_user_id" TEXT,
                "univer_document" TEXT NOT NULL DEFAULT '{}',
                "permissions" TEXT NOT NULL DEFAULT '{"shop": "rw", "customer": "r"}',
                "token_hash" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'expired', 'completed', 'abandoned', 'in_progress', 'pending_customer', 'approved', 'awaiting_payment')),
                "webrtc_signaling" TEXT NOT NULL DEFAULT '{}',
                "conversion_status" TEXT NOT NULL DEFAULT 'pending' CHECK ("conversion_status" IN ('pending', 'processing', 'completed', 'failed')),
                "conversion_error" TEXT,
                "created_at" DATETIME NOT NULL DEFAULT (datetime('now')),
                "updated_at" DATETIME NOT NULL DEFAULT (datetime('now')),
                "expires_at" DATETIME NOT NULL,
                "last_activity_at" DATETIME NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY ("document_edit_id") REFERENCES "document_edits"("id") ON DELETE CASCADE,
                FOREIGN KEY ("shop_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
                FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // Indexes
        await queryRunner.query(`CREATE INDEX "IDX_editor_sessions_document_edit" ON "editor_sessions" ("document_edit_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_editor_sessions_status" ON "editor_sessions" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_editor_sessions_expires_at" ON "editor_sessions" ("expires_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_editor_sessions_shop_user" ON "editor_sessions" ("shop_user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_editor_sessions_customer_user" ON "editor_sessions" ("customer_user_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "editor_sessions"`);
    }
}