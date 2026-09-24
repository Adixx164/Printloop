import { Request, Response, Router } from 'express';
import { AppDataSource } from '../config/database';
import { BlogPost, BlogPostStatus } from '../entities/blogPost.entity';

const router = Router();

/**
 * Public blog (V2-54). No auth — powers the marketing site's
 * /blog page and /blog/:slug reader. Only PUBLISHED posts surface;
 * drafts are invisible outside the admin console.
 */

function serialize(post: BlogPost) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    coverImageUrl: post.coverImageUrl,
    authorName: post.authorName,
    tags: post.tags ?? [],
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  };
}

/**
 * GET /api/blog?limit=&offset=
 * Newest published posts first.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const repo = AppDataSource.getRepository(BlogPost);
    const [posts, total] = await repo.findAndCount({
      where: { status: BlogPostStatus.PUBLISHED },
      order: { publishedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    res.json({
      success: true,
      data: { posts: posts.map(serialize), total, limit, offset },
    });
  } catch (err: any) {
    console.error('[blog] list error:', err?.message);
    res.status(500).json({ success: false, message: 'Failed to load posts' });
  }
});

/**
 * GET /api/blog/:slug — one published post.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(BlogPost);
    const post = await repo.findOne({
      where: { slug: String(req.params.slug), status: BlogPostStatus.PUBLISHED },
    });
    if (!post) {
      res.status(404).json({ success: false, message: 'Post not found' });
      return;
    }
    res.json({ success: true, data: serialize(post) });
  } catch (err: any) {
    console.error('[blog] get error:', err?.message);
    res.status(500).json({ success: false, message: 'Failed to load post' });
  }
});

export default router;
