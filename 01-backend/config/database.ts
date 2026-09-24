import { DataSource, type DataSourceOptions } from 'typeorm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './index.js';
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
import { Tenant } from '../entities/tenant.entity';
import { TenantMember } from '../entities/tenantMember.entity';
import { Payout } from '../entities/payout.entity';
import { PayoutSchedule } from '../entities/payoutSchedule.entity';
import { InitSchema1700000000000 } from '../migrations/1700000000000-InitSchema';
import { CreateSaasFoundation1717100000000 } from '../migrations/1717100000000-CreateSaasFoundation';
import { AddTenantIdColumns1717200000000 } from '../migrations/1717200000000-AddTenantIdColumns';
import { TightenTenantUniqueness1717300000000 } from '../migrations/1717300000000-TightenTenantUniqueness';
import { AddRenderingStatus1717400000000 } from '../migrations/1717400000000-AddRenderingStatus';
import { AddPrintJobItemTenantId1717500000000 } from '../migrations/1717500000000-AddPrintJobItemTenantId';
import { CreateTenantBalances1717600000000 } from '../migrations/1717600000000-CreateTenantBalances';
import { TightenTenantIdNotNull1717700000000 } from '../migrations/1717700000000-TightenTenantIdNotNull';
import { CreateTenantBrandings1717800000000 } from '../migrations/1717800000000-CreateTenantBrandings';
import { CreateTenantWebhooks1717900000000 } from '../migrations/1717900000000-CreateTenantWebhooks';
import { CreateTenantDomains1718000000000 } from '../migrations/1718000000000-CreateTenantDomains';
import { AddUserTotp1718200000000 } from '../migrations/1718200000000-AddUserTotp';
import { AddTenantLocation1718300000000 } from '../migrations/1718300000000-AddTenantLocation';
import { AddKioskTestPrintPassedAt1718400000000 } from '../migrations/1718400000000-AddKioskTestPrintPassedAt';
import { AllowNullablePrintJobCode1718500000000 } from '../migrations/1718500000000-AllowNullablePrintJobCode';
import { PostgresBaseline1718100000000 } from '../migrations/1718100000000-PostgresBaseline';
import { TenantDomain } from '../entities/tenantDomain.entity';
import { TenantBalance } from '../entities/tenantBalance.entity';
import { Dispute } from '../entities/dispute.entity';
import { ShopReview } from '../entities/shopReview.entity';
import { CreateDisputesAndReviews1718600000000 } from '../migrations/1718600000000-CreateDisputesAndReviews';
import { AddPrintJobRenderFields1718700000000 } from '../migrations/1718700000000-AddPrintJobRenderFields';
import { AddPrintJobFinalCost1720000000000 } from '../migrations/1720000000000-AddPrintJobFinalCost';
import { AddPaymentAuthorizationCode1720100000000 } from '../migrations/1720100000000-AddPaymentAuthorizationCode';
import { CreateBlogPosts1720200000000 } from '../migrations/1720200000000-CreateBlogPosts';
import { CreatePrinterProfiles1720300000000 } from '../migrations/1720300000000-CreatePrinterProfiles';
import { AddTenantAvailability1720400000000 } from '../migrations/1720400000000-AddTenantAvailability';
import { AddAcceptWindowFields1720500000000 } from '../migrations/1720500000000-AddAcceptWindowFields';
import { AddKioskLastOfflineAlertAt1718800000000 } from '../migrations/1718800000000-AddKioskLastOfflineAlertAt';
import { AddJobTruthKioskCapsLmsKey1719000000000 } from '../migrations/1719000000000-AddJobTruthKioskCapsLmsKey';
import { AddOfficeConversionToPricing1720600000000 } from '../migrations/1720600000000-AddOfficeConversionToPricing';
import { AddEditingFieldsToPrintJob1720700000000 } from '../migrations/1720700000000-AddEditingFieldsToPrintJob';
import { CreateDocumentEditsTable1720900000000 } from '../migrations/1720900000000-CreateDocumentEditsTable';
import { CreateEditPricingConfigsTable1721000000000 } from '../migrations/1721000000000-CreateEditPricingConfigsTable';
import { CreateEditorSessionsTable1721100000000 } from '../migrations/1721100000000-CreateEditorSessionsTable';
import { AddTenantIdToDocumentEditAndEditorSession1721200000000 } from '../migrations/1721200000000-AddTenantIdToDocumentEditAndEditorSession';
import { TenantBranding } from '../entities/tenantBranding.entity';
import { TenantWebhook } from '../entities/tenantWebhook.entity';
import { BlogPost } from '../entities/blogPost.entity';
import { PrinterProfile } from '../entities/printerProfile.entity';
import { DocumentEdit } from '../entities/documentEdit.entity';
import { EditPricingConfig } from '../entities/editPricingConfig.entity';
import { EditorSession } from '../entities/editorSession.entity';

