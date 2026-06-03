// ============================================================================
// Effect Catalog — the single source of truth for what card effects exist.
// ============================================================================
//
// Adding a new effect is a two-step process:
//   1. Add the trigger/action/target to Card.ts type union (if new)
//   2. Add a CatalogEntry below with a handler that mutates state
//
// The cardDataValidator below runs at module load time and THROWS if any
// card uses a trigger/action combo that is not in this catalog. This
// guarantees it is impossible to author a card effect that has no code path.
//
// Value scale (LP = 500 starting):
//   damage_lp:   20-120
//   heal_lp:     30-150
//   boost_atk:   5-30  (these are stat points, not LP)
//   weaken_atk:  5-25
//   draw_card:   1-2
// ============================================================================

import {
  CardDefinition,
  CardEffectDef,
  CardElement,
  EffectAction,
  EffectTrigger,
  EffectTarget,
  FieldMonster,
  PlayerField,
  DuelState,
  DuelLogEntry,
  MonsterPosition,
} from '@/types/Card';
import { STARTING_LP } from './duelConstants';

// === Shared resolution context passed to every handler ====================
export interface EffectContext {
  state: DuelState;
  effect: CardEffectDef;
  sourceOwner: 'player' | 'enemy';
  sourceMonster: FieldMonster | null;
  ownerField: PlayerField;
  opponentField: PlayerField;
  /** The monster currently attacking us — only set inside on_attacked. */
  attackerMonster?: FieldMonster | null;
  log: (message: string, type?: DuelLogEntry['type']) => void;
}

// === Catalog entry shape ==================================================
interface CatalogEntry {
  action: EffectAction;
  /** Triggers this action is allowed to be used with. Validator enforces. */
  allowedTriggers: readonly EffectTrigger[];
  /** Targets this action is allowed to use. Validator enforces. */
  allowedTargets: readonly EffectTarget[];
  /** Min/max value range. Validator enforces. */
  valueRange: readonly [number, number];
  /** The actual implementation. Mutates state directly. */
  handler: (ctx: EffectContext) => void;
}

// === The catalog ==========================================================
// Sentinel for permanent buffs installed by `continuous` effects.
export const PERMANENT_BUFF = 9999;

const ALL_TRIGGERS_EXCEPT_CONTINUOUS: readonly EffectTrigger[] = [
  'on_summon',
  'on_attack',
  'on_attacked',
  'on_destroy',
  'start_of_turn',
  'end_of_turn',
  'on_flip',
];

const ALL_TRIGGERS: readonly EffectTrigger[] = [
  ...ALL_TRIGGERS_EXCEPT_CONTINUOUS,
  'continuous',
];

