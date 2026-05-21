import { Repository } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { Kiosk, KioskStatus } from '../../database/entities/kiosk.entity';
import crypto from 'crypto';

export class KioskService {
  private kioskRepository: Repository<Kiosk>;

  constructor() {
    this.kioskRepository = AppDataSource.getRepository(Kiosk);
  }

  /**
   * Generate a secure API key for a kiosk
   * Format: KSK_<random_32_chars>
   */
  private generateApiKey(): string {
    const randomBytes = crypto.randomBytes(24).toString('base64url');
    return `KSK_${randomBytes}`;
  }

  /**
   * Create a new kiosk with auto-generated API key
   */
  async createKiosk(data: {
    name: string;
    location?: string;
    campus?: string;
    shopId?: string;
    printerName?: string;
    printerModel?: string;
    ipAddress?: string;
    notes?: string;
  }): Promise<Kiosk> {
    const apiKey = this.generateApiKey();

    const kiosk = this.kioskRepository.create({
      ...data,
      apiKey,
      status: KioskStatus.ACTIVE,
      totalJobsPrinted: 0,
      totalPagesPrinted: 0,
    });

    return await this.kioskRepository.save(kiosk);
  }

  /**
   * Get kiosk by ID
   */
  async getKioskById(id: string): Promise<Kiosk | null> {
    return await this.kioskRepository.findOne({ where: { id } });
  }

  /**
   * Get kiosk by API key
   */
  async getKioskByApiKey(apiKey: string): Promise<Kiosk | null> {
    return await this.kioskRepository.findOne({ where: { apiKey } });
  }

  /**
   * List all kiosks with optional filters
   */
  async listKiosks(filters?: {
    status?: KioskStatus;
    campus?: string;
    location?: string;
  }): Promise<Kiosk[]> {
    const query = this.kioskRepository.createQueryBuilder('kiosk');

    if (filters?.status) {
      query.andWhere('kiosk.status = :status', { status: filters.status });
    }

    if (filters?.campus) {
      query.andWhere('kiosk.campus = :campus', { campus: filters.campus });
    }

    if (filters?.location) {
      query.andWhere('kiosk.location LIKE :location', {
        location: `%${filters.location}%`,
      });
    }

    query.orderBy('kiosk.createdAt', 'DESC');

    return await query.getMany();
  }

  /**
   * Update kiosk status
   */
  async updateKioskStatus(
    id: string,
    status: KioskStatus
  ): Promise<Kiosk | null> {
    const kiosk = await this.getKioskById(id);
    if (!kiosk) return null;

    kiosk.status = status;
    return await this.kioskRepository.save(kiosk);
  }

  /**
   * Update kiosk details
   */
  async updateKiosk(
    id: string,
    updates: Partial<Omit<Kiosk, 'id' | 'apiKey' | 'createdAt' | 'updatedAt'>>
  ): Promise<Kiosk | null> {
    const kiosk = await this.getKioskById(id);
    if (!kiosk) return null;

    Object.assign(kiosk, updates);
    return await this.kioskRepository.save(kiosk);
  }

  /**
   * Regenerate API key for a kiosk (useful if key is compromised)
   */
  async regenerateApiKey(id: string): Promise<Kiosk | null> {
    const kiosk = await this.getKioskById(id);
    if (!kiosk) return null;

    kiosk.apiKey = this.generateApiKey();
    return await this.kioskRepository.save(kiosk);
  }

  /**
   * Update last printed timestamp and increment counters
   */
  async recordPrintJob(
    kioskId: string,
    pageCount: number
  ): Promise<void> {
    await this.kioskRepository.increment(
      { id: kioskId },
      'totalJobsPrinted',
      1
    );
    await this.kioskRepository.increment(
      { id: kioskId },
      'totalPagesPrinted',
      pageCount
    );
    await this.kioskRepository.update(
      { id: kioskId },
      { lastPrintedAt: new Date() }
    );
  }

  /**
   * Get kiosks that haven't been seen in X minutes (for monitoring)
   */
  async getOfflineKiosks(minutesOffline: number = 15): Promise<Kiosk[]> {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutesOffline);

    return await this.kioskRepository
      .createQueryBuilder('kiosk')
      .where('kiosk.status != :disabled', { disabled: KioskStatus.DISABLED })
      .andWhere(
        '(kiosk.lastSeenAt IS NULL OR kiosk.lastSeenAt < :cutoffTime)',
        { cutoffTime }
      )
      .getMany();
  }

  /**
   * Delete kiosk (soft delete by setting status to DISABLED)
   */
  async deleteKiosk(id: string): Promise<boolean> {
    const result = await this.kioskRepository.update(
      { id },
      { status: KioskStatus.DISABLED }
    );
    return result.affected ? result.affected > 0 : false;
  }
}
