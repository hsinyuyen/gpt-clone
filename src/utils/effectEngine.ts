// Effect Engine — thin orchestrator over effectCatalog.
//
// Responsibility split:
//   - effectCatalog.ts: what each action DOES (the handlers) + validation
//   - effectEngine.ts:  WHEN effects fire (per trigger) + buff lifecycle
//
// Adding a new trigger means: add the type in Card.ts, add a process* helper
// here, and wire it into the correct point in duelEngine.ts. Adding a new
// action means: add to Card.ts + add a CatalogEntry in effectCatalog.ts.

import {
  CardEffectDef,
  EffectTrigger,
  EffectAction,
  DuelState,
  FieldMonster,
  PlayerField,
  DuelLogEntry,
  CardDefinition,
} from '@/types/Card';
import {
  applyEffect,
  PERMANENT_BUFF,
  EffectContext,
} from './effectCatalog';

// === Trigger dispatch =====================================================

function runEffectsFor(
  state: DuelState,
  owner: 'player' | 'enemy',
  sourceMonster: FieldMonster | null,
  effects: CardEffectDef[]
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  if (effects.length === 0) return logs;

  const ownerField = owner === 'player' ? state.player : state.enemy;
  const opponentField = owner === 'player' ? state.enemy : state.player;

  for (const effect of effects) {
    const ctx: EffectContext = {
      state,
      effect,
      sourceOwner: owner,
      sourceMonster,
      ownerField,
      opponentField,
      log: (message, type = 'effect') => {
        logs.push({ turn: state.turn, actor: owner, message, type });
      },
    };
    applyEffect(ctx);
  }
  return logs;
}

function effectsOf(monster: FieldMonster, trigger: EffectTrigger): CardEffectDef[] {
  return (monster.definition.ygoEffects || []).filter((e) => e.trigger === trigger);
}

// === Per-trigger processors ==============================================
// These are the ONLY places effects get fired. Each one is wired into exactly
// one point in duelEngine.ts. If you add a trigger, add a processor here and
// call it from the right place in duelEngine.

/** On-summon effects. Also installs any continuous effects as permanent buffs. */
export function processOnSummonEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  monster: FieldMonster
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  logs.push(...runEffectsFor(state, owner, monster, effectsOf(monster, 'on_summon')));
  // Continuous effects are installed exactly once, here.
  logs.push(...runEffectsFor(state, owner, monster, effectsOf(monster, 'continuous')));
  return logs;
}

export function processOnAttackEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  attacker: FieldMonster
): DuelLogEntry[] {
  return runEffectsFor(state, owner, attacker, effectsOf(attacker, 'on_attack'));
}

export function processOnAttackedEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  defender: FieldMonster
): DuelLogEntry[] {
  return runEffectsFor(state, owner, defender, effectsOf(defender, 'on_attacked'));
}

export function processOnDestroyEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  monster: FieldMonster
): DuelLogEntry[] {
  return runEffectsFor(state, owner, monster, effectsOf(monster, 'on_destroy'));
}

export function processStartOfTurnEffects(
  state: DuelState,
  owner: 'player' | 'enemy'
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  const field = owner === 'player' ? state.player : state.enemy;
  for (const m of field.monsters) {
    if (!m || !m.faceUp) continue;
    logs.push(...runEffectsFor(state, owner, m, effectsOf(m, 'start_of_turn')));
  }
  return logs;
}

export function processEndOfTurnEffects(
  state: DuelState,
  owner: 'player' | 'enemy'
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  const field = owner === 'player' ? state.player : state.enemy;
  for (const m of field.monsters) {
    if (!m || !m.faceUp) continue;
    logs.push(...runEffectsFor(state, owner, m, effectsOf(m, 'end_of_turn')));
    tickBuffs(m);
  }
  return logs;
}

// === Buff helpers ========================================================

/** Check if a monster currently has a given flag buff active. */
export function hasBuff(monster: FieldMonster, action: EffectAction): boolean {
  return monster.turnBuffs.some((b) => b.action === action && b.turnsRemaining > 0);
}

function tickBuffs(monster: FieldMonster): void {
  // Permanent (continuous) buffs are never ticked down.
  monster.turnBuffs = monster.turnBuffs
    .map((b) =>
      b.turnsRemaining >= PERMANENT_BUFF
        ? b
        : { ...b, turnsRemaining: b.turnsRemaining - 1 }
    )
    .filter((b) => b.turnsRemaining > 0);
}

// === FieldMonster factory ================================================

export function createFieldMonster(
  definition: CardDefinition,
  playerLevel: number,
  position: 'attack' | 'defense' | 'facedown_defense' = 'attack'
): FieldMonster {
  const scale = 1 + 0.1 * (playerLevel - 1);
  return {
    cardId: definition.id,
    definition,
    playerCardLevel: playerLevel,
    position,
    currentAtk: Math.round(definition.baseAtk * scale),
    currentDef: Math.round(definition.baseDef * scale),
    canAttack: true,
    hasAttacked: false,
    justSummoned: true,
    turnBuffs: [],
    effectCooldowns: {},
    faceUp: position !== 'facedown_defense',
  };
}

// Re-export PERMANENT_BUFF so existing imports keep working.
export { PERMANENT_BUFF } from './effectCatalog';
