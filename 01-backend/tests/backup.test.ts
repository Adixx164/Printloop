import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { AppDataSource } from '../config/database';
import { SystemSetting } from '../entities/systemSetting.entity';
import { runDatabaseBackup } from '../services/backup.service';

const paths = vi.hoisted(() => {
  const file = process.cwd() + '/data/backup-test.sqlite';
  const backups = process.cwd() + '/data/backup-test-snapshots';
  process.env.DATABASE_FILE = file;
  process.env.BACKUP_DIR = backups;
  process.env.BACKUP_KEEP = '2';
  return { file, backups };
});

function sqliteHasTable(file: string, table: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, (err) => (err ? reject(err) : undefined));
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
      [table],
      (err, row) => {
        db.close(() => (err ? reject(err) : resolve(!!row)));
      },
    );
  });
}

describe('Database backup (V2-59)', () => {
  beforeAll(async () => {
    if (fs.existsSync(paths.file)) {
      try {
        fs.unlinkSync(paths.file);
      } catch {}
    }
    if (fs.existsSync(paths.backups)) {
      fs.rmSync(paths.backups, { recursive: true, force: true });
    }
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
    // Force a row into the schema so the snapshot has real content.
    await AppDataSource.getRepository(SystemSetting).save(
      AppDataSource.getRepository(SystemSetting).create({
        key: `backup-probe-${Date.now()}`,
        value: '1',
      }),
    );
  });

  afterAll(async () => {
    if (await AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    for (const f of [paths.file, paths.backups]) {
      try {
        fs.rmSync(f, { recursive: true, force: true });
      } catch {}
    }
  });

  it('produces a valid SQLite snapshot and rotates to BACKUP_KEEP', async () => {
    const first = await runDatabaseBackup();
    expect(first.driver).toBe('sqlite');
    expect(fs.existsSync(first.path)).toBe(true);
    expect(await sqliteHasTable(first.path, 'print_jobs')).toBe(true);

    await runDatabaseBackup();
    await runDatabaseBackup();

    const files = fs
      .readdirSync(paths.backups)
      .filter((f) => f.startsWith('printloop-backup-'))
      .sort();
    expect(files.length).toBe(2);
    for (const f of files) {
      expect(await sqliteHasTable(path.join(paths.backups, f), 'print_jobs')).toBe(true);
    }
  });
});