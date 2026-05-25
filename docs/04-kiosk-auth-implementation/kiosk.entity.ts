import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from './base.entity';

export enum KioskStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  OFFLINE = 'OFFLINE',
  DISABLED = 'DISABLED',
}

@Entity('kiosks')
export class Kiosk extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  campus: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shopId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_kiosk_api_key')
  apiKey: string;

  @Column({
    type: 'enum',
    enum: KioskStatus,
    default: KioskStatus.ACTIVE,
  })
  status: KioskStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerModel: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastPrintedAt: Date;

  @Column({ type: 'int', default: 0 })
  totalJobsPrinted: number;

  @Column({ type: 'int', default: 0 })
  totalPagesPrinted: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