const CATALOG: Record<EffectAction, CatalogEntry> = {
  // ------------------------------------------------------------------ LP ---
  damage_lp: {
    action: 'damage_lp',
    allowedTriggers: ALL_TRIGGERS_EXCEPT_CONTINUOUS,
    allowedTargets: ['opponent_lp'],
    valueRange: [20, 120],
    handler: ({ effect, opponentField, log }) => {
      opponentField.lp = Math.max(0, opponentField.lp - effect.value);
      log(`${effect.name}：對對手造成 ${effect.value} 點傷害！(LP: ${opponentField.lp})`, 'effect');
    },
  },

  heal_lp: {
    action: 'heal_lp',
    allowedTriggers: ALL_TRIGGERS_EXCEPT_CONTINUOUS,
    allowedTargets: ['own_lp'],
    valueRange: [30, 150],
    handler: ({ effect, ownerField, log }) => {
      const before = ownerField.lp;
      ownerField.lp = Math.min(STARTING_LP, ownerField.lp + effect.value);
      const healed = ownerField.lp - before;
      log(`${effect.name}：回復 ${healed} 點生命值！(LP: ${ownerField.lp})`, 'effect');
    },
  },

  // ------------------------------------------------------------- ATK/DEF ---
  boost_atk: {
    action: 'boost_atk',
    allowedTriggers: ALL_TRIGGERS,
    allowedTargets: ['self', 'own_monster', 'all_own_monsters'],
    valueRange: [5, 30],
    handler: (ctx) => applyStatBuff(ctx, 'boost_atk', +1),
  },

  boost_def: {
    action: 'boost_def',
    allowedTriggers: ALL_TRIGGERS,
    allowedTargets: ['self', 'own_monster', 'all_own_monsters'],
    valueRange: [5, 30],
    handler: (ctx) => applyStatBuff(ctx, 'boost_def', +1),
  },

  weaken_atk: {
    action: 'weaken_atk',
    allowedTriggers: ALL_TRIGGERS_EXCEPT_CONTINUOUS,
    allowedTargets: [
      'opponent_monster',
      'all_opponent_monsters',
      'random_opponent_monster',
      'weakest_opponent_monster',
      'strongest_opponent_monster',
      'attacker_monster',
    ],
    valueRange: [5, 25],
    handler: (ctx) => applyStatBuff(ctx, 'weaken_atk', -1),
  },

  weaken_def: {
    action: 'weaken_def',
    allowedTriggers: ALL_TRIGGERS_EXCEPT_CONTINUOUS,
    allowedTargets: [
      'opponent_monster',
      'all_opponent_monsters',
      'random_opponent_monster',
      'weakest_opponent_monster',
      'strongest_opponent_monster',
      'attacker_monster',
    ],
    valueRange: [5, 25],
    handler: (ctx) => applyStatBuff(ctx, 'weaken_def', -1),
  },

  // --------------------------------------------------------- board wipe ---
  destroy_monster: {
    action: 'destroy_monster',
    allowedTriggers: ALL_TRIGGERS_EXCEPT_CONTINUOUS,
    allowedTargets: [
      'opponent_monster',
      'random_opponent_monster',
      'weakest_opponent_monster',
      'strongest_opponent_monster',
    ],
    valueRange: [1, 1],
    handler: ({ state, effect, sourceMonster, ownerField, opponentField, sourceOwner, log }) => {
      const targets = resolveTargets(effect.target, sourceMonster, ownerField, opponentField);
      const destroyedOwner = sourceOwner === 'player' ? 'enemy' : 'player';
      for (const m of targets) {
        if (!m) continue;
        const idx = opponentField.monsters.indexOf(m);
        if (idx < 0) continue;
        // Respect "indestructible" — protect buff also shields against effect-destruction
        if (m.turnBuffs.some((b) => b.action === 'protect')) {
          log(`${effect.name}：${m.definition.name} 受到破壞保護，免於被效果破壞！`, 'info');
          continue;
        }
        // Fire the destroyed monster's on_destroy chain (e.g. 蠕蟲一號 →
        // 蠕蟲二號) BEFORE removing it from the field, so the chain can
        // observe the dying monster.
        fireOnDestroyFor(state, destroyedOwner, m, log);
        opponentField.graveyard.push(m.definition);
        opponentField.monsters[idx] = null;
        log(`${effect.name}：${m.definition.name} 被破壞了！`, 'destroy');
      }
      void ownerField;
    },
  },

  // ------------------------------------------------------------- card flow ---
  draw_card: {
    action: 'draw_card',
    allowedTriggers: ['on_summon', 'on_attack', 'start_of_turn', 'end_of_turn'],
    allowedTargets: ['self'],
    valueRange: [1, 2],
    handler: ({ effect, ownerField, log }) => {
      let drawn = 0;
      for (let i = 0; i < effect.value; i++) {
        if (ownerField.deck.length === 0) break;
        ownerField.hand.push(ownerField.deck.shift()!);
        drawn++;
      }
      log(`${effect.name}：抽了 ${drawn} 張卡！`, 'draw');
    },
  },

  return_to_hand: {
    action: 'return_to_hand',
    allowedTriggers: ALL_TRIGGERS_EXCEPT_CONTINUOUS,
    allowedTargets: [
      'opponent_monster',
      'random_opponent_monster',
      'weakest_opponent_monster',
      'strongest_opponent_monster',
      'attacker_monster',
    ],
    valueRange: [1, 1],
    handler: ({ effect, sourceMonster, ownerField, opponentField, attackerMonster, log }) => {
      const targets = resolveTargets(effect.target, sourceMonster, ownerField, opponentField, attackerMonster);
      for (const m of targets) {
        if (!m) continue;
        const idx = opponentField.monsters.indexOf(m);
        if (idx < 0) continue;
        opponentField.hand.push(m.definition);
        opponentField.monsters[idx] = null;
        log(`${effect.name}：${m.definition.name} 被彈回手牌！`, 'effect');
      }
    },
  },

  // ---------------------------------------------------- persistent flags ---
  // These only make sense as continuous effects — they install a permanent
  // buff when the monster is summoned.
  piercing: {
    action: 'piercing',
    allowedTriggers: ['continuous'],
    allowedTargets: ['self'],
    valueRange: [1, 1],
    handler: (ctx) => installFlagBuff(ctx, 'piercing', '獲得貫通傷害'),
  },

  direct_attack: {
    action: 'direct_attack',
    allowedTriggers: ['continuous'],
    allowedTargets: ['self'],
    valueRange: [1, 1],
    handler: (ctx) => installFlagBuff(ctx, 'direct_attack', '可直接攻擊對手 LP'),
  },

  double_attack: {
    action: 'double_attack',
    allowedTriggers: ['continuous'],
    allowedTargets: ['self'],
    valueRange: [1, 1],
    handler: (ctx) => installFlagBuff(ctx, 'double_attack', '可在戰鬥階段攻擊兩次'),
  },

  protect: {
    action: 'protect',
    allowedTriggers: ['on_summon', 'continuous'],
    allowedTargets: ['self'],
    valueRange: [1, 1],
    handler: (ctx) => installFlagBuff(ctx, 'protect', '不會被戰鬥破壞'),
  },

  // ----------------------------------------------------- Special Summon ---
  special_summon_from_hand: {
    action: 'special_summon_from_hand',
    allowedTriggers: ['on_destroy'] as readonly EffectTrigger[],
    allowedTargets: ['self'] as readonly EffectTarget[],
    valueRange: [1, 1] as const,
    handler: (ctx) => {
      const { state, sourceOwner, ownerField, log } = ctx;
      const emptyIdx = ownerField.monsters.findIndex((m) => m === null);
      if (emptyIdx < 0) { log('場上沒有空位，無法特殊召喚！', 'info'); return; }
      const candidateIndices = ownerField.hand
        .map((c, i) => ({ card: c, idx: i }))
        .filter((x) => x.card.cardCategory === 'monster')
        .map((x) => x.idx);
      if (candidateIndices.length === 0) { log('手牌中沒有怪獸，無法特殊召喚！', 'info'); return; }

      // Mark as pending — the UI / AI driver resolves it later via
      // resolvePendingSpecialSummon(). This lets the player CHOOSE which
      // monster to summon instead of the engine auto-picking.
      state.pendingSpecialSummon = {
        owner: sourceOwner,
        candidateHandIndices: candidateIndices,
      };
      log('觸發特殊召喚效果！請選擇要從手牌召喚的怪獸...', 'effect');
    },
  },

  special_summon_from_graveyard: {
    action: 'special_summon_from_graveyard',
    allowedTriggers: ['on_summon', 'on_destroy'] as readonly EffectTrigger[],
    allowedTargets: ['self'] as readonly EffectTarget[],
    valueRange: [1, 1] as const,
    handler: (ctx) => {
      const { effect, sourceOwner, ownerField, log } = ctx;
      const emptyIdx = ownerField.monsters.findIndex((m) => m === null);
      if (emptyIdx < 0) { log('場上沒有空位，無法從墓地特殊召喚！', 'info'); return; }
      const filter = (effect as CardEffectDef & { elementFilter?: CardElement }).elementFilter;
      let candidates = ownerField.graveyard.filter((c) => c.cardCategory === 'monster');
      if (filter) candidates = candidates.filter((c) => c.element === filter);
      if (candidates.length === 0) { log('墓地中沒有符合條件的怪獸！', 'info'); return; }
      candidates.sort((a, b) => b.baseAtk - a.baseAtk);
      const picked = candidates[0];
      const gIdx = ownerField.graveyard.indexOf(picked);
      ownerField.graveyard.splice(gIdx, 1);
      const lvl = ownerField.cardLevels?.[picked.id] || 1;
      const scale = 1 + 0.1 * (lvl - 1);
      const fm: FieldMonster = {
        cardId: picked.id,
        definition: picked,
        playerCardLevel: lvl,
        position: 'attack' as MonsterPosition,
        currentAtk: Math.round(picked.baseAtk * scale),
        currentDef: Math.round(picked.baseDef * scale),
        canAttack: true,
        hasAttacked: false,
        attackCount: 0,
        justSummoned: true,
        turnBuffs: [],
        effectCooldowns: {},
        faceUp: true,
      };
      ownerField.monsters[emptyIdx] = fm;
      log(`${picked.name} 從墓地特殊召喚！(ATK:${fm.currentAtk})`, 'summon');
      fireOnSummonFor(ctx.state, sourceOwner, fm, log);
    },
  },

  // ------------------------------------- Summon a specific card by ID ---
  // Searches deck → hand → graveyard for the target card and special-summons
  // it. If costDiscardHand is set, the entire hand is sent to the graveyard
  // first (required for "蠕蟲三號 → 沃蘭極" style cost summons).
  summon_specific: {
    action: 'summon_specific',
    allowedTriggers: ['on_summon', 'on_destroy'] as readonly EffectTrigger[],
    allowedTargets: ['self'] as readonly EffectTarget[],
    valueRange: [1, 1] as const,
    handler: (ctx) => {
      const { effect, sourceOwner, ownerField, log } = ctx;
      const targetId = (effect as CardEffectDef & { targetCardId?: string }).targetCardId;
      if (!targetId) { log('summon_specific: 缺少 targetCardId', 'info'); return; }

      const emptyIdx = ownerField.monsters.findIndex((m) => m === null);
      if (emptyIdx < 0) { log('場上沒有空位，無法特殊召喚！', 'info'); return; }

      // Reserve the target from hand BEFORE paying the discard cost.
      // Otherwise the cost wipes the hand and the target vanishes (bug:
      // 蠕蟲三號 with 蠕蟲帝王 in hand previously failed to summon).
      let found: CardDefinition | null = null;
      let source: 'deck' | 'hand' | 'graveyard' | null = null;
      const reservedHandIdx = ownerField.hand.findIndex((c) => c.id === targetId);
      if (reservedHandIdx >= 0) {
        found = ownerField.hand[reservedHandIdx];
        source = 'hand';
        ownerField.hand.splice(reservedHandIdx, 1);
      }

      // Optional cost: discard entire hand to graveyard
      const cost = (effect as CardEffectDef & { costDiscardHand?: boolean }).costDiscardHand;
      if (cost && ownerField.hand.length > 0) {
        const discarded = ownerField.hand.splice(0);
        for (const c of discarded) {
          ownerField.graveyard.push(c);
        }
        log(`支付代價：手牌 ${discarded.length} 張全部送入墓地！`, 'effect');
      }

      // If not reserved from hand, search deck → graveyard
      if (!found) {
        const deckIdx = ownerField.deck.findIndex((c) => c.id === targetId);
        if (deckIdx >= 0) { found = ownerField.deck[deckIdx]; source = 'deck'; ownerField.deck.splice(deckIdx, 1); }
      }
      if (!found) {
        const gyIdx = ownerField.graveyard.findIndex((c) => c.id === targetId);
        if (gyIdx >= 0) { found = ownerField.graveyard[gyIdx]; source = 'graveyard'; ownerField.graveyard.splice(gyIdx, 1); }
      }

      if (!found) {
        log(`找不到指定的卡「${targetId}」，無法特殊召喚！`, 'info');
        return;
      }

      const lvl = ownerField.cardLevels?.[found.id] || 1;
      const scale = 1 + 0.1 * (lvl - 1);
      const fm: FieldMonster = {
        cardId: found.id,
        definition: found,
        playerCardLevel: lvl,
        position: 'attack',
        currentAtk: Math.round(found.baseAtk * scale),
        currentDef: Math.round(found.baseDef * scale),
        canAttack: true,
        hasAttacked: false,
        attackCount: 0,
        justSummoned: true,
        turnBuffs: [],
        effectCooldowns: {},
        faceUp: true,
      };
      ownerField.monsters[emptyIdx] = fm;
      const sourceLabel = source === 'deck' ? '牌組' : source === 'hand' ? '手牌' : '墓地';
      log(`${found.name} 從${sourceLabel}特殊召喚！(ATK:${fm.currentAtk})`, 'summon');
      // Fire the newly-summoned monster's on_summon chain (bug fix for 蠕蟲三號)
      fireOnSummonFor(ctx.state, sourceOwner, fm, log);
    },
  },

  // ----------- Search deck for a specific card → add to hand ---
  search_deck_for_card: {
    action: 'search_deck_for_card',
    allowedTriggers: ['on_summon'] as readonly EffectTrigger[],
    allowedTargets: ['self'] as readonly EffectTarget[],
    valueRange: [1, 1] as const,
    handler: (ctx) => {
      const { effect, ownerField, log } = ctx;
      const targetId = (effect as CardEffectDef & { targetCardId?: string }).targetCardId;
      if (!targetId) { log('search_deck_for_card: 缺少 targetCardId', 'info'); return; }
      const deckIdx = ownerField.deck.findIndex((c) => c.id === targetId);
      if (deckIdx < 0) { log(`牌組中找不到「${targetId}」`, 'info'); return; }
      const found = ownerField.deck[deckIdx];
      ownerField.deck.splice(deckIdx, 1);
      ownerField.hand.push(found);
      log(`從牌組將「${found.name}」加入手牌！`, 'effect');
    },
  },

  // -------------------- Discard hand → damage (emperor end-of-turn) ---
  discard_hand_for_damage: {
    action: 'discard_hand_for_damage',
    allowedTriggers: ['end_of_turn'] as readonly EffectTrigger[],
    allowedTargets: ['opponent_lp'] as readonly EffectTarget[],
    valueRange: [1, 1] as const,
    handler: (ctx) => {
      const { ownerField, opponentField, log } = ctx;
      const monsters = ownerField.hand.filter((c) => c.cardCategory === 'monster');
      if (monsters.length === 0) return;
      let totalDamage = 0;
      for (const m of monsters) {
        const lvl = ownerField.cardLevels?.[m.id] || 1;
        const scale = 1 + 0.1 * (lvl - 1);
        totalDamage += Math.round(m.baseAtk * scale);
      }
      // Move discarded monsters to graveyard; keep non-monsters in hand
      ownerField.graveyard.push(...monsters);
      ownerField.hand = ownerField.hand.filter((c) => c.cardCategory !== 'monster');
      opponentField.lp = Math.max(0, opponentField.lp - totalDamage);
      log(`丟棄 ${monsters.length} 隻怪獸，造成 ${totalDamage} 點直傷害！(對手 LP: ${opponentField.lp})`, 'effect');
    },
  },

  // -------------------------------------------------------- Negate Attack ---
  negate_attack: {
    action: 'negate_attack',
    allowedTriggers: ['on_flip', 'on_summon', 'on_attacked'] as readonly EffectTrigger[],
    allowedTargets: ['opponent_monster', 'strongest_opponent_monster', 'all_opponent_monsters'] as readonly EffectTarget[],
    valueRange: [1, 1] as const,
    handler: (ctx) => {
      const { effect, sourceMonster, ownerField, opponentField, attackerMonster, log } = ctx;
      const targets = resolveTargets(effect.target, sourceMonster, ownerField, opponentField, attackerMonster);
      for (const m of targets) {
        if (!m) continue;
        m.canAttack = false;
        log(`${effect.name}：${m.definition.name} 的攻擊被無效化！`, 'effect');
      }
    },
  },
};

