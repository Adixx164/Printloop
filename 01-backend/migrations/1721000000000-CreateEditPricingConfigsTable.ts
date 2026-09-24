import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEditPricingConfigsTable1721000000000 implements MigrationInterface {
    name = 'CreateEditPricingConfigsTable1721000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // SQLite-compatible schema
        await queryRunner.query(`
            CREATE TABLE "edit_pricing_configs" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "tenantId" TEXT NOT NULL,
                "baseFee" REAL NOT NULL DEFAULT 500,
                "perPageFee" REAL NOT NULL DEFAULT 100,
                "complexityTierFees" TEXT NOT NULL DEFAULT '{}',
                "maxShopAdjustmentPct" REAL NOT NULL DEFAULT 0,
                "editingEnabled" INTEGER NOT NULL DEFAULT 1,
                "bankAccountName" TEXT,
                "bankAccountNumber" TEXT,
                "bankName" TEXT,
                "bankSortCode" TEXT,
                "createdAt" DATETIME NOT NULL DEFAULT (datetime('now')),
                "updatedAt" DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_edit_pricing_configs_tenant" ON "edit_pricing_configs" ("tenantId")`);
        await queryRunner.query(`CREATE INDEX "idx_edit_pricing_config_tenant" ON "edit_pricing_configs" ("tenantId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "edit_pricing_configs"`);
    }
}