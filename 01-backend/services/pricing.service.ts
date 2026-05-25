import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { redisClient } from '../config/redis';

const CACHE_TTL_SECONDS = 3600; // 1 hour
const CACHE_KEY_PREFIX = 'pricing:';

// ─────────────────────────────────────────────────────────────────────────
// Shared cost helpers used by every ingress path (customer web, personal
// batch, participant upload, CUPS). Lifted out of three inline copies of
// `priceOf` / `computeCost` that lived in the route files — colocating
// them here is what *prevents* pricing drift across ingress paths.
// ─────────────────────────────────────────────────────────────────────────

/** Print config the route handlers pass to `priceOf` / `computeCost`. */
export interface PrintConfiguration {
  copies: number;
  paper: string;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  /**
   * Page orientation. Portrait (default) prints A4 etc. as 210×297;
   * landscape rotates to 297×210. Does NOT affect cost — same paper,
   * same ink coverage — but it changes the IPP `orientation-requested`
   * attribute and how the preview is rendered. Optional so legacy
   * configs default to portrait at read time.
   */
  orientation?: 'portrait' | 'landscape';
}

/**
 * Flat-rate fallback price. Used by single-file customer + CUPS ingress
 * paths that don't want to consult `PricingConfig` for every print.
 * Matches the legacy `priceOf` byte-for-byte; minimum charge ₦5.
 */
export function priceOf(pages: number, c: PrintConfiguration): number {
  const copies = Math.max(1, Number(c.copies) || 1);
  const perPage = c.color === 'color' ? 25 : 5;
  const duplex = c.sided === 'double' ? 0.85 : 1;
  const quality = c.qualityDpi === 600 ? 1.2 : c.qualityDpi === 100 ? 0.8 : 1;
  return Math.max(5, Math.round(Math.max(1, pages) * copies * perPage * duplex * quality));
}

const PAPER_MAP: Record<string, PaperSize> = {
  A3: PaperSize.A3,
  LETTER: PaperSize.LETTER,
  LEGAL: PaperSize.LEGAL,
  A4: PaperSize.A4,
};
function mapPaper(paper: string): PaperSize {
  return PAPER_MAP[String(paper || 'A4').toUpperCase()] ?? PaperSize.A4;
}

/**
 * Pick the right per-cell column for a (dpi, isDuplex) pair. Returns
 * `null` when the requested cell hasn't been populated yet so the
 * caller can fall back to the legacy multiplier path.
 */
function pickCell(cfg: PricingConfig, dpi: number, duplex: boolean): number | null {
  const f =
    duplex
      ? dpi === 100 ? cfg.price100Duplex
        : dpi === 600 ? cfg.price600Duplex
        : cfg.price300Duplex
      : dpi === 100 ? cfg.price100Simplex
        : dpi === 600 ? cfg.price600Simplex
        : cfg.price300Simplex;
  return f == null ? null : Number(f);
}

/**
 * DB-pricing path. Looks up the active `PricingConfig` for the
 * paper/colour combo and:
 *   1. Picks the exact (dpi, duplex) cell if it's populated, treating
 *      that as ₦/page (no further multipliers).
 *   2. Otherwise falls back to the legacy multiplier-based path so
 *      pre-matrix data still computes a sensible price.
 *   3. If no row exists at all, falls back to `priceOf` (flat-rate).
 * Floor of ₦5 enforced uniformly. Used by every ingress (single, batch,
 * participant upload, CUPS) so prices match exactly across channels.
 */
export async function computeCost(opts: {
  pageCount: number;
  paper: string;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  copies?: number;
}): Promise<number> {
  const pages = Math.max(1, Number(opts.pageCount) || 1);
  const copies = Math.max(1, Number(opts.copies) || 1);
  const colorType = opts.color === 'color' ? ColorType.COLOR : ColorType.BLACK_WHITE;
  const duplex = opts.sided === 'double';
  const cfg = await AppDataSource.getRepository(PricingConfig).findOne({
    where: { paperSize: mapPaper(opts.paper), colorType, isActive: true },
  });

  if (!cfg) {
    return priceOf(pages, {
      copies,
      paper: opts.paper,
      color: opts.color,
      sided: opts.sided,
      qualityDpi: opts.qualityDpi,
    });
  }

  const cell = pickCell(cfg, Number(opts.qualityDpi), duplex);
  if (cell != null) {
    return Math.max(5, Math.ceil(cell * pages * copies));
  }

  // Legacy multiplier path — only used for rows that haven't been
  // populated with per-cell prices yet (e.g. Letter / Legal that admins
  // add via the old API).
  const perPage = Number(cfg.pricePerPage);
  const duplexMult = Number(cfg.duplexMultiplier);
  const hiResMult = Number(cfg.highResolutionMultiplier);
  let total = perPage * pages * copies;
  if (duplex) total *= duplexMult;
  if (Number(opts.qualityDpi) === 600) total *= hiResMult;
  return Math.max(5, Math.ceil(total));
}

