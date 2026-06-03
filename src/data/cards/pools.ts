// Card Pool Definitions

import { CardPool, CardDefinition } from '@/types/Card';
import { validateCards } from '@/utils/effectCatalog';
import { BASIC_POOL_CARDS } from './basic-pool';
import { HIGHTECH_CITY_CARDS } from './hightech-city';
import { SWORD_SHIELD_POOL_CARDS } from './sword-shield-pool';
import { WORM_NIGHTMARE_CARDS } from './worm-nightmare-pool';

// All card definitions combined
export const ALL_CARDS: CardDefinition[] = [
  ...BASIC_POOL_CARDS,
  ...HIGHTECH_CITY_CARDS,
  ...SWORD_SHIELD_POOL_CARDS,
  ...WORM_NIGHTMARE_CARDS,
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
    common: 0.62,
    rare: 0.25,
    epic: 0.12,
    legendary: 0.01,
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
    common: 0.58,
    rare: 0.28,
    epic: 0.13,
    legendary: 0.01,
  },
  singleDrawCost: 5,
  multiDrawCost: 45,
  multiDrawCount: 10,
  guaranteedRare: true,
};

export const SWORD_SHIELD_POOL: CardPool = {
  id: 'sword-shield',
  name: '刀盾柴之團',
  description: '圓滾滾的橘粉柴犬戰士舉起刀與盾出征，歡樂又熱血的冒險集結！',
  tagline: '柴犬勇者・刀盾集結',
  lore: '傳說森林深處的柴犬村,有一位天生圓滾滾的橘粉小柴犬,從小就夢想成為最強刀盾戰士。他揮舞著過大的劍與盾,帶著整個柴之團踏上冒險 —— 用可愛與勇氣守護夥伴！',
  theme: {
    gradientFrom: '#c2410c',
    gradientTo: '#fb923c',
    accent: '#fde68a',
  },
  type: 'event',
  isActive: true,
  startDate: '2026-04-01',
  endDate: '2026-06-30',
  cardIds: SWORD_SHIELD_POOL_CARDS.map((c) => c.id),
  // 盾牌柴犬勇者 為主打招牌
  featuredCardIds: [
    'ss_19', // 盾牌柴犬勇者 (主打)
    'ss_20', // 刀盾雙絕・柴之極
    'ss_15', // 黃金盾騎士犬
    'ss_16', // 烈焰劍聖柴
    'ss_17', // 盾擊突擊犬
  ],
  rates: {
    common: 0.60,
    rare: 0.27,
    epic: 0.12,
    legendary: 0.01,
  },
  singleDrawCost: 5,
  multiDrawCost: 45,
  multiDrawCount: 10,
  guaranteedRare: true,
};

export const WORM_NIGHTMARE_POOL: CardPool = {
  id: 'worm-nightmare',
  name: '蠕蟲噩夢',
  description: '獻祭你的手牌，喚醒沉睡於深淵的帝王。四張卡構成的終極連鎖！',
  tagline: '深淵連鎖・帝王降臨',
  lore: '從不起眼的蠕蟲一號開始，每一次「死亡」都是下一個恐怖的召喚。當三位蠕蟲將手牌全部獻祭給古老的契約之時，蠕蟲帝王・沃蘭極便會從深淵爬出，吞噬對手的所有希望。',
  theme: {
    gradientFrom: '#3f0d2e',
    gradientTo: '#1a1a2e',
    accent: '#a855f7',
  },
  type: 'event',
  isActive: true,
  cardIds: WORM_NIGHTMARE_CARDS.filter((c) => !c.isForbidden).map((c) => c.id),
  featuredCardIds: [
    'mainframe_worm',   // 主機蠕蟲・噩夢連鎖 (終極主打)
    'worm_emperor',     // 蠕蟲帝王・沃蘭極
    'abyss_tentacle',   // 深淵主宰・觸手
    'void_beast',       // 虛空巨獸
    'worm_1',           // 連鎖起點
  ],
  rates: {
    common: 0.25,   // 蠕蟲卵
    rare: 0.39,     // 蠕蟲一號、繁殖巢、獵手
    epic: 0.35,     // 蠕蟲二號、三號、深淵觸手、虛空巨獸
    legendary: 0.01, // 蠕蟲帝王、主機蠕蟲
  },
  singleDrawCost: 300,
  multiDrawCost: 2700,
  multiDrawCount: 10,
  guaranteedRare: true,
};

// All available pools
export const ALL_POOLS: CardPool[] = [
  BASIC_POOL,
  HIGHTECH_CITY_POOL,
  SWORD_SHIELD_POOL,
  WORM_NIGHTMARE_POOL,
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
