import { describe, it, expect } from 'vitest';
import { buildOnboardingDeck } from '../helpers/deck.builder';

describe('deck.builder', () => {
  it('returns a deck whose first slide is an intro title slide', () => {
    const deck = buildOnboardingDeck();

    expect(deck.slides.length).toBeGreaterThanOrEqual(1);

    const first = deck.slides[0];
    expect(first.type).toBe('intro-title');
    expect(first.title.trim().length).toBeGreaterThan(0);
  });
});
