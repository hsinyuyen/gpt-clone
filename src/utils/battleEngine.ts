// Battle Engine - Turn-based battle state machine

import {
  BattleState,
  BattleCard,
  BattleLogEntry,
  CardAbility,
  ActiveEffect,
  SynergyBonus,
  CardDefinition,
  PlayerCard,
  PveOpponent,
} from '@/types/Card';
import {
  createBattleCard,
  detectSynergies,
  applySynergyBonuses,
  getEffectiveAtk,
  getEffectiveDef,
  isStunned,
  getShieldValue,
  processEffects,
} from './cardStats';
import { CARD_MAP } from '@/data/cards/pools';

// Initialize a PvE battle
export function initPveBattle(
  playerCards: PlayerCard[],
  opponent: PveOpponent
): BattleState {
  // Build player team
  const playerTeam: BattleCard[] = playerCards
    .map((pc) => {
      const def = CARD_MAP.get(pc.cardId);
      if (!def) return null;
      return createBattleCard(def, pc);
    })
    .filter(Boolean) as BattleCard[];

  // Build enemy team
  const enemyTeam: BattleCard[] = opponent.teamCardIds
    .map((cardId, i) => {
      const def = CARD_MAP.get(cardId);
      if (!def) return null;
      const fakePlayerCard: PlayerCard = {
        cardId,
        level: opponent.teamLevels[i] || 1,
        xp: 0,
        duplicateCount: 0,
        obtainedAt: '',
        isInDeck: true,
      };
      return createBattleCard(def, fakePlayerCard);
    })
    .filter(Boolean) as BattleCard[];

  // Detect synergies
  const playerDefs = playerTeam.map((c) => c.definition);
  const enemyDefs = enemyTeam.map((c) => c.definition);
  const playerSynergies = detectSynergies(playerDefs);
  const enemySynergies = detectSynergies(enemyDefs);

  // Apply synergy bonuses
  applySynergyBonuses(playerTeam, playerSynergies);
  applySynergyBonuses(enemyTeam, enemySynergies);

  return {
    id: `battle_${Date.now()}`,
    phase: 'battling',
    turn: 1,
    maxTurns: 30,
    playerTeam,
    playerActiveIndex: 0,
    enemyTeam,
    enemyActiveIndex: 0,
    battleLog: [],
    synergyBonuses: { player: playerSynergies, enemy: enemySynergies },
  };
}

// Initialize a PvP battle
export function initPvpBattle(
  player1Cards: PlayerCard[],
  player2Cards: PlayerCard[]
): BattleState {
  const team1 = player1Cards
    .map((pc) => {
      const def = CARD_MAP.get(pc.cardId);
      return def ? createBattleCard(def, pc) : null;
    })
    .filter(Boolean) as BattleCard[];

  const team2 = player2Cards
    .map((pc) => {
      const def = CARD_MAP.get(pc.cardId);
      return def ? createBattleCard(def, pc) : null;
    })
    .filter(Boolean) as BattleCard[];

  const syn1 = detectSynergies(team1.map((c) => c.definition));
  const syn2 = detectSynergies(team2.map((c) => c.definition));
  applySynergyBonuses(team1, syn1);
  applySynergyBonuses(team2, syn2);

  return {
    id: `pvp_${Date.now()}`,
    phase: 'battling',
    turn: 1,
    maxTurns: 30,
    playerTeam: team1,
    playerActiveIndex: 0,
    enemyTeam: team2,
    enemyActiveIndex: 0,
    battleLog: [],
    synergyBonuses: { player: syn1, enemy: syn2 },
  };
}

// Calculate damage
export function calculateDamage(
  attacker: BattleCard,
  defender: BattleCard,
  ability: CardAbility
): number {
  if (ability.damage <= 0) return 0;

  const atk = getEffectiveAtk(attacker);
  const def = getEffectiveDef(defender);
  const ratio = Math.max(0.5, atk / Math.max(1, def));
  const variance = 0.9 + Math.random() * 0.2;
  const shield = getShieldValue(defender);

  let damage = Math.round(ability.damage * ratio * variance);
  damage = Math.max(1, damage - shield);

  return damage;
}

// Execute an ability
export function executeAbility(
  state: BattleState,
  actor: 'player' | 'enemy',
  abilityId: string
): BattleState {
  const newState = { ...state, battleLog: [...state.battleLog] };

  const attackerTeam = actor === 'player' ? newState.playerTeam : newState.enemyTeam;
  const defenderTeam = actor === 'player' ? newState.enemyTeam : newState.playerTeam;
  const attackerIdx = actor === 'player' ? newState.playerActiveIndex : newState.enemyActiveIndex;
  const defenderIdx = actor === 'player' ? newState.enemyActiveIndex : newState.playerActiveIndex;

  const attacker = attackerTeam[attackerIdx];
  const defender = defenderTeam[defenderIdx];

  if (!attacker || attacker.isDefeated) return newState;

  // Check stun
  if (isStunned(attacker)) {
    newState.battleLog.push({
      turn: newState.turn,
      actor,
      cardName: attacker.definition.name,
      action: '暈眩中',
      message: `${attacker.definition.name} 被暈眩了，無法行動！`,
    });
    return newState;
  }

  const ability = attacker.definition.abilities.find((a) => a.id === abilityId);
  if (!ability) return newState;

  // Check cooldown
  if ((attacker.abilityCooldowns[abilityId] || 0) > 0) return newState;

  // Set cooldown
  attacker.abilityCooldowns[abilityId] = ability.cooldown;

  const logEntry: BattleLogEntry = {
    turn: newState.turn,
    actor,
    cardName: attacker.definition.name,
    action: ability.name,
    message: '',
  };

  // Apply damage
  if (ability.damage > 0) {
    const damage = calculateDamage(attacker, defender, ability);
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    logEntry.damage = damage;
    logEntry.message = `${attacker.definition.name} 使用了 ${ability.name}，對 ${defender.definition.name} 造成 ${damage} 點傷害！`;

    if (defender.currentHp <= 0) {
      defender.isDefeated = true;
      logEntry.message += ` ${defender.definition.name} 被擊敗了！`;
    }
  }

  // Apply effect
  if (ability.effect) {
    const eff = ability.effect;
    const target = eff.target === 'enemy' ? defender : attacker;

    const newEffect: ActiveEffect = {
      effectType: eff.type,
      value: eff.value,
      turnsRemaining: eff.duration,
      sourceCardId: attacker.cardId,
    };

    target.activeEffects.push(newEffect);

    if (ability.damage <= 0) {
      const effectDesc = getEffectDescription(eff.type);
      logEntry.message = `${attacker.definition.name} 使用了 ${ability.name}！${effectDesc}`;
      logEntry.effect = effectDesc;
    }
  }

  newState.battleLog.push(logEntry);
  return newState;
}