// ─────────────────────────────────────────────────────────────────────────
// Legacy class-based PricingService — kept because the directory-mapping
// doc still references it, but unused by any route. Above are the actual
// entry points called from the codebase.
// ─────────────────────────────────────────────────────────────────────────

export interface PriceCalculationInput {
  pageCount: number;
  paperSize: PaperSize;
  colorType: ColorType;
  isDuplex: boolean;
  isHighResolution?: boolean;
  copies?: number;
}

export interface PriceCalculationResult {
  pricePerPage: number;
  basePrice: number;
  duplexMultiplier: number;
  highResolutionMultiplier: number;
  copies: number;
  totalPrice: number;
  currency: string;
  breakdown: {
    pageCount: number;
    pricePerPage: number;
    subtotal: number;
    duplexAdjustment: number;
    resolutionAdjustment: number;
    copiesMultiplier: number;
  };
}

export class PricingService {
  private repo: Repository<PricingConfig>;

  constructor() {
    this.repo = AppDataSource.getRepository(PricingConfig);
  }

  /**
   * Get pricing config from cache or DB
   */
  async getConfig(
    paperSize: PaperSize,
    colorType: ColorType
  ): Promise<PricingConfig | null> {
    const cacheKey = `${CACHE_KEY_PREFIX}${paperSize}:${colorType}`;

    // Try cache first
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.warn('Redis cache miss for pricing:', err);
    }

    // Fetch from DB
    const config = await this.repo.findOne({
      where: { paperSize, colorType, isActive: true },
    });

    if (config) {
      try {
        await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(config));
      } catch (err) {
        console.warn('Could not cache pricing:', err);
      }
    }

    return config;
  }

  /**
   * Calculate price for a print job
   */
  async calculatePrice(input: PriceCalculationInput): Promise<PriceCalculationResult> {
    const config = await this.getConfig(input.paperSize, input.colorType);

    if (!config) {
      throw new Error(
        `No pricing config found for ${input.paperSize} ${input.colorType}`
      );
    }

    const copies = input.copies || 1;
    const pricePerPage = Number(config.pricePerPage);
    const subtotal = pricePerPage * input.pageCount;
    const duplexMultiplier = input.isDuplex ? Number(config.duplexMultiplier) : 1.0;
    const resolutionMultiplier = input.isHighResolution
      ? Number(config.highResolutionMultiplier)
      : 1.0;

    const totalPrice = Math.ceil(
      subtotal * duplexMultiplier * resolutionMultiplier * copies
    );

    return {
      pricePerPage,
      basePrice: subtotal,
      duplexMultiplier,
      highResolutionMultiplier: resolutionMultiplier,
      copies,
      totalPrice,
      currency: config.currency,
      breakdown: {
        pageCount: input.pageCount,
        pricePerPage,
        subtotal,
        duplexAdjustment: subtotal * duplexMultiplier - subtotal,
        resolutionAdjustment: subtotal * resolutionMultiplier - subtotal,
        copiesMultiplier: copies,
      },
    };
  }

  /**
   * List all pricing configs
   */
  async listConfigs(): Promise<PricingConfig[]> {
    return this.repo.find({ order: { paperSize: 'ASC', colorType: 'ASC' } });
  }

  /**
   * Update pricing config (admin only)
   */
  async updateConfig(
    id: string,
    updates: Partial<PricingConfig>
  ): Promise<PricingConfig | null> {
    const config = await this.repo.findOne({ where: { id } });
    if (!config) return null;

    Object.assign(config, updates);
    const saved = await this.repo.save(config);

    // Invalidate cache
    const cacheKey = `${CACHE_KEY_PREFIX}${saved.paperSize}:${saved.colorType}`;
    try {
      await redisClient.del(cacheKey);
    } catch (err) {
      console.warn('Could not invalidate cache:', err);
    }

    return saved;
  }

  /**
   * Create new pricing config
   */
  async createConfig(data: Partial<PricingConfig>): Promise<PricingConfig> {
    const config = this.repo.create(data);
    return this.repo.save(config);
  }

  /**
   * Invalidate all pricing cache
   */
  async invalidateCache(): Promise<void> {
    const keys = await redisClient.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}