// ============================================================================
// Catalog public API
// ============================================================================

export function getCatalogEntry(action: EffectAction): CatalogEntry | undefined {
  return CATALOG[action];
}

export function applyEffect(ctx: EffectContext): void {
  const entry = CATALOG[ctx.effect.action];
  if (!entry) {
    // Validated at load time — should never hit in practice.
    throw new Error(`[effectCatalog] no handler for action "${ctx.effect.action}"`);
  }
  entry.handler(ctx);
}

// ============================================================================
// Validation — runs at module load on every card. Throws on first violation.
// ============================================================================

export interface ValidationError {
  cardId: string;
  effectId: string;
  reason: string;
}

export function validateCardEffect(
  cardId: string,
  effect: CardEffectDef
): ValidationError | null {
  const entry = CATALOG[effect.action];
  if (!entry) {
    return {
      cardId,
      effectId: effect.id,
      reason: `unknown action "${effect.action}"`,
    };
  }
  if (!entry.allowedTriggers.includes(effect.trigger)) {
    return {
      cardId,
      effectId: effect.id,
      reason: `action "${effect.action}" is not allowed with trigger "${effect.trigger}" (allowed: ${entry.allowedTriggers.join(', ')})`,
    };
  }
  if (!entry.allowedTargets.includes(effect.target)) {
    return {
      cardId,
      effectId: effect.id,
      reason: `action "${effect.action}" is not allowed with target "${effect.target}" (allowed: ${entry.allowedTargets.join(', ')})`,
    };
  }
  const [minV, maxV] = entry.valueRange;
  if (effect.value < minV || effect.value > maxV) {
    return {
      cardId,
      effectId: effect.id,
      reason: `value ${effect.value} outside allowed range [${minV}, ${maxV}] for action "${effect.action}"`,
    };
  }
  return null;
}

