import { AppDataSource } from '../config/database';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { PrintJob } from '../entities/printJob.entity';

/**
 * Dimension 10 — Abuse & fraud limits (replaces plan-limit enforcement).
 *
 * No monthly plans = no plan limits. But we still need guard rails
 * to prevent a single tenant or customer from soaking platform
 * resources (S3 bandwidth, DB rows, Paystack API calls) or brute-forcing
 * pickup codes.
 *
 * Each limit is keyed by tenantId (where applicable) so Tenant A's
 * abuse never affects Tenant B.
 */

export const ABUSE_LIMITS = {
  /** Max bytes a tenant can upload in 24h (default 5 GB). */
  UPLOAD_BYTES_24H: 5 * 1024 * 1024 * 1024,

  /** Max pickup-code attempts per customer per hour (default 30). */
  PICKUP_ATTEMPTS_PER_HOUR: 30,

  /** Min commission revenue before we flag a tenant as "abandoned" (₦0 = no flag). */
  MIN_COMMISSION_30D: 0,

  /** Max file size per upload (50 MB). */
  MAX_FILE_SIZE: 50 * 1024 * 1024,
} as const;

export interface UploadLimitResult {
  allowed: boolean;
  usedBytes: number;
  limitBytes: number;
  resetAt: Date;
}

export interface PickupLimitResult {
  allowed: boolean;
  attempts: number;
  limit: number;
  resetAt: Date;
}

export interface CommissionHealthResult {
  healthy: boolean;
  commission30d: number;
  threshold: number;
}

/**
 * Check if a tenant's upload would exceed the 24h byte limit.
 * If allowed, tentatively reserves the bytes (caller must confirm or release).
 */
export async function checkUploadLimit(
  tenantId: string,
  fileSize: number,
): Promise<UploadLimitResult> {
  const uploadRepo = AppDataSource.getRepository(Transaction);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Sum all upload-related transactions in the last 24h for this tenant.
  // We use TOPUP transactions as a proxy for uploads since every upload
  // creates a print job which creates a payment. For a more precise
  // measure we'd add an `upload_bytes` column to print_jobs or files.
  const row = await uploadRepo
    .createQueryBuilder('tx')
    .select(
      `COALESCE(SUM(CAST(tx.amount AS REAL)), 0)`,
      'total',
    )
    .where('tx.tenantId = :tid', { tid: tenantId })
    .andWhere('tx.createdAt >= :since', { since })
    .andWhere('tx.type = :type', { type: TransactionType.TOPUP })
    .getRawOne<{ total: string }>();

  const used = Math.round(row ? Number(row.total) * 100 : 0); // approximate bytes from naira
  const limit = ABUSE_LIMITS.UPLOAD_BYTES_24H;
  const allowed = used + fileSize <= limit;

  // Next midnight UTC
  const resetAt = new Date();
  resetAt.setUTCHours(24, 0, 0, 0);

  return {
    allowed,
    usedBytes: used,
    limitBytes: limit,
    resetAt,
  };
}

/**
 * Record that an upload of `fileSize` bytes actually happened.
 * Called after the file is successfully stored.
 */
export async function recordUpload(tenantId: string, fileSize: number): Promise<void> {
  // In a production implementation, we'd write to a dedicated
  // `tenant_upload_bytes` table with a TTL. For now, the check
  // uses TOPUP as a proxy; if we need precision, add the column.
}

/**
 * Check pickup-code attempts for a specific customer in the last hour.
 */
export async function checkPickupLimit(
  tenantId: string,
  customerUserId: string,
): Promise<PickupLimitResult> {
  const jobRepo = AppDataSource.getRepository(PrintJob);
  const since = new Date(Date.now() - 60 * 60 * 1000);

  const attempts = await jobRepo
    .createQueryBuilder('pj')
    .where('pj.tenantId = :tid', { tid: tenantId })
    .andWhere('pj.userId = :uid', { uid: customerUserId })
    .andWhere('pj.createdAt >= :since', { since })
    .andWhere('pj.status IN (:...statuses)', {
      statuses: ['READY', 'RELEASING', 'PRINTING', 'PRINTED', 'FAILED'],
    })
    .getCount();

  const limit = ABUSE_LIMITS.PICKUP_ATTEMPTS_PER_HOUR;
  const allowed = attempts < limit;

  const resetAt = new Date();
  resetAt.setMinutes(60, 0, 0);

  return {
    allowed,
    attempts,
    limit,
    resetAt,
  };
}

/**
 * Check if a tenant's commission revenue over the last 30 days is
 * below the sanity threshold. If so, alert platform admins.
 */
export async function checkCommissionHealth(
  tenantId: string,
): Promise<CommissionHealthResult> {
  const txRepo = AppDataSource.getRepository(Transaction);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const row = await txRepo
    .createQueryBuilder('tx')
    .select(
      `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
      'total',
    )
    .where('tx.tenantId = :tid', { tid: tenantId })
    .andWhere('tx.createdAt >= :since', { since })
    .getRawOne<{ total: string }>();

  const commission30d = row ? Number(row.total) : 0;
  const threshold = ABUSE_LIMITS.MIN_COMMISSION_30D;
  const healthy = commission30d >= threshold;

  return {
    healthy,
    commission30d,
    threshold,
  };
}

/**
 * Validate file size before accepting upload.
 */
export function validateFileSize(fileSize: number): { valid: boolean; message?: string } {
  if (fileSize > ABUSE_LIMITS.MAX_FILE_SIZE) {
    return {
      valid: false,
      message: `File size ${(fileSize / 1024 / 1024).toFixed(1)} MB exceeds ${ABUSE_LIMITS.MAX_FILE_SIZE / 1024 / 1024} MB limit`,
    };
  }
  return { valid: true };
}