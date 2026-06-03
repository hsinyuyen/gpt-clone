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
  processOnFlipEffects,
  processStartOfTurnEffects,
  processEndOfTurnEffects,
  hasBuff,
} from './effectEngine';

// Import from shared constants (avoids circular dependency)
import { STARTING_LP } from './duelConstants';
export { STARTING_LP };
const MAX_TURNS = 40;
const MONSTER_ZONES = 5;
const STARTING_HAND = 5;
/** Target deck size for PvE enemies — small teams get padded by cycling. */
const PVE_DECK_SIZE = 20;

// === Initialization ===

export function initDuel(
  playerDeck: CardDefinition[],
  enemyDeck: CardDefinition[],
  playerCardLevels: Record<string, number> = {},
  enemyCardLevels: Record<string, number> = {}
): DuelState {
  const shuffledPlayer = shuffle([...playerDeck]);
  const shuffledEnemy = shuffle([...enemyDeck]);

  const playerHand = shuffledPlayer.splice(0, STARTING_HAND);
  const enemyHand = shuffledEnemy.splice(0, STARTING_HAND);

  // Coin flip — heads = player goes first, tails = enemy goes first.
  const firstPlayer: 'player' | 'enemy' = Math.random() < 0.5 ? 'player' : 'enemy';

  const state: DuelState = {
    id: `duel_${Date.now()}`,
    status: 'dueling',
    turn: 1,
    maxTurns: MAX_TURNS,
    currentPhase: 'draw',
    currentPlayer: firstPlayer,
    firstPlayer,
    player: {
      lp: STARTING_LP,
      monsters: Array(MONSTER_ZONES).fill(null),
      spellTraps: [],
      hand: playerHand,
      deck: shuffledPlayer,
      graveyard: [],
      hasNormalSummoned: false,
      cardLevels: playerCardLevels,
    },
    enemy: {
      lp: STARTING_LP,
      monsters: Array(MONSTER_ZONES).fill(null),
      spellTraps: [],
      hand: enemyHand,
      deck: shuffledEnemy,
      graveyard: [],
      hasNormalSummoned: false,
      cardLevels: enemyCardLevels,
    },
    log: [],
    chainStack: [],
  };

  state.log.push(makeLog(state, 'player', 'info', '決鬥開始！'));
  state.log.push(makeLog(state, firstPlayer, 'info',
    `🪙 擲硬幣決定先攻：${firstPlayer === 'player' ? '你' : '對手'} 先攻！（先攻第一回合不能攻擊）`));
  return state;
}