/**
 * Validate every card in a pool. Throws with a single combined message if
 * any effect is invalid. Called at module load time from _init.ts.
 */
export function validateCards(
  cards: Array<{ id: string; ygoEffects?: CardEffectDef[] }>
): void {
  const errors: ValidationError[] = [];
  for (const card of cards) {
    for (const effect of card.ygoEffects || []) {
      const err = validateCardEffect(card.id, effect);
      if (err) errors.push(err);
    }
  }
  if (errors.length > 0) {
    const msg = errors
      .map((e) => `  - [${e.cardId}] effect "${e.effectId}": ${e.reason}`)
      .join('\n');
    throw new Error(
      `[effectCatalog] ${errors.length} card effect(s) failed validation:\n${msg}`
    );
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

function resolveTargets(
  target: EffectTarget,
  source: FieldMonster | null,
  ownerField: PlayerField,
  opponentField: PlayerField,
  attacker?: FieldMonster | null
): (FieldMonster | null)[] {
  switch (target) {
    case 'self':
      return [source];
    case 'opponent_monster': {
      const m = opponentField.monsters.find((x) => x !== null && x.faceUp);
      return m ? [m] : [];
    }
    case 'all_opponent_monsters':
      return opponentField.monsters.filter((m) => m !== null && m.faceUp);
    case 'own_monster': {
      const m = ownerField.monsters.find((x) => x !== null && x !== source && x.faceUp);
      return m ? [m] : source ? [source] : [];
    }
    case 'all_own_monsters':
      return ownerField.monsters.filter((m) => m !== null && m.faceUp);
    case 'random_opponent_monster': {
      const alive = opponentField.monsters.filter((m) => m !== null && m.faceUp);
      if (alive.length === 0) return [];
      return [alive[Math.floor(Math.random() * alive.length)]];
    }
    case 'weakest_opponent_monster': {
      const alive = opponentField.monsters.filter(
        (m): m is FieldMonster => m !== null && m.faceUp
      );
      if (alive.length === 0) return [];
      alive.sort((a, b) => a.currentAtk - b.currentAtk);
      return [alive[0]];
    }
    case 'strongest_opponent_monster': {
      const alive = opponentField.monsters.filter(
        (m): m is FieldMonster => m !== null && m.faceUp
      );
      if (alive.length === 0) return [];
      alive.sort((a, b) => b.currentAtk - a.currentAtk);
      return [alive[0]];
    }
    case 'attacker_monster':
      // Only meaningful inside on_attacked. Falls back to first opponent
      // monster if attacker context is missing (defensive — shouldn't happen).
      if (attacker) return [attacker];
      return resolveTargets('opponent_monster', source, ownerField, opponentField);
    case 'opponent_lp':
    case 'own_lp':
      return []; // LP actions handled directly in their handlers
    default:
      return [];
  }
}

// Apply a stat buff with sign: +1 for boost, -1 for weaken.
function applyStatBuff(
  ctx: EffectContext,
  action: 'boost_atk' | 'boost_def' | 'weaken_atk' | 'weaken_def',
  sign: 1 | -1
): void {
  const { effect, sourceMonster, ownerField, opponentField, attackerMonster, log } = ctx;
  const targets = resolveTargets(effect.target, sourceMonster, ownerField, opponentField, attackerMonster);
  const delta = sign * effect.value;
  // continuous effects are permanent, others default to 1 turn (or duration)
  const duration = effect.trigger === 'continuous' ? PERMANENT_BUFF : effect.duration || 1;

  for (const m of targets) {
    if (!m) continue;
    if (action === 'boost_atk' || action === 'weaken_atk') {
      m.currentAtk = Math.max(0, m.currentAtk + delta);
    } else {
      m.currentDef = Math.max(0, m.currentDef + delta);
    }
    m.turnBuffs.push({
      action,
      value: effect.value,
      turnsRemaining: duration,
      sourceId: effect.id,
    });
    const arrow = sign > 0 ? '+' : '-';
    const stat = action.endsWith('atk') ? 'ATK' : 'DEF';
    log(
      `${effect.name}：${m.definition.name} ${stat} ${arrow}${effect.value}！`,
      'effect'
    );
  }
}

// Install a flag buff (piercing/direct_attack/double_attack/protect).
// Fire a newly-summoned monster's on_summon + continuous effects. Used by
// special-summon handlers so cards like 蠕蟲三號 actually trigger their
// on_summon chain when placed via an effect (not just normalSummon).
// Kept here to avoid a circular dependency with effectEngine.
function fireOnSummonFor(
  baseState: DuelState,
  owner: 'player' | 'enemy',
  newMonster: FieldMonster,
  log: (msg: string, type?: DuelLogEntry['type']) => void
): void {
  const effects = (newMonster.definition.ygoEffects || []).filter(
    (e) => e.trigger === 'on_summon' || e.trigger === 'continuous'
  );
  if (effects.length === 0) return;
  const ownerField = owner === 'player' ? baseState.player : baseState.enemy;
  const opponentField = owner === 'player' ? baseState.enemy : baseState.player;
  for (const eff of effects) {
    const newCtx: EffectContext = {
      state: baseState,
      effect: eff,
      sourceOwner: owner,
      sourceMonster: newMonster,
      ownerField,
      opponentField,
      log,
    };
    applyEffect(newCtx);
  }
}

// Fire a destroyed monster's on_destroy effects. Used by the destroy_monster
// handler so cards like 蠕蟲一號 actually trigger their chain when killed by
// an effect (not just by battle).
function fireOnDestroyFor(
  baseState: DuelState,
  destroyedOwner: 'player' | 'enemy',
  destroyedMonster: FieldMonster,
  log: (msg: string, type?: DuelLogEntry['type']) => void
): void {
  const effects = (destroyedMonster.definition.ygoEffects || []).filter(
    (e) => e.trigger === 'on_destroy'
  );
  if (effects.length === 0) return;
  const ownerField = destroyedOwner === 'player' ? baseState.player : baseState.enemy;
  const opponentField = destroyedOwner === 'player' ? baseState.enemy : baseState.player;
  for (const eff of effects) {
    const newCtx: EffectContext = {
      state: baseState,
      effect: eff,
      sourceOwner: destroyedOwner,
      sourceMonster: destroyedMonster,
      ownerField,
      opponentField,
      log,
    };
    applyEffect(newCtx);
  }
}

function installFlagBuff(
  ctx: EffectContext,
  action: 'piercing' | 'direct_attack' | 'double_attack' | 'protect',
  description: string
): void {
  const { effect, sourceMonster, log } = ctx;
  if (!sourceMonster) return;
  // Continuous → permanent. on_summon → must survive at least the opponent's
  // turn (otherwise tickBuffs at end of own turn drops it before the opponent
  // ever gets a chance to attack). Use 2 so it lasts: own turn end → tick to 1
  // → opponent's turn → opponent end → tick to 0 → expires before our next.
  const duration = effect.trigger === 'continuous' ? PERMANENT_BUFF : 2;
  sourceMonster.turnBuffs.push({
    action,
    value: 1,
    turnsRemaining: duration,
    sourceId: effect.id,
  });
  log(`${effect.name}：${sourceMonster.definition.name} ${description}！`, 'effect');
}
