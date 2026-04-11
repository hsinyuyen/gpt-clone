// Card detail modal - full card info with stats, abilities, level up
import { useState } from 'react';
import { CardDefinition, PlayerCard } from '@/types/Card';
import { getRarityColor, getRarityLabel, getElementEmoji, scaledStat, xpToNextLevel } from '@/utils/cardStats';
import { useCards } from '@/contexts/CardContext';
import { useCoin } from '@/contexts/CoinContext';

interface CardDetailProps {
  definition: CardDefinition;
  playerCard?: PlayerCard;
  onClose: () => void;
}

export default function CardDetail({ definition, playerCard, onClose }: CardDetailProps) {
  const { strengthenWithCoins } = useCards();
  const { coins } = useCoin();
  const [strengthenMsg, setStrengthenMsg] = useState('');

  const level = playerCard?.level || 1;
  const rarityColor = getRarityColor(definition.rarity);
  const xpNeeded = xpToNextLevel(level);

  const handleStrengthen = () => {
    if (!playerCard) return;
    if (playerCard.level >= 10) {
      setStrengthenMsg('已達最高等級！');
      return;
    }
    if (coins < 50) {
      setStrengthenMsg('金幣不足！需要 50 ◆');
      return;
    }
    const success = strengthenWithCoins(definition.id);
    setStrengthenMsg(success ? '強化成功！+100 XP' : '強化失敗');
    setTimeout(() => setStrengthenMsg(''), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border-2 border-[var(--terminal-color)] rounded-lg max-w-2xl w-full max-h-[92vh] overflow-y-auto p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-3xl font-bold" style={{ color: 'var(--terminal-color)' }}>
              {definition.emoji} {definition.name}
            </h2>
            {definition.nameEn && (
              <p className="text-sm text-gray-500 mt-1">{definition.nameEn}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
        </div>

        {/* Rarity & Element */}
        <div className="flex gap-4 mb-5">
          <span className={`${rarityColor} text-base font-bold`}>{getRarityLabel(definition.rarity)} {definition.rarity.toUpperCase()}</span>
          <span className="text-base">{getElementEmoji(definition.element)} {definition.element}</span>
        </div>

        {/* Card image */}
        <div className="text-center my-5">
          {definition.imageUrl ? (
            <img
              src={definition.imageUrl}
              alt={definition.name}
              className="w-72 h-72 sm:w-80 sm:h-80 mx-auto rounded-lg object-cover shadow-lg"
              style={{ borderColor: 'var(--terminal-color)', borderWidth: '2px', borderStyle: 'solid' }}
            />
          ) : (
            <div className="text-9xl">{definition.emoji}</div>
          )}
        </div>

        {/* Description */}
        <p className="text-base text-gray-300 mb-5 italic leading-relaxed">{definition.description}</p>

        {/* Level & XP */}
        {playerCard && (
          <div className="mb-5 p-4 bg-black/50 rounded border border-gray-700">
            <div className="flex justify-between text-base mb-2">
              <span className="font-bold" style={{ color: 'var(--terminal-color)' }}>等級 {level}</span>
              <span className="text-gray-400">
                {level >= 10 ? 'MAX' : `${playerCard.xp} / ${xpNeeded} XP`}
              </span>
            </div>
            {level < 10 && (
              <div className="w-full bg-gray-800 rounded-full h-3">
                <div
                  className="h-3 rounded-full"
                  style={{
                    width: `${Math.min(100, (playerCard.xp / xpNeeded) * 100)}%`,
                    backgroundColor: 'var(--terminal-color)',
                  }}
                />
              </div>
            )}
            {playerCard.duplicateCount > 0 && (
              <div className="text-sm text-yellow-500 mt-2">重複卡片: +{playerCard.duplicateCount}</div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {[
            { label: 'ATK', base: definition.baseAtk, color: 'text-orange-400' },
            { label: 'DEF', base: definition.baseDef, color: 'text-blue-400' },
          ].map(({ label, base, color }) => (
            <div key={label} className="text-center p-3 bg-black/50 rounded border border-gray-700">
              <div className={`text-sm font-bold ${color}`}>{label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: 'var(--terminal-color)' }}>
                {scaledStat(base, level)}
              </div>
              {level > 1 && (
                <div className="text-xs text-gray-500 mt-1">基礎: {base}</div>
              )}
            </div>
          ))}
        </div>

        {/* Abilities */}
        <div className="mb-5">
          <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--terminal-color)' }}>技能</h3>
          {definition.abilities.map((ability) => (
            <div key={ability.id} className="p-3 mb-3 bg-black/50 rounded border border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold" style={{ color: 'var(--terminal-color)' }}>{ability.name}</span>
                <div className="flex gap-2 text-sm text-gray-400">
                  {ability.damage > 0 && <span className="text-red-400">DMG {ability.damage}</span>}
                  {ability.cooldown > 0 && <span>CD {ability.cooldown}</span>}
                </div>
              </div>
              <p className="text-sm text-gray-300 mt-2 leading-relaxed">{ability.description}</p>
              {ability.effect && (
                <div className="text-sm text-purple-400 mt-2">
                  效果: {ability.effect.type} +{ability.effect.value} ({ability.effect.duration} 回合)
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Synergy */}
        {definition.synergyBonus && (
          <div className="mb-5 p-4 bg-purple-900/30 rounded border border-purple-600">
            <h3 className="text-base font-bold text-purple-400 mb-2">🔗 套裝效果: {definition.synergyBonus.setName}</h3>
            <p className="text-sm text-purple-300 leading-relaxed">{definition.synergyBonus.bonusDescription}</p>
          </div>
        )}

        {/* Strengthen button */}
        {playerCard && level < 10 && (
          <div className="mt-5">
            <button
              onClick={handleStrengthen}
              disabled={coins < 50}
              className="w-full py-3 px-4 rounded font-bold text-base border-2 transition-colors hover:bg-[var(--terminal-color)] hover:text-black disabled:hover:bg-transparent disabled:hover:text-gray-500"
              style={{
                borderColor: coins >= 50 ? 'var(--terminal-color)' : '#555',
                color: coins >= 50 ? 'var(--terminal-color)' : '#555',
              }}
            >
              強化 (50 ◆ → +100 XP)
            </button>
            {strengthenMsg && (
              <p className="text-center text-base mt-2" style={{ color: 'var(--terminal-color)' }}>
                {strengthenMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
