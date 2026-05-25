import { AppDataSource } from '../config/database';
import { Promotion } from '../entities/promotion.entity';

export interface PromotionApplyResult {
  cost: number;
  discount: number;
  code?: string;
  reason?:
    | 'not_found'
    | 'inactive'
    | 'not_started'
    | 'expired'
    | 'exhausted'
    | 'no_code';
}

/**
 * Run a job cost through a (case-insensitive) promotion code.
 * Always returns a positive integer cost — discounts that would push the
 * total below the floor are clamped, and an unknown / invalid / expired
 * code is a no-op (returns the original cost with a `reason`). Increments
 * `usageCount` atomically when a discount actually applies.
 *
 * NOTE: the call site decides whether to *display* the reason. We never
 * 500 the upload over a bad coupon — fall back to full price.
 */
export async function applyPromotion(
  baseCost: number,
  rawCode: string | undefined | null,
  opts: { pageCount?: number; perPageBw?: number } = {},
): Promise<PromotionApplyResult> {
  const cost = Math.max(0, Math.floor(Number(baseCost) || 0));
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { cost, discount: 0, reason: 'no_code' };

  const repo = AppDataSource.getRepository(Promotion);
  // Codes are normalized to uppercase at write time (admin.routes.ts on
  // POST/PATCH + a one-shot migration in config/database.ts), so the
  // lookup uses the unique index on `code` directly.
  const promo = await repo.findOne({ where: { code } });
  if (!promo) return { cost, discount: 0, reason: 'not_found' };

  if (promo.status !== 'active') {
    return { cost, discount: 0, code: promo.code, reason: 'inactive' };
  }
  const now = new Date();
  if (promo.startsAt && now < new Date(promo.startsAt)) {
    return { cost, discount: 0, code: promo.code, reason: 'not_started' };
  }
  if (promo.endsAt && now > new Date(promo.endsAt)) {
    return { cost, discount: 0, code: promo.code, reason: 'expired' };
  }
  if (promo.maxUses != null && Number(promo.usageCount) >= Number(promo.maxUses)) {
    return { cost, discount: 0, code: promo.code, reason: 'exhausted' };
  }

  let discount = 0;
  const value = Number(promo.discountValue) || 0;
  if (promo.discountType === 'percentage') {
    discount = Math.floor((cost * value) / 100);
  } else if (promo.discountType === 'fixed') {
    discount = Math.floor(value);
  } else if (promo.discountType === 'free_pages') {
    // Free N pages at the B/W per-page rate (best-effort — caller provides
    // pages + per-page price; otherwise we estimate from baseCost).
    const pages = Math.max(0, Number(opts.pageCount) || 0);
    const perPage =
      Number(opts.perPageBw) ||
      (pages > 0 ? Math.floor(cost / pages) : 0);
    discount = Math.min(cost, Math.floor(Math.min(value, pages) * perPage));
  }
  discount = Math.max(0, Math.min(cost, discount));
  if (discount <= 0) return { cost, discount: 0, code: promo.code };

  // Conditional UPDATE — bumps usageCount only if we're still under
  // maxUses. The previous implementation checked then incremented in two
  // statements, which let concurrent redemptions overshoot maxUses. We
  // do the check + write in one statement and check the affected count.
  const result = await repo
    .createQueryBuilder()
    .update(Promotion)
    .set({ usageCount: () => 'usageCount + 1' })
    .where('id = :id AND (maxUses IS NULL OR usageCount < maxUses)', { id: promo.id })
    .execute();
  if ((result.affected ?? 0) !== 1) {
    // Lost the race — someone else took the last slot between our
    // bounds-check above and this UPDATE.
    return { cost, discount: 0, code: promo.code, reason: 'exhausted' };
  }

  const final = Math.max(0, cost - discount);
  return { cost: final, discount, code: promo.code };
}
