/**
 * Redis is optional. When REDIS_URL (or REDIS_HOST) is configured we use a
 * real client; otherwise we fall back to a no-op stub so caching/queue code
 * runs cleanly in local dev without a Redis server.
 */
import { createClient, type RedisClientType } from 'redis';

export const REDIS_ENABLED = process.env.DISABLE_REDIS !== '1' && Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

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
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key: string) {
      const item = store.get(key);
      if (!item) return null;
      if (Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }
      return item.value;
    },
    async set(key: string, value: string) {
      store.set(key, { value, expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 });
      return 'OK';
    },
    async setEx(key: string, ttl: number, value: string) {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
      return 'OK';
    },
    async del(key: string | string[]) {
      if (Array.isArray(key)) {
        for (const k of key) store.delete(k);
      } else {
        store.delete(key);
      }
      return 1;
    },
    async keys(pattern: string) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const results: string[] = [];
      const now = Date.now();
      for (const [key, item] of store.entries()) {
        if (now > item.expiresAt) {
          store.delete(key);
          continue;
        }
        if (regex.test(key)) results.push(key);
      }
      return results;
    },
    async ttl(key: string) {
      const item = store.get(key);
      if (!item) return -2;
      const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000);
      if (remaining <= 0) {
        store.delete(key);
        return -2;
      }
      return remaining;
    },
    async incr(key: string) {
      const item = store.get(key);
      let val = 0;
      let expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
      if (item && Date.now() <= item.expiresAt) {
        val = Number(item.value) || 0;
        expiresAt = item.expiresAt;
      }
      val += 1;
      store.set(key, { value: String(val), expiresAt });
      return val;
    },
    async expire(key: string, seconds: number) {
      const item = store.get(key);
      if (!item) return false;
      item.expiresAt = Date.now() + seconds * 1000;
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
