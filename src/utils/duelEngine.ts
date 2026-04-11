// Yu-Gi-Oh Style Duel Engine - LP, phases, tribute summon, positions, battle

import {
  DuelState,
  PlayerField,
  FieldMonster,
  CardDefinition,
  PlayerCard,
  DuelLogEntry,
  DuelPhase,
  MonsterPosition,
  PveOpponent,
} from '@/types/Card';
import { CARD_MAP } from '@/data/cards/pools';
import {
  createFieldMonster,
  processOnSummonEffects,
  processOnAttackEffects,
  processOnAttackedEffects,
  processOnDestroyEffects,
  processStartOfTurnEffects,
  processEndOfTurnEffects,
  hasBuff,
} from './effectEngine';

export const STARTING_LP = 500;
const MAX_TURNS = 40;
const MONSTER_ZONES = 5;
const STARTING_HAND = 5;

// === Initialization ===

export function initDuel(
  playerDeck: CardDefinition[],
  enemyDeck: CardDefinition[]
): DuelState {
  const shuffledPlayer = shuffle([...playerDeck]);
  const shuffledEnemy = shuffle([...enemyDeck]);

  const playerHand = shuffledPlayer.splice(0, STARTING_HAND);
  const enemyHand = shuffledEnemy.splice(0, STARTING_HAND);

  const state: DuelState = {
    id: `duel_${Date.now()}`,
    status: 'dueling',
    turn: 1,
    maxTurns: MAX_TURNS,
    currentPhase: 'draw',
    currentPlayer: 'player',
    player: {
      lp: STARTING_LP,
      monsters: Array(MONSTER_ZONES).fill(null),
      spellTraps: [],
      hand: playerHand,
      deck: shuffledPlayer,
      graveyard: [],
      hasNormalSummoned: false,
    },
    enemy: {
      lp: STARTING_LP,
      monsters: Array(MONSTER_ZONES).fill(null),
      spellTraps: [],
      hand: enemyHand,
      deck: shuffledEnemy,
      graveyard: [],
      hasNormalSummoned: false,
    },
    log: [],
    chainStack: [],
  };

  state.log.push(makeLog(state, 'player', 'info', '決鬥開始！'));
  return state;
}

// Accept a cardImageMap to merge image URLs into card definitions
export function initPveDuel(
  playerCards: PlayerCard[],
  opponent: PveOpponent,
  cardImageMap?: Record<string, string>
): DuelState {
  const playerDeck: CardDefinition[] = [];

  for (const pc of playerCards) {
    const def = CARD_MAP.get(pc.cardId);
    if (def) {
      const withImage = cardImageMap && cardImageMap[def.id]
        ? { ...def, imageUrl: cardImageMap[def.id] }
        : def;
      playerDeck.push(withImage);
    }
  }

  const enemyDeck: CardDefinition[] = [];

  for (let i = 0; i < opponent.teamCardIds.length; i++) {
    const def = CARD_MAP.get(opponent.teamCardIds[i]);
    if (def) {
      const withImage = cardImageMap && cardImageMap[def.id]
        ? { ...def, imageUrl: cardImageMap[def.id] }
        : def;
      enemyDeck.push(withImage);
    }
  }

  return initDuel(playerDeck, enemyDeck);
}

// Initialize a PvP duel from two card-ID decks
export function initPvpDuel(
  player1CardIds: string[],
  player2CardIds: string[],
  cardImageMap?: Record<string, string>
): DuelState {
  const resolveDeck = (ids: string[]): CardDefinition[] => {
    const deck: CardDefinition[] = [];
    for (const id of ids) {
      const def = CARD_MAP.get(id);
      if (def) {
        const withImage = cardImageMap && cardImageMap[def.id]
          ? { ...def, imageUrl: cardImageMap[def.id] }
          : def;
        deck.push(withImage);
      }
    }
    return deck;
  };

  return initDuel(resolveDeck(player1CardIds), resolveDeck(player2CardIds));
}

