import crypto from 'node:crypto';
import { AppDataSource } from '../config/database';
import {
  TenantWebhook,
  WebhookEvent,
} from '../entities/tenantWebhook.entity';
import { webhookQueue } from '../workers/queues';
import { REDIS_ENABLED } from '../config/redis';

/**
 * Tenant webhook dispatcher (Dimension 14 — V2-14, queue in V2-15).
 *
 * `emitTenantEvent(tenantId, event, data)` resolves which webhook
 * rows subscribe to the event, then enqueues one delivery job per
 * row on the `webhook-deliveries` BullMQ queue. The worker
 * (`workers/webhook.worker.ts`) does the HMAC-signed POST with
 * BullMQ's retry/backoff.
 *
 * When Redis is disabled (single-tenant dev), we fall back to inline
 * `nextTick` delivery — best-effort, no retry — so the dev flow
 * still exercises webhooks without standing up Redis.
 */

export interface WebhookPayload {
  event: WebhookEvent;
  tenantId: string;
  emittedAt: string;
  data: Record<string, unknown>;
}

/**
 * Resolve subscribers + enqueue (or inline-deliver) one job each.
 * Returns immediately; never throws into the caller's request path.
 */
export function emitTenantEvent(
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): void {
  void resolveAndEnqueue(tenantId, event, data).catch((err) => {
    console.error(
      `[webhook] emit ${event} for tenant ${tenantId} failed:`,
      err,
    );
  });
}

async function resolveAndEnqueue(
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const repo = AppDataSource.getRepository(TenantWebhook);
  const subs = await repo.find({ where: { tenantId, isActive: true } });
  const matched = subs.filter((w) => w.events?.includes(event));
  if (!matched.length) return;

  const payload: WebhookPayload = {
    event,
    tenantId,
    emittedAt: new Date().toISOString(),
    data,
  };
  // Pre-serialise so the worker's HMAC matches the exact bytes sent.
  const body = JSON.stringify(payload);

  for (const sub of matched) {
    const job = {
      webhookId: sub.id,
      url: sub.url,
      secret: sub.secret,
      event,
      body,
    };
    if (REDIS_ENABLED) {
      await webhookQueue.add('deliver', job);
    } else {
      // No Redis — best-effort inline delivery, no retry.
      void deliverInline(job).catch((err) =>
        console.error(`[webhook] inline delivery failed for ${sub.id}:`, err),
      );
    }
  }
}

/**
 * The actual signed POST. Shared by the inline (no-Redis) path here
 * and the BullMQ worker. Updates the webhook row's success/failure
 * stamps. Throws on non-2xx so the BullMQ worker's retry kicks in.
 */
export async function deliverWebhook(job: {
  webhookId: string;
  url: string;
  secret: string;
  event: string;
  body: string;
}): Promise<void> {
  const raw = Buffer.from(job.body, 'utf8');
  const signature = crypto
    .createHmac('sha256', job.secret)
    .update(raw)
    .digest('hex');

  const repo = AppDataSource.getRepository(TenantWebhook);
  try {
    const res = await fetch(job.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PrintLoop-Signature': signature,
        'X-PrintLoop-Event': job.event,
      },
      body: raw,
    });
    if (!res.ok) {
      await stampFailure(repo, job.webhookId, `HTTP ${res.status}`);
      throw new Error(`webhook ${job.webhookId} returned HTTP ${res.status}`);
    }
    await stampSuccess(repo, job.webhookId);
  } catch (err: any) {
    await stampFailure(repo, job.webhookId, err?.message || 'Unknown error');
    throw err;
  }
}

/** Inline variant that swallows errors (no-Redis dev path). */
async function deliverInline(job: {
  webhookId: string;
  url: string;
  secret: string;
  event: string;
  body: string;
}): Promise<void> {
  try {
    await deliverWebhook(job);
  } catch {
    /* already stamped; inline path has no retry */
  }
}

async function stampSuccess(repo: any, webhookId: string): Promise<void> {
  await repo.update(
    { id: webhookId },
    { lastSuccessAt: new Date(), lastFailureReason: null },
  );
}

async function stampFailure(
  repo: any,
  webhookId: string,
  reason: string,
): Promise<void> {
  await repo.update(
    { id: webhookId },
    { lastFailureAt: new Date(), lastFailureReason: reason.slice(0, 255) },
  );
}

/** Generate a fresh secret for a new webhook row. */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('base64url');
}
