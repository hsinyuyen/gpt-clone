// Yu-Gi-Oh style Effect Engine - trigger/resolution/chain system

import {
  YgoEffect,
  EffectTrigger,
  EffectAction,
  EffectTarget,
  DuelState,
  FieldMonster,
  FieldBuff,
  PlayerField,
  DuelLogEntry,
  CardDefinition,
} from '@/types/Card';

// A sentinel value used for permanent (continuous) buffs so they never tick down.
export const PERMANENT_BUFF = 9999;

// Check if an effect's trigger matches the current event
export function shouldTrigger(
  effect: YgoEffect,
  trigger: EffectTrigger
): boolean {
  return effect.trigger === trigger;
}

// Get all effects that should trigger for a given event
export function getTriggeredEffects(
  monster: FieldMonster,
  trigger: EffectTrigger
): YgoEffect[] {
  const effects = monster.definition.ygoEffects || [];
  return effects.filter((e) => shouldTrigger(e, trigger));
}

// Check / set effect cooldowns (per FieldMonster, keyed by effect id).
function isOnCooldown(monster: FieldMonster, effectId: string): boolean {
  return (monster.effectCooldowns?.[effectId] || 0) > 0;
}

function startCooldown(monster: FieldMonster, effectId: string, turns: number): void {
  if (!monster.effectCooldowns) monster.effectCooldowns = {};
  monster.effectCooldowns[effectId] = turns;
}

