import { DataSource } from 'typeorm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kiosk } from '../entities/kiosk.entity';
import { PricingConfig } from '../entities/pricingConfig.entity';
import { SystemSetting } from '../entities/systemSetting.entity';
import { GroupParticipant } from '../entities/groupParticipant.entity';
import { File } from '../entities/file.entity';
import { User } from '../entities/user.entity';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { AuditLog } from '../entities/auditLog.entity';
import { Payment } from '../entities/payment.entity';
import { Promotion } from '../entities/promotion.entity';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile =
  process.env.DATABASE_FILE || path.resolve(dirname, '../data/printloop.sqlite');

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: dbFile,
  // SQLite has no real schema migrations here; sync the schema on boot.
  synchronize: true,
  logging: process.env.DB_LOGGING === 'true',
  entities: [
    Kiosk,
    PricingConfig,
    SystemSetting,
    GroupParticipant,
    File,
    User,
    PrintJob,
    PrintJobItem,
    Wallet,
    Transaction,
    GroupSession,
    AuditLog,
    Payment,
    Promotion,
  ],
  migrations: [],
  subscribers: [],
});

/**
 * One-shot data normalizations run after `AppDataSource.initialize()`.
 * Idempotent; safe to invoke on every boot. Mirrors the "ensure" pattern
 * used by `config/settings.ts` — schema-level changes are synchronize's
 * job, *data* changes are this function's job.
 */
export async function runPostInitMigrations(): Promise<void> {
  try {
    // Promotion codes: uppercase any rows that pre-date the
    // normalize-on-write change in admin.routes.ts. Cheap UPDATE; the
    // `WHERE code != UPPER(code)` clause makes it a no-op on already-
    // clean tables.
    await AppDataSource.query(
      `UPDATE promotions SET code = UPPER(code) WHERE code != UPPER(code)`,
    );
  } catch (err) {
    console.warn('[migrations] promotion code normalization skipped:', err);
  }

  // Pricing: backfill the per-cell columns added with the explicit price
  // matrix. Only touches rows where the cells are still NULL — admins
  // who customised their prices keep them. Maps to the user's published
  // pricing table (A4/A3 × BW/COLOR × 100/300/600 × simplex/duplex).
  const PRICING_BACKFILL: Array<{
    paper: 'A4' | 'A3';
    color: 'BLACK_WHITE' | 'COLOR';
    cells: [number, number, number, number, number, number];
    // [p100Sx, p300Sx, p600Sx, p100Dx, p300Dx, p600Dx]
  }> = [
    { paper: 'A4', color: 'BLACK_WHITE', cells: [50, 70, 100, 65, 90, 120] },
    { paper: 'A4', color: 'COLOR',       cells: [100, 200, 300, 150, 250, 350] },
    { paper: 'A3', color: 'BLACK_WHITE', cells: [100, 150, 300, 150, 230, 400] },
    { paper: 'A3', color: 'COLOR',       cells: [250, 400, 650, 390, 400, 650] },
  ];
  for (const row of PRICING_BACKFILL) {
    try {
      await AppDataSource.query(
        `UPDATE pricing_configs
           SET price100Simplex = COALESCE(price100Simplex, ?),
               price300Simplex = COALESCE(price300Simplex, ?),
               price600Simplex = COALESCE(price600Simplex, ?),
               price100Duplex  = COALESCE(price100Duplex,  ?),
               price300Duplex  = COALESCE(price300Duplex,  ?),
               price600Duplex  = COALESCE(price600Duplex,  ?)
         WHERE paperSize = ? AND colorType = ?`,
        [...row.cells, row.paper, row.color],
      );
    } catch (err) {
      console.warn(
        `[migrations] pricing backfill skipped for ${row.paper}/${row.color}:`,
        err,
      );
    }
  }
}
