import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema for the SQLite database.
 *
 * This captures the exact end-state that `synchronize: true` used to build,
 * generated from the entity metadata (see scripts/_genInitSchema was used
 * once to author it). Every statement is `IF NOT EXISTS`, which makes this
 * migration safe to run against BOTH:
 *   - a brand-new database  → creates all tables + indexes, and
 *   - the existing prod database that synchronize already built → every
 *     statement no-ops, and TypeORM simply records the baseline so future
 *     schema changes go through reviewed migration files instead of an
 *     auto-derived (and potentially destructive) diff on boot.
 *
 * SQLite does not validate foreign-key targets at CREATE TABLE time, so the
 * table order below (referenced tables may appear after their referrers) is
 * intentionally the synchronize order and is safe.
 */
export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  private static readonly STATEMENTS: string[] = [
    `CREATE TABLE IF NOT EXISTS "kiosks" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar(255) NOT NULL, "location" varchar(255), "campus" varchar(100), "shopId" varchar(255), "apiKey" varchar(255) NOT NULL, "status" varchar CHECK( "status" IN ('ACTIVE','MAINTENANCE','OFFLINE','DISABLED') ) NOT NULL DEFAULT ('ACTIVE'), "printerName" varchar(255), "printerModel" varchar(255), "ipAddress" varchar(100), "lastSeenAt" datetime, "lastPrintedAt" datetime, "totalJobsPrinted" integer NOT NULL DEFAULT (0), "totalPagesPrinted" integer NOT NULL DEFAULT (0), "notes" text, "mapsUrl" varchar(1024), "isPublic" boolean NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, CONSTRAINT "UQ_1fba7902aab877f2a5284c8be96" UNIQUE ("apiKey"))`,
    `CREATE TABLE IF NOT EXISTS "pricing_configs" ("id" varchar PRIMARY KEY NOT NULL, "paperSize" varchar CHECK( "paperSize" IN ('A4','A3','LETTER','LEGAL') ) NOT NULL DEFAULT ('A4'), "colorType" varchar CHECK( "colorType" IN ('BLACK_WHITE','COLOR') ) NOT NULL DEFAULT ('BLACK_WHITE'), "pricePerPage" decimal(10,2) NOT NULL, "duplexMultiplier" decimal(4,2) NOT NULL DEFAULT (1), "highResolutionMultiplier" decimal(4,2) NOT NULL DEFAULT (1), "price100Simplex" decimal(10,2), "price300Simplex" decimal(10,2), "price600Simplex" decimal(10,2), "price100Duplex" decimal(10,2), "price300Duplex" decimal(10,2), "price600Duplex" decimal(10,2), "isActive" boolean NOT NULL DEFAULT (1), "currency" varchar(3) NOT NULL DEFAULT ('NGN'), "notes" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS "system_settings" ("id" varchar PRIMARY KEY NOT NULL, "key" varchar(100) NOT NULL, "value" text NOT NULL, "valueType" varchar(50) NOT NULL DEFAULT ('string'), "category" varchar(100), "description" text, "isReadOnly" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b1b5bc664526d375c94ce9ad43d" UNIQUE ("key"))`,
    `CREATE TABLE IF NOT EXISTS "group_sessions" ("id" varchar PRIMARY KEY NOT NULL, "hostUserId" varchar, "groupName" varchar(255) NOT NULL, "deadline" datetime NOT NULL, "status" varchar CHECK( "status" IN ('open','closed') ) NOT NULL DEFAULT ('open'), "shareUrl" varchar(255) NOT NULL, "shareId" varchar(20), "watermarkPrefix" varchar(50), "batchCode" varchar(10), "batchToken" varchar(255), "closedAt" datetime, "defaultOptions" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_31f836afa8bfd9ff6d75d97d283" UNIQUE ("shareId"))`,
    `CREATE TABLE IF NOT EXISTS "files" ("id" varchar PRIMARY KEY NOT NULL, "fileName" varchar(255) NOT NULL, "mimeType" varchar(100) NOT NULL, "sizeBytes" integer NOT NULL, "fileURL" text NOT NULL, "watermarkedUrl" text, "pageCount" integer NOT NULL DEFAULT (1), "participantId" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS "users" ("id" varchar PRIMARY KEY NOT NULL, "firstName" varchar(100) NOT NULL, "lastName" varchar(100) NOT NULL, "email" varchar(255) NOT NULL, "phoneNumber" varchar(20) NOT NULL, "passwordHash" varchar(255) NOT NULL, "salt" varchar(255) NOT NULL, "printToken" varchar(96), "isEmailVerified" boolean NOT NULL DEFAULT (0), "verificationToken" varchar(10), "resetToken" varchar(10), "role" varchar CHECK( "role" IN ('user','admin','super_admin') ) NOT NULL DEFAULT ('user'), "adminPrivileges" text, "isBlocked" boolean NOT NULL DEFAULT (0), "blockReason" varchar(255), "lastLoginAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_b52dc8eb83069af9076bb408c01" UNIQUE ("printToken"))`,
    `CREATE TABLE IF NOT EXISTS "print_job_items" ("id" varchar PRIMARY KEY NOT NULL, "printJobId" varchar NOT NULL, "fileId" varchar NOT NULL, "fileName" varchar(255) NOT NULL, "order" integer NOT NULL DEFAULT (0), "totalPages" integer NOT NULL DEFAULT (1), "cost" decimal(10,2) NOT NULL DEFAULT (0), "printConfiguration" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS "promotions" ("id" varchar PRIMARY KEY NOT NULL, "code" varchar(64) NOT NULL, "name" varchar(255) NOT NULL, "description" text, "discountType" varchar(20) NOT NULL DEFAULT ('percentage'), "discountValue" decimal(10,2) NOT NULL DEFAULT (0), "status" varchar(20) NOT NULL DEFAULT ('active'), "usageCount" integer NOT NULL DEFAULT (0), "maxUses" integer, "startsAt" datetime, "endsAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_8ab10e580f70c3d2e2e4b31ebf2" UNIQUE ("code"))`,
    `CREATE TABLE IF NOT EXISTS "group_participants" ("id" varchar PRIMARY KEY NOT NULL, "groupSessionId" varchar NOT NULL, "userId" varchar, "name" varchar(255) NOT NULL, "email" varchar(255), "phoneNumber" varchar(50), "watermarkId" varchar(50), "uploadToken" varchar(255) NOT NULL, "status" varchar CHECK( "status" IN ('INVITED','JOINED','UPLOADED','PAID','CANCELLED') ) NOT NULL DEFAULT ('JOINED'), "printJobId" varchar, "joinedAt" datetime, "uploadedAt" datetime, "paidAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_38b95bc696721cde2072be49ac5" UNIQUE ("uploadToken"), CONSTRAINT "FK_32c4752330cb9ce57afd861cf48" FOREIGN KEY ("groupSessionId") REFERENCES "group_sessions" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    `CREATE TABLE IF NOT EXISTS "transactions" ("id" varchar PRIMARY KEY NOT NULL, "walletId" varchar NOT NULL, "type" varchar CHECK( "type" IN ('topup','print','refund','credit') ) NOT NULL, "amount" decimal(10,2) NOT NULL, "description" varchar(255) NOT NULL, "balanceAfter" decimal(10,2) NOT NULL, "reference" varchar(100), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_a88f466d39796d3081cf96e1b66" FOREIGN KEY ("walletId") REFERENCES "wallets" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    `CREATE TABLE IF NOT EXISTS "wallets" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "balance" decimal(10,2) NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "REL_2ecdb33f23e9a6fc392025c0b9" UNIQUE ("userId"), CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    `CREATE TABLE IF NOT EXISTS "print_jobs" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar, "fileId" varchar, "fileName" varchar(255), "code" varchar(10) NOT NULL, "cost" decimal(10,2) NOT NULL, "totalPages" integer NOT NULL DEFAULT (0), "jobType" varchar(20), "status" varchar CHECK( "status" IN ('pending','ready','releasing','printing','done','failed','expired','refunded') ) NOT NULL DEFAULT ('ready'), "printConfiguration" text NOT NULL, "kioskId" varchar, "printerId" varchar, "printerName" varchar(255), "groupSessionId" varchar, "watermarkId" varchar(50), "pagesCompleted" integer NOT NULL DEFAULT (0), "idempotencyKey" varchar(128), "expiresAt" datetime, "completedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_5f9cbba8cf46967052427baa7c5" UNIQUE ("code"), CONSTRAINT "FK_86ed1e238f61a57a8eb716319d8" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_421f90b7579306013df7cf268c6" FOREIGN KEY ("fileId") REFERENCES "files" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_7fc365da501d9e3a09ef7054336" FOREIGN KEY ("kioskId") REFERENCES "kiosks" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`,
    `CREATE TABLE IF NOT EXISTS "audit_logs" ("id" varchar PRIMARY KEY NOT NULL, "actorId" varchar, "actorName" varchar(100) NOT NULL, "action" varchar(100) NOT NULL, "target" varchar(255), "detail" text, "ipAddress" varchar(45), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_2dc33f7f3c22e2e7badafca1d12" FOREIGN KEY ("actorId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`,
    `CREATE TABLE IF NOT EXISTS "payments" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "amount" decimal(10,2) NOT NULL, "status" varchar(20) NOT NULL DEFAULT ('SUCCESS'), "method" varchar(20) NOT NULL DEFAULT ('wallet'), "reference" varchar(120), "description" varchar(255), "refundedAt" datetime, "refundReason" varchar(255), "refundAmount" decimal(10,2), "refundType" varchar(10), "refundReference" varchar(120), "refundedBy" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_d35cb3c13a18e1ea1705b2817b1" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`,
    `CREATE INDEX IF NOT EXISTS "idx_kiosk_api_key" ON "kiosks" ("apiKey")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_8f9dab671b376d1c46cbe837ad" ON "pricing_configs" ("paperSize", "colorType")`,
    `CREATE INDEX IF NOT EXISTS "idx_pji_print_job" ON "print_job_items" ("printJobId")`,
    `CREATE INDEX IF NOT EXISTS "idx_participant_session_id" ON "group_participants" ("groupSessionId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "print_jobs_user_idem_uniq" ON "print_jobs" ("userId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "idx_payment_user_id" ON "payments" ("userId")`,
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const sql of InitSchema1700000000000.STATEMENTS) {
      await queryRunner.query(sql);
    }
  }

  public async down(): Promise<void> {
    // Refuse to revert the baseline: a down() that dropped these tables would
    // destroy the entire production database. If you genuinely need to tear
    // the schema down, do it deliberately by hand.
    throw new Error(
      'InitSchema is a baseline migration and cannot be reverted (it would drop every table).',
    );
  }
}
