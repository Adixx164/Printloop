import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  validateDeployEnv,
  assertDeployConfig,
  DEV_JWT_SECRET,
} from '../config/validateEnv';

function clearRelevantEnv() {
  vi.stubEnv('NODE_ENV', 'production');
  for (const k of [
    'DATABASE_URL',
    'REDIS_URL',
    'RENDER_CALLBACK_SECRET',
    'PAYSTACK_SECRET_KEY',
    'PRINTLOOP_APEX_DOMAINS',
    'JWT_SECRET',
    'SEED_DEMO',
    'DISABLE_RATE_LIMIT',
  ]) {
    vi.stubEnv(k, '');
  }
}

function setAllValid() {
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@host/db');
  vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  vi.stubEnv('RENDER_CALLBACK_SECRET', 'render-secret');
  vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_xyz');
  vi.stubEnv('PRINTLOOP_APEX_DOMAINS', 'printloop.app');
  vi.stubEnv('JWT_SECRET', 'a-production-grade-secret-long-enough-256');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateDeployEnv', () => {
  it('is a no-op outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(validateDeployEnv()).toEqual([]);
  });

  it('lists every missing required var in production', () => {
    clearRelevantEnv();
    const issues = validateDeployEnv();
    const keys = issues.map((i) => i.key);
    for (const k of [
      'DATABASE_URL',
      'REDIS_URL',
      'RENDER_CALLBACK_SECRET',
      'PAYSTACK_SECRET_KEY',
      'PRINTLOOP_APEX_DOMAINS',
      'JWT_SECRET',
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('rejects the dev JWT fallback in production', () => {
    clearRelevantEnv();
    setAllValid();
    vi.stubEnv('JWT_SECRET', DEV_JWT_SECRET);
    const issues = validateDeployEnv();
    expect(issues.find((i) => i.key === 'JWT_SECRET')?.detail).toMatch(/dev fallback/);
  });

  it('rejects SEED_DEMO=1 (demo accounts) in production', () => {
    clearRelevantEnv();
    setAllValid();
    vi.stubEnv('SEED_DEMO', '1');
    const issues = validateDeployEnv();
    expect(issues.find((i) => i.key === 'SEED_DEMO')).toBeTruthy();
  });

  it('rejects DISABLE_RATE_LIMIT=1 in production', () => {
    clearRelevantEnv();
    setAllValid();
    vi.stubEnv('DISABLE_RATE_LIMIT', '1');
    const issues = validateDeployEnv();
    expect(issues.find((i) => i.key === 'DISABLE_RATE_LIMIT')).toBeTruthy();
  });

  it('passes clean when every required var is set', () => {
    clearRelevantEnv();
    setAllValid();
    expect(validateDeployEnv()).toEqual([]);
  });

  it('assertDeployConfig throws once listing all issues', () => {
    clearRelevantEnv();
    const t = () => assertDeployConfig();
    expect(t).toThrow(/refusing to boot/);
    expect(t).toThrow(/DATABASE_URL/);
  });
});