// Swap the player ↔ enemy fields of a DuelState so that the LOCAL player
// always looks at themselves on the bottom row. Used by the PvP view layer.
export function swapDuelState(state: DuelState): DuelState {
  return {
    ...state,
    player: state.enemy,
    enemy: state.player,
    currentPlayer: state.currentPlayer === 'player' ? 'enemy' : 'player',
  };
}

// === Phase Management ===

export function advancePhase(state: DuelState): DuelState {
  const newState = cloneState(state);
  const phases: DuelPhase[] = ['draw', 'main', 'battle', 'end'];
  const currentIdx = phases.indexOf(newState.currentPhase);

  if (currentIdx < phases.length - 1) {
    newState.currentPhase = phases[currentIdx + 1];
  } else {
    // End phase → switch to opponent's draw phase
    const endLogs = processEndOfTurnEffects(newState, newState.currentPlayer);
    newState.log.push(...endLogs);

    // Reset monster attack states for next turn
    const field = getField(newState, newState.currentPlayer);
    for (const m of field.monsters) {
      if (m) {
        m.hasAttacked = false;
        m.justSummoned = false;
      }
    }

    newState.currentPlayer = newState.currentPlayer === 'player' ? 'enemy' : 'player';
    newState.currentPhase = 'draw';
    if (newState.currentPlayer === 'player') {
      newState.turn++;
    }

    // Reset normal summon flag for new turn
    const nextField = getField(newState, newState.currentPlayer);
    nextField.hasNormalSummoned = false;

    // Draw phase: auto-draw (no deck-out penalty, just skip draw)
    if (nextField.deck.length > 0) {
      const drawn = nextField.deck.shift()!;
      nextField.hand.push(drawn);
      newState.log.push(makeLog(newState, newState.currentPlayer, 'draw',
        `抽了一張卡！(手牌: ${nextField.hand.length})`));
    } else {
      newState.log.push(makeLog(newState, newState.currentPlayer, 'info',
        '牌組已空，無法抽卡'));
    }

    // Start of turn effects
    const startLogs = processStartOfTurnEffects(newState, newState.currentPlayer);
    newState.log.push(...startLogs);
  }

  newState.log.push(makeLog(newState, newState.currentPlayer, 'phase',
    `${getPhaseLabel(newState.currentPhase)}`));

  checkWinCondition(newState);
  return newState;
}

// === Actions ===

// Normal Summon a monster from hand
export function normalSummon(
  state: DuelState,
  owner: 'player' | 'enemy',
  handIndex: number,
  zoneIndex: number,
  position: MonsterPosition = 'attack',
  tributeIndices: number[] = []
): DuelState {
  const newState = cloneState(state);
  const field = getField(newState, owner);

  if (field.hasNormalSummoned) return newState;
  if (handIndex < 0 || handIndex >= field.hand.length) return newState;
  if (zoneIndex < 0 || zoneIndex >= MONSTER_ZONES) return newState;

  const card = field.hand[handIndex];
  if (card.cardCategory !== 'monster') return newState;

  const level = card.level || 1;
  const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;

  if (tributesNeeded > 0) {
    if (tributeIndices.length < tributesNeeded) return newState;

    const tributes = tributeIndices
      .map((i) => field.monsters[i])
      .filter((m): m is FieldMonster => m !== null);

    if (tributes.length < tributesNeeded) return newState;

    for (const idx of tributeIndices) {
      const tribute = field.monsters[idx];
      if (tribute) {
        field.graveyard.push(tribute.definition);
        field.monsters[idx] = null;
        newState.log.push(makeLog(newState, owner, 'info',
          `${tribute.definition.name} 被獻為祭品`));
      }
    }
  }

  // Find empty zone
  let targetZone = zoneIndex;
  if (field.monsters[targetZone] !== null) {
    targetZone = field.monsters.findIndex((m) => m === null);
    if (targetZone < 0) return newState;
  }

  const monster = createFieldMonster(card, 1, position);
  field.monsters[targetZone] = monster;
  field.hand.splice(handIndex, 1);
  field.hasNormalSummoned = true;

  newState.log.push(makeLog(newState, owner, 'summon',
    `${card.name} ${position === 'facedown_defense' ? '裏側守備表示' : position === 'defense' ? '守備表示' : '攻擊表示'}召喚！(ATK:${monster.currentAtk} DEF:${monster.currentDef})`));

  if (position !== 'facedown_defense') {
    const effectLogs = processOnSummonEffects(newState, owner, monster);
    newState.log.push(...effectLogs);
  }

  checkWinCondition(newState);
  return newState;
}

