// Single card display component (terminal/retro style)
import { CardDefinition, PlayerCard } from '@/types/Card';
import { getRarityColor, getRarityLabel, getElementEmoji, scaledStat } from '@/utils/cardStats';

interface CardTileProps {
  definition: CardDefinition;
  playerCard?: PlayerCard;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
}

export default function CardTile({ definition, playerCard, onClick, selected, compact }: CardTileProps) {
  const level = playerCard?.level || 1;
  const rarityColor = getRarityColor(definition.rarity);
  const rarityLabel = getRarityLabel(definition.rarity);
  const elementEmoji = getElementEmoji(definition.element);

  const borderColor = selected
    ? 'border-[var(--terminal-color)]'
    : definition.rarity === 'legendary'
    ? 'border-yellow-500'
    : definition.rarity === 'epic'
    ? 'border-purple-500'
    : definition.rarity === 'rare'
    ? 'border-blue-500'
    : 'border-gray-600';

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`p-2 border ${borderColor} rounded bg-black/50 hover:bg-black/80 transition-colors text-left w-full ${
          selected ? 'ring-1 ring-[var(--terminal-color)]' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center">
            {definition.imageUrl ? (
              <img src={definition.imageUrl} alt={definition.name} className="w-20 h-20 rounded object-cover" />
            ) : (
              <span className="text-3xl">{definition.emoji}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: 'var(--terminal-color)' }}>
              {definition.name}
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className={rarityColor}>{rarityLabel}</span>
              <span>{elementEmoji}</span>
              {playerCard && <span className="text-gray-400">Lv.{level}</span>}
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`p-3 border-2 ${borderColor} rounded-lg bg-black/60 hover:bg-black/90 transition-all text-left w-full ${
        selected ? 'ring-2 ring-[var(--terminal-color)] scale-105' : ''
      }`}
    >
      {/* Card header */}
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs ${rarityColor}`}>{rarityLabel}</span>
        <span className="text-xs">{elementEmoji}</span>
      </div>

      {/* Card art / emoji */}
      <div className="text-center text-4xl my-3">
        {definition.imageUrl ? (
          <img src={definition.imageUrl} alt={definition.name} className="w-48 h-48 mx-auto rounded-lg object-cover" />
        ) : (
          definition.emoji
        )}
      </div>

      {/* Card name */}
      <div className="text-center font-bold text-sm mb-1" style={{ color: 'var(--terminal-color)' }}>
        {definition.name}
      </div>

      {/* Level */}
      {playerCard && (
        <div className="text-center text-xs text-gray-400 mb-2">
          Lv.{level}
          {playerCard.duplicateCount > 0 && (
            <span className="ml-1 text-yellow-500">+{playerCard.duplicateCount}</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-orange-400 font-bold">ATK {scaledStat(definition.baseAtk, level)}</div>
        <div className="text-blue-400 font-bold">DEF {scaledStat(definition.baseDef, level)}</div>
      </div>

      {/* Synergy indicator */}
      {definition.synergySetId && (
        <div className="mt-2 text-xs text-center text-purple-400 truncate">
          🔗 {definition.synergyBonus?.setName}
        </div>
      )}
    </button>
  );
}
