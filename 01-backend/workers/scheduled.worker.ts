import { Worker, Job } from 'bullmq';
import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { GroupSessionService } from '../services/groupSession.service';
import { SystemSetting } from '../entities/systemSetting.entity';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

/**
 * Scheduled Jobs Worker
 * Handles cron-like recurring tasks
 */
export const scheduledWorker = new Worker(
  'scheduled',
  async (job: Job) => {
    switch (job.name) {
      case 'auto-close-group-sessions':
        return await autoCloseGroupSessions();

      case 'mark-offline-kiosks':
        return await markOfflineKiosks();

      case 'daily-cleanup':
        return await dailyCleanup();

      default:
        console.warn(`[Scheduled] Unknown job: ${job.name}`);
        return { skipped: true };
    }
  },
  { connection: redisConnection }
);

/**
 * Auto-close group sessions where deadline has passed
 */
async function autoCloseGroupSessions(): Promise<{ closed: number }> {
  console.log('[Scheduled] Auto-closing expired group sessions...');
  const service = new GroupSessionService();
  const closed = await service.autoCloseExpiredSessions();
  console.log(`[Scheduled] Auto-closed ${closed} sessions`);
  return { closed };
}

/**
 * Mark kiosks as OFFLINE if they haven't sent heartbeat recently
 */
async function markOfflineKiosks(): Promise<{ markedOffline: number }> {
  console.log('[Scheduled] Checking for offline kiosks...');

  const kioskRepo: Repository<Kiosk> = AppDataSource.getRepository(Kiosk);
  const settingRepo: Repository<SystemSetting> = AppDataSource.getRepository(SystemSetting);

  // Get threshold from settings
  const setting = await settingRepo.findOne({
    where: { key: 'kiosk_offline_threshold_minutes' },
  });
  const thresholdMinutes = setting ? parseInt(setting.value) : 15;

  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() - thresholdMinutes);

  const result = await kioskRepo
    .createQueryBuilder()
    .update(Kiosk)
    .set({ status: KioskStatus.OFFLINE })
    .where('status = :active', { active: KioskStatus.ACTIVE })
    .andWhere('(lastSeenAt IS NULL OR lastSeenAt < :cutoff)', { cutoff })
    .execute();

  console.log(`[Scheduled] Marked ${result.affected} kiosks offline`);
  return { markedOffline: result.affected || 0 };
}

/**
 * Daily cleanup tasks
 */
async function dailyCleanup(): Promise<any> {
  console.log('[Scheduled] Running daily cleanup...');

  // Add cleanup tasks here:
  // - Delete expired upload tokens
  // - Archive old audit logs
  // - Generate daily reports
  // - etc.

  return { ranAt: new Date().toISOString() };
}

scheduledWorker.on('completed', (job) => {
  console.log(`[Scheduled] ${job.name} completed`);
});

scheduledWorker.on('failed', (job, err) => {
  console.error(`[Scheduled] ${job?.name} failed:`, err);
});