// Resolve a single effect and mutate duel state
export function resolveEffect(
  state: DuelState,
  effect: YgoEffect,
  sourceOwner: 'player' | 'enemy',
  sourceMonster: FieldMonster | null
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  const ownerField = sourceOwner === 'player' ? state.player : state.enemy;
  const opponentField = sourceOwner === 'player' ? state.enemy : state.player;

  const targets = resolveTargets(effect.target, sourceMonster, ownerField, opponentField);

  // Continuous effects live for the lifetime of the monster.
  const persistentDuration = effect.trigger === 'continuous' ? PERMANENT_BUFF : (effect.duration || 1);

  switch (effect.action) {
    case 'damage_lp': {
      opponentField.lp = Math.max(0, opponentField.lp - effect.value);
      logs.push(makeLog(state, sourceOwner, 'effect',
        `${effect.name}：對對手造成 ${effect.value} 點傷害！(LP: ${opponentField.lp})`));
      break;
    }
    case 'heal_lp': {
      ownerField.lp = Math.min(100, ownerField.lp + effect.value);
      logs.push(makeLog(state, sourceOwner, 'effect',
        `${effect.name}：恢復 ${effect.value} LP！(LP: ${ownerField.lp})`));
      break;
    }
    case 'boost_atk': {
      for (const m of targets) {
        if (m) {
          m.currentAtk += effect.value;
          m.turnBuffs.push({ action: 'boost_atk', value: effect.value, turnsRemaining: persistentDuration, sourceId: effect.id });
          logs.push(makeLog(state, sourceOwner, 'effect',
            `${effect.name}：${m.definition.name} ATK +${effect.value}！`));
        }
      }
      break;
    }
    case 'boost_def': {
      for (const m of targets) {
        if (m) {
          m.currentDef += effect.value;
          m.turnBuffs.push({ action: 'boost_def', value: effect.value, turnsRemaining: persistentDuration, sourceId: effect.id });
          logs.push(makeLog(state, sourceOwner, 'effect',
            `${effect.name}：${m.definition.name} DEF +${effect.value}！`));
        }
      }
      break;
    }
    case 'weaken_atk': {
      for (const m of targets) {
        if (m) {
          m.currentAtk = Math.max(0, m.currentAtk - effect.value);
          m.turnBuffs.push({ action: 'weaken_atk', value: effect.value, turnsRemaining: persistentDuration, sourceId: effect.id });
          logs.push(makeLog(state, sourceOwner, 'effect',
            `${effect.name}：${m.definition.name} ATK -${effect.value}！`));
        }
      }
      break;
    }
    case 'weaken_def': {
      for (const m of targets) {
        if (m) {
          m.currentDef = Math.max(0, m.currentDef - effect.value);
          m.turnBuffs.push({ action: 'weaken_def', value: effect.value, turnsRemaining: persistentDuration, sourceId: effect.id });
          logs.push(makeLog(state, sourceOwner, 'effect',
            `${effect.name}：${m.definition.name} DEF -${effect.value}！`));
        }
      }
      break;
    }
    case 'destroy_monster': {
      for (const m of targets) {
        if (m) {
          destroyMonster(m, opponentField, ownerField);
          logs.push(makeLog(state, sourceOwner, 'destroy',
            `${effect.name}：${m.definition.name} 被破壞了！`));
        }
      }
      break;
    }
    case 'destroy_spell_trap': {
      // Destroy first face-down spell/trap on opponent field
      const stIdx = opponentField.spellTraps.findIndex((st) => st !== null);
      if (stIdx >= 0) {
        const st = opponentField.spellTraps[stIdx]!;
        logs.push(makeLog(state, sourceOwner, 'destroy',
          `${effect.name}：${st.definition.name} 被破壞了！`));
        opponentField.graveyard.push(st.definition);
        opponentField.spellTraps[stIdx] = null;
      }
      break;
    }
    case 'draw_card': {
      const count = effect.value;
      for (let i = 0; i < count; i++) {
        if (ownerField.deck.length > 0) {
          const drawn = ownerField.deck.shift()!;
          ownerField.hand.push(drawn);
        }
      }
      logs.push(makeLog(state, sourceOwner, 'draw',
        `${effect.name}：抽了 ${count} 張卡！`));
      break;
    }
    case 'special_summon': {
      // Special summon from graveyard (first monster card)
      const gravIdx = ownerField.graveyard.findIndex(
        (c) => c.cardCategory === 'monster'
      );
      if (gravIdx >= 0) {
        const card = ownerField.graveyard.splice(gravIdx, 1)[0];
        const emptyZone = ownerField.monsters.findIndex((m) => m === null);
        if (emptyZone >= 0) {
          ownerField.monsters[emptyZone] = createFieldMonster(card, 1);
          logs.push(makeLog(state, sourceOwner, 'summon',
            `${effect.name}：${card.name} 從墓地特殊召喚！`));
        }
      }
      break;
    }
    case 'return_to_hand': {
      for (const m of targets) {
        if (m) {
          const idx = opponentField.monsters.indexOf(m);
          if (idx >= 0) {
            opponentField.hand.push(m.definition);
            opponentField.monsters[idx] = null;
            logs.push(makeLog(state, sourceOwner, 'effect',
              `${effect.name}：${m.definition.name} 被彈回手牌！`));
          }
        }
      }
      break;
    }
    case 'negate_attack': {
      // Handled during battle phase resolution — flag it
      if (sourceMonster) {
        sourceMonster.turnBuffs.push({
          action: 'negate_attack', value: 1, turnsRemaining: persistentDuration, sourceId: effect.id,
        });
      }
      logs.push(makeLog(state, sourceOwner, 'effect',
        `${effect.name}：攻擊無效化！`));
      break;
    }
    case 'change_position': {
      for (const m of targets) {
        if (m) {
          m.position = m.position === 'attack' ? 'defense' : 'attack';
          logs.push(makeLog(state, sourceOwner, 'effect',
            `${effect.name}：${m.definition.name} 變更為${m.position === 'attack' ? '攻擊' : '守備'}表示！`));
        }
      }
      break;
    }
    case 'piercing': {
      if (sourceMonster) {
        sourceMonster.turnBuffs.push({
          action: 'piercing', value: 1, turnsRemaining: persistentDuration, sourceId: effect.id,
        });
      }
      logs.push(makeLog(state, sourceOwner, 'effect',
        `${effect.name}：獲得貫通傷害效果！`));
      break;
    }
    case 'direct_attack': {
      if (sourceMonster) {
        sourceMonster.turnBuffs.push({
          action: 'direct_attack', value: 1, turnsRemaining: persistentDuration, sourceId: effect.id,
        });
      }
      logs.push(makeLog(state, sourceOwner, 'effect',
        `${effect.name}：可以直接攻擊對手 LP！`));
      break;
    }
    case 'double_attack': {
      if (sourceMonster) {
        sourceMonster.turnBuffs.push({
          action: 'double_attack', value: 1, turnsRemaining: persistentDuration, sourceId: effect.id,
        });
      }
      logs.push(makeLog(state, sourceOwner, 'effect',
        `${effect.name}：本回合可以攻擊兩次！`));
      break;
    }
    case 'protect': {
      if (sourceMonster) {
        sourceMonster.turnBuffs.push({
          action: 'protect', value: 1, turnsRemaining: persistentDuration, sourceId: effect.id,
        });
      }
      logs.push(makeLog(state, sourceOwner, 'effect',
        `${effect.name}：本回合不會被破壞！`));
      break;
    }
  }

  // Start cooldown tracking on the source monster after a successful fire.
  if (sourceMonster && effect.cooldown && effect.cooldown > 0) {
    startCooldown(sourceMonster, effect.id, effect.cooldown);
  }

  return logs;
}

