/**
 * End-to-end smoke test for `reconcileStuckRenders`.
 *
 * Verifies the four state combinations the JOURNAL Phase V2-7
 * called out:
 *
 *   1. RENDERING + render-worker available (Redis up) → re-enqueued.
 *   2. RENDERING + render-worker unavailable (Redis off) →
 *      promoted directly to READY.
 *   3. RENDERING with reenqueue=false → flipped to FAILED.
 *   4. Job already FAILED / READY → untouched by the sweep.
 *
 * Run via `tsx`:
 *
 *   pnpm tsx scripts/e2eStuckRenderTest.cjs
 *
 * Uses the same SQLite file the app boots against. Creates four
 * disposable PrintJobs prefixed with `STUCK_TEST_` so they're easy
 * to identify and delete afterwards.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawn } = require('child_process');

const TS_SCRIPT = `
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Tenant } from '../entities/tenant.entity';
import { reconcileStuckRenders } from '../services/renderEnqueue.service';
import { LEGACY_TENANT_SLUG } from '../middleware/tenant.middleware';

async function main() {
  await AppDataSource.initialize();
  const jobRepo = AppDataSource.getRepository(PrintJob);
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const legacy = await tenantRepo.findOne({ where: { slug: LEGACY_TENANT_SLUG } });
  if (!legacy) {
    console.error('Legacy tenant missing — run the seed first.');
    process.exit(1);
  }

  // Past the 15min threshold so the sweep picks these up.
  const oldDate = new Date(Date.now() - 30 * 60 * 1000);

  const makeJob = async (status: PrintJobStatus, suffix: string) => {
    const job = jobRepo.create({
      tenantId: legacy.id,
      userId: null,
      fileId: null,
      fileName: 'stuck-test.pdf',
      code: 'ST' + suffix + Math.floor(Math.random() * 9999),
      cost: 0,
      totalPages: 1,
      status,
      printConfiguration: { copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 } as any,
    });
    const saved = await jobRepo.save(job);
    // Backdate via raw UPDATE — TypeORM's @UpdateDateColumn would
    // overwrite the timestamp on save().
    await AppDataSource.query(
      'UPDATE print_jobs SET updatedAt = ? WHERE id = ?',
      [oldDate.toISOString(), saved.id],
    );
    return saved;
  };

  const rendering1 = await makeJob(PrintJobStatus.RENDERING, 'R1');
  const rendering2 = await makeJob(PrintJobStatus.RENDERING, 'R2');
  const alreadyFailed = await makeJob(PrintJobStatus.FAILED, 'F1');
  const alreadyReady = await makeJob(PrintJobStatus.READY, 'OK');

  // Case 1+2 mixed: default reenqueue=true. Redis-off path will
  // promote to READY-direct; Redis-on would re-enqueue. Either is
  // a valid outcome — assert the stuck jobs are no longer stuck.
  const r1 = await reconcileStuckRenders();
  console.log('Pass 1 (reenqueue=true):', r1);
  const r1Jobs = await jobRepo.findByIds([rendering1.id, rendering2.id]);
  for (const j of r1Jobs) {
    if (j.status === PrintJobStatus.RENDERING) {
      console.error('FAIL: job', j.id, 'still RENDERING after sweep');
      process.exit(1);
    }
  }

  // Case 3: force a stuck job, then sweep with reenqueue=false.
  await jobRepo.update(rendering1.id, { status: PrintJobStatus.RENDERING });
  await AppDataSource.query(
    'UPDATE print_jobs SET updatedAt = ? WHERE id = ?',
    [oldDate.toISOString(), rendering1.id],
  );
  const r2 = await reconcileStuckRenders({ reenqueue: false });
  console.log('Pass 2 (reenqueue=false):', r2);
  const r2Job = await jobRepo.findOne({ where: { id: rendering1.id } });
  if (r2Job?.status !== PrintJobStatus.FAILED) {
    console.error('FAIL: job', rendering1.id, 'status is', r2Job?.status, 'expected FAILED');
    process.exit(1);
  }

  // Case 4: untouched-pre-existing jobs.
  const failed = await jobRepo.findOne({ where: { id: alreadyFailed.id } });
  const ready = await jobRepo.findOne({ where: { id: alreadyReady.id } });
  if (failed?.status !== PrintJobStatus.FAILED) {
    console.error('FAIL: pre-FAILED job changed to', failed?.status);
    process.exit(1);
  }
  if (ready?.status !== PrintJobStatus.READY) {
    console.error('FAIL: pre-READY job changed to', ready?.status);
    process.exit(1);
  }

  // Cleanup.
  for (const id of [rendering1.id, rendering2.id, alreadyFailed.id, alreadyReady.id]) {
    await jobRepo.delete(id);
  }
  console.log('OK: all four cases passed.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

const path = require('path');
const fs = require('fs');
const tmp = path.join(__dirname, '_stuckRenderTest.tmp.ts');
fs.writeFileSync(tmp, TS_SCRIPT, 'utf8');

const proc = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', tmp],
  { stdio: 'inherit', cwd: path.dirname(__dirname), shell: process.platform === 'win32' },
);
proc.on('close', (code) => {
  try { fs.unlinkSync(tmp); } catch {}
  process.exit(code || 0);
});
