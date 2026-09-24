import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEditingFieldsToPrintJob1720700000000 implements MigrationInterface {
    name = 'AddEditingFieldsToPrintJob1720700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add editing fields to print_jobs table (SQLite requires separate statements)
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "editingRequired" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "editingInstructions" text`);
        await queryRunner.query(`ALTER TABLE "print_jobs" ADD COLUMN "editedDocumentUrl" varchar(500)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "print_jobs" DROP COLUMN "editedDocumentUrl"`);
        await queryRunner.query(`ALTER TABLE "print_jobs" DROP COLUMN "editingInstructions"`);
        await queryRunner.query(`ALTER TABLE "print_jobs" DROP COLUMN "editingRequired"`);
    }
}