// Resolve effect chain (process all effects in the chain stack)
export function resolveChain(state: DuelState): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  // Chains resolve last-in-first-out
  while (state.chainStack.length > 0) {
    const effect = state.chainStack.pop()!;
    // For chain effects, determine owner from context (simplified: current player)
    const chainLogs = resolveEffect(state, effect, state.currentPlayer, null);
    logs.push(...chainLogs);
  }
  return logs;
}

// Process start-of-turn effects for all monsters on a field.
// Also auto-fires any `activated` effects that are off cooldown.
export function processStartOfTurnEffects(
  state: DuelState,
  owner: 'player' | 'enemy'
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  const field = owner === 'player' ? state.player : state.enemy;

  for (const monster of field.monsters) {
    if (!monster || !monster.faceUp) continue;

    // Real start_of_turn effects
    const effects = getTriggeredEffects(monster, 'start_of_turn');
    for (const effect of effects) {
      if (isOnCooldown(monster, effect.id)) continue;
      logs.push(...resolveEffect(state, effect, owner, monster));
    }

    // Auto-fire activated effects (cooldown enforced)
    const activated = getTriggeredEffects(monster, 'activated');
    for (const effect of activated) {
      if (isOnCooldown(monster, effect.id)) continue;
      logs.push(...resolveEffect(state, effect, owner, monster));
      // Default 3-turn cooldown when none declared, to avoid infinite heal.
      if (!effect.cooldown || effect.cooldown <= 0) {
        startCooldown(monster, effect.id, 3);
      }
    }
  }

  return logs;
}

// Process end-of-turn effects and tick down buff durations
export function processEndOfTurnEffects(
  state: DuelState,
  owner: 'player' | 'enemy'
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  const field = owner === 'player' ? state.player : state.enemy;

  for (const monster of field.monsters) {
    if (!monster || !monster.faceUp) continue;

    // Trigger end_of_turn effects
    const effects = getTriggeredEffects(monster, 'end_of_turn');
    for (const effect of effects) {
      logs.push(...resolveEffect(state, effect, owner, monster));
    }

    // Tick down buff durations and remove expired ones
    tickBuffs(monster);
  }

  return logs;
}

// Process on_summon effects. Also applies any `continuous` effects this monster has,
// since continuous effects need to be installed exactly once when the monster hits the field.
export function processOnSummonEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  monster: FieldMonster
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];

  // 1. Real on_summon effects
  const onSummon = getTriggeredEffects(monster, 'on_summon');
  for (const effect of onSummon) {
    logs.push(...resolveEffect(state, effect, owner, monster));
  }

  // 2. Install continuous effects as permanent buffs
  const continuous = getTriggeredEffects(monster, 'continuous');
  for (const effect of continuous) {
    logs.push(...resolveEffect(state, effect, owner, monster));
  }

  return logs;
}

// Process on_attacked effects (fires on the defender when it is attacked)
export function processOnAttackedEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  defender: FieldMonster
): DuelLogEntry[] {
  const effects = getTriggeredEffects(defender, 'on_attacked');
  const logs: DuelLogEntry[] = [];
  for (const effect of effects) {
    logs.push(...resolveEffect(state, effect, owner, defender));
  }
  return logs;
}

// Process activated effects for all face-up monsters on a field.
// Activated effects auto-fire once per cooldown window, respecting the effect's
// own cooldown (defaulting to 3 turns if none specified).
export function processActivatedEffects(
  state: DuelState,
  owner: 'player' | 'enemy'
): DuelLogEntry[] {
  const logs: DuelLogEntry[] = [];
  const field = owner === 'player' ? state.player : state.enemy;

  for (const monster of field.monsters) {
    if (!monster || !monster.faceUp) continue;
    const effects = getTriggeredEffects(monster, 'activated');
    for (const effect of effects) {
      if (isOnCooldown(monster, effect.id)) continue;
      logs.push(...resolveEffect(state, effect, owner, monster));
      // Ensure a cooldown is set even if the effect didn't declare one
      if (!effect.cooldown || effect.cooldown <= 0) {
        startCooldown(monster, effect.id, 3);
      }
    }
  }

  return logs;
}

