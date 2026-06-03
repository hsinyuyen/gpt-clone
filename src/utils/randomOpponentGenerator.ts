// Generates a PveOpponent on-the-fly from a quick-match room. Used so the
// "12 fake online players" lobby can spawn a real AI when clicked, without
// us having to hand-author 12 separate decks.
import { CardDefinition, PveOpponent } from '@/types/Card';
import { ALL_CARDS } from '@/data/cards/pools';
import { QuickRoom } from '@/data/cards/quick-rooms';

// Seedable PRNG so the same (room, seed) pair always produces the same deck —
// useful for debugging, but we usually pass a fresh seed each click.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REWARD_BY_DIFFICULTY: Record<QuickRoom['difficulty'], { coins: number; xp: number }> = {
  easy: { coins: 6, xp: 12 },
  medium: { coins: 12, xp: 22 },
  hard: { coins: 20, xp: 35 },
};

// Cards we never want the AI to draw / attempt to play.
function isPlayable(c: CardDefinition): boolean {
  if (c.isForbidden) return false;
  if (c.cardCategory !== 'monster') return false; // duel only supports monsters today
  if (c.cannotNormalSummon) return false;          // these need a chain to enter
  if (c.requiredTributeCardIds && c.requiredTributeCardIds.length > 0) return false;
  return true;
}

// Difficulty config: how many cards of each tier should appear in the deck.
// Tier breakdown (Yu-Gi-Oh tribute rules):
//   - low (lv 1-4):    no tribute needed
//   - mid (lv 5-6):    1 tribute needed
//   - high (lv 7-10):  2 tributes needed
// Guaranteeing at least N mid/high cards per deck means the AI WILL show
// tribute summons in actual play (not just in theory).
const DIFFICULTY_DECK: Record<QuickRoom['difficulty'], { low: number; mid: number; high: number }> = {
  easy:   { low: 6, mid: 3, high: 1 },   // mostly basic + a couple of tribute summons
  medium: { low: 4, mid: 4, high: 2 },   // balanced
  hard:   { low: 3, mid: 4, high: 3 },   // heavy hitters
};

const shuffleSeeded = <T,>(arr: T[], rng: () => number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Split playable pool into tiers, with a 70/30 themed/off-theme bias inside each.
function buildTieredPool(
  room: QuickRoom,
  rng: () => number
): { low: CardDefinition[]; mid: CardDefinition[]; high: CardDefinition[] } {
  const playable = ALL_CARDS.filter(isPlayable);

  const tier = (c: CardDefinition): 'low' | 'mid' | 'high' => {
    const lvl = c.level || 1;
    if (lvl <= 4) return 'low';
    if (lvl <= 6) return 'mid';
    return 'high';
  };

  // Theme weight: prefer themed cards, mix in off-theme for variety
  const weight = (c: CardDefinition): number => {
    if (room.theme === 'mixed') return 1;
    return c.element === room.theme ? 7 : 3;
  };

  const sample = (cards: CardDefinition[]): CardDefinition[] => {
    // Weighted shuffle: replicate cards by weight then dedupe via Set
    const expanded: CardDefinition[] = [];
    for (const c of cards) {
      const w = weight(c);
      for (let i = 0; i < w; i++) expanded.push(c);
    }
    const shuffled = shuffleSeeded(expanded, rng);
    const seen = new Set<string>();
    const out: CardDefinition[] = [];
    for (const c of shuffled) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  };

  return {
    low: sample(playable.filter((c) => tier(c) === 'low')),
    mid: sample(playable.filter((c) => tier(c) === 'mid')),
    high: sample(playable.filter((c) => tier(c) === 'high')),
  };
}

// Generate the AI's "team" with GUARANTEED counts of each tribute tier so
// the AI actually performs tribute summons during play.
export function generateOpponentFromRoom(room: QuickRoom, seed?: number): PveOpponent {
  const actualSeed = seed ?? (Date.now() & 0x7fffffff);
  const rng = mulberry32(actualSeed);

  const tiered = buildTieredPool(room, rng);
  const counts = DIFFICULTY_DECK[room.difficulty];

  const teamCardIds: string[] = [];
  const teamLevels: number[] = [];
  const used = new Set<string>();

  const takeFrom = (pool: CardDefinition[], n: number, levelRoll: () => number) => {
    let taken = 0;
    for (const c of pool) {
      if (taken >= n) break;
      if (used.has(c.id)) continue;
      used.add(c.id);
      teamCardIds.push(c.id);
      teamLevels.push(levelRoll());
      taken++;
    }
    // If we couldn't find enough unique, top up with repeats
    while (taken < n && pool.length > 0) {
      const pick = pool[Math.floor(rng() * pool.length)];
      teamCardIds.push(pick.id);
      teamLevels.push(levelRoll());
      taken++;
    }
  };

  // Per-difficulty player-card-level (XP scaling) — easy AIs use low-level cards
  const lvlEasy   = () => 1 + Math.floor(rng() * 2); // 1-2
  const lvlMedium = () => 2 + Math.floor(rng() * 2); // 2-3
  const lvlHard   = () => 3 + Math.floor(rng() * 3); // 3-5
  const levelRoll =
    room.difficulty === 'easy' ? lvlEasy :
    room.difficulty === 'medium' ? lvlMedium : lvlHard;

  // Order tier insertion: high first → important cards always make it in,
  // then mid, then low. Their order doesn't matter because initPveDuel shuffles.
  takeFrom(tiered.high, counts.high, levelRoll);
  takeFrom(tiered.mid,  counts.mid,  levelRoll);
  takeFrom(tiered.low,  counts.low,  levelRoll);

  const reward = REWARD_BY_DIFFICULTY[room.difficulty];

  return {
    id: `quickroom_${room.id}_${actualSeed}`,
    name: room.name,
    description: '線上玩家對戰',
    difficulty: room.difficulty,
    teamCardIds,
    teamLevels,
    rewardCoins: reward.coins,
    rewardXp: reward.xp,
    emoji: '👤',
    aiStrategy: 'standard',
  };
}