// Change monster position
export function changePosition(
  state: DuelState,
  owner: 'player' | 'enemy',
  zoneIndex: number,
  newPosition: MonsterPosition
): DuelState {
  const newState = cloneState(state);
  const field = getField(newState, owner);
  const monster = field.monsters[zoneIndex];

  if (!monster) return newState;
  if (monster.position === newPosition) return newState;

  const wasFacedown = !monster.faceUp;
  monster.position = newPosition;
  monster.faceUp = newPosition !== 'facedown_defense';

  newState.log.push(makeLog(newState, owner, 'info',
    `${monster.definition.name} 變更為${newPosition === 'attack' ? '攻擊' : '守備'}表示！`));

  // wasFacedown flip: no on_flip trigger in current catalog, nothing to do
  void wasFacedown;

  return newState;
}

// Attack with a monster
export function declareAttack(
  state: DuelState,
  attackerOwner: 'player' | 'enemy',
  attackerZone: number,
  targetZone: number
): DuelState {
  const newState = cloneState(state);
  const attackerField = getField(newState, attackerOwner);
  const defenderOwner = attackerOwner === 'player' ? 'enemy' : 'player';
  const defenderField = getField(newState, defenderOwner);

  const attacker = attackerField.monsters[attackerZone];
  if (!attacker || !attacker.faceUp) return newState;
  if (attacker.position !== 'attack') return newState;
  if (attacker.hasAttacked && !hasBuff(attacker, 'double_attack')) return newState;

  // On-attack effects
  const attackLogs = processOnAttackEffects(newState, attackerOwner, attacker);
  newState.log.push(...attackLogs);

  // Direct attack
  if (targetZone < 0 || defenderField.monsters.every((m) => m === null)) {
    const canDirect = hasBuff(attacker, 'direct_attack') ||
      defenderField.monsters.every((m) => m === null);
    if (!canDirect) return newState;

    defenderField.lp = Math.max(0, defenderField.lp - attacker.currentAtk);
    newState.log.push(makeLog(newState, attackerOwner, 'attack',
      `${attacker.definition.name} 直接攻擊！造成 ${attacker.currentAtk} 點傷害！(LP: ${defenderField.lp})`));
    attacker.hasAttacked = true;
    checkWinCondition(newState);
    return newState;
  }

  const defender = defenderField.monsters[targetZone];
  if (!defender) return newState;

  // Flip face-down monster (no on_flip trigger in current catalog)
  if (!defender.faceUp) {
    defender.faceUp = true;
    defender.position = defender.position === 'facedown_defense' ? 'defense' : defender.position;
    newState.log.push(makeLog(newState, defenderOwner, 'info',
      `${defender.definition.name} 被翻轉為表側表示！`));
  }

  // Defender on_attacked effects (e.g. reflect damage, return-to-hand, weaken attacker)
  const attackedLogs = processOnAttackedEffects(newState, defenderOwner, defender);
  newState.log.push(...attackedLogs);

  // on_attacked effects may have removed the defender (e.g. return_to_hand) — re-check
  if (defenderField.monsters[targetZone] !== defender) {
    attacker.hasAttacked = true;
    checkWinCondition(newState);
    return newState;
  }
  // They may also have destroyed the attacker (though unlikely) — re-check
  if (!attackerField.monsters[attackerZone]) {
    checkWinCondition(newState);
    return newState;
  }

  if (defender.position === 'attack') {
    const diff = attacker.currentAtk - defender.currentAtk;
    if (diff > 0) {
      defenderField.lp = Math.max(0, defenderField.lp - diff);
      newState.log.push(makeLog(newState, attackerOwner, 'attack',
        `${attacker.definition.name}(${attacker.currentAtk}) 戰鬥破壞 ${defender.definition.name}(${defender.currentAtk})！傷害: ${diff}`));
      const destroyLogs = processOnDestroyEffects(newState, defenderOwner, defender);
      newState.log.push(...destroyLogs);
      sendToGraveyard(defenderField, targetZone);
    } else if (diff < 0) {
      attackerField.lp = Math.max(0, attackerField.lp - Math.abs(diff));
      newState.log.push(makeLog(newState, defenderOwner, 'attack',
        `${defender.definition.name}(${defender.currentAtk}) 反擊破壞 ${attacker.definition.name}(${attacker.currentAtk})！傷害: ${Math.abs(diff)}`));
      if (!hasBuff(attacker, 'protect')) {
        const destroyLogs = processOnDestroyEffects(newState, attackerOwner, attacker);
        newState.log.push(...destroyLogs);
        sendToGraveyard(attackerField, attackerZone);
      }
    } else {
      newState.log.push(makeLog(newState, attackerOwner, 'attack',
        `${attacker.definition.name} 與 ${defender.definition.name} 同歸於盡！`));
      if (!hasBuff(attacker, 'protect')) {
        const destroyLogs1 = processOnDestroyEffects(newState, attackerOwner, attacker);
        newState.log.push(...destroyLogs1);
        sendToGraveyard(attackerField, attackerZone);
      }
      const destroyLogs2 = processOnDestroyEffects(newState, defenderOwner, defender);
      newState.log.push(...destroyLogs2);
      sendToGraveyard(defenderField, targetZone);
    }
  } else {
    const diff = attacker.currentAtk - defender.currentDef;
    if (diff > 0) {
      newState.log.push(makeLog(newState, attackerOwner, 'attack',
        `${attacker.definition.name}(ATK:${attacker.currentAtk}) 戰鬥破壞守備表示的 ${defender.definition.name}(DEF:${defender.currentDef})！`));
      if (hasBuff(attacker, 'piercing')) {
        defenderField.lp = Math.max(0, defenderField.lp - diff);
        newState.log.push(makeLog(newState, attackerOwner, 'damage',
          `貫通傷害！${diff} 點！(LP: ${defenderField.lp})`));
      }
      const destroyLogs = processOnDestroyEffects(newState, defenderOwner, defender);
      newState.log.push(...destroyLogs);
      sendToGraveyard(defenderField, targetZone);
    } else if (diff < 0) {
      attackerField.lp = Math.max(0, attackerField.lp - Math.abs(diff));
      newState.log.push(makeLog(newState, attackerOwner, 'attack',
        `${attacker.definition.name}(ATK:${attacker.currentAtk}) 攻擊守備表示 ${defender.definition.name}(DEF:${defender.currentDef}) 失敗！反彈傷害: ${Math.abs(diff)}`));
    } else {
      newState.log.push(makeLog(newState, attackerOwner, 'attack',
        `${attacker.definition.name} 攻擊 ${defender.definition.name}，無事發生`));
    }
  }

  attacker.hasAttacked = true;
  checkWinCondition(newState);
  return newState;
}

