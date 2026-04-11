// Card Pool Definitions

import { CardPool, CardDefinition } from '@/types/Card';
import { validateCards } from '@/utils/effectCatalog';
import { BASIC_POOL_CARDS } from './basic-pool';
import { HIGHTECH_CITY_CARDS } from './hightech-city';

// All card definitions combined
export const ALL_CARDS: CardDefinition[] = [
  ...BASIC_POOL_CARDS,
  ...HIGHTECH_CITY_CARDS,
];

// Module-load validation: any card whose effects are not in the catalog
// (unknown trigger/action/target/out-of-range value) throws here so the app
// refuses to boot rather than silently shipping dead card effects.
validateCards(ALL_CARDS);

// Card lookup map
export const CARD_MAP = new Map<string, CardDefinition>(
  ALL_CARDS.map((c) => [c.id, c])
);

// Get a card definition by ID
export function getCardDef(cardId: string): CardDefinition | undefined {
  return CARD_MAP.get(cardId);
}

// === Pool Definitions ===

export const BASIC_POOL: CardPool = {
  id: 'basic',
  name: '基礎卡池',
  description: '包含各屬性基礎卡牌，適合新手抽取！',
  type: 'basic',
  isActive: true,
  cardIds: BASIC_POOL_CARDS.map((c) => c.id),
  rates: {
    common: 0.60,
    rare: 0.25,
    epic: 0.12,
    legendary: 0.03,
  },
  singleDrawCost: 5,
  multiDrawCost: 45,
  multiDrawCount: 10,
  guaranteedRare: true,
};

export const HIGHTECH_CITY_POOL: CardPool = {
  id: 'hightech-city',
  name: '高科技都市',
  description: '賽博龐克風格的限定卡池！收集套裝獲得額外加成！',
  type: 'event',
  isActive: true,
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  cardIds: HIGHTECH_CITY_CARDS.map((c) => c.id),
  rates: {
    common: 0.55,
    rare: 0.28,
    epic: 0.13,
    legendary: 0.04,
  },
  singleDrawCost: 5,
  multiDrawCost: 45,
  multiDrawCount: 10,
  guaranteedRare: true,
};

// All available pools
export const ALL_POOLS: CardPool[] = [
  BASIC_POOL,
  HIGHTECH_CITY_POOL,
];

// Get active pools
export function getActivePools(): CardPool[] {
  const now = new Date().toISOString();
  return ALL_POOLS.filter((p) => {
    if (!p.isActive) return false;
    if (p.startDate && now < p.startDate) return false;
    if (p.endDate && now > p.endDate) return false;
    return true;
  });
}
