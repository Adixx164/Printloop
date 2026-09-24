import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentEditsTable1720900000000 implements MigrationInterface {
    name = 'CreateDocumentEditsTable1720900000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // SQLite-compatible schema
        await queryRunner.query(`
            CREATE TABLE "document_edits" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "printJobId" TEXT NOT NULL,
                "shopId" TEXT NOT NULL,
                "editedBy" TEXT NOT NULL,
                "editOperations" TEXT NOT NULL DEFAULT '[]',
                "originalDocumentMeta" TEXT,
                "editedDocumentMeta" TEXT,
                "baseEditFee" REAL NOT NULL DEFAULT 0,
                "perPageFee" REAL NOT NULL DEFAULT 0,
                "complexityFee" REAL NOT NULL DEFAULT 0,
                "shopAdjustedFee" REAL NOT NULL DEFAULT 0,
                "totalEditFee" REAL NOT NULL DEFAULT 0,
                "status" TEXT NOT NULL DEFAULT 'pending_shop',
                "shopNotes" TEXT,
                "customerRejectionReason" TEXT,
                "approvedBy" TEXT,
                "approvedAt" DATETIME,
                "completedAt" DATETIME,
                "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
                "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_document_edit_job" ON "document_edits" ("printJobId")`);
        await queryRunner.query(`CREATE INDEX "idx_document_edit_shop" ON "document_edits" ("shopId")`);
        await queryRunner.query(`CREATE INDEX "idx_document_edit_status" ON "document_edits" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "document_edits"`);
    }
}