// Accept a cardImageMap to merge image URLs into card definitions
export function initPveDuel(
  playerCards: PlayerCard[],
  opponent: PveOpponent,
  cardImageMap?: Record<string, string>
): DuelState {
  const playerDeck: CardDefinition[] = [];
  const playerCardLevels: Record<string, number> = {};

  for (const pc of playerCards) {
    const def = CARD_MAP.get(pc.cardId);
    if (def) {
      const withImage = cardImageMap && cardImageMap[def.id]
        ? { ...def, imageUrl: cardImageMap[def.id] }
        : def;
      playerDeck.push(withImage);
      playerCardLevels[pc.cardId] = pc.level || 1;
    }
  }

  const enemyDeck: CardDefinition[] = [];
  const enemyCardLevels: Record<string, number> = {};

  for (let i = 0; i < opponent.teamCardIds.length; i++) {
    const def = CARD_MAP.get(opponent.teamCardIds[i]);
    if (def) {
      const withImage = cardImageMap && cardImageMap[def.id]
        ? { ...def, imageUrl: cardImageMap[def.id] }
        : def;
      enemyDeck.push(withImage);
      // Use PvE opponent's team level for this card
      enemyCardLevels[def.id] = opponent.teamLevels?.[i] || 1;
    }
  }

  // PvE opponents only define a small "team" (3-5 cards). Pad the deck by
  // cycling those cards so the AI has draws beyond the opening hand.
  if (enemyDeck.length > 0 && enemyDeck.length < PVE_DECK_SIZE) {
    const base = [...enemyDeck];
    let i = 0;
    while (enemyDeck.length < PVE_DECK_SIZE) {
      enemyDeck.push(base[i % base.length]);
      i++;
    }
  }

  const initialState = initDuel(playerDeck, enemyDeck, playerCardLevels, enemyCardLevels);

  // Stack the AI's opening hand with key combo pieces ("luck"). If the deck
  // contains all the requested IDs, pull one copy of each to the front of the
  // hand, then refill the rest with shuffled draws.
  if (opponent.guaranteedOpening && opponent.guaranteedOpening.length > 0) {
    const enemyField = initialState.enemy;
    // Combine current hand+deck back into one shuffled pool
    const pool: CardDefinition[] = [...enemyField.hand, ...enemyField.deck];
    const guaranteedHand: CardDefinition[] = [];
    for (const wantedId of opponent.guaranteedOpening) {
      const idx = pool.findIndex((c) => c.id === wantedId);
      if (idx >= 0) {
        guaranteedHand.push(pool[idx]);
        pool.splice(idx, 1);
      }
    }
    // Fill remaining hand slots (up to 5) from the pool
    const remainingHandSlots = Math.max(0, 5 - guaranteedHand.length);
    const fillers = pool.splice(0, remainingHandSlots);
    enemyField.hand = [...guaranteedHand, ...fillers];
    enemyField.deck = pool;
  }

  initialState.enemyAiStrategy = opponent.aiStrategy || 'standard';
  return initialState;
}

// Initialize a PvP duel from two card-ID decks
export function initPvpDuel(
  player1CardIds: string[],
  player2CardIds: string[],
  cardImageMap?: Record<string, string>,
  player1Levels?: Record<string, number>,
  player2Levels?: Record<string, number>
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

  return initDuel(
    resolveDeck(player1CardIds),
    resolveDeck(player2CardIds),
    player1Levels || {},
    player2Levels || {}
  );
}

