// Battle AI - Simple decision logic for PvE and PvP defense

import { BattleState, BattleCard, CardAbility } from '@/types/Card';
import { isStunned } from './cardStats';

interface AiAction {
  type: 'ability' | 'switch';
  abilityId?: string;
  switchIndex?: number;
}

// Choose an action for the AI opponent
export function chooseAiAction(state: BattleState): AiAction {
  const activeCard = state.enemyTeam[state.enemyActiveIndex];
  if (!activeCard || activeCard.isDefeated) {
    // Try to switch to alive card
    const aliveIdx = state.enemyTeam.findIndex((c) => !c.isDefeated);
    return aliveIdx >= 0
      ? { type: 'switch', switchIndex: aliveIdx }
      : { type: 'ability', abilityId: activeCard?.definition.abilities[0]?.id };
  }

  if (isStunned(activeCard)) {
    return { type: 'ability', abilityId: activeCard.definition.abilities[0]?.id };
  }

  const playerActive = state.playerTeam[state.playerActiveIndex];
  const hpRatio = activeCard.currentHp / activeCard.maxHp;

  // Get available abilities (not on cooldown)
  const available = activeCard.definition.abilities.filter(
    (a) => (activeCard.abilityCooldowns[a.id] || 0) <= 0
  );

  if (available.length === 0) {
    return { type: 'ability', abilityId: activeCard.definition.abilities[0]?.id };
  }

  // Strategy based on HP
  if (hpRatio < 0.3) {
    // Low HP: prioritize heals/shields
    const healAbility = available.find(
      (a) => a.effect && (a.effect.type === 'heal' || a.effect.type === 'shield')
    );
    if (healAbility) {
      return { type: 'ability', abilityId: healAbility.id };
    }

    // Consider switching if there are healthier cards
    const healthierIdx = state.enemyTeam.findIndex(
      (c, i) => !c.isDefeated && i !== state.enemyActiveIndex && c.currentHp / c.maxHp > 0.5
    );
    if (healthierIdx >= 0 && Math.random() < 0.4) {
      return { type: 'switch', switchIndex: healthierIdx };
    }
  }

  if (hpRatio > 0.5 && playerActive) {
    // Healthy: prioritize high damage
    const damageAbilities = available
      .filter((a) => a.damage > 0)
      .sort((a, b) => b.damage - a.damage);

    if (damageAbilities.length > 0) {
      // Use strongest available, with some randomness
      const idx = Math.random() < 0.7 ? 0 : Math.min(1, damageAbilities.length - 1);
      return { type: 'ability', abilityId: damageAbilities[idx].id };
    }
  }

  // Medium HP: use debuffs or moderate attacks
  const debuffAbility = available.find(
    (a) => a.effect && (a.effect.type === 'debuff_atk' || a.effect.type === 'debuff_def' || a.effect.type === 'stun')
  );
  if (debuffAbility && Math.random() < 0.4) {
    return { type: 'ability', abilityId: debuffAbility.id };
  }

  // Default: use strongest available damage ability
  const bestDamage = available
    .filter((a) => a.damage > 0)
    .sort((a, b) => b.damage - a.damage);

  if (bestDamage.length > 0) {
    return { type: 'ability', abilityId: bestDamage[0].id };
  }

  // Fallback: use first available ability
  return { type: 'ability', abilityId: available[0].id };
}
