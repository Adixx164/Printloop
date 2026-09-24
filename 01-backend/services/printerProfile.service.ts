import { AppDataSource } from '../config/database';
import { PrinterProfile, type PrinterCapabilities } from '../entities/printerProfile.entity';
import type { PrintConfiguration } from './pricing.service';

// ─────────────────────────────────────────────────────────────────────────
// Printer profiles (V2-56).
//
// The cloud render worker rasterizes to PWG-Raster at the JOB's
// settings today. With a profile, the tenant declares what the actual
// machine can do and the render honours it:
//
//   dpi      → render at min(customer quality, profile.maxDpi) — never
//              rasterize above the printer's capability (wasteful,
//              slower, no visible gain).
//   colour   → a mono-only profile forces grayscale even when the
//              customer paid for colour (a colour render on a mono
//              printer is the worst outcome: it misprints or wastes
//              the paid-for colour mode).
//   paper    → fit every page onto the target sheet, scale-to-fit,
//              when the profile pins a size (handled by the worker's
//              fit-to-paper step).
// ─────────────────────────────────────────────────────────────────────────

export interface ResolvedRenderOpts {
  /** DPI the worker should rasterize at. */
  dpi: number;
  /** Whether the render should be colour (false = force grayscale). */
  color: boolean;
  /** Target paper size for fit-to-paper, or null to leave pages as-is. */
  paperSize: string | null;
}

const DPI_VALUES = [100, 300, 600];

function clampDpi(dpi: number | null | undefined): number | null {
  const n = Number(dpi);
  return DPI_VALUES.includes(n) ? (n as 100 | 300 | 600) : null;
}

/**
 * Map a printer profile's capabilities + the customer's configuration
 * to the options the render worker applies. Pure — unit-testable
 * without a DB.
 */
export function resolveProfileRenderOpts(
  profile: { capabilities: PrinterCapabilities } | null | undefined,
  config: Partial<PrintConfiguration> | null | undefined,
): ResolvedRenderOpts {
  const caps = profile?.capabilities;
  const customerDpi = clampDpi(config?.qualityDpi);
  const profileDpi = caps ? clampDpi(caps.maxDpi) : null;

  const dpi = [customerDpi, profileDpi].filter((d): d is number => d != null);
  const effectiveDpi = dpi.length ? Math.min(...dpi) : 300;

  const customerWantsColor = config?.color !== 'bw';
  const color = caps ? caps.colorMode !== 'bw' && customerWantsColor : customerWantsColor;

  return {
    dpi: effectiveDpi,
    color,
    paperSize: caps?.paperSize ?? null,
  };
}

/**
 * Resolve the profile for a render job: the job's pinned
 * printerProfileId when set, otherwise the tenant's default profile.
 * Returns null when the tenant has no profile (legacy behaviour — the
 * worker falls back to the job's own settings).
 */
export async function resolveProfileForJob(opts: {
  tenantId: string | null;
  printerProfileId?: string | null;
}): Promise<PrinterProfile | null> {
  if (!opts.tenantId) return null;

  const repo = AppDataSource.getRepository(PrinterProfile);
  if (opts.printerProfileId) {
    const pinned = await repo.findOne({
      where: { id: opts.printerProfileId, tenantId: opts.tenantId, isActive: true },
    });
    if (pinned) return pinned;
  }

  return repo.findOne({
    where: { tenantId: opts.tenantId, isDefault: true, isActive: true },
  });
}
