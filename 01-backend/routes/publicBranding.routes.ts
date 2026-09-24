import { Router, type Request, type Response } from 'express';
import { AppDataSource } from '../config/database';
import { TenantBranding } from '../entities/tenantBranding.entity';
import { Tenant } from '../entities/tenant.entity';

const router = Router();

/**
 * GET /api/branding — public, anonymous read of the resolved tenant's
 * brand row. Returns name + slug + branding fields. Used by the
 * landing page to render the right wordmark/colours BEFORE the
 * customer logs in.
 *
 * Mounted under `optionalTenant`, so on the apex/landing domain it
 * falls back to the legacy tenant's brand (effectively the
 * PrintLoop default). On `{slug}.printloop.app` it serves that
 * tenant's brand.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    let tenant = req.tenant;
    if (!tenant) {
      tenant = (await AppDataSource.getRepository(Tenant).findOne({
        where: { slug: 'legacy' },
      })) ?? undefined;
    }
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    const branding = await AppDataSource.getRepository(TenantBranding).findOne({
      where: { tenantId: tenant.id },
    });
    res.json({
      success: true,
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        branding: branding ?? null,
      },
    });
  } catch (err: any) {
    console.error('Public branding read error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to load branding' });
  }
});

export default router;
