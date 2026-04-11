// Card Strengthen System - coin-based card upgrade logic

import { PlayerCard, StrengthenResult, CardDefinition } from '@/types/Card';
import { scaledStat, xpToNextLevel } from './cardStats';

// Cost to strengthen at each level
export function strengthenCost(currentLevel: number): number {
  if (currentLevel >= 10) return 0;
  // Costs increase per level: 50, 75, 100, 125, ...
  return 50 + (currentLevel - 1) * 25;
}

// XP gained per strengthen attempt
export function strengthenXpGain(currentLevel: number): number {
  // Base 100 XP, scales slightly with level
  return 100 + (currentLevel - 1) * 10;
}

// Success rate for strengthening (higher levels = lower chance)
export function strengthenSuccessRate(currentLevel: number): number {
  // Level 1-3: 100%, Level 4-6: 80%, Level 7-9: 60%
  if (currentLevel <= 3) return 1.0;
  if (currentLevel <= 6) return 0.8;
  return 0.6;
}

// Attempt to strengthen a card with coins
export function attemptStrengthen(
  playerCard: PlayerCard,
  definition: CardDefinition,
  currentCoins: number
): { result: StrengthenResult; coinCost: number } {
  const level = playerCard.level;

  if (level >= 10) {
    return {
      result: {
        success: false,
        newLevel: level,
        newXp: playerCard.xp,
        atkGain: 0,
        defGain: 0,
        message: '已達最高等級！',
      },
      coinCost: 0,
    };
  }

  const cost = strengthenCost(level);
  if (currentCoins < cost) {
    return {
      result: {
        success: false,
        newLevel: level,
        newXp: playerCard.xp,
        atkGain: 0,
        defGain: 0,
        message: `金幣不足！需要 ${cost} ◆`,
      },
      coinCost: 0,
    };
  }

  const successRate = strengthenSuccessRate(level);
  const isSuccess = Math.random() < successRate;

  if (!isSuccess) {
    // Failed strengthen — still costs coins but gives partial XP
    const partialXp = Math.round(strengthenXpGain(level) * 0.3);
    return {
      result: {
        success: false,
        newLevel: level,
        newXp: playerCard.xp + partialXp,
        atkGain: 0,
        defGain: 0,
        message: `強化失敗！獲得 ${partialXp} XP 作為安慰`,
      },
      coinCost: cost,
    };
  }

  // Success — add full XP
  const xpGain = strengthenXpGain(level);
  let newXp = playerCard.xp + xpGain;
  let newLevel = level;
  const xpNeeded = xpToNextLevel(level);

  // Check if leveled up
  if (xpNeeded > 0 && newXp >= xpNeeded) {
    newLevel = Math.min(10, level + 1);
    newXp = newXp - xpNeeded;
  }

  const oldAtk = scaledStat(definition.baseAtk, level);
  const oldDef = scaledStat(definition.baseDef, level);
  const newAtk = scaledStat(definition.baseAtk, newLevel);
  const newDef = scaledStat(definition.baseDef, newLevel);

  const atkGain = newAtk - oldAtk;
  const defGain = newDef - oldDef;

  const levelUpMsg = newLevel > level
    ? ` 等級提升！Lv.${level} → Lv.${newLevel}`
    : '';

  return {
    result: {
      success: true,
      newLevel,
      newXp,
      atkGain,
      defGain,
      message: `強化成功！+${xpGain} XP${levelUpMsg}${atkGain > 0 ? ` ATK+${atkGain}` : ''}${defGain > 0 ? ` DEF+${defGain}` : ''}`,
    },
    coinCost: cost,
  };
}

// Feed duplicate cards for XP
export function feedDuplicate(
  playerCard: PlayerCard,
  definition: CardDefinition,
  duplicateRarity: string
): StrengthenResult {
  const xpByRarity: Record<string, number> = {
    common: 50,
    rare: 100,
    epic: 200,
    legendary: 500,
  };

  const xpGain = xpByRarity[duplicateRarity] || 50;
  let newXp = playerCard.xp + xpGain;
  let newLevel = playerCard.level;
  const xpNeeded = xpToNextLevel(newLevel);

  if (xpNeeded > 0 && newXp >= xpNeeded) {
    newLevel = Math.min(10, newLevel + 1);
    newXp = newXp - xpNeeded;
  }

  const atkGain = scaledStat(definition.baseAtk, newLevel) - scaledStat(definition.baseAtk, playerCard.level);
  const defGain = scaledStat(definition.baseDef, newLevel) - scaledStat(definition.baseDef, playerCard.level);

  return {
    success: true,
    newLevel,
    newXp,
    atkGain,
    defGain,
    message: `吸收重複卡片！+${xpGain} XP${newLevel > playerCard.level ? ` 等級提升！Lv.${newLevel}` : ''}`,
  };
}

// Calculate stats preview for next level
export function getStatsPreview(definition: CardDefinition, currentLevel: number) {
  const nextLevel = Math.min(10, currentLevel + 1);
  return {
    current: {
      atk: scaledStat(definition.baseAtk, currentLevel),
      def: scaledStat(definition.baseDef, currentLevel),
      hp: scaledStat(definition.baseHp, currentLevel),
    },
    next: {
      atk: scaledStat(definition.baseAtk, nextLevel),
      def: scaledStat(definition.baseDef, nextLevel),
      hp: scaledStat(definition.baseHp, nextLevel),
    },
    cost: strengthenCost(currentLevel),
    successRate: Math.round(strengthenSuccessRate(currentLevel) * 100),
  };
}
