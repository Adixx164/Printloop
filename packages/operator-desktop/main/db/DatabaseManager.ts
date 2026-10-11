/**
 * Database Manager - SQLite for offline queue and print job cache
 * Uses sqlite3 (async) instead of better-sqlite3 to avoid native build issues on Windows
 */

import sqlite3 from 'sqlite3';
import { join } from 'path';
import { app } from 'electron';
import { promisify } from 'util';

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  
  async initialize(): Promise<void> {
    const dbPath = join(app.getPath('userData'), 'operator.db');
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('[Database] Failed to open:', err);
          reject(err);
        } else {
          console.log('[Database] Initialized at', dbPath);
          this.configureDatabase().then(resolve).catch(reject);
        }
      });
    });
  }
  
  private async configureDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const run = promisify(this.db.run.bind(this.db));
    const exec = promisify(this.db.exec.bind(this.db));
    
    await run('PRAGMA journal_mode = WAL');
    
    await this.createTables();
    
    console.log('[Database] Tables created');
  }
  
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const exec = promisify(this.db.exec.bind(this.db));
    
    await exec(`
      CREATE TABLE IF NOT EXISTS printers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        address TEXT NOT NULL,
        capabilities TEXT,
        isDefault INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        pairedAt TEXT,
        lastUsedAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await exec(`
      CREATE TABLE IF NOT EXISTS print_jobs (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        status TEXT NOT NULL,
        documentUrl TEXT,
        pages INTEGER,
        copies INTEGER,
        color INTEGER,
        duplex INTEGER,
        paperSize TEXT,
        dpi INTEGER,
        price INTEGER,
        tenantId TEXT NOT NULL,
        kioskId TEXT,
        printerId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        syncedAt TEXT
      )
    `);
    
    await exec(`
      CREATE TABLE IF NOT EXISTS offline_accepts (
        id TEXT PRIMARY KEY,
        jobId TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        syncedAt TEXT,
        retryCount INTEGER DEFAULT 0
      )
    `);
    
    await exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        data TEXT,
        read INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      )
    `);
    
    await exec(`
      CREATE TABLE IF NOT EXISTS analytics_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    
    await exec(`
      CREATE INDEX IF NOT EXISTS idx_print_jobs_tenant ON print_jobs(tenantId);
      CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_offline_accepts_synced ON offline_accepts(syncedAt);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    `);
  }
  
  // Promisify methods for async usage
  private getAll(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  private get(sql: string, params: any[] = []): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
  
  private run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    if (!this.db) throw new Error('Database not initialized');
    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
  
  // Printer methods
  async getPrinters(): Promise<any[]> {
    return this.getAll('SELECT * FROM printers WHERE isActive = 1 ORDER BY isDefault DESC, name ASC');
  }
  
  async getPrinter(id: string): Promise<any | null> {
    return this.get('SELECT * FROM printers WHERE id = ?', [id]);
  }
  
  async savePrinter(printer: any): Promise<void> {
    const stmt = `
      INSERT OR REPLACE INTO printers (id, name, type, address, capabilities, isDefault, isActive, pairedAt, lastUsedAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;
    await this.run(stmt, [
      printer.id,
      printer.name,
      printer.type,
      printer.address,
      JSON.stringify(printer.capabilities),
      printer.isDefault ? 1 : 0,
      printer.isActive ? 1 : 0,
      printer.pairedAt || new Date().toISOString(),
      printer.lastUsedAt || null
    ]);
  }
  
  async deletePrinter(id: string): Promise<void> {
    await this.run('DELETE FROM printers WHERE id = ?', [id]);
  }
  
  async updatePrinterLastUsed(id: string): Promise<void> {
    await this.run('UPDATE printers SET lastUsedAt = datetime(\'now\') WHERE id = ?', [id]);
  }
  
  // Print jobs cache
  async cachePrintJobs(jobs: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = `
      INSERT OR REPLACE INTO print_jobs (id, code, status, documentUrl, pages, copies, color, duplex, paperSize, dpi, price, tenantId, kioskId, printerId, createdAt, updatedAt, syncedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;
    
    // Use transaction for bulk insert
    await new Promise<void>((resolve, reject) => {
      this.db!.serialize(() => {
        this.db!.run('BEGIN TRANSACTION');
        const stmt = this.db!.prepare(`
          INSERT OR REPLACE INTO print_jobs (id, code, status, documentUrl, pages, copies, color, duplex, paperSize, dpi, price, tenantId, kioskId, printerId, createdAt, updatedAt, syncedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        
        for (const job of jobs) {
          stmt.run(
            job.id,
            job.code,
            job.status,
            job.documentUrl || null,
            job.pages || 0,
            job.copies || 1,
            job.color ? 1 : 0,
            job.duplex ? 1 : 0,
            job.paperSize || 'A4',
            job.dpi || 300,
            job.price || 0,
            job.tenantId,
            job.kioskId || null,
            job.printerId || null,
            job.createdAt,
            job.updatedAt
          );
        }
        
        stmt.finalize((err: any) => {
          if (err) {
            this.db!.run('ROLLBACK');
            reject(err);
          } else {
            this.db!.run('COMMIT', (err: any) => {
              if (err) reject(err);
              else resolve();
            });
          }
        });
      });
    });
  }
  
  async getCachedPrintJobs(tenantId: string): Promise<any[]> {
    return this.getAll('SELECT * FROM print_jobs WHERE tenantId = ? ORDER BY createdAt DESC', [tenantId]);
  }
  
  async updatePrintJobStatus(jobId: string, status: string): Promise<void> {
    await this.run('UPDATE print_jobs SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?', [status, jobId]);
  }
  
  // Offline accept queue
  async queueOfflineAccept(jobId: string, action: 'accept' | 'reject'): Promise<void> {
    await this.run(`
      INSERT INTO offline_accepts (id, jobId, action, timestamp)
      VALUES (?, ?, ?, datetime('now'))
    `, [crypto.randomUUID(), jobId, action]);
  }
  
  async getPendingOfflineAccepts(): Promise<any[]> {
    return this.getAll('SELECT * FROM offline_accepts WHERE syncedAt IS NULL ORDER BY timestamp ASC');
  }
  
  async markOfflineAcceptSynced(id: string): Promise<void> {
    await this.run('UPDATE offline_accepts SET syncedAt = datetime(\'now\') WHERE id = ?', [id]);
  }
  
  async incrementOfflineAcceptRetry(id: string): Promise<void> {
    await this.run('UPDATE offline_accepts SET retryCount = retryCount + 1 WHERE id = ?', [id]);
  }
  
  // Notifications
  async saveNotification(notification: any): Promise<void> {
    await this.run(`
      INSERT OR REPLACE INTO notifications (id, type, title, body, data, read, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      notification.id,
      notification.type,
      notification.title,
      notification.body || null,
      JSON.stringify(notification.data || {}),
      notification.read ? 1 : 0,
      notification.createdAt
    ]);
  }
  
  async getNotifications(unreadOnly = false): Promise<any[]> {
    const query = unreadOnly
      ? 'SELECT * FROM notifications WHERE read = 0 ORDER BY createdAt DESC'
      : 'SELECT * FROM notifications ORDER BY createdAt DESC';
    return this.getAll(query);
  }
  
  async markNotificationRead(id: string): Promise<void> {
    await this.run('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
  }
  
  // Analytics cache
  async setAnalyticsCache(key: string, value: any): Promise<void> {
    await this.run(`
      INSERT OR REPLACE INTO analytics_cache (key, value, updatedAt)
      VALUES (?, ?, datetime('now'))
    `, [key, JSON.stringify(value)]);
  }
  
  async getAnalyticsCache(key: string): Promise<any | null> {
    const row = await this.get('SELECT value FROM analytics_cache WHERE key = ?', [key]);
    return row ? JSON.parse(row.value) : null;
  }
  
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}