const dbFile = config.database.file;

const ENTITIES = [
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
  // SaaS foundation (Phase A) — added 2026-05-31.
  Tenant,
  TenantMember,
  Payout,
  PayoutSchedule,
  // Denormalised rollup (V2-8) for O(1) dashboard reads.
  TenantBalance,
  // White-label branding (V2-13) — Dimension 7.
  TenantBranding,
  // Tenant webhooks (V2-14) — Dimension 14.
  TenantWebhook,
  // Custom domains (V2-16) — Dimension 8.
  TenantDomain,
  Dispute,
  ShopReview,
  // Marketing blog (V2-54) — tenant-owned posts, public when published.
  BlogPost,
  // Printer profiles (V2-56) — per-printer render capabilities.
  PrinterProfile,
  // Document editing (V2-XX) — Edit & Print feature.
  DocumentEdit,
  // Edit pricing config (V2-XX) — per-shop editing service pricing.
  EditPricingConfig,
  // Editor sessions (V2-XX) — collaborative document editing.
  EditorSession,
];

/**
 * The SQLite incremental chain. Each file is SQLite-dialect
 * (`datetime('now')`, PRAGMA, table-rewrite NOT-NULL). These are the
 * authoritative history for SQLite deployments.
 */
const SQLITE_MIGRATIONS = [
  InitSchema1700000000000,
  CreateSaasFoundation1717100000000,
  AddTenantIdColumns1717200000000,
  TightenTenantUniqueness1717300000000,
  AddRenderingStatus1717400000000,
  AddPrintJobItemTenantId1717500000000,
  CreateTenantBalances1717600000000,
  TightenTenantIdNotNull1717700000000,
  CreateTenantBrandings1717800000000,
  CreateTenantWebhooks1717900000000,
  CreateTenantDomains1718000000000,
  AddUserTotp1718200000000,
  AddTenantLocation1718300000000,
  AddKioskTestPrintPassedAt1718400000000,
  AllowNullablePrintJobCode1718500000000,
  CreateDisputesAndReviews1718600000000,
  AddPrintJobRenderFields1718700000000,
  AddKioskLastOfflineAlertAt1718800000000,
  // V2-44 — job-truth + kiosk hardware caps + LMS handoff key.
  AddJobTruthKioskCapsLmsKey1719000000000,
  // V2-52 — final-cost reconciliation (render callback writes the
  // authoritative price; release gate settles the shortfall).
  AddPrintJobFinalCost1720000000000,
  // V2-53 — saved-card authorizations on payments.
  AddPaymentAuthorizationCode1720100000000,
  // V2-54 — marketing blog.
  CreateBlogPosts1720200000000,
  // V2-56 — printer profiles (render capabilities) + job pinning.
  CreatePrinterProfiles1720300000000,
  // V2-57 — operator availability toggle.
  AddTenantAvailability1720400000000,
  // V2-58 — accept-window job fields.
  AddAcceptWindowFields1720500000000,
  // V2-59 — office conversion flag on pricing configs.
  AddOfficeConversionToPricing1720600000000,
  // V2-XX — Document editing fields on print jobs.
  AddEditingFieldsToPrintJob1720700000000,
  // V2-XX — Document edits table for tracking edit workflow.
  CreateDocumentEditsTable1720900000000,
  // V2-XX — Edit pricing configs table.
  CreateEditPricingConfigsTable1721000000000,
  // V2-XX — Editor sessions table for collaborative editing.
  CreateEditorSessionsTable1721100000000,
  // V2-XX — Add tenantId to DocumentEdit and EditorSession tables.
  AddTenantIdToDocumentEditAndEditorSession1721200000000,
];

/**
 * Postgres deployments run a SINGLE consolidated baseline that builds
 * the full final schema in pg-native DDL. The SQLite incremental
 * files are NOT Postgres-safe (their PRAGMA + table-rewrite syntax
 * would error), so they're excluded from the Postgres migration set.
 */
const POSTGRES_MIGRATIONS = [
  PostgresBaseline1718100000000,
  AddPrintJobRenderFields1718700000000,
  AddKioskLastOfflineAlertAt1718800000000,
  // Dual-driver guarded (IF NOT EXISTS) — safe in both chains.
  AddJobTruthKioskCapsLmsKey1719000000000,
  // Dual-driver guarded (column-existence checks) — safe in both chains.
  AddPrintJobFinalCost1720000000000,
  AddPaymentAuthorizationCode1720100000000,
  CreateBlogPosts1720200000000,
  CreatePrinterProfiles1720300000000,
  AddTenantAvailability1720400000000,
  AddAcceptWindowFields1720500000000,
  // V2-XX — Document editing fields on print jobs (guarded for Postgres).
  AddEditingFieldsToPrintJob1720700000000,
  // V2-XX — Document edits table (guarded for Postgres).
  CreateDocumentEditsTable1720900000000,
  // V2-XX — Edit pricing configs table (guarded for Postgres).
  CreateEditPricingConfigsTable1721000000000,
  // V2-XX — Editor sessions table (guarded for Postgres).
  CreateEditorSessionsTable1721100000000,
  // V2-XX — Add tenantId to DocumentEdit and EditorSession tables.
  AddTenantIdToDocumentEditAndEditorSession1721200000000,
];

