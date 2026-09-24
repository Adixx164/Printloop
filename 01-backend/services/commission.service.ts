import { Tenant } from '../entities/tenant.entity';

/**
 * The Bolt-Nigeria commission engine.
 *
 * PrintLoop's SaaS revenue is a percentage cut of every customer print
 * transaction (default 10% — see SAAS-ROADMAP.md Dimension 9). The
 * commission is taken via Paystack Split at the moment of charge, so
 * the math here has to match Paystack's `transaction_charge` parameter
 * exactly — the customer is charged ONE gross amount; the processor
 * splits it into our slice + the tenant's slice automatically.
 *
 * Currency is whole kobo when calling Paystack (NGN amounts × 100).
 * This module deals in NGN units; callers convert at the API boundary.
 */

export interface CommissionSplit {
  /** Original gross amount the customer is being charged (NGN). */
  grossAmount: number;
  /** PrintLoop's slice (NGN, rounded half-up to 2 decimals). */
  commissionAmount: number;
  /** Tenant's slice (NGN). grossAmount = commission + tenant net. */
  tenantNetAmount: number;
  /** Commission rate used, as a decimal (e.g. 0.1 = 10%). Echoed back for auditing. */
  rateUsed: number;
}

/**
 * Compute the split for a tenant given a gross customer charge.
 *
 * @param tenant   resolved Tenant row (`tenant.commissionPct`)
 * @param grossAmount  gross amount in NGN (e.g. 200 for ₦200)
 * @returns the split — feed `commissionAmount` to Paystack's
 *          `transaction_charge` (after converting to kobo) and the
 *          tenant's subaccount via `subaccount`.
 */
export function computeCommissionSplit(
  tenant: Tenant,
  grossAmount: number,
): CommissionSplit {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw new Error(`Invalid gross amount: ${grossAmount}`);
  }
  const rate = clampRate(Number(tenant.commissionPct));
  const commissionRaw = grossAmount * rate;
  const commissionAmount = round2(commissionRaw);
  const tenantNetAmount = round2(grossAmount - commissionAmount);
  return {
    grossAmount: round2(grossAmount),
    commissionAmount,
    tenantNetAmount,
    rateUsed: rate,
  };
}

/**
 * Convenience: Paystack `transaction_charge` value (commission in kobo).
 * Paystack expects integer minor units; we floor to avoid sending a
 * fraction of a kobo (it would reject the charge).
 */
export function commissionInKobo(split: CommissionSplit): number {
  return Math.floor(split.commissionAmount * 100);
}

/**
 * Inverse: given a commission entry on a transaction, work out what
 * the tenant's payable balance increment is. Used by the payout
 * ledger when reconciling against Paystack subaccount balances.
 */
export function tenantNetFromTransaction(
  grossAmount: number,
  commissionAmount: number,
): number {
  return round2(grossAmount - commissionAmount);
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) return 0;
  // Hard ceiling at 50% — defensive. A misconfigured tenant
  // shouldn't be able to charge their customers a 99% commission.
  if (rate > 0.5) return 0.5;
  return rate;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
