export type DeckSlide = {
  type: 'intro-title';
  title: string;
};

export type Deck = {
  slides: DeckSlide[];
};

export function buildOnboardingDeck(): Deck {
  return {
    slides: [
      {
        type: 'intro-title',
        title: 'Get your shop live in 5 minutes',
      },
    ],
  };
}
