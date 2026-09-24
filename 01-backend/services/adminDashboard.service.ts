import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Payment } from '../entities/payment.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { GroupSession, GroupSessionStatus } from '../entities/groupSession.entity';
import { Tenant } from '../entities/tenant.entity';

export interface DashboardStats {
  users: {
    total: number;
    activeToday: number;
    activeThisWeek: number;
    blocked: number;
  };
  jobs: {
    total: number;
    completedToday: number;
    pendingNow: number;
    failedToday: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
    byDay: Array<{ date: string; revenue: number; jobCount: number }>;
  };
  pages: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
  };
  kiosks: {
    total: number;
    online: number;
    offline: number;
    maintenance: number;
    disabled: number;
  };
  groupSessions: {
    open: number;
    closed: number;
    totalThisMonth: number;
  };
}

export class AdminDashboardService {
  private userRepo: Repository<User>;
  private jobRepo: Repository<PrintJob>;
  private paymentRepo: Repository<Payment>;
  private kioskRepo: Repository<Kiosk>;
  private sessionRepo: Repository<GroupSession>;

  constructor() {
    this.userRepo = AppDataSource.getRepository(User);
    this.jobRepo = AppDataSource.getRepository(PrintJob);
    this.paymentRepo = AppDataSource.getRepository(Payment);
    this.kioskRepo = AppDataSource.getRepository(Kiosk);
    this.sessionRepo = AppDataSource.getRepository(GroupSession);
  }

