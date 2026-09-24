import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BlogPostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

/**
 * A marketing / how-to post (V2-54). Tenant-scoped like everything
 * else: each shop manages its own blog from the admin console; the
 * public `/api/blog` endpoint surfaces PUBLISHED posts from all
 * tenants so the marketing site has content out of the box.
 */
@Entity('blog_posts')
@Index('idx_blog_tenant_status', ['tenantId', 'status'])
@Index('idx_blog_slug', ['slug'], { unique: true })
export class BlogPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  /** URL-safe unique identifier, e.g. "how-printloop-works". */
  @Column({ type: 'varchar', length: 160 })
  slug: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** One-paragraph teaser shown on the blog list + cards. */
  @Column({ type: 'varchar', length: 400, nullable: true })
  excerpt: string | null;

  /** Markdown-ish body (headings, paragraphs, lists, bold). */
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImageUrl: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  authorName: string | null;

  @Column({
    type: 'simple-enum',
    enum: BlogPostStatus,
    default: BlogPostStatus.DRAFT,
  })
  status: BlogPostStatus;

  @Column({ type: 'simple-json', nullable: true })
  tags: string[] | null;

  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