// Switch active card
export function switchCard(
  state: BattleState,
  actor: 'player' | 'enemy',
  newIndex: number
): BattleState {
  const newState = { ...state, battleLog: [...state.battleLog] };

  const team = actor === 'player' ? newState.playerTeam : newState.enemyTeam;
  if (newIndex < 0 || newIndex >= team.length || team[newIndex].isDefeated) {
    return newState;
  }

  if (actor === 'player') {
    newState.playerActiveIndex = newIndex;
  } else {
    newState.enemyActiveIndex = newIndex;
  }

  newState.battleLog.push({
    turn: newState.turn,
    actor,
    cardName: team[newIndex].definition.name,
    action: '上場',
    message: `${team[newIndex].definition.name} 上場了！`,
  });

  return newState;
}

// End of turn processing
export function endTurn(state: BattleState): BattleState {
  const newState = { ...state, battleLog: [...state.battleLog] };

  // Process effects for all active cards
  const allCards = [...newState.playerTeam, ...newState.enemyTeam];
  for (const card of allCards) {
    if (card.isDefeated) continue;

    const { messages } = processEffects(card);
    for (const msg of messages) {
      newState.battleLog.push({
        turn: newState.turn,
        actor: newState.playerTeam.includes(card) ? 'player' : 'enemy',
        cardName: card.definition.name,
        action: '效果',
        message: msg,
      });
    }

    // Reduce cooldowns
    for (const abilityId of Object.keys(card.abilityCooldowns)) {
      if (card.abilityCooldowns[abilityId] > 0) {
        card.abilityCooldowns[abilityId]--;
      }
    }
  }

  // Auto-switch if active card defeated
  if (newState.playerTeam[newState.playerActiveIndex]?.isDefeated) {
    const nextAlive = newState.playerTeam.findIndex((c) => !c.isDefeated);
    if (nextAlive >= 0) {
      newState.playerActiveIndex = nextAlive;
      newState.battleLog.push({
        turn: newState.turn,
        actor: 'player',
        cardName: newState.playerTeam[nextAlive].definition.name,
        action: '自動上場',
        message: `${newState.playerTeam[nextAlive].definition.name} 自動上場了！`,
      });
    }
  }

  if (newState.enemyTeam[newState.enemyActiveIndex]?.isDefeated) {
    const nextAlive = newState.enemyTeam.findIndex((c) => !c.isDefeated);
    if (nextAlive >= 0) {
      newState.enemyActiveIndex = nextAlive;
      newState.battleLog.push({
        turn: newState.turn,
        actor: 'enemy',
        cardName: newState.enemyTeam[nextAlive].definition.name,
        action: '自動上場',
        message: `${newState.enemyTeam[nextAlive].definition.name} 自動上場了！`,
      });
    }
  }

  // Check win/lose conditions
  const playerAllDefeated = newState.playerTeam.every((c) => c.isDefeated);
  const enemyAllDefeated = newState.enemyTeam.every((c) => c.isDefeated);

  if (enemyAllDefeated) {
    newState.phase = 'victory';
  } else if (playerAllDefeated) {
    newState.phase = 'defeat';
  } else if (newState.turn >= newState.maxTurns) {
    // Timeout: compare remaining HP
    const playerHp = newState.playerTeam.reduce((s, c) => s + c.currentHp, 0);
    const enemyHp = newState.enemyTeam.reduce((s, c) => s + c.currentHp, 0);
    newState.phase = playerHp >= enemyHp ? 'victory' : 'defeat';
  }

  newState.turn++;
  return newState;
}

// Determine turn order (who goes first based on speed)
export function getTurnOrder(
  playerCard: BattleCard,
  enemyCard: BattleCard
): 'player' | 'enemy' {
  if (playerCard.spd > enemyCard.spd) return 'player';
  if (enemyCard.spd > playerCard.spd) return 'enemy';
  return Math.random() < 0.5 ? 'player' : 'enemy';
}

function getEffectDescription(type: string): string {
  switch (type) {
    case 'heal': return '恢復了生命值！';
    case 'shield': return '獲得了護盾保護！';
    case 'buff_atk': return '攻擊力提升了！';
    case 'buff_def': return '防禦力提升了！';
    case 'debuff_atk': return '敵方攻擊力下降了！';
    case 'debuff_def': return '敵方防禦力下降了！';
    case 'stun': return '敵方被暈眩了！';
    case 'dot': return '敵方中毒了！';
    default: return '';
  }
}