// === AI Decision Making ===

export interface DuelAiAction {
  type: 'summon' | 'attack' | 'end_phase';
  handIndex?: number;
  zoneIndex?: number;
  targetZone?: number;
  position?: MonsterPosition;
  tributeIndices?: number[];
}

export function chooseDuelAiAction(state: DuelState): DuelAiAction {
  const field = state.enemy;

  if (state.currentPhase === 'main') {
    if (!field.hasNormalSummoned) {
      const monsterCards = field.hand
        .map((c, i) => ({ card: c, idx: i }))
        .filter((x) => x.card.cardCategory === 'monster');

      if (monsterCards.length > 0) {
        const sorted = monsterCards.sort((a, b) => b.card.baseAtk - a.card.baseAtk);

        for (const mc of sorted) {
          const level = mc.card.level || 1;
          const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;
          const ownMonsters = field.monsters
            .map((m, i) => ({ m, i }))
            .filter((x) => x.m !== null);

          if (ownMonsters.length >= tributesNeeded) {
            const emptyZone = field.monsters.findIndex((m) => m === null);
            if (emptyZone >= 0) {
              const tributes = ownMonsters
                .sort((a, b) => (a.m?.currentAtk || 0) - (b.m?.currentAtk || 0))
                .slice(0, tributesNeeded)
                .map((x) => x.i);

              return {
                type: 'summon',
                handIndex: mc.idx,
                zoneIndex: emptyZone,
                position: 'attack',
                tributeIndices: tributes,
              };
            }
          }
        }
      }
    }

    return { type: 'end_phase' };
  }

  if (state.currentPhase === 'battle') {
    for (let i = 0; i < MONSTER_ZONES; i++) {
      const m = field.monsters[i];
      if (!m || !m.faceUp || m.position !== 'attack') continue;
      if (m.hasAttacked && !hasBuff(m, 'double_attack')) continue;

      const playerField = state.player;
      const targets = playerField.monsters
        .map((pm, pi) => ({ m: pm, i: pi }))
        .filter((x) => x.m !== null);

      if (targets.length === 0) {
        return { type: 'attack', zoneIndex: i, targetZone: -1 };
      }

      // Attack targets we can beat
      const attackTargets = targets
        .filter((t) => t.m!.position === 'attack' && m.currentAtk > t.m!.currentAtk)
        .sort((a, b) => (b.m?.currentAtk || 0) - (a.m?.currentAtk || 0));

      if (attackTargets.length > 0) {
        return { type: 'attack', zoneIndex: i, targetZone: attackTargets[0].i };
      }

      const defTargets = targets
        .filter((t) => t.m!.position !== 'attack' && m.currentAtk > t.m!.currentDef);

      if (defTargets.length > 0) {
        return { type: 'attack', zoneIndex: i, targetZone: defTargets[0].i };
      }

      // Still attack even if we might lose — makes AI more aggressive
      if (targets.length > 0 && m.currentAtk >= (targets[0].m?.currentAtk || 0)) {
        return { type: 'attack', zoneIndex: i, targetZone: targets[0].i };
      }
    }

    return { type: 'end_phase' };
  }

  return { type: 'end_phase' };
}

