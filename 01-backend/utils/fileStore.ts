import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

const here = path.dirname(fileURLToPath(import.meta.url));
/** On-disk store for uploaded documents the kiosk/printer must fetch. */
export const UPLOAD_DIR = path.resolve(here, '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PUBLIC_BASE =
  process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;

export interface StoredFile {
  key: string;
  fileName: string;
  absPath: string;
  /** Absolute, fetchable URL served by the static /api/files route. */
  url: string;
  sizeBytes: number;
}

function sanitize(name: string): string {
  return (name || 'document').replace(/[^\w.-]+/g, '_').slice(0, 80);
}

/** Persist raw bytes and return a real fetchable URL + absolute path. */
export function saveBuffer(buf: Buffer, originalName: string): StoredFile {
  const fileName = sanitize(originalName);
  const key = `${randomUUID()}__${fileName}`;
  const absPath = path.join(UPLOAD_DIR, key);
  fs.writeFileSync(absPath, buf);
  return {
    key,
    fileName,
    absPath,
    url: `${PUBLIC_BASE}/api/files/${encodeURIComponent(key)}`,
    sizeBytes: buf.length,
  };
}

/** Persist a (possibly data:) base64 string. */
export function saveBase64(b64: string, originalName: string): StoredFile {
  const clean = b64.replace(/^data:.*?;base64,/, '');
  return saveBuffer(Buffer.from(clean, 'base64'), originalName);
}

/**
 * Load a document's bytes from any source we understand:
 *   - our own /api/files/<key>      → read straight off local disk (fast)
 *   - file:// or absolute path      → fs
 *   - http(s)://                    → fetch
 *   - local:// / dev:// / unknown   → null (caller degrades gracefully)
 */
export async function loadDocumentBytes(src: string): Promise<Buffer | null> {
  if (!src) return null;
  try {
    // Our own static store — resolve to disk without a self-HTTP round trip.
    const m = src.match(/\/api\/files\/([^/?#]+)/);
    if (m) {
      const p = path.join(UPLOAD_DIR, decodeURIComponent(m[1]));
      return fs.existsSync(p) ? fs.readFileSync(p) : null;
    }
    if (src.startsWith('file://')) return fs.readFileSync(fileURLToPath(src));
    if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('/')) {
      return fs.existsSync(src) ? fs.readFileSync(src) : null;
    }
    if (/^https?:\/\//i.test(src)) {
      const r = await axios.get(src, { responseType: 'arraybuffer' });
      return Buffer.from(r.data);
    }
  } catch {
    return null;
  }
  return null; // local:// , dev:// , etc.
}
