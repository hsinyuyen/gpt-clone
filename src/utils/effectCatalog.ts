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
  CardEffectDef,
  EffectAction,
  EffectTrigger,
  EffectTarget,
  FieldMonster,
  PlayerField,
  DuelState,
  DuelLogEntry,
} from '@/types/Card';
import { STARTING_LP } from './duelEngine';

// === Shared resolution context passed to every handler ====================
export interface EffectContext {
  state: DuelState;
  effect: CardEffectDef;
  sourceOwner: 'player' | 'enemy';
  sourceMonster: FieldMonster | null;
  ownerField: PlayerField;
  opponentField: PlayerField;
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
      for (const m of targets) {
        if (!m) continue;
        const idx = opponentField.monsters.indexOf(m);
        if (idx < 0) continue;
        opponentField.graveyard.push(m.definition);
        opponentField.monsters[idx] = null;
        log(`${effect.name}：${m.definition.name} 被破壞了！`, 'destroy');
      }
      // Prevent unused warning
      void state;
      void sourceOwner;
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
    ],
    valueRange: [1, 1],
    handler: ({ effect, sourceMonster, ownerField, opponentField, log }) => {
      const targets = resolveTargets(effect.target, sourceMonster, ownerField, opponentField);
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
  opponentField: PlayerField
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
  const { effect, sourceMonster, ownerField, opponentField, log } = ctx;
  const targets = resolveTargets(effect.target, sourceMonster, ownerField, opponentField);
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
function installFlagBuff(
  ctx: EffectContext,
  action: 'piercing' | 'direct_attack' | 'double_attack' | 'protect',
  description: string
): void {
  const { effect, sourceMonster, log } = ctx;
  if (!sourceMonster) return;
  const duration = effect.trigger === 'continuous' ? PERMANENT_BUFF : 1;
  sourceMonster.turnBuffs.push({
    action,
    value: 1,
    turnsRemaining: duration,
    sourceId: effect.id,
  });
  log(`${effect.name}：${sourceMonster.definition.name} ${description}！`, 'effect');
}