// Swap the player ↔ enemy fields of a DuelState so that the LOCAL player
// always looks at themselves on the bottom row. Used by the PvP view layer.
export function swapDuelState(state: DuelState): DuelState {
  // Swap victory ↔ defeat so each player sees the correct result
  const swapStatus = (s: DuelState['status']): DuelState['status'] => {
    if (s === 'victory') return 'defeat';
    if (s === 'defeat') return 'victory';
    return s;
  };
  return {
    ...state,
    status: swapStatus(state.status),
    player: state.enemy,
    enemy: state.player,
    currentPlayer: state.currentPlayer === 'player' ? 'enemy' : 'player',
    firstPlayer: state.firstPlayer === 'player' ? 'enemy' : 'player',
    pendingSpecialSummon: state.pendingSpecialSummon
      ? {
          ...state.pendingSpecialSummon,
          owner: state.pendingSpecialSummon.owner === 'player' ? 'enemy' : 'player',
        }
      : undefined,
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
        m.attackCount = 0;
        m.justSummoned = false;
        m.canAttack = true;
      }
    }

    newState.currentPlayer = newState.currentPlayer === 'player' ? 'enemy' : 'player';
    newState.currentPhase = 'draw';
    // A "turn" cycles when control returns to whoever went first.
    if (newState.currentPlayer === newState.firstPlayer) {
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
  // Guard: monsters with cannotNormalSummon can only enter the field through effects
  if (card && card.cannotNormalSummon) return newState;
  if (card.cardCategory !== 'monster') return newState;

  const level = card.level || 1;
  const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;

  if (tributesNeeded > 0) {
    if (tributeIndices.length < tributesNeeded) return newState;

    const tributes = tributeIndices
      .map((i) => field.monsters[i])
      .filter((m): m is FieldMonster => m !== null);

    if (tributes.length < tributesNeeded) return newState;

    // Enforce specific-tribute requirement (e.g. 主機蠕蟲 needs 蠕蟲帝王 + 終極戰爭機器)
    if (card.requiredTributeCardIds && card.requiredTributeCardIds.length > 0) {
      const tributeIds = tributes.map((t) => t.definition.id);
      const tributeIdsCopy = [...tributeIds];
      for (const reqId of card.requiredTributeCardIds) {
        const idx = tributeIdsCopy.indexOf(reqId);
        if (idx < 0) return newState; // required tribute not found
        tributeIdsCopy.splice(idx, 1);
      }
    }

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

  const monster = createFieldMonster(card, field.cardLevels[card.id] || 1, position);
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

  // wasFacedown flip: handled by flipSummon instead
  void wasFacedown;

  return newState;
}

// Flip summon a face-down defense monster
export function flipSummon(
  state: DuelState,
  owner: 'player' | 'enemy',
  zoneIndex: number
): DuelState {
  const newState = cloneState(state);
  const field = getField(newState, owner);
  const monster = field.monsters[zoneIndex];

  if (!monster) return newState;
  if (monster.faceUp) return newState;
  if (monster.position !== 'facedown_defense') return newState;

  monster.faceUp = true;
  monster.position = 'attack';

  newState.log.push(makeLog(newState, owner, 'summon',
    `${monster.definition.name} 翻轉召喚！(ATK:${monster.currentAtk} DEF:${monster.currentDef})`));

  // Fire on_flip effects + install continuous effects (skipped during face-down set)
  const flipLogs = processOnFlipEffects(newState, owner, monster);
  newState.log.push(...flipLogs);

  checkWinCondition(newState);
  return newState;
}

// Resolve a pending `special_summon_from_hand` choice.
// The effect handler parks a `pendingSpecialSummon` on the state; the UI (or
// AI driver) picks which hand index to summon and calls this to actually place
// the monster on the field.
export function resolvePendingSpecialSummon(
  state: DuelState,
  chosenHandIndex: number
): DuelState {
  const newState = cloneState(state);
  const pending = newState.pendingSpecialSummon;
  if (!pending) return newState;

  const field = getField(newState, pending.owner);
  const emptyIdx = field.monsters.findIndex((m) => m === null);
  if (emptyIdx < 0) {
    newState.log.push(makeLog(newState, pending.owner, 'info',
      '場上沒有空位，無法特殊召喚！'));
    newState.pendingSpecialSummon = undefined;
    return newState;
  }

  const card = field.hand[chosenHandIndex];
  if (!card || card.cardCategory !== 'monster') {
    newState.pendingSpecialSummon = undefined;
    return newState;
  }

  field.hand.splice(chosenHandIndex, 1);
  const lvl = field.cardLevels?.[card.id] || 1;
  const scale = 1 + 0.1 * (lvl - 1);
  const fm: FieldMonster = {
    cardId: card.id,
    definition: card,
    playerCardLevel: lvl,
    position: 'attack',
    currentAtk: Math.round(card.baseAtk * scale),
    currentDef: Math.round(card.baseDef * scale),
    canAttack: true,
    hasAttacked: false,
    attackCount: 0,
    justSummoned: true,
    turnBuffs: [],
    effectCooldowns: {},
    faceUp: true,
  };
  field.monsters[emptyIdx] = fm;
  newState.log.push(makeLog(newState, pending.owner, 'summon',
    `${card.name} 從手牌特殊召喚！(ATK:${fm.currentAtk})`));

  // Fire the summoned monster's on_summon + continuous effects (bug fix:
  // previously special-summoned monsters never ran their on_summon chain).
  const effectLogs = processOnSummonEffects(newState, pending.owner, fm);
  newState.log.push(...effectLogs);

  newState.pendingSpecialSummon = undefined;
  checkWinCondition(newState);
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
  const maxAttacks = hasBuff(attacker, 'double_attack') ? 2 : 1;
  if (attacker.attackCount >= maxAttacks) return newState;
  if (!attacker.canAttack) return newState;

  // First player cannot attack on turn 1 (Yu-Gi-Oh standard rule).
  if (newState.turn === 1 && attackerOwner === newState.firstPlayer) {
    return newState;
  }

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
    attacker.attackCount++;
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
  const attackedLogs = processOnAttackedEffects(newState, defenderOwner, defender, attacker);
  newState.log.push(...attackedLogs);

  // on_attacked effects may have removed the defender (e.g. return_to_hand) — re-check
  if (defenderField.monsters[targetZone] !== defender) {
    attacker.hasAttacked = true;
    attacker.attackCount++;
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
      if (!hasBuff(defender, 'protect')) {
        const destroyLogs = processOnDestroyEffects(newState, defenderOwner, defender);
        newState.log.push(...destroyLogs);
        sendToGraveyard(defenderField, targetZone);
      } else {
        newState.log.push(makeLog(newState, defenderOwner, 'info',
          `${defender.definition.name} 受到破壞保護，免於被摧毀！`));
      }
    } else if (diff < 0) {
      attackerField.lp = Math.max(0, attackerField.lp - Math.abs(diff));
      newState.log.push(makeLog(newState, defenderOwner, 'attack',
        `${defender.definition.name}(${defender.currentAtk}) 反擊破壞 ${attacker.definition.name}(${attacker.currentAtk})！傷害: ${Math.abs(diff)}`));
      if (!hasBuff(attacker, 'protect')) {
        const destroyLogs = processOnDestroyEffects(newState, attackerOwner, attacker);
        newState.log.push(...destroyLogs);
        sendToGraveyard(attackerField, attackerZone);
      } else {
        newState.log.push(makeLog(newState, attackerOwner, 'info',
          `${attacker.definition.name} 受到破壞保護，免於被摧毀！`));
      }
    } else {
      newState.log.push(makeLog(newState, attackerOwner, 'attack',
        `${attacker.definition.name} 與 ${defender.definition.name} 同歸於盡！`));
      if (!hasBuff(attacker, 'protect')) {
        const destroyLogs1 = processOnDestroyEffects(newState, attackerOwner, attacker);
        newState.log.push(...destroyLogs1);
        sendToGraveyard(attackerField, attackerZone);
      } else {
        newState.log.push(makeLog(newState, attackerOwner, 'info',
          `${attacker.definition.name} 受到破壞保護，免於被摧毀！`));
      }
      if (!hasBuff(defender, 'protect')) {
        const destroyLogs2 = processOnDestroyEffects(newState, defenderOwner, defender);
        newState.log.push(...destroyLogs2);
        sendToGraveyard(defenderField, targetZone);
      } else {
        newState.log.push(makeLog(newState, defenderOwner, 'info',
          `${defender.definition.name} 受到破壞保護，免於被摧毀！`));
      }
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
      if (!hasBuff(defender, 'protect')) {
        const destroyLogs = processOnDestroyEffects(newState, defenderOwner, defender);
        newState.log.push(...destroyLogs);
        sendToGraveyard(defenderField, targetZone);
      } else {
        newState.log.push(makeLog(newState, defenderOwner, 'info',
          `${defender.definition.name} 受到破壞保護，免於被摧毀！`));
      }
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
  attacker.attackCount++;
  checkWinCondition(newState);
  return newState;
}

// === AI Decision Making ===

export interface DuelAiAction {
  type: 'summon' | 'attack' | 'end_phase' | 'flip_summon';
  handIndex?: number;
  zoneIndex?: number;
  targetZone?: number;
  position?: MonsterPosition;
  tributeIndices?: number[];
}

// === Smart "worm combo" AI ===========================================
// This boss-tier strategy aggressively plays the worm chain:
//   蠕蟲卵 → search worm_1 → summon → die → worm_2 → die → worm_3 →
//   discard hand → worm_emperor → end-of-turn discard for huge LP burn.
// Also opportunistically plays 噩夢融合契約 to summon mainframe_worm
// (which then summons emperor + 終極戰爭機器).
//
// Priority for what to normal-summon (highest first):
//   1. nightmare_pact   — instantly chains to mainframe_worm + emperor + war machine
//   2. worm_egg         — searches worm_1 from deck (almost free tempo)
//   3. worm_spawner     — draws 2 cards (cycles to combo pieces)
//   4. worm_1           — kicks off the death-chain
//   5. worm_hunter      — solid 60 ATK + revives worm_1 on death (combo backup)
//   6. fallback         — best ATK monster the AI can normal-summon
const WORM_PRIORITY_IDS = [
  'worm_egg',
  'worm_spawner',
  'worm_1',
  'worm_hunter',
];

function chooseWormComboAction(state: DuelState): DuelAiAction {
  const field = state.enemy;

  if (state.currentPhase === 'main') {
    if (!field.hasNormalSummoned) {
      // === Priority 0: Tribute-summon 主機蠕蟲 if requirements on field ===
      // If 蠕蟲帝王 + 終極戰爭機器 are both on field and mainframe_worm is in hand,
      // tribute them to summon mainframe.
      const mainframeInHand = field.hand.findIndex((c) => c.id === 'mainframe_worm');
      if (mainframeInHand >= 0) {
        const emperorZone = field.monsters.findIndex((m) => m !== null && m.definition.id === 'worm_emperor');
        const warMachineZone = field.monsters.findIndex((m) => m !== null && m.definition.id === 'htc_20');
        if (emperorZone >= 0 && warMachineZone >= 0) {
          // Find a zone to place mainframe: prefer an empty zone, else one of the tributes
          const emptyZone = field.monsters.findIndex((m) => m === null);
          const targetZone = emptyZone >= 0 ? emptyZone : emperorZone;
          return {
            type: 'summon',
            handIndex: mainframeInHand,
            zoneIndex: targetZone,
            position: 'attack',
            tributeIndices: [emperorZone, warMachineZone],
          };
        }
      }

      // === Priority 1: Summon 終極戰爭機器 if 蠕蟲帝王 is already on field ===
      // This sets up the mainframe tribute combo.
      const emperorOnField = field.monsters.some((m) => m !== null && m.definition.id === 'worm_emperor');
      const warMachineInHand = field.hand.findIndex((c) => c.id === 'htc_20');
      if (emperorOnField && warMachineInHand >= 0) {
        const ownMonsters = field.monsters
          .map((m, i) => ({ m, i }))
          .filter((x) => x.m !== null);
        if (ownMonsters.length >= 2) {
          // Keep 蠕蟲帝王 — tribute 2 weakest non-emperor monsters
          const sacrificeCandidates = ownMonsters
            .filter((x) => x.m!.definition.id !== 'worm_emperor')
            .sort((a, b) => (a.m?.currentAtk || 0) - (b.m?.currentAtk || 0))
            .slice(0, 2)
            .map((x) => x.i);
          if (sacrificeCandidates.length >= 2) {
            const emptyZone = field.monsters.findIndex((m) => m === null);
            const targetZone = emptyZone >= 0 ? emptyZone : sacrificeCandidates[0];
            return {
              type: 'summon',
              handIndex: warMachineInHand,
              zoneIndex: targetZone,
              position: 'attack',
              tributeIndices: sacrificeCandidates,
            };
          }
        }
      }

      const summonable = field.hand
        .map((c, i) => ({ card: c, idx: i }))
        .filter((x) => x.card.cardCategory === 'monster' && !x.card.cannotNormalSummon);

      if (summonable.length > 0) {
        // Try priority IDs first
        let pick: { card: CardDefinition; idx: number } | null = null;
        for (const wantedId of WORM_PRIORITY_IDS) {
          const found = summonable.find((s) => s.card.id === wantedId);
          if (found) { pick = found; break; }
        }
        // Fallback: highest ATK that can be summoned with available tributes
        if (!pick) {
          const sortedByAtk = [...summonable].sort((a, b) => b.card.baseAtk - a.card.baseAtk);
          pick = sortedByAtk[0] || null;
        }

        if (pick) {
          const level = pick.card.level || 1;
          const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;
          const ownMonsters = field.monsters
            .map((m, i) => ({ m, i }))
            .filter((x) => x.m !== null);

          if (ownMonsters.length >= tributesNeeded) {
            const emptyZone = field.monsters.findIndex((m) => m === null);
            if (emptyZone >= 0 || tributesNeeded > 0) {
              // Don't tribute 蠕蟲帝王 for anything except mainframe — preserve for combo
              const tributes = ownMonsters
                .filter((x) => x.m!.definition.id !== 'worm_emperor' && x.m!.definition.id !== 'htc_20')
                .sort((a, b) => (a.m?.currentAtk || 0) - (b.m?.currentAtk || 0))
                .slice(0, tributesNeeded)
                .map((x) => x.i);
              // If we can't find enough non-essential tributes, fall back to cheapest
              if (tributes.length < tributesNeeded) {
                tributes.length = 0;
                ownMonsters
                  .sort((a, b) => (a.m?.currentAtk || 0) - (b.m?.currentAtk || 0))
                  .slice(0, tributesNeeded)
                  .forEach((x) => tributes.push(x.i));
              }
              const targetZone = emptyZone >= 0 ? emptyZone : tributes[0];
              return {
                type: 'summon',
                handIndex: pick.idx,
                zoneIndex: targetZone,
                position: 'attack',
                tributeIndices: tributes,
              };
            }
          }
        }
      }
    }

    // Flip face-down monsters before ending main phase
    for (let i = 0; i < MONSTER_ZONES; i++) {
      const m = field.monsters[i];
      if (m && !m.faceUp && m.position === 'facedown_defense') {
        return { type: 'flip_summon', zoneIndex: i };
      }
    }
    return { type: 'end_phase' };
  }

  if (state.currentPhase === 'battle') {
    if (state.turn === 1 && state.firstPlayer === 'enemy') {
      return { type: 'end_phase' };
    }
    // Same battle logic as standard but slightly more aggressive — always
    // attack into player's strongest if we'll trade or kill.
    for (let i = 0; i < MONSTER_ZONES; i++) {
      const m = field.monsters[i];
      if (!m || !m.faceUp || m.position !== 'attack') continue;
      const aiMaxAttacks = hasBuff(m, 'double_attack') ? 2 : 1;
      if (m.attackCount >= aiMaxAttacks) continue;

      const playerField = state.player;
      const targets = playerField.monsters
        .map((pm, pi) => ({ m: pm, i: pi }))
        .filter((x) => x.m !== null);

      if (targets.length === 0 || hasBuff(m, 'direct_attack')) {
        return { type: 'attack', zoneIndex: i, targetZone: -1 };
      }

      // Worm AI prefers to trade aggressively to TRIGGER on_destroy chains.
      // If our attacker is a worm in the chain, attack into anything to die.
      const isChainWorm = m.definition.id === 'worm_1' || m.definition.id === 'worm_2' || m.definition.id === 'worm_hunter';
      if (isChainWorm) {
        const strongest = [...targets].sort((a, b) => (b.m?.currentAtk || 0) - (a.m?.currentAtk || 0))[0];
        if (strongest) return { type: 'attack', zoneIndex: i, targetZone: strongest.i };
      }

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

      if (targets.length > 0 && m.currentAtk >= (targets[0].m?.currentAtk || 0)) {
        return { type: 'attack', zoneIndex: i, targetZone: targets[0].i };
      }
    }
    return { type: 'end_phase' };
  }

  return { type: 'end_phase' };
}

export function chooseDuelAiAction(state: DuelState): DuelAiAction {
  // Dispatch to specialized strategy if configured
  if (state.enemyAiStrategy === 'worm_combo') {
    return chooseWormComboAction(state);
  }

  const field = state.enemy;

  if (state.currentPhase === 'main') {
    if (!field.hasNormalSummoned) {
      const monsterCards = field.hand
        .map((c, i) => ({ card: c, idx: i }))
        .filter((x) => x.card.cardCategory === 'monster' && !x.card.cannotNormalSummon);

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

    // Flip any face-down monsters before ending main phase
    for (let i = 0; i < MONSTER_ZONES; i++) {
      const m = field.monsters[i];
      if (m && !m.faceUp && m.position === 'facedown_defense') {
        return { type: 'flip_summon', zoneIndex: i };
      }
    }

    return { type: 'end_phase' };
  }

  if (state.currentPhase === 'battle') {
    // First player cannot attack on turn 1.
    if (state.turn === 1 && state.firstPlayer === 'enemy') {
      return { type: 'end_phase' };
    }
    for (let i = 0; i < MONSTER_ZONES; i++) {
      const m = field.monsters[i];
      if (!m || !m.faceUp || m.position !== 'attack') continue;
      const aiMaxAttacks = hasBuff(m, 'double_attack') ? 2 : 1;
      if (m.attackCount >= aiMaxAttacks) continue;

      const playerField = state.player;
      const targets = playerField.monsters
        .map((pm, pi) => ({ m: pm, i: pi }))
        .filter((x) => x.m !== null);

      // Direct attack: if no targets or has direct_attack buff
      if (targets.length === 0 || hasBuff(m, 'direct_attack')) {
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

      // Smart suicide-prevention: only trade if we kill an equal-ATK opponent
      // AND we ourselves don't take ANY net loss bigger than 0. Otherwise skip
      // — kid-friendly AI shouldn't throw away cards into stronger defenders.
      // (Per design: "若手牌的攻擊力比對方低，就不會貿然發動攻擊")
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

    if (action.type === 'flip_summon' && action.zoneIndex !== undefined) {
      current = flipSummon(current, 'enemy', action.zoneIndex);
      if (current.status !== 'dueling') break;
      continue;
    }

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
  kind: 'summon' | 'attack' | 'phase_advance' | 'flip_summon' | 'done';
  action?: DuelAiAction;
} {
  if (state.currentPlayer !== 'enemy' || state.status !== 'dueling') {
    return { kind: 'done' };
  }
  if (state.currentPhase === 'draw') {
    return { kind: 'phase_advance' };
  }

  const action = chooseDuelAiAction(state);
  if (action.type === 'flip_summon') return { kind: 'flip_summon', action };
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
  kind: 'summon' | 'attack' | 'phase_advance' | 'flip_summon',
  action?: DuelAiAction
): DuelState {
  let current = cloneState(state);

  if (kind === 'flip_summon' && action && action.zoneIndex !== undefined) {
    current = flipSummon(current, 'enemy', action.zoneIndex);
    return current;
  }

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
  // Some monsters can ONLY be special-summoned (e.g. 蠕蟲二號、三號、帝王)
  if (card.cannotNormalSummon) return false;

  const level = card.level || 1;
  const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;
  const ownMonsters = field.monsters.filter((m) => m !== null).length;
  const emptyZones = field.monsters.filter((m) => m === null).length;

  if (tributesNeeded > ownMonsters) return false;
  if (tributesNeeded === 0 && emptyZones === 0) return false;

  // If card requires specific tribute card IDs, ensure ALL of those cards are on field
  if (card.requiredTributeCardIds && card.requiredTributeCardIds.length > 0) {
    const onFieldIds = new Set(field.monsters.filter((m) => m !== null).map((m) => m!.definition.id));
    for (const reqId of card.requiredTributeCardIds) {
      if (!onFieldIds.has(reqId)) return false;
    }
  }

  return true;
}

export function getTributesNeeded(card: CardDefinition): number {
  const level = card.level || 1;
  return level >= 7 ? 2 : level >= 5 ? 1 : 0;
}
