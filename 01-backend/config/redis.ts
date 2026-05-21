/**
 * Redis is optional. When REDIS_URL (or REDIS_HOST) is configured we use a
 * real client; otherwise we fall back to a no-op stub so caching/queue code
 * runs cleanly in local dev without a Redis server.
 */
import { createClient, type RedisClientType } from 'redis';

export const REDIS_ENABLED = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

interface MinimalRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setEx(key: string, ttl: number, value: string): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  connect?(): Promise<unknown>;
  on?(event: string, cb: (...args: any[]) => void): unknown;
}

function createStub(): MinimalRedis {
  return {
    async get() {
      return null;
    },
    async set() {
      return null;
    },
    async setEx() {
      return null;
    },
    async del() {
      return null;
    },
    async keys() {
      return [];
    },
    async ttl() {
      return -2;
    },
    async incr() {
      return 1;
    },
    async expire() {
      return true;
    },
    async connect() {
      return null;
    },
    on() {
      return this;
    },
  };
}

export const redisClient: MinimalRedis = REDIS_ENABLED
  ? (createClient({
      url:
        process.env.REDIS_URL ||
        `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
      password: process.env.REDIS_PASSWORD,
    }) as unknown as MinimalRedis)
  : createStub();

if (REDIS_ENABLED) {
  redisClient.on?.('error', (err: unknown) =>
    console.error('Redis error:', err instanceof Error ? err.message : err)
  );
  redisClient.on?.('ready', () => console.log('Redis: ready'));
  redisClient.connect?.().catch((err: unknown) =>
    console.error('Redis connect failed:', err instanceof Error ? err.message : err)
  );
}
