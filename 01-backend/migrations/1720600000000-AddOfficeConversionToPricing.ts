import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOfficeConversionToPricing1720600000000 implements MigrationInterface {
    name = 'AddOfficeConversionToPricing1720600000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "pricing_configs" ADD "officeConversion" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pricing_configs" DROP COLUMN "officeConversion"`);
    }
}