// Execute AI turn (full auto-play for enemy)
export function executeAiTurn(state: DuelState): DuelState {
  let current = cloneState(state);
  let safety = 0;

  while (current.currentPlayer === 'enemy' && current.status === 'dueling' && safety < 30) {
    safety++;

    // Auto-advance draw phase
    if (current.currentPhase === 'draw') {
      current = advancePhase(current); // draw → main
      continue;
    }

    const action = chooseDuelAiAction(current);

    if (action.type === 'summon' && action.handIndex !== undefined) {
      current = normalSummon(
        current, 'enemy',
        action.handIndex, action.zoneIndex || 0,
        action.position || 'attack',
        action.tributeIndices || []
      );
      // After summoning, advance to battle if in main phase
      current = advancePhase(current); // main → battle
      continue;
    }

    if (action.type === 'attack' && action.zoneIndex !== undefined) {
      current = declareAttack(
        current, 'enemy',
        action.zoneIndex, action.targetZone ?? -1
      );
      if (current.status !== 'dueling') break;
      // Try more attacks in same battle phase
      continue;
    }

    // end_phase — advance
    current = advancePhase(current);

    // If we've reached end phase, advance once more to switch to player
    if (current.currentPhase === 'end' && current.currentPlayer === 'enemy') {
      current = advancePhase(current);
    }
  }

  return current;
}

// === Step-by-step AI execution (for animated playback) ===

export type AiStepKind =
  | { kind: 'phase_advance'; state: DuelState }
  | { kind: 'summon'; state: DuelState; zoneIndex: number }
  | { kind: 'attack_intent'; fromZone: number; toZone: number; isDirect: boolean }
  | { kind: 'attack_resolve'; state: DuelState }
  | { kind: 'done' };

/**
 * Pure planning function — returns what the AI WANTS to do given current state,
 * WITHOUT mutating state. UI uses this to schedule animations, then calls
 * applyAiPlan() to actually mutate.
 */
