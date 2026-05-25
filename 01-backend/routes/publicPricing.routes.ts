import { Router, type Request, type Response } from 'express';
import { AppDataSource } from '../config/database';
import { PricingConfig } from '../entities/pricingConfig.entity';

const router = Router();

/**
 * GET /api/pricing
 *
 * The PUBLIC pricing matrix — no auth. Mounted at the top level so:
 *   • The customer app (authenticated) renders accurate previews
 *   • The group-participant `/join/:shareId` flow (anonymous) renders
 *     accurate previews
 *   • The marketing site / landing page can show real prices
 *
 * Same payload shape the admin reads, just without the surrounding
 * admin-only fields. Pricing is not sensitive — admins WANT this
 * visible to drive conversion — so a public endpoint is appropriate.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await AppDataSource.getRepository(PricingConfig).find({
      where: { isActive: true },
    });
    res.json({
      success: true,
      data: {
        currency: 'NGN',
        floor: 5,
        configs: rows.map((r) => ({
          paperSize: r.paperSize,
          colorType: r.colorType,
          pricePerPage: Number(r.pricePerPage),
          duplexMultiplier: Number(r.duplexMultiplier),
          highResolutionMultiplier: Number(r.highResolutionMultiplier),
          price100Simplex: r.price100Simplex == null ? null : Number(r.price100Simplex),
          price300Simplex: r.price300Simplex == null ? null : Number(r.price300Simplex),
          price600Simplex: r.price600Simplex == null ? null : Number(r.price600Simplex),
          price100Duplex: r.price100Duplex == null ? null : Number(r.price100Duplex),
          price300Duplex: r.price300Duplex == null ? null : Number(r.price300Duplex),
          price600Duplex: r.price600Duplex == null ? null : Number(r.price600Duplex),
        })),
      },
    });
  } catch (err) {
    console.error('Public pricing read error:', err);
    res.status(500).json({ success: false, message: 'Failed to read pricing' });
  }
});

export default router;
