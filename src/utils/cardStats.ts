// Card stat calculation helpers

import { CardDefinition, BattleCard, SynergyBonus, PlayerCard, ActiveEffect } from '@/types/Card';

// XP required to reach a given level (cumulative)
export function xpForLevel(level: number): number {
  let total = 0;
  for (let i = 2; i <= level; i++) {
    total += i * 50;
  }
  return total;
}

// XP needed from current level to next
export function xpToNextLevel(level: number): number {
  if (level >= 10) return 0;
  return (level + 1) * 50;
}

// Calculate scaled stat based on level
export function scaledStat(baseStat: number, level: number): number {
  return Math.round(baseStat * (1 + 0.1 * (level - 1)));
}

// Create a BattleCard from a CardDefinition and PlayerCard
export function createBattleCard(definition: CardDefinition, playerCard: PlayerCard): BattleCard {
  const level = playerCard.level;
  const hp = scaledStat(definition.baseHp, level);

  return {
    cardId: definition.id,
    definition,
    level,
    currentHp: hp,
    maxHp: hp,
    atk: scaledStat(definition.baseAtk, level),
    def: scaledStat(definition.baseDef, level),
    spd: scaledStat(definition.baseSpd, level),
    abilityCooldowns: {},
    activeEffects: [],
    isDefeated: false,
  };
}

// Apply synergy bonuses to battle cards
export function applySynergyBonuses(team: BattleCard[], synergies: SynergyBonus[]): void {
  for (const synergy of synergies) {
    const affectedCards = team.filter(
      (c) => c.definition.synergySetId === synergy.setId && !c.isDefeated
    );

    for (const card of affectedCards) {
      switch (synergy.bonusType) {
        case 'atk':
          card.atk = Math.round(card.atk * (1 + synergy.bonusValue / 100));
          break;
        case 'def':
          card.def = Math.round(card.def * (1 + synergy.bonusValue / 100));
          break;
        case 'hp':
          const hpBonus = Math.round(card.maxHp * synergy.bonusValue / 100);
          card.maxHp += hpBonus;
          card.currentHp += hpBonus;
          break;
        case 'spd':
          card.spd = Math.round(card.spd * (1 + synergy.bonusValue / 100));
          break;
      }
    }
  }
}

// Detect active synergies in a team
export function detectSynergies(cards: CardDefinition[]): SynergyBonus[] {
  const setCount = new Map<string, number>();
  const setBonuses = new Map<string, SynergyBonus[]>();

  for (const card of cards) {
    if (card.synergySetId && card.synergyBonus) {
      setCount.set(card.synergySetId, (setCount.get(card.synergySetId) || 0) + 1);
      if (!setBonuses.has(card.synergySetId)) {
        setBonuses.set(card.synergySetId, []);
      }
      // Collect unique bonuses
      const existing = setBonuses.get(card.synergySetId)!;
      if (!existing.find((b) => b.requiredCount === card.synergyBonus!.requiredCount)) {
        existing.push(card.synergyBonus);
      }
    }
  }

  const activeSynergies: SynergyBonus[] = [];
  setCount.forEach((count, setId) => {
    const bonuses = setBonuses.get(setId) || [];
    for (const bonus of bonuses) {
      if (count >= bonus.requiredCount) {
        activeSynergies.push(bonus);
      }
    }
  });

  return activeSynergies;
}

// Process active effects at end of turn
export function processEffects(card: BattleCard): { damage: number; healed: number; messages: string[] } {
  let damage = 0;
  let healed = 0;
  const messages: string[] = [];

  const remainingEffects: ActiveEffect[] = [];

  for (const effect of card.activeEffects) {
    switch (effect.effectType) {
      case 'dot':
        damage += effect.value;
        messages.push(`${card.definition.name} 受到 ${effect.value} 點持續傷害！`);
        break;
      case 'heal':
        healed += effect.value;
        messages.push(`${card.definition.name} 恢復了 ${effect.value} 點生命！`);
        break;
    }

    const remaining = { ...effect, turnsRemaining: effect.turnsRemaining - 1 };
    if (remaining.turnsRemaining > 0) {
      remainingEffects.push(remaining);
    }
  }

  card.activeEffects = remainingEffects;
  card.currentHp = Math.min(card.maxHp, Math.max(0, card.currentHp - damage + healed));

  if (card.currentHp <= 0) {
    card.isDefeated = true;
  }

  return { damage, healed, messages };
}

// Get effective ATK considering buffs/debuffs
export function getEffectiveAtk(card: BattleCard): number {
  let atk = card.atk;
  for (const effect of card.activeEffects) {
    if (effect.effectType === 'buff_atk') atk += effect.value;
    if (effect.effectType === 'debuff_atk') atk -= effect.value;
  }
  return Math.max(1, atk);
}

// Get effective DEF considering buffs/debuffs
export function getEffectiveDef(card: BattleCard): number {
  let def = card.def;
  for (const effect of card.activeEffects) {
    if (effect.effectType === 'buff_def') def += effect.value;
    if (effect.effectType === 'debuff_def') def -= effect.value;
  }
  return Math.max(1, def);
}

// Check if card is stunned
export function isStunned(card: BattleCard): boolean {
  return card.activeEffects.some((e) => e.effectType === 'stun' && e.turnsRemaining > 0);
}

// Get shield value
export function getShieldValue(card: BattleCard): number {
  return card.activeEffects
    .filter((e) => e.effectType === 'shield' && e.turnsRemaining > 0)
    .reduce((sum, e) => sum + e.value, 0);
}

// Rarity color mapping
export function getRarityColor(rarity: string): string {
  switch (rarity) {
    case 'legendary': return 'text-yellow-400';
    case 'epic': return 'text-purple-400';
    case 'rare': return 'text-blue-400';
    default: return 'text-gray-400';
  }
}

export function getRarityLabel(rarity: string): string {
  switch (rarity) {
    case 'legendary': return '★★★★';
    case 'epic': return '★★★';
    case 'rare': return '★★';
    default: return '★';
  }
}

export function getElementEmoji(element: string): string {
  switch (element) {
    case 'fire': return '🔥';
    case 'water': return '💧';
    case 'earth': return '🌍';
    case 'wind': return '🌬️';
    case 'electric': return '⚡';
    default: return '⭐';
  }
}
