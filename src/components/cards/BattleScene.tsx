// Main battle UI component
import { useState } from 'react';
import { BattleState, BattleCard, CardAbility } from '@/types/Card';
import { getEffectiveAtk, getEffectiveDef, getShieldValue, isStunned, getRarityColor } from '@/utils/cardStats';
import BattleLog from './BattleLog';
import SynergyIndicator from './SynergyIndicator';

interface BattleSceneProps {
  state: BattleState;
  onUseAbility: (abilityId: string) => void;
  onSwitchCard: (index: number) => void;
  isPlayerTurn: boolean;
  isProcessing: boolean;
}

function HpBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = Math.max(0, (current / max) * 100);
  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#eab308' : '#ef4444';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span>{current}/{max}</span>
      </div>
      <div className="w-full bg-gray-800 rounded h-3">
        <div className="h-3 rounded transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function BattleCardDisplay({ card, isEnemy, isActive }: { card: BattleCard; isEnemy: boolean; isActive: boolean }) {
  const shield = getShieldValue(card);
  const stunned = isStunned(card);

  return (
    <div
      className={`p-3 rounded border ${
        isActive ? 'border-[var(--terminal-color)] bg-gray-900' : 'border-gray-700 bg-gray-900/50 opacity-60'
      } ${card.isDefeated ? 'opacity-30 line-through' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{card.definition.emoji}</span>
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color: 'var(--terminal-color)' }}>
            {card.definition.name}
          </div>
          <div className="text-xs text-gray-400">Lv.{card.level}</div>
        </div>
        {stunned && <span className="text-xs text-yellow-400">💫 暈眩</span>}
        {shield > 0 && <span className="text-xs text-blue-400">🛡️ {shield}</span>}
      </div>
      <HpBar current={card.currentHp} max={card.maxHp} label="HP" />
      {isActive && !card.isDefeated && (
        <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
          <span className="text-orange-400">ATK {getEffectiveAtk(card)}</span>
          <span className="text-blue-400">DEF {getEffectiveDef(card)}</span>
        </div>
      )}
      {card.activeEffects.length > 0 && !card.isDefeated && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {card.activeEffects.map((e, i) => (
            <span key={i} className="text-xs px-1 bg-purple-900/50 rounded text-purple-300">
              {e.effectType} ({e.turnsRemaining})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BattleScene({ state, onUseAbility, onSwitchCard, isPlayerTurn, isProcessing }: BattleSceneProps) {
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const playerActive = state.playerTeam[state.playerActiveIndex];
  const enemyActive = state.enemyTeam[state.enemyActiveIndex];

  const availableAbilities = playerActive?.definition.abilities.filter(
    (a) => (playerActive.abilityCooldowns[a.id] || 0) <= 0
  ) || [];

  return (
    <div className="flex flex-col h-full">
      {/* Turn indicator */}
      <div className="text-center py-2 border-b border-gray-700 mb-3">
        <span className="text-sm" style={{ color: 'var(--terminal-color)' }}>
          回合 {state.turn}/{state.maxTurns}
          {isPlayerTurn ? ' — 你的回合' : ' — 對手回合'}
        </span>
      </div>

      {/* Synergy display */}
      {(state.synergyBonuses.player.length > 0 || state.synergyBonuses.enemy.length > 0) && (
        <div className="flex justify-between mb-2 px-2">
          <SynergyIndicator synergies={state.synergyBonuses.player} label="我方" />
          <SynergyIndicator synergies={state.synergyBonuses.enemy} label="敵方" />
        </div>
      )}

      {/* Enemy side */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">{">>>"} 敵方陣容</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {state.enemyTeam.map((card, i) => (
            <BattleCardDisplay
              key={card.cardId}
              card={card}
              isEnemy
              isActive={i === state.enemyActiveIndex}
            />
          ))}
        </div>
      </div>

      {/* VS divider */}
      <div className="text-center text-2xl font-bold my-2" style={{ color: 'var(--terminal-color)' }}>
        ⚔️ VS ⚔️
      </div>

      {/* Player side */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">{">>>"} 我方陣容</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {state.playerTeam.map((card, i) => (
            <BattleCardDisplay
              key={card.cardId}
              card={card}
              isEnemy={false}
              isActive={i === state.playerActiveIndex}
            />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      {state.phase === 'battling' && isPlayerTurn && !isProcessing && (
        <div className="border-t border-gray-700 pt-3">
          <div className="text-xs text-gray-400 mb-2">{">>>"} 選擇行動</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {playerActive?.definition.abilities.map((ability) => {
              const onCooldown = (playerActive.abilityCooldowns[ability.id] || 0) > 0;
              const cd = playerActive.abilityCooldowns[ability.id] || 0;
              return (
                <button
                  key={ability.id}
                  onClick={() => !onCooldown && onUseAbility(ability.id)}
                  disabled={onCooldown || isStunned(playerActive)}
                  className={`p-2 rounded border text-left text-xs transition-colors ${
                    onCooldown
                      ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                      : 'border-[var(--terminal-color)] hover:bg-[var(--terminal-color)]/20'
                  }`}
                  style={!onCooldown ? { color: 'var(--terminal-color)' } : undefined}
                >
                  <div className="font-bold">{ability.name}</div>
                  <div className="text-gray-400">
                    {ability.damage > 0 ? `DMG ${ability.damage}` : '效果'}
                    {onCooldown && ` (CD: ${cd})`}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowSwitchMenu(!showSwitchMenu)}
            className="w-full py-1 px-3 rounded border border-gray-600 text-xs text-gray-400 hover:text-[var(--terminal-color)] hover:border-[var(--terminal-color)] transition-colors"
          >
            🔄 換卡
          </button>

          {showSwitchMenu && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {state.playerTeam.map((card, i) => {
                if (i === state.playerActiveIndex || card.isDefeated) return null;
                return (
                  <button
                    key={card.cardId}
                    onClick={() => {
                      onSwitchCard(i);
                      setShowSwitchMenu(false);
                    }}
                    className="p-2 rounded border border-gray-600 text-xs hover:border-[var(--terminal-color)] transition-colors"
                  >
                    {card.definition.emoji} {card.definition.name}
                    <div className="text-gray-400">HP {card.currentHp}/{card.maxHp}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isProcessing && (
        <div className="text-center py-4 animate-pulse" style={{ color: 'var(--terminal-color)' }}>
          處理中...
        </div>
      )}

      {/* Battle Log */}
      <BattleLog entries={state.battleLog} />
    </div>
  );
}
