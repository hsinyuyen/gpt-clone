// Grid layout for card collection display
import { useState } from 'react';
import { CardDefinition, PlayerCard, CardRarity, CardElement } from '@/types/Card';
import CardTile from './CardTile';
import CardDetail from './CardDetail';

interface CardGridProps {
  cards: { definition: CardDefinition; playerCard?: PlayerCard }[];
  onCardSelect?: (cardId: string) => void;
  selectedCardIds?: string[];
  selectionMode?: boolean;
  maxSelection?: number;
}

export default function CardGrid({
  cards,
  onCardSelect,
  selectedCardIds = [],
  selectionMode = false,
  maxSelection = 20,
}: CardGridProps) {
  const [detailCard, setDetailCard] = useState<{ def: CardDefinition; pc?: PlayerCard } | null>(null);
  const [filterRarity, setFilterRarity] = useState<CardRarity | 'all'>('all');
  const [filterElement, setFilterElement] = useState<CardElement | 'all'>('all');
  const [sortBy, setSortBy] = useState<'rarity' | 'level' | 'element' | 'name'>('rarity');

  const rarityOrder: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };

  const filtered = cards.filter((c) => {
    if (filterRarity !== 'all' && c.definition.rarity !== filterRarity) return false;
    if (filterElement !== 'all' && c.definition.element !== filterElement) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'rarity':
        return (rarityOrder[a.definition.rarity] || 0) - (rarityOrder[b.definition.rarity] || 0);
      case 'level':
        return (b.playerCard?.level || 1) - (a.playerCard?.level || 1);
      case 'element':
        return a.definition.element.localeCompare(b.definition.element);
      case 'name':
        return a.definition.name.localeCompare(b.definition.name);
      default:
        return 0;
    }
  });

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={filterRarity}
          onChange={(e) => setFilterRarity(e.target.value as CardRarity | 'all')}
          className="bg-black border border-gray-600 rounded px-2 py-1 text-xs"
          style={{ color: 'var(--terminal-color)' }}
        >
          <option value="all">全部稀有度</option>
          <option value="legendary">傳說</option>
          <option value="epic">史詩</option>
          <option value="rare">稀有</option>
          <option value="common">普通</option>
        </select>

        <select
          value={filterElement}
          onChange={(e) => setFilterElement(e.target.value as CardElement | 'all')}
          className="bg-black border border-gray-600 rounded px-2 py-1 text-xs"
          style={{ color: 'var(--terminal-color)' }}
        >
          <option value="all">全部屬性</option>
          <option value="fire">🔥 火</option>
          <option value="water">💧 水</option>
          <option value="earth">🌍 地</option>
          <option value="wind">🌬️ 風</option>
          <option value="electric">⚡ 電</option>
          <option value="neutral">⭐ 中立</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-black border border-gray-600 rounded px-2 py-1 text-xs"
          style={{ color: 'var(--terminal-color)' }}
        >
          <option value="rarity">按稀有度排序</option>
          <option value="level">按等級排序</option>
          <option value="element">按屬性排序</option>
          <option value="name">按名稱排序</option>
        </select>

        {selectionMode && (
          <span className="text-xs self-center" style={{ color: 'var(--terminal-color)' }}>
            已選 {selectedCardIds.length}/{maxSelection}
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {sorted.map((card) => (
          <CardTile
            key={card.definition.id}
            definition={card.definition}
            playerCard={card.playerCard}
            selected={selectedCardIds.includes(card.definition.id)}
            onClick={() => {
              if (selectionMode && onCardSelect) {
                onCardSelect(card.definition.id);
              } else {
                setDetailCard({ def: card.definition, pc: card.playerCard });
              }
            }}
          />
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          沒有符合條件的卡牌
        </div>
      )}

      {/* Detail Modal */}
      {detailCard && (
        <CardDetail
          definition={detailCard.def}
          playerCard={detailCard.pc}
          onClose={() => setDetailCard(null)}
        />
      )}
    </div>
  );
}
