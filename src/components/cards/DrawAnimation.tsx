// Gacha draw animation - terminal style reveal
import { useState, useEffect } from 'react';
import { CardDefinition } from '@/types/Card';
import { getRarityColor, getRarityLabel, getElementEmoji } from '@/utils/cardStats';

interface DrawAnimationProps {
  cards: CardDefinition[];
  onComplete: () => void;
}

export default function DrawAnimation({ cards, onComplete }: DrawAnimationProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [isRevealing, setIsRevealing] = useState(true);

  useEffect(() => {
    if (revealedCount < cards.length) {
      const timer = setTimeout(() => {
        setRevealedCount((prev) => prev + 1);
      }, cards.length === 1 ? 800 : 300);
      return () => clearTimeout(timer);
    } else {
      setIsRevealing(false);
    }
  }, [revealedCount, cards.length]);

  const getBorderGlow = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return 'border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]';
      case 'epic': return 'border-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.4)]';
      case 'rare': return 'border-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.3)]';
      default: return 'border-gray-500';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--terminal-color)' }}>
        {isRevealing ? '>>> 抽卡中...' : '>>> 抽卡完成！'}
      </h2>

      <div className="flex flex-wrap justify-center gap-3 max-w-4xl mb-8">
        {cards.map((card, i) => {
          const revealed = i < revealedCount;
          return (
            <div
              key={`${card.id}_${i}`}
              className={`w-28 h-40 rounded-lg border-2 transition-all duration-500 flex flex-col items-center justify-center p-2 ${
                revealed
                  ? `${getBorderGlow(card.rarity)} bg-gray-900`
                  : 'border-gray-700 bg-gray-800'
              }`}
            >
              {revealed ? (
                <>
                  <span className={`text-xs mb-1 ${getRarityColor(card.rarity)}`}>
                    {getRarityLabel(card.rarity)}
                  </span>
                  <span className="text-3xl mb-1">{card.emoji}</span>
                  <span className="text-xs font-bold text-center" style={{ color: 'var(--terminal-color)' }}>
                    {card.name}
                  </span>
                  <span className="text-xs mt-1">{getElementEmoji(card.element)}</span>
                </>
              ) : (
                <span className="text-2xl text-gray-600 animate-pulse">？</span>
              )}
            </div>
          );
        })}
      </div>

      {!isRevealing && (
        <button
          onClick={onComplete}
          className="px-6 py-2 border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
          style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
        >
          確認
        </button>
      )}
    </div>
  );
}
