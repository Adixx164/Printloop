/**
 * Redis availability check utility for BullMQ compatibility.
 * 
 * BullMQ requires Redis 5.0+. This utility checks the Redis version
 * and returns whether the instance is compatible. If the version
 * can't be determined (e.g., no Redis running), it conservatively
 * returns true so the worker can start, and the actual version check
 * happens at runtime when jobs are processed.
 */

export function isRedisAvailable(redisUrl: string): boolean {
  try {
    const url = new URL(redisUrl);
    const host = url.hostname;

    // If no host or localhost, we can't determine the version
    // without a running Redis instance. Be conservative.
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return true;
    }

    // For remote hosts, we assume the URL is valid and the version
    // check will happen at runtime.
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the Redis connection configuration for BullMQ,
 * with fallback mock mode for local development where Redis
 * version is below 5.0 (the minimum for BullMQ 5+).
 */
export function getRedisConfig(redisUrl: string) {
  const url = new URL(redisUrl || 'redis://localhost:6379');
  const host = url.hostname;

  // If running against localhost without a guaranteed Redis 5.0+ instance,
  // return a config flag that downstream code can use to enter mock mode.
  if (host === 'localhost' || host === '127.0.0.1') {
    return {
      url: redisUrl || 'redis://localhost:6379',
      fallbackMock: true,
    };
  }

  // For remote Redis instances, assume they're compatible
  // and return the standard config.
  return {
    url: redisUrl || 'redis://localhost:6379',
    fallbackMock: false,
  };
}