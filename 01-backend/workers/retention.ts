import fs from 'node:fs';
import path from 'node:path';
import { In, LessThan } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { File } from '../entities/file.entity';
import { SystemSetting } from '../entities/systemSetting.entity';
import { UPLOAD_DIR } from '../utils/fileStore';

/**
 * Local-disk document retention.
 *
 * The Cloudinary/BullMQ cleanup worker is dead code (never started, and there
 * is no Redis in this deployment), so without this sweep the files written to
 * data/uploads/ would accumulate forever. This is a plain setInterval — no
 * Redis, no queue.
 *
 * Policy: once a job is in a terminal state (done/failed/expired/refunded) and
 * has sat there longer than `documentRetentionHours`, its source bytes are no
 * longer needed and are removed from disk. A job still awaiting release (READY)
 * keeps its file regardless of age — that file is exactly what the customer is
 * about to print.
 *
 * We only touch the filesystem, never the DB row: `files.fileURL` is NOT NULL
 * so it can't be cleared, and `loadDocumentBytes()` already degrades gracefully
 * when the bytes are gone. Touching only disk also makes the sweep idempotent —
 * a re-run just re-confirms the files are already absent.
 */

const TERMINAL_STATUSES = [
  PrintJobStatus.DONE,
  PrintJobStatus.FAILED,
  PrintJobStatus.EXPIRED,
  PrintJobStatus.REFUNDED,
];

const DEFAULT_RETENTION_HOURS = 24;

async function getRetentionHours(): Promise<number> {
  try {
    const row = await AppDataSource.getRepository(SystemSetting).findOne({
      where: { key: 'documentRetentionHours' },
    });
    const n = Number(row?.value);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* fall through to env / default */
  }
  const envN = Number(process.env.DOCUMENT_RETENTION_HOURS);
  return Number.isFinite(envN) && envN > 0 ? envN : DEFAULT_RETENTION_HOURS;
}

/** Resolve a stored fileURL to its on-disk path, or null if it isn't one of ours. */
function diskPathFor(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/api\/files\/([^/?#]+)/);
  if (!m) return null;
  return path.join(UPLOAD_DIR, decodeURIComponent(m[1]));
}

/** Delete a file if present. Returns true when a file was actually removed. */
function unlinkIfExists(p: string): boolean {
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch (err) {
    console.warn('[retention] failed to unlink', p, err);
  }
  return false;
}

/** One pass: delete on-disk bytes for expired terminal jobs. Never throws. */
export async function runRetentionSweep(): Promise<void> {
  try {
    const hours = await getRetentionHours();
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const jobs = await AppDataSource.getRepository(PrintJob).find({
      where: { status: In(TERMINAL_STATUSES), updatedAt: LessThan(cutoff) },
      select: ['id', 'fileId'],
    });
    if (jobs.length === 0) return;

    const jobIds = jobs.map((j) => j.id);
    const fileIds = new Set<string>();
    for (const j of jobs) if (j.fileId) fileIds.add(j.fileId);

    // Batch jobs keep their documents in print_job_items, not on the job row.
    const items = await AppDataSource.getRepository(PrintJobItem).find({
      where: { printJobId: In(jobIds) },
      select: ['fileId'],
    });
    for (const it of items) if (it.fileId) fileIds.add(it.fileId);

    if (fileIds.size === 0) return;

    const files = await AppDataSource.getRepository(File).find({
      where: { id: In([...fileIds]) },
      select: ['id', 'fileURL', 'watermarkedUrl'],
    });

    let removed = 0;
    for (const f of files) {
      for (const p of [diskPathFor(f.fileURL), diskPathFor(f.watermarkedUrl)]) {
        if (p && unlinkIfExists(p)) removed++;
      }
    }

    if (removed > 0) {
      console.log(
        `[retention] removed ${removed} expired file(s) across ${jobs.length} terminal job(s) (retention ${hours}h).`,
      );
    }
  } catch (err) {
    console.warn('[retention] sweep failed:', err);
  }
}

/**
 * Start the periodic sweep. The first pass is deferred so it never competes
 * with boot; thereafter it runs hourly. `.unref()` keeps the timers from
 * holding the process open on shutdown.
 */
export function startRetentionSweep(): void {
  const HOUR = 60 * 60 * 1000;
  setTimeout(() => {
    void runRetentionSweep();
    setInterval(() => void runRetentionSweep(), HOUR).unref();
  }, 30_000).unref();
}
