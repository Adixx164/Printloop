import crypto from "node:crypto";

/**
 * Calls back to the PrintLoop API after a render completes (or fails).
 *
 * The API endpoint verifies an HMAC-SHA256 signature over the raw
 * request body, computed with `RENDER_CALLBACK_SECRET`. Same secret
 * value must be configured on both sides (this worker AND the API).
 *
 * Fail-open posture: a callback failure is logged but does NOT throw,
 * so the BullMQ job stays "succeeded" and we don't retry the entire
 * render (expensive). A follow-up reconciliation job (not yet built)
 * will fix any orphans where the render succeeded but the API never
 * heard about it.
 */

export interface CallbackResult {
  printJobId: string;
  renderedKey: string;
  renderedPdfUrl: string;
  previewImageUrls: string[];
  pageCount: number;
  bytes: number;
  durationMs?: number;
}

const API_BASE = (process.env.PRINTLOOP_API_URL || "").replace(/\/$/, "");
const SECRET = process.env.RENDER_CALLBACK_SECRET || "";

export async function postRenderSuccess(result: CallbackResult): Promise<void> {
  await postSigned("/api/render/callback", result);
}

export async function postRenderFailure(opts: {
  printJobId: string;
  errorMessage: string;
}): Promise<void> {
  await postSigned("/api/render/failure", opts);
}

async function postSigned(path: string, body: unknown): Promise<void> {
  if (!API_BASE) {
    console.error(`[callback] PRINTLOOP_API_URL not set; cannot POST ${path}`);
    return;
  }
  if (!SECRET) {
    console.error(`[callback] RENDER_CALLBACK_SECRET not set; refusing to send`);
    return;
  }

  const raw = Buffer.from(JSON.stringify(body), "utf8");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(raw)
    .digest("hex");

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Render-Signature": signature,
      },
      body: raw,
    });
    if (!res.ok) {
      const text = await safeText(res);
      console.error(
        `[callback] ${path} returned ${res.status}: ${text.slice(0, 200)}`,
      );
    }
  } catch (err) {
    console.error(`[callback] ${path} POST failed:`, err);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
