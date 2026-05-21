import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('files')
export class File {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