const MIGRATIONS = (() => {
  const url = (process.env.DATABASE_URL || '').toLowerCase();
  const isPg = url.startsWith('postgres://') || url.startsWith('postgresql://');
  return isPg ? POSTGRES_MIGRATIONS : SQLITE_MIGRATIONS;
})();

/**
 * Database driver selection (Critical bucket #4 — V2-13).
 *
 * When `DATABASE_URL` is set and starts with `postgres://` or
 * `postgresql://`, we boot against Postgres — required for
 * horizontal scaling (SQLite is single-writer; you can't safely run
 * 2+ API instances against the same SQLite file).
 *
 * Otherwise we boot against the legacy SQLite file. Existing
 * single-tenant deployments keep working unchanged.
 *
 * **Migration parity (resolved V2-16):** the SQLite incremental
 * chain is SQLite-dialect and not Postgres-safe. The `MIGRATIONS`
 * const selects by driver — Postgres boots run a single consolidated
 * `PostgresBaseline` that builds the full final schema in pg-native
 * DDL; SQLite boots run the incremental history. See the two
 * migration arrays below.
 */
const driverFromUrl = (config.database.url || '').toLowerCase();
const usePostgres =
  driverFromUrl.startsWith('postgres://') ||
  driverFromUrl.startsWith('postgresql://');

const dataSourceOptions: DataSourceOptions = usePostgres
  ? {
      type: 'postgres',
      url: config.database.url,
      // Connection pool — defaults sized for a small Railway/Fly box.
      extra: {
        max: config.database.poolMax,
      },
      // Postgres SSL: most managed providers (Neon, Supabase, Railway)
      // require TLS; set DB_SSL=true to opt in. Self-hosted localhost
      // dev with `DB_SSL=false` (or unset) keeps the connection clear.
      ssl:
        config.database.ssl
          ? { rejectUnauthorized: false }
          : false,
      synchronize: false,
      migrationsRun: true,
      logging: config.database.logging,
      entities: ENTITIES as any,
      migrations: MIGRATIONS as any,
    }
  : {
      type: 'sqlite',
      database: dbFile,
      // Schema is managed by explicit, reviewed migrations — NOT synchronize.
      // synchronize auto-derives a schema diff from the entities on every boot
      // and will silently drop/recreate columns (and their data) when an entity
      // changes. `migrationsRun` applies the migrations array on boot instead,
      // which preserves the zero-touch deploy flow while making every schema
      // change an auditable file. The InitSchema baseline is idempotent
      // (CREATE … IF NOT EXISTS), so it self-baselines the existing prod DB.
      synchronize: false,
      migrationsRun: true,
      logging: config.database.logging,
      entities: ENTITIES as any,
      migrations: MIGRATIONS as any,
    };

export const AppDataSource = new DataSource(dataSourceOptions);

console.log(
  `[database] driver=${usePostgres ? 'postgres' : 'sqlite'}` +
    (usePostgres ? ` (DATABASE_URL set)` : ` file=${dbFile}`),
);

/**
 * One-shot data normalizations run after `AppDataSource.initialize()`.
 * Idempotent; safe to invoke on every boot. Mirrors the "ensure" pattern
 * used by `config/settings.ts` — schema-level changes are synchronize's
 * job, *data* changes are this function's job.
 */
export async function runPostInitMigrations(): Promise<void> {
  // Add photoUrl column to shop_reviews table if it doesn't exist
  try {
    const isPg = !!process.env.DATABASE_URL;
    if (isPg) {
      await AppDataSource.query(`ALTER TABLE "shop_reviews" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT`);
    } else {
      // SQLite has no ADD COLUMN IF NOT EXISTS, so try-catch is our safety harness
      await AppDataSource.query(`ALTER TABLE "shop_reviews" ADD COLUMN "photoUrl" TEXT`);
    }
  } catch (err: any) {
    const msg = err?.message || '';
    if (!msg.includes('duplicate column') && !msg.includes('already exists') && !msg.includes('duplicate')) {
      console.warn('[migrations] shop_reviews photoUrl column addition skipped/already exists:', msg || err);
    }
  }

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
