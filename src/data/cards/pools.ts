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
  description: '五元素神獸降臨，每一次抽卡都是與傳說的相遇。',
  tagline: '五元素神獸・初始傳說',
  lore: '遠古五族的化身齊聚於此 —— 太陽神鳥、深淵海龍王、古代樹靈王、天神鳳凰、超電磁龍。每一張傳說卡都記錄著一段文明的起源。',
  theme: {
    gradientFrom: '#7c2d12',
    gradientTo: '#1e3a8a',
    accent: '#fbbf24',
  },
  type: 'basic',
  isActive: true,
  cardIds: BASIC_POOL_CARDS.map((c) => c.id),
  // 太陽神鳥 為主打，其餘四大神獸為輔
  featuredCardIds: [
    'basic_fire_08',     // 太陽神鳥 (主打)
    'basic_water_08',    // 深淵海龍王
    'basic_earth_08',    // 古代樹靈王
    'basic_wind_08',     // 天神鳳凰
    'basic_electric_08', // 超電磁龍
  ],
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
  description: '霓虹閃爍的未來都市，收集套裝觸發賽博協同！',
  tagline: '賽博都市・限定抽取',
  lore: '2089 年，都市核心 AI 覺醒。機械戰士、黑客、納米戰場守護者在霓虹下交戰 —— 只有收集完整套裝，才能駕馭終極戰爭機器。',
  theme: {
    gradientFrom: '#4c1d95',
    gradientTo: '#0891b2',
    accent: '#22d3ee',
  },
  type: 'event',
  isActive: true,
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  cardIds: HIGHTECH_CITY_CARDS.map((c) => c.id),
  // 終極戰爭機器 為主打，都市核心 AI 為副主打
  featuredCardIds: [
    'htc_20', // 終極戰爭機器 (主打)
    'htc_19', // 都市核心 AI
    'htc_18',
    'htc_17',
    'htc_16',
  ],
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
