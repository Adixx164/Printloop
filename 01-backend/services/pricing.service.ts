import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { redisClient } from '../config/redis';

const CACHE_TTL_SECONDS = 3600; // 1 hour
const CACHE_KEY_PREFIX = 'pricing:';

export interface PriceCalculationInput {
  pageCount: number;
  paperSize: PaperSize;
  colorType: ColorType;
  isDuplex: boolean;
  isHighResolution?: boolean;
  copies?: number;
}

export interface PriceCalculationResult {
  pricePerPage: number;
  basePrice: number;
  duplexMultiplier: number;
  highResolutionMultiplier: number;
  copies: number;
  totalPrice: number;
  currency: string;
  breakdown: {
    pageCount: number;
    pricePerPage: number;
    subtotal: number;
    duplexAdjustment: number;
    resolutionAdjustment: number;
    copiesMultiplier: number;
  };
}

export class PricingService {
  private repo: Repository<PricingConfig>;

  constructor() {
    this.repo = AppDataSource.getRepository(PricingConfig);
  }

  /**
   * Get pricing config from cache or DB
   */
  async getConfig(
    paperSize: PaperSize,
    colorType: ColorType
  ): Promise<PricingConfig | null> {
    const cacheKey = `${CACHE_KEY_PREFIX}${paperSize}:${colorType}`;

    // Try cache first
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.warn('Redis cache miss for pricing:', err);
    }

    // Fetch from DB
    const config = await this.repo.findOne({
      where: { paperSize, colorType, isActive: true },
    });

    if (config) {
      try {
        await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(config));
      } catch (err) {
        console.warn('Could not cache pricing:', err);
      }
    }

    return config;
  }

  /**
   * Calculate price for a print job
   */
  async calculatePrice(input: PriceCalculationInput): Promise<PriceCalculationResult> {
    const config = await this.getConfig(input.paperSize, input.colorType);

    if (!config) {
      throw new Error(
        `No pricing config found for ${input.paperSize} ${input.colorType}`
      );
    }

    const copies = input.copies || 1;
    const pricePerPage = Number(config.pricePerPage);
    const subtotal = pricePerPage * input.pageCount;
    const duplexMultiplier = input.isDuplex ? Number(config.duplexMultiplier) : 1.0;
    const resolutionMultiplier = input.isHighResolution
      ? Number(config.highResolutionMultiplier)
      : 1.0;

    const totalPrice = Math.ceil(
      subtotal * duplexMultiplier * resolutionMultiplier * copies
    );

    return {
      pricePerPage,
      basePrice: subtotal,
      duplexMultiplier,
      highResolutionMultiplier: resolutionMultiplier,
      copies,
      totalPrice,
      currency: config.currency,
      breakdown: {
        pageCount: input.pageCount,
        pricePerPage,
        subtotal,
        duplexAdjustment: subtotal * duplexMultiplier - subtotal,
        resolutionAdjustment: subtotal * resolutionMultiplier - subtotal,
        copiesMultiplier: copies,
      },
    };
  }

  /**
   * List all pricing configs
   */
  async listConfigs(): Promise<PricingConfig[]> {
    return this.repo.find({ order: { paperSize: 'ASC', colorType: 'ASC' } });
  }

  /**
   * Update pricing config (admin only)
   */
  async updateConfig(
    id: string,
    updates: Partial<PricingConfig>
  ): Promise<PricingConfig | null> {
    const config = await this.repo.findOne({ where: { id } });
    if (!config) return null;

    Object.assign(config, updates);
    const saved = await this.repo.save(config);

    // Invalidate cache
    const cacheKey = `${CACHE_KEY_PREFIX}${saved.paperSize}:${saved.colorType}`;
    try {
      await redisClient.del(cacheKey);
    } catch (err) {
      console.warn('Could not invalidate cache:', err);
    }

    return saved;
  }

  /**
   * Create new pricing config
   */
  async createConfig(data: Partial<PricingConfig>): Promise<PricingConfig> {
    const config = this.repo.create(data);
    return this.repo.save(config);
  }

  /**
   * Invalidate all pricing cache
   */
  async invalidateCache(): Promise<void> {
    const keys = await redisClient.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}
