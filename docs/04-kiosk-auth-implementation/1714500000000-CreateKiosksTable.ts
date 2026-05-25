import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateKiosksTable1714500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'kiosks',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'location',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'campus',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'shopId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'apiKey',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['ACTIVE', 'MAINTENANCE', 'OFFLINE', 'DISABLED'],
            default: "'ACTIVE'",
          },
          {
            name: 'printerName',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'printerModel',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'lastSeenAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastPrintedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'totalJobsPrinted',
            type: 'int',
            default: 0,
          },
          {
            name: 'totalPagesPrinted',
            type: 'int',
            default: 0,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Create index on apiKey for fast lookups
    await queryRunner.createIndex(
      'kiosks',
      new TableIndex({
        name: 'idx_kiosk_api_key',
        columnNames: ['apiKey'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('kiosks', 'idx_kiosk_api_key');
    await queryRunner.dropTable('kiosks');
  }
}
