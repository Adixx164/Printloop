import { describe, it, expect } from 'vitest';

describe('frontend harness smoke test', () => {
  it('runs in jsdom', () => {
    expect(typeof window).toBe('object');
  });
});
