import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantIdToDocumentEditAndEditorSession1721200000000 implements MigrationInterface {
    name = 'AddTenantIdToDocumentEditAndEditorSession1721200000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add tenantId to document_edits table
        await queryRunner.query(
            'ALTER TABLE "document_edits" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT \'\''
        );

        // Update existing rows to have a tenantId (use the shop's tenantId from document_edit -> print_job -> tenant)
        // SQLite doesn't support UPDATE ... FROM, so use a subquery
        await queryRunner.query(
            'UPDATE "document_edits" SET "tenantId" = (SELECT pj."tenantId" FROM "print_jobs" pj WHERE pj."id" = "document_edits"."printJobId")'
        );

        // Add index for tenantId
        await queryRunner.query('CREATE INDEX "IDX_document_edit_tenant" ON "document_edits" ("tenantId")');

        // Add tenantId to editor_sessions table
        await queryRunner.query('ALTER TABLE "editor_sessions" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT \'\'');

        // Update existing rows to have a tenantId (use the document_edit's tenantId)
        // SQLite doesn't support UPDATE ... FROM, so use a subquery
        await queryRunner.query(
            'UPDATE "editor_sessions" SET "tenantId" = (SELECT de."tenantId" FROM "document_edits" de WHERE de."id" = "editor_sessions"."document_edit_id")'
        );

        // Add index for tenantId
        await queryRunner.query('CREATE INDEX "IDX_editor_sessions_tenant" ON "editor_sessions" ("tenantId")');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove index
        await queryRunner.query('DROP INDEX "IDX_editor_sessions_tenant"');

        // Drop column
        await queryRunner.query('ALTER TABLE "editor_sessions" DROP COLUMN "tenantId"');

        // Remove index
        await queryRunner.query('DROP INDEX "IDX_document_edit_tenant"');

        // Drop column
        await queryRunner.query('ALTER TABLE "document_edits" DROP COLUMN "tenantId"');
    }
}