// Process on_attack effects
export function processOnAttackEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  attacker: FieldMonster
): DuelLogEntry[] {
  const effects = getTriggeredEffects(attacker, 'on_attack');
  const logs: DuelLogEntry[] = [];
  for (const effect of effects) {
    if (isOnCooldown(attacker, effect.id)) continue;
    logs.push(...resolveEffect(state, effect, owner, attacker));
  }
  return logs;
}

// Process on_destroy effects
export function processOnDestroyEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  monster: FieldMonster
): DuelLogEntry[] {
  const effects = getTriggeredEffects(monster, 'on_destroy');
  const logs: DuelLogEntry[] = [];
  for (const effect of effects) {
    logs.push(...resolveEffect(state, effect, owner, monster));
  }
  return logs;
}

// Process on_flip effects (when a facedown monster is flipped face-up)
export function processOnFlipEffects(
  state: DuelState,
  owner: 'player' | 'enemy',
  monster: FieldMonster
): DuelLogEntry[] {
  const effects = getTriggeredEffects(monster, 'on_flip');
  const logs: DuelLogEntry[] = [];
  for (const effect of effects) {
    logs.push(...resolveEffect(state, effect, owner, monster));
  }
  return logs;
}

// Check if a monster has a specific buff active
export function hasBuff(monster: FieldMonster, action: EffectAction): boolean {
  return monster.turnBuffs.some((b) => b.action === action && b.turnsRemaining > 0);
}

// === Helper Functions ===

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
      // Target first opponent monster
      const m = opponentField.monsters.find((m) => m !== null && m.faceUp);
      return m ? [m] : [];
    }
    case 'all_opponent_monsters':
      return opponentField.monsters.filter((m) => m !== null && m.faceUp);
    case 'own_monster': {
      // Target first own monster that isn't the source
      const m = ownerField.monsters.find((m) => m !== null && m !== source && m.faceUp);
      return m ? [m] : (source ? [source] : []);
    }
    case 'all_own_monsters':
      return ownerField.monsters.filter((m) => m !== null && m.faceUp);
    case 'random_opponent_monster': {
      const alive = opponentField.monsters.filter((m) => m !== null && m.faceUp);
      if (alive.length === 0) return [];
      return [alive[Math.floor(Math.random() * alive.length)]];
    }
    case 'weakest_opponent_monster': {
      const alive = opponentField.monsters.filter((m): m is FieldMonster => m !== null && m.faceUp);
      if (alive.length === 0) return [];
      alive.sort((a, b) => a.currentAtk - b.currentAtk);
      return [alive[0]];
    }
    case 'strongest_opponent_monster': {
      const alive = opponentField.monsters.filter((m): m is FieldMonster => m !== null && m.faceUp);
      if (alive.length === 0) return [];
      alive.sort((a, b) => b.currentAtk - a.currentAtk);
      return [alive[0]];
    }
    case 'opponent_lp':
    case 'own_lp':
      return []; // LP effects handled directly in resolveEffect
    default:
      return [];
  }
}

function destroyMonster(
  monster: FieldMonster,
  monsterField: PlayerField,
  _destroyerField: PlayerField
): void {
  const idx = monsterField.monsters.indexOf(monster);
  if (idx >= 0) {
    monsterField.graveyard.push(monster.definition);
    monsterField.monsters[idx] = null;
  }
}

function tickBuffs(monster: FieldMonster): void {
  // Permanent buffs (turnsRemaining === PERMANENT_BUFF) are not ticked.
  monster.turnBuffs = monster.turnBuffs
    .map((b) =>
      b.turnsRemaining >= PERMANENT_BUFF
        ? b
        : { ...b, turnsRemaining: b.turnsRemaining - 1 }
    )
    .filter((b) => b.turnsRemaining > 0);

  // Tick down effect cooldowns
  if (monster.effectCooldowns) {
    const next: Record<string, number> = {};
    for (const [id, turns] of Object.entries(monster.effectCooldowns)) {
      if (turns - 1 > 0) next[id] = turns - 1;
    }
    monster.effectCooldowns = next;
  }
}

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
    canAttack: true,     // YGO: can attack on summon turn
    hasAttacked: false,
    justSummoned: true,  // cosmetic only, doesn't block attacks
    turnBuffs: [],
    effectCooldowns: {},
    faceUp: position !== 'facedown_defense',
  };
}

function makeLog(
  state: DuelState,
  actor: 'player' | 'enemy',
  type: DuelLogEntry['type'],
  message: string
): DuelLogEntry {
  return { turn: state.turn, actor, message, type };
}
