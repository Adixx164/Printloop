import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('files')
@Index('idx_file_tenant', ['tenantId'])
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owning tenant. Used by the storage-quota abuse limit + per-tenant
   *  retention sweeps. */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ type: 'text' })
  fileURL: string;

  @Column({ type: 'text', nullable: true })
  watermarkedUrl: string;

  @Column({ type: 'int', default: 1 })
  pageCount: number;

  // Set when this file belongs to a group-session participant upload
  @Column({ type: 'uuid', nullable: true })
  participantId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