  /**
   * Aggregate stats for a single tenant's admin dashboard.
   *
   * **Tenant-scoped as of V2-11.** Every query in here used to return
   * cross-tenant counts (every user, every job, every kiosk). Now
   * each clause is filtered by `tenant.id`. SUPER_ADMIN platform
   * stats (cross-tenant aggregates) belong on a separate
   * platform-console method later in Dimension 11.
   */
  async getStats(tenant: Tenant): Promise<DashboardStats> {
    const tid = tenant.id;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      userTotal,
      userActiveToday,
      userActiveWeek,
      userBlocked,
      jobTotal,
      jobCompletedToday,
      jobPending,
      jobFailedToday,
      jobByStatus,
      revenueToday,
      revenueWeek,
      revenueMonth,
      revenueAllTime,
      revenueByDay,
      pagesToday,
      pagesWeek,
      pagesMonth,
      pagesAllTime,
      kioskCounts,
      groupSessionsOpen,
      groupSessionsClosed,
      groupSessionsMonth,
    ] = await Promise.all([
      this.userRepo.count({ where: { tenantId: tid } }),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.tenantId = :tid', { tid })
        .andWhere('u.lastLoginAt >= :d', { d: startOfDay })
        .getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.tenantId = :tid', { tid })
        .andWhere('u.lastLoginAt >= :d', { d: startOfWeek })
        .getCount(),
      this.userRepo.count({ where: { tenantId: tid, isBlocked: true } }),

      this.jobRepo.count({ where: { tenantId: tid } }),
      this.jobRepo
        .createQueryBuilder('j')
        .where('j.tenantId = :tid', { tid })
        .andWhere('j.status = :s', { s: PrintJobStatus.DONE })
        .andWhere('j.completedAt >= :d', { d: startOfDay })
        .getCount(),
      this.jobRepo.count({ where: { tenantId: tid, status: PrintJobStatus.READY } }),
      this.jobRepo
        .createQueryBuilder('j')
        .where('j.tenantId = :tid', { tid })
        .andWhere('j.status = :s', { s: PrintJobStatus.FAILED })
        .andWhere('j.updatedAt >= :d', { d: startOfDay })
        .getCount(),
      this.jobRepo
        .createQueryBuilder('j')
        .select('j.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('j.tenantId = :tid', { tid })
        .groupBy('j.status')
        .getRawMany(),

      this.sumRevenue(tid, startOfDay),
      this.sumRevenue(tid, startOfWeek),
      this.sumRevenue(tid, startOfMonth),
      this.sumRevenue(tid),
      this.revenueByDay(tid, thirtyDaysAgo),

      this.sumPages(tid, startOfDay),
      this.sumPages(tid, startOfWeek),
      this.sumPages(tid, startOfMonth),
      this.sumPages(tid),

      this.kioskRepo
        .createQueryBuilder('k')
        .select('k.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('k.tenantId = :tid', { tid })
        .groupBy('k.status')
        .getRawMany(),

      this.sessionRepo.count({ where: { tenantId: tid, status: GroupSessionStatus.OPEN } }),
      this.sessionRepo.count({ where: { tenantId: tid, status: GroupSessionStatus.CLOSED } }),
      this.sessionRepo
        .createQueryBuilder('s')
        .where('s.tenantId = :tid', { tid })
        .andWhere('s.createdAt >= :d', { d: startOfMonth })
        .getCount(),
    ]);

    const kioskByStatus: Record<string, number> = {};
    for (const row of kioskCounts) kioskByStatus[row.status] = parseInt(row.count);

    return {
      users: {
        total: userTotal,
        activeToday: userActiveToday,
        activeThisWeek: userActiveWeek,
        blocked: userBlocked,
      },
      jobs: {
        total: jobTotal,
        completedToday: jobCompletedToday,
        pendingNow: jobPending,
        failedToday: jobFailedToday,
        byStatus: jobByStatus.map((r) => ({ status: r.status, count: parseInt(r.count) })),
      },
      revenue: {
        today: revenueToday,
        thisWeek: revenueWeek,
        thisMonth: revenueMonth,
        allTime: revenueAllTime,
        byDay: revenueByDay,
      },
      pages: {
        today: pagesToday,
        thisWeek: pagesWeek,
        thisMonth: pagesMonth,
        allTime: pagesAllTime,
      },
      kiosks: {
        total: Object.values(kioskByStatus).reduce((a, b) => a + b, 0),
        online: kioskByStatus[KioskStatus.ACTIVE] || 0,
        offline: kioskByStatus[KioskStatus.OFFLINE] || 0,
        maintenance: kioskByStatus[KioskStatus.MAINTENANCE] || 0,
        disabled: kioskByStatus[KioskStatus.DISABLED] || 0,
      },
      groupSessions: {
        open: groupSessionsOpen,
        closed: groupSessionsClosed,
        totalThisMonth: groupSessionsMonth,
      },
    };
  }

  private async sumRevenue(tenantId: string, since?: Date): Promise<number> {
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.tenantId = :tid', { tid: tenantId })
      .andWhere('p.status = :s', { s: 'SUCCESS' });
    if (since) qb.andWhere('p.createdAt >= :d', { d: since });
    const result = await qb.getRawOne();
    return parseFloat(result?.total || '0');
  }

  private async sumPages(tenantId: string, since?: Date): Promise<number> {
    const qb = this.jobRepo
      .createQueryBuilder('j')
      .select('COALESCE(SUM(j.totalPages), 0)', 'total')
      .where('j.tenantId = :tid', { tid: tenantId })
      .andWhere('j.status = :s', { s: PrintJobStatus.DONE });
    if (since) qb.andWhere('j.completedAt >= :d', { d: since });
    const result = await qb.getRawOne();
    return parseInt(result?.total || '0');
  }

  private async revenueByDay(
    tenantId: string,
    since: Date,
  ): Promise<Array<{ date: string; revenue: number; jobCount: number }>> {
    const result = await this.paymentRepo
      .createQueryBuilder('p')
      .select('DATE(p.createdAt)', 'date')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'revenue')
      .addSelect('COUNT(*)', 'jobCount')
      .where('p.tenantId = :tid', { tid: tenantId })
      .andWhere('p.status = :s', { s: 'SUCCESS' })
      .andWhere('p.createdAt >= :d', { d: since })
      .groupBy('DATE(p.createdAt)')
      .orderBy('DATE(p.createdAt)', 'ASC')
      .getRawMany();

    return result.map((r) => ({
      date: r.date,
      revenue: parseFloat(r.revenue),
      jobCount: parseInt(r.jobCount),
    }));
  }
}
