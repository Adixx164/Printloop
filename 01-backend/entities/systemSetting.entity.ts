import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Key-value store for system-wide settings that admins can change at runtime
 * without redeploying. Examples:
 *   - file_retention_hours: 24
 *   - max_file_size_mb: 50
 *   - allowed_file_types: pdf,docx,doc,jpg,png
 *   - kiosk_offline_threshold_minutes: 15
 *   - brute_force_max_attempts: 5
 */
@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'varchar', length: 50, default: 'string' })
  valueType: 'string' | 'number' | 'boolean' | 'json';

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: false })
  isReadOnly: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
