// Card pool banner — hero art with featured cards
import { CardPool } from '@/types/Card';
import { useCards } from '@/contexts/CardContext';
import { CARD_MAP } from '@/data/cards/pools';
import { getElementEmoji } from '@/utils/cardStats';

interface PoolBannerProps {
  pool: CardPool;
  selected: boolean;
  onClick: () => void;
  onDetailClick?: () => void;
}

export default function PoolBanner({ pool, selected, onClick, onDetailClick }: PoolBannerProps) {
  const { cardImageMap } = useCards();
  const isEvent = pool.type === 'event';

  // Resolve featured cards — first one is the hero, rest are supporting art
  const featuredIds = pool.featuredCardIds || [];
  const heroCard = featuredIds[0] ? CARD_MAP.get(featuredIds[0]) : undefined;
  const supportingCards = featuredIds
    .slice(1, 5)
    .map((id) => CARD_MAP.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const resolveImage = (cardId: string, fallback: string): string => {
    return cardImageMap[cardId] || fallback || '';
  };

  const heroImage = heroCard ? resolveImage(heroCard.id, heroCard.imageUrl) : '';

  const gradientFrom = pool.theme?.gradientFrom || (isEvent ? '#4c1d95' : '#1e293b');
  const gradientTo = pool.theme?.gradientTo || (isEvent ? '#0891b2' : '#334155');
  const accent = pool.theme?.accent || (isEvent ? '#a855f7' : '#fbbf24');

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 transition-all ${
        selected
          ? 'border-[var(--terminal-color)] scale-[1.01] shadow-[0_0_25px_rgba(0,255,0,0.25)]'
          : 'border-gray-700 hover:border-gray-500'
      }`}
      style={{
        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
      }}
    >
      <button onClick={onClick} className="block w-full text-left">
        <div className="relative min-h-[220px] flex">
          {/* Hero art panel (left, 60%) */}
          <div className="relative flex-[3] overflow-hidden">
            {heroImage ? (
              <img
                src={heroImage}
                alt={heroCard?.name || pool.name}
                className="absolute inset-0 w-full h-full object-cover opacity-90"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-9xl opacity-60">
                {heroCard?.emoji || '🃏'}
              </div>
            )}

            {/* Hero dark overlay for text legibility */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.85) 100%)',
              }}
            />

            {/* Text layer */}
            <div className="relative p-5 flex flex-col justify-between h-full min-h-[220px]">
              <div>
                {isEvent && (
                  <span
                    className="inline-block text-[10px] px-2 py-0.5 rounded font-bold text-white mb-2"
                    style={{ backgroundColor: accent }}
                  >
                    限定活動
                  </span>
                )}
                {pool.tagline && (
                  <div className="text-xs mb-1 tracking-widest" style={{ color: accent }}>
                    {pool.tagline}
                  </div>
                )}
                <h3
                  className="text-2xl font-black tracking-wide drop-shadow-lg"
                  style={{ color: 'white' }}
                >
                  {pool.name}
                </h3>
                {heroCard && (
                  <div className="text-xs text-white/80 mt-1">
                    主打 ★ {heroCard.name}
                    <span className="ml-2">{getElementEmoji(heroCard.element)}</span>
                  </div>
                )}
                <p className="text-xs text-white/70 mt-2 max-w-sm leading-relaxed">
                  {pool.description}
                </p>
              </div>

              {/* Rate bar */}
              <div className="flex gap-3 text-[10px] mt-3">
                <span className="text-gray-300">普 {(pool.rates.common * 100).toFixed(0)}%</span>
                <span className="text-blue-300">稀 {(pool.rates.rare * 100).toFixed(0)}%</span>
                <span className="text-purple-300">史 {(pool.rates.epic * 100).toFixed(0)}%</span>
                <span className="text-yellow-300 font-bold">
                  傳 {(pool.rates.legendary * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Supporting cards strip (right, 40%) */}
          <div className="relative flex-[2] bg-black/50 border-l border-white/10 p-3">
            <div className="text-[10px] text-white/60 mb-2 tracking-wider">SIGNATURE</div>
            <div className="grid grid-cols-2 gap-2">
              {supportingCards.map((card) => {
                const img = resolveImage(card.id, card.imageUrl);
                return (
                  <div
                    key={card.id}
                    className="relative aspect-[3/4] rounded border border-white/20 bg-black/60 overflow-hidden"
                    style={{ boxShadow: `0 0 8px ${accent}40` }}
                  >
                    {img ? (
                      <img
                        src={img}
                        alt={card.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-3xl">
                        {card.emoji}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/75 text-[9px] text-white text-center px-1 py-0.5 truncate">
                      {card.name}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cost pill */}
            <div className="absolute bottom-3 right-3 text-right">
              <div
                className="text-xs font-bold"
                style={{ color: accent }}
              >
                單抽 {pool.singleDrawCost} ◆
              </div>
              <div className="text-[10px] text-white/60">
                十連 {pool.multiDrawCost} ◆
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Detail button (outside main button, positioned top-right) */}
      {onDetailClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDetailClick();
          }}
          className="absolute top-3 right-3 z-10 text-[10px] px-2 py-1 rounded border bg-black/60 backdrop-blur hover:bg-black/90 transition-colors"
          style={{ borderColor: accent, color: accent }}
        >
          詳情 →
        </button>
      )}

      {isEvent && pool.endDate && (
        <div className="bg-black/60 px-4 py-1.5 text-[10px] text-white/70 border-t border-white/10">
          活動期間：{pool.startDate?.slice(0, 10)} ~ {pool.endDate.slice(0, 10)}
        </div>
      )}
    </div>
  );
}
