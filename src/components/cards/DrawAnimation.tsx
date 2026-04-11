// Gacha draw animation - terminal style reveal
import { useState, useEffect } from 'react';
import { CardDefinition } from '@/types/Card';
import { useCards } from '@/contexts/CardContext';
import { getRarityColor, getRarityLabel, getElementEmoji } from '@/utils/cardStats';

interface DrawAnimationProps {
  cards: CardDefinition[];
  onComplete: () => void;
}

export default function DrawAnimation({ cards, onComplete }: DrawAnimationProps) {
  const { cardImageMap } = useCards();
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
      case 'legendary':
        return 'border-yellow-400 shadow-[0_0_25px_rgba(250,204,21,0.7)] animate-pulse';
      case 'epic':
        return 'border-purple-400 shadow-[0_0_18px_rgba(192,132,252,0.55)]';
      case 'rare':
        return 'border-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.4)]';
      default:
        return 'border-gray-500';
    }
  };

  /** Resolve the best image URL for a card — prefer the card def, fall back to
   *  the Firestore cardImageMap if the raw def had empty imageUrl. */
  const resolveImage = (card: CardDefinition): string => {
    return card.imageUrl || cardImageMap[card.id] || '';
  };

  const highestRarity = cards.reduce<string>((acc, c) => {
    const order = { common: 0, rare: 1, epic: 2, legendary: 3 } as const;
    return order[c.rarity as keyof typeof order] > order[acc as keyof typeof order]
      ? c.rarity
      : acc;
  }, 'common');

  const isSingle = cards.length === 1;

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--terminal-color)' }}>
        {isRevealing ? '>>> 抽卡中...' : '>>> 抽卡完成！'}
      </h2>

      {/* Single draw: big hero display */}
      {isSingle ? (
        <div className="mb-8">
          {(() => {
            const card = cards[0];
            const revealed = revealedCount > 0;
            const img = resolveImage(card);
            return (
              <div
                key={card.id}
                className={`w-64 h-96 rounded-xl border-4 transition-all duration-700 flex flex-col overflow-hidden ${
                  revealed
                    ? `${getBorderGlow(card.rarity)} bg-gradient-to-b from-gray-900 to-black`
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                {revealed ? (
                  <>
                    <div className="flex justify-between px-3 pt-2">
                      <span className={`text-sm font-bold ${getRarityColor(card.rarity)}`}>
                        {getRarityLabel(card.rarity)}
                      </span>
                      <span className="text-xl">{getElementEmoji(card.element)}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center px-3 py-2">
                      {img ? (
                        <img
                          src={img}
                          alt={card.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <span className="text-8xl">{card.emoji}</span>
                      )}
                    </div>
                    <div
                      className="text-center font-bold text-lg px-2 py-2 border-t border-gray-700"
                      style={{ color: 'var(--terminal-color)' }}
                    >
                      {card.name}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-6xl text-gray-600 animate-pulse">？</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        /* Multi-draw: grid */
        <div className="grid grid-cols-5 gap-3 max-w-4xl mb-8">
          {cards.map((card, i) => {
            const revealed = i < revealedCount;
            const img = resolveImage(card);
            return (
              <div
                key={`${card.id}_${i}`}
                className={`w-32 h-44 rounded-lg border-2 transition-all duration-500 flex flex-col overflow-hidden ${
                  revealed
                    ? `${getBorderGlow(card.rarity)} bg-gradient-to-b from-gray-900 to-black`
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                {revealed ? (
                  <>
                    <div className="flex justify-between px-1.5 pt-1">
                      <span className={`text-[10px] font-bold ${getRarityColor(card.rarity)}`}>
                        {getRarityLabel(card.rarity)}
                      </span>
                      <span className="text-xs">{getElementEmoji(card.element)}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center px-1 py-1">
                      {img ? (
                        <img
                          src={img}
                          alt={card.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <span className="text-4xl">{card.emoji}</span>
                      )}
                    </div>
                    <div
                      className="text-center text-[10px] font-bold px-1 py-1 border-t border-gray-700 truncate"
                      style={{ color: 'var(--terminal-color)' }}
                    >
                      {card.name}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-3xl text-gray-600 animate-pulse">？</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isRevealing && (
        <div className="flex flex-col items-center gap-3">
          {highestRarity === 'legendary' && (
            <div className="text-yellow-400 text-sm font-bold animate-pulse">
              ★ LEGENDARY DROP ★
            </div>
          )}
          <button
            onClick={onComplete}
            className="px-6 py-2 border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
            style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
          >
            確認
          </button>
        </div>
      )}
    </div>
  );
}
