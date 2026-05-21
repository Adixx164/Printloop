import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

export class AddSchemaGapsAndNewEntities1714600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // 1. Create pricing_configs table
    // ============================================================
    await queryRunner.createTable(
      new Table({
        name: 'pricing_configs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'paperSize', type: 'enum', enum: ['A4', 'A3', 'LETTER', 'LEGAL'], default: "'A4'" },
          { name: 'colorType', type: 'enum', enum: ['BLACK_WHITE', 'COLOR'], default: "'BLACK_WHITE'" },
          { name: 'pricePerPage', type: 'decimal', precision: 10, scale: 2 },
          { name: 'duplexMultiplier', type: 'decimal', precision: 4, scale: 2, default: 1.0 },
          { name: 'highResolutionMultiplier', type: 'decimal', precision: 4, scale: 2, default: 1.0 },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'currency', type: 'varchar', length: '3', default: "'NGN'" },
          { name: 'notes', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'pricing_configs',
      new TableIndex({
        name: 'idx_pricing_paper_color',
        columnNames: ['paperSize', 'colorType'],
        isUnique: true,
      })
    );

    // ============================================================
    // 2. Create system_settings table
    // ============================================================
    await queryRunner.createTable(
      new Table({
        name: 'system_settings',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'key', type: 'varchar', length: '100', isUnique: true },
          { name: 'value', type: 'text' },
          { name: 'valueType', type: 'varchar', length: '50', default: "'string'" },
          { name: 'category', type: 'varchar', length: '100', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'isReadOnly', type: 'boolean', default: false },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    // ============================================================
    // 3. Create group_participants table
    // ============================================================
    await queryRunner.createTable(
      new Table({
        name: 'group_participants',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'groupSessionId', type: 'uuid' },
          { name: 'userId', type: 'uuid', isNullable: true },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'email', type: 'varchar', length: '255', isNullable: true },
          { name: 'phoneNumber', type: 'varchar', length: '50', isNullable: true },
          { name: 'watermarkId', type: 'varchar', length: '50', isUnique: true },
          { name: 'uploadToken', type: 'varchar', length: '255', isUnique: true },
          { name: 'status', type: 'enum', enum: ['INVITED', 'JOINED', 'UPLOADED', 'PAID', 'CANCELLED'], default: "'JOINED'" },
          { name: 'printJobId', type: 'uuid', isNullable: true },
          { name: 'joinedAt', type: 'timestamp', isNullable: true },
          { name: 'uploadedAt', type: 'timestamp', isNullable: true },
          { name: 'paidAt', type: 'timestamp', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'timestamp', default: 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'group_participants',
      new TableIndex({ name: 'idx_participant_session_id', columnNames: ['groupSessionId'] })
    );

    await queryRunner.createIndex(
      'group_participants',
      new TableIndex({ name: 'idx_watermark_id', columnNames: ['watermarkId'] })
    );

    // ============================================================
    // 4. Add columns to existing files table
    // ============================================================
    await queryRunner.addColumn(
      'files',
      new TableColumn({
        name: 'participantId',
        type: 'uuid',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'files',
      new TableColumn({
        name: 'perFilePrintConfig',
        type: 'json',
        isNullable: true,
      })
    );

    // ============================================================
    // 5. Add columns to existing audit_logs table
    // ============================================================
    await queryRunner.addColumn(
      'audit_logs',
      new TableColumn({
        name: 'resourceType',
        type: 'varchar',
        length: '100',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'audit_logs',
      new TableColumn({
        name: 'resourceId',
        type: 'uuid',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'audit_logs',
      new TableColumn({
        name: 'payload',
        type: 'json',
        isNullable: true,
      })
    );

    // ============================================================
    // 6. Add columns to existing promotions table
    // ============================================================
    await queryRunner.addColumn(
      'promotions',
      new TableColumn({
        name: 'promoCode',
        type: 'varchar',
        length: '50',
        isNullable: true,
        isUnique: true,
      })
    );

    await queryRunner.addColumn(
      'promotions',
      new TableColumn({
        name: 'maxUsage',
        type: 'int',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'promotions',
      new TableColumn({
        name: 'currentUsage',
        type: 'int',
        default: 0,
      })
    );

    // ============================================================
    // 7. Add columns to print_jobs for partial print resume
    // ============================================================
    await queryRunner.addColumn(
      'print_jobs',
      new TableColumn({
        name: 'pagesCompleted',
        type: 'int',
        default: 0,
      })
    );

    await queryRunner.addColumn(
      'print_jobs',
      new TableColumn({
        name: 'qrCodeUrl',
        type: 'text',
        isNullable: true,
      })
    );

    // ============================================================
    // 8. Add column to users for block/unblock
    // ============================================================
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'isBlocked',
        type: 'boolean',
        default: false,
      })
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'blockReason',
        type: 'text',
        isNullable: true,
      })
    );

    // ============================================================
    // 9. Insert default pricing configs (current hardcoded values)
    // ============================================================
    await queryRunner.query(`
      INSERT INTO pricing_configs ("paperSize", "colorType", "pricePerPage", "duplexMultiplier", "currency", "notes")
      VALUES 
        ('A4', 'BLACK_WHITE', 5.00, 0.90, 'NGN', 'Default A4 black and white pricing'),
        ('A4', 'COLOR', 25.00, 0.90, 'NGN', 'Default A4 color pricing'),
        ('A3', 'BLACK_WHITE', 10.00, 0.90, 'NGN', 'Default A3 black and white pricing'),
        ('A3', 'COLOR', 50.00, 0.90, 'NGN', 'Default A3 color pricing')
    `);

    // ============================================================
    // 10. Insert default system settings
    // ============================================================
    await queryRunner.query(`
      INSERT INTO system_settings ("key", "value", "valueType", "category", "description")
      VALUES
        ('file_retention_hours', '24', 'number', 'privacy', 'Hours to retain files after print completion'),
        ('max_file_size_mb', '50', 'number', 'uploads', 'Maximum file size in MB'),
        ('allowed_file_types', 'pdf,docx,doc,jpg,jpeg,png,ppt,pptx', 'string', 'uploads', 'Comma-separated allowed file extensions'),
        ('kiosk_offline_threshold_minutes', '15', 'number', 'monitoring', 'Minutes before kiosk is considered offline'),
        ('brute_force_max_attempts', '5', 'number', 'security', 'Max failed code attempts per IP per 10 minutes'),
        ('group_session_max_deadline_hours', '168', 'number', 'group_printing', 'Max hours before group session deadline (1 week)'),
        ('email_receipts_enabled', 'true', 'boolean', 'notifications', 'Send email receipts after payment'),
        ('sms_receipts_enabled', 'true', 'boolean', 'notifications', 'Send SMS receipts after payment')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse all changes in reverse order
    await queryRunner.dropColumn('users', 'blockReason');
    await queryRunner.dropColumn('users', 'isBlocked');
    await queryRunner.dropColumn('print_jobs', 'qrCodeUrl');
    await queryRunner.dropColumn('print_jobs', 'pagesCompleted');
    await queryRunner.dropColumn('promotions', 'currentUsage');
    await queryRunner.dropColumn('promotions', 'maxUsage');
    await queryRunner.dropColumn('promotions', 'promoCode');
    await queryRunner.dropColumn('audit_logs', 'payload');
    await queryRunner.dropColumn('audit_logs', 'resourceId');
    await queryRunner.dropColumn('audit_logs', 'resourceType');
    await queryRunner.dropColumn('files', 'perFilePrintConfig');
    await queryRunner.dropColumn('files', 'participantId');
    await queryRunner.dropTable('group_participants');
    await queryRunner.dropTable('system_settings');
    await queryRunner.dropTable('pricing_configs');
  }
}