export function planAiStep(state: DuelState): {
  kind: 'summon' | 'attack' | 'phase_advance' | 'done';
  action?: DuelAiAction;
} {
  if (state.currentPlayer !== 'enemy' || state.status !== 'dueling') {
    return { kind: 'done' };
  }
  if (state.currentPhase === 'draw') {
    return { kind: 'phase_advance' };
  }

  const action = chooseDuelAiAction(state);
  if (action.type === 'summon') return { kind: 'summon', action };
  if (action.type === 'attack') return { kind: 'attack', action };
  return { kind: 'phase_advance' };
}

/**
 * Apply a planned action to the state and return the new state.
 * Used by the UI after playing the animation for the action.
 */
export function applyAiAction(
  state: DuelState,
  kind: 'summon' | 'attack' | 'phase_advance',
  action?: DuelAiAction
): DuelState {
  let current = cloneState(state);

  if (kind === 'phase_advance') {
    current = advancePhase(current);
    if (current.currentPhase === 'end' && current.currentPlayer === 'enemy') {
      current = advancePhase(current);
    }
    return current;
  }

  if (kind === 'summon' && action && action.handIndex !== undefined) {
    current = normalSummon(
      current, 'enemy',
      action.handIndex, action.zoneIndex || 0,
      action.position || 'attack',
      action.tributeIndices || []
    );
    // After summoning, advance to battle
    current = advancePhase(current);
    return current;
  }

  if (kind === 'attack' && action && action.zoneIndex !== undefined) {
    current = declareAttack(
      current, 'enemy',
      action.zoneIndex, action.targetZone ?? -1
    );
    return current;
  }

  return current;
}

// === Helper Functions ===

function getField(state: DuelState, owner: 'player' | 'enemy'): PlayerField {
  return owner === 'player' ? state.player : state.enemy;
}

function sendToGraveyard(field: PlayerField, zoneIndex: number): void {
  const monster = field.monsters[zoneIndex];
  if (monster) {
    field.graveyard.push(monster.definition);
    field.monsters[zoneIndex] = null;
  }
}

function checkWinCondition(state: DuelState): void {
  if (state.player.lp <= 0) {
    state.status = 'defeat';
    state.log.push(makeLog(state, 'enemy', 'info', '玩家 LP 歸零！對手勝利！'));
  } else if (state.enemy.lp <= 0) {
    state.status = 'victory';
    state.log.push(makeLog(state, 'player', 'info', '對手 LP 歸零！你贏了！'));
  } else if (state.turn > state.maxTurns) {
    state.status = state.player.lp >= state.enemy.lp ? 'victory' : 'defeat';
    state.log.push(makeLog(state, 'player', 'info',
      `回合限制到達！${state.status === 'victory' ? '你贏了' : '你輸了'}！`));
  }
}

function makeLog(
  state: DuelState,
  actor: 'player' | 'enemy',
  type: DuelLogEntry['type'],
  message: string
): DuelLogEntry {
  return { turn: state.turn, actor, message, type };
}

function getPhaseLabel(phase: DuelPhase): string {
  switch (phase) {
    case 'draw': return '抽卡階段';
    case 'main': return '召喚階段';
    case 'battle': return '戰鬥階段';
    case 'end': return '結束階段';
  }
}

function cloneState(state: DuelState): DuelState {
  return JSON.parse(JSON.stringify(state));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getMonsterCount(field: PlayerField): number {
  return field.monsters.filter((m) => m !== null).length;
}

export function canNormalSummon(field: PlayerField, card: CardDefinition): boolean {
  if (field.hasNormalSummoned) return false;
  if (card.cardCategory !== 'monster') return false;

  const level = card.level || 1;
  const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;
  const ownMonsters = field.monsters.filter((m) => m !== null).length;
  const emptyZones = field.monsters.filter((m) => m === null).length;

  if (tributesNeeded > ownMonsters) return false;
  if (tributesNeeded === 0 && emptyZones === 0) return false;

  return true;
}

export function getTributesNeeded(card: CardDefinition): number {
  const level = card.level || 1;
  return level >= 7 ? 2 : level >= 5 ? 1 : 0;
}
