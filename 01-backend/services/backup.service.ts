import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const execFileP = promisify(execFile);

const dirname = path.dirname(fileURLToPath(import.meta.url));

const hasBackupS3 = Boolean(
  process.env.BACKUP_S3_ENDPOINT &&
  process.env.BACKUP_S3_BUCKET &&
  process.env.BACKUP_S3_ACCESS_KEY_ID &&
  process.env.BACKUP_S3_SECRET_ACCESS_KEY,
);

let backupS3Client: S3Client | null = null;
if (hasBackupS3) {
  backupS3Client = new S3Client({
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    region: process.env.BACKUP_S3_REGION || 'auto',
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
  });
}

export interface BackupResult {
  driver: 'sqlite' | 'postgres';
  path: string;
  sizeBytes: number;
  kept: number;
  timestamp: string;
  s3Url?: string;
}

function usePostgres(): boolean {
  return (
    process.env.DATABASE_URL?.toLowerCase().startsWith('postgres://') ||
    process.env.DATABASE_URL?.toLowerCase().startsWith('postgresql://') ||
    false
  );
}

function sqliteFile(): string {
  return (
    process.env.DATABASE_FILE ||
    path.resolve(dirname, '../data/printloop.sqlite')
  );
}

function backupDir(): string {
  return process.env.BACKUP_DIR || path.resolve(dirname, '../data/backups');
}

function keepCount(): number {
  const n = Number(process.env.BACKUP_KEEP ?? 14);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
}

function stamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, -1);
}

async function sqliteBackup(): Promise<string> {
  const src = sqliteFile();
  await fs.access(src);
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `printloop-backup-${stamp()}.sqlite`).replace(/\\/g, '/');
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const d = new sqlite3.Database(src, (err) => (err ? reject(err) : resolve(d)));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  } finally {
    await new Promise<void>((resolve) => db.close(() => resolve()));
  }
  return out;
}

async function postgresBackup(): Promise<string> {
  const url = process.env.DATABASE_URL!;
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, `printloop-backup-${stamp()}.dump`);
  await execFileP('pg_dump', ['--dbname', url, '--format=c', '--file', out], {
    timeout: 15 * 60 * 1000,
  });
  return out;
}

async function prune(dir: string, keep: number): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  const backups = entries.filter((f) => f.startsWith('printloop-backup-'));
  backups.sort();
  const removed = backups.slice(0, Math.max(0, backups.length - keep));
  await Promise.all(removed.map((f) => fs.rm(path.join(dir, f), { force: true })));
  return backups.length - removed.length;
}

async function uploadToS3(localPath: string, key: string): Promise<string | null> {
  if (!hasBackupS3 || !backupS3Client) return null;
  try {
    const fileStream = await fs.open(localPath, 'r');
    const stat = await fileStream.stat();
    await backupS3Client!.send(
      new PutObjectCommand({
        Bucket: process.env.BACKUP_S3_BUCKET!,
        Key: key,
        Body: fileStream.createReadStream(),
        ContentLength: stat.size,
      }),
    );
    await fileStream.close();
    const publicBase = process.env.BACKUP_S3_PUBLIC_URL || process.env.BACKUP_S3_ENDPOINT;
    return `${publicBase}/${process.env.BACKUP_S3_BUCKET}/${encodeURIComponent(key)}`;
  } catch (err) {
    console.error('[Backup] S3 upload failed:', err);
    return null;
  }
}

export async function runDatabaseBackup(): Promise<BackupResult> {
  const driver = usePostgres() ? 'postgres' : 'sqlite';
  const out = driver === 'postgres' ? await postgresBackup() : await sqliteBackup();
  const stat = await fs.stat(out);
  const kept = await prune(path.dirname(out), keepCount());

  // Upload to S3 if configured
  const s3Key = `backups/${path.basename(out)}`;
  const s3Url = await uploadToS3(out, s3Key);

  const result: BackupResult = {
    driver,
    path: out,
    sizeBytes: stat.size,
    kept,
    timestamp: new Date().toISOString(),
    s3Url: s3Url || undefined,
  };
  console.log(
    `[Backup] ${driver} backup OK → ${out} (${(stat.size / 1024).toFixed(1)} KB, keeping ${kept})` +
      (s3Url ? ` → S3: ${s3Url}` : ''),
  );
  return result;
}