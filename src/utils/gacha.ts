// Gacha / Draw System

import { CardDefinition, CardPool, CardRarity, PlayerCard } from '@/types/Card';

// Roll a rarity based on pool rates, with pity system
export function rollRarity(
  pool: CardPool,
  pityCounter: number
): CardRarity {
  // Pity: guaranteed epic+ every 50 draws
  if (pityCounter >= 49) {
    return Math.random() < 0.3 ? 'legendary' : 'epic';
  }

  // Pity: guaranteed rare+ every 10 draws
  if (pityCounter >= 9 && pityCounter % 10 === 9) {
    const roll = Math.random();
    if (roll < pool.rates.legendary) return 'legendary';
    if (roll < pool.rates.legendary + pool.rates.epic) return 'epic';
    return 'rare';
  }

  // Normal roll
  const roll = Math.random();
  const { common, rare, epic } = pool.rates;

  if (roll < pool.rates.legendary) return 'legendary';
  if (roll < pool.rates.legendary + epic) return 'epic';
  if (roll < pool.rates.legendary + epic + rare) return 'rare';
  return 'common';
}

// Pick a random card of a given rarity from the pool
export function pickCard(
  rarity: CardRarity,
  pool: CardPool,
  allCards: CardDefinition[]
): CardDefinition | null {
  const poolCards = allCards.filter(
    (c) => pool.cardIds.includes(c.id) && c.rarity === rarity
  );

  if (poolCards.length === 0) {
    // Fallback: pick any card from pool
    const fallback = allCards.filter((c) => pool.cardIds.includes(c.id));
    if (fallback.length === 0) return null;
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  return poolCards[Math.floor(Math.random() * poolCards.length)];
}

// Perform a single draw
export function singleDraw(
  pool: CardPool,
  allCards: CardDefinition[],
  pityCounter: number
): { card: CardDefinition | null; newPityCounter: number } {
  const rarity = rollRarity(pool, pityCounter);
  const card = pickCard(rarity, pool, allCards);

  // Reset pity on epic+ pull
  const newPity = (rarity === 'epic' || rarity === 'legendary') ? 0 : pityCounter + 1;

  return { card, newPityCounter: newPity };
}

// Perform a multi-draw (guaranteed at least one rare+)
export function multiDraw(
  pool: CardPool,
  allCards: CardDefinition[],
  pityCounter: number,
  count: number = 10
): { cards: CardDefinition[]; newPityCounter: number } {
  const cards: CardDefinition[] = [];
  let currentPity = pityCounter;
  let hasRareOrAbove = false;

  for (let i = 0; i < count; i++) {
    const { card, newPityCounter } = singleDraw(pool, allCards, currentPity);
    if (card) {
      cards.push(card);
      if (card.rarity !== 'common') hasRareOrAbove = true;
    }
    currentPity = newPityCounter;
  }

  // Guarantee: replace last common with a rare if none drawn
  if (pool.guaranteedRare && !hasRareOrAbove && cards.length > 0) {
    const rareCard = pickCard('rare', pool, allCards);
    if (rareCard) {
      const lastCommonIdx = cards.findLastIndex((c) => c.rarity === 'common');
      if (lastCommonIdx >= 0) {
        cards[lastCommonIdx] = rareCard;
      }
    }
  }

  return { cards, newPityCounter: currentPity };
}

// Generate starter deck: random 20 cards from basic pool
export function generateStarterDeck(
  allBasicCards: CardDefinition[]
): PlayerCard[] {
  const shuffled = [...allBasicCards].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 20);

  return selected.map((card) => ({
    cardId: card.id,
    level: 1,
    xp: 0,
    duplicateCount: 0,
    obtainedAt: new Date().toISOString(),
    isInDeck: true,
  }));
}

// Add a drawn card to collection (handles duplicates)
export function addCardToCollection(
  existingCards: PlayerCard[],
  newCardId: string
): PlayerCard[] {
  const existing = existingCards.find((c) => c.cardId === newCardId);

  if (existing) {
    // Duplicate: add XP
    return existingCards.map((c) =>
      c.cardId === newCardId
        ? { ...c, duplicateCount: c.duplicateCount + 1, xp: c.xp + 100 }
        : c
    );
  }

  // New card
  return [
    ...existingCards,
    {
      cardId: newCardId,
      level: 1,
      xp: 0,
      duplicateCount: 0,
      obtainedAt: new Date().toISOString(),
      isInDeck: false,
    },
  ];
}
