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
