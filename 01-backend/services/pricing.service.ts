import { AppDataSource } from '../config/database';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';

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
