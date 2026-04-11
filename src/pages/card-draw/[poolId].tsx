// Pool detail page — lore, featured cards, full card list
import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import { useCoin } from '@/contexts/CoinContext';
import CoinDisplay from '@/components/CoinDisplay';
import DrawAnimation from '@/components/cards/DrawAnimation';
import { ALL_POOLS } from '@/data/cards/pools';
import { CARD_MAP } from '@/data/cards/pools';
import { CardDefinition, CardRarity } from '@/types/Card';
import { getRarityColor, getRarityLabel, getElementEmoji } from '@/utils/cardStats';

const RARITY_ORDER: CardRarity[] = ['legendary', 'epic', 'rare', 'common'];

export default function PoolDetailPage() {
  const router = useRouter();
  const { poolId } = router.query;
  const { user, isLoading } = useAuth();
  const { drawSingle, drawMulti, collection } = useCards();
  const { canAfford } = useCoin();

  const pool = useMemo(() => {
    if (typeof poolId !== 'string') return undefined;
    return ALL_POOLS.find((p) => p.id === poolId);
  }, [poolId]);

  const [drawnCards, setDrawnCards] = useState<CardDefinition[] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [rarityFilter, setRarityFilter] = useState<CardRarity | 'all'>('all');

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  if (!pool) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <div className="text-lg mb-4">找不到卡池</div>
        <button
          onClick={() => router.push('/card-draw')}
          className="px-4 py-2 border rounded"
          style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
        >
          ← 返回抽卡
        </button>
      </div>
    );
  }

  const handleSingleDraw = async () => {
    if (isDrawing) return;
    if (!canAfford(pool.singleDrawCost)) {
      alert('金幣不足！');
      return;
    }
    setIsDrawing(true);
    const card = await drawSingle(pool.id);
    if (card) setDrawnCards([card]);
    setIsDrawing(false);
  };

  const handleMultiDraw = async () => {
    if (isDrawing) return;
    if (!canAfford(pool.multiDrawCost)) {
      alert('金幣不足！');
      return;
    }
    setIsDrawing(true);
    const cards = await drawMulti(pool.id);
    if (cards.length > 0) setDrawnCards(cards);
    setIsDrawing(false);
  };

  const theme = pool.theme || {
    gradientFrom: '#1e293b',
    gradientTo: '#334155',
    accent: '#fbbf24',
  };

  // All cards in pool, grouped by rarity
  const poolCards = pool.cardIds
    .map((id) => CARD_MAP.get(id))
    .filter((c): c is CardDefinition => Boolean(c));

  const filteredCards =
    rarityFilter === 'all' ? poolCards : poolCards.filter((c) => c.rarity === rarityFilter);

  const cardsByRarity = RARITY_ORDER.reduce<Record<CardRarity, CardDefinition[]>>(
    (acc, r) => {
      acc[r] = filteredCards.filter((c) => c.rarity === r);
      return acc;
    },
    { legendary: [], epic: [], rare: [], common: [] }
  );

  const rarityCount = {
    legendary: poolCards.filter((c) => c.rarity === 'legendary').length,
    epic: poolCards.filter((c) => c.rarity === 'epic').length,
    rare: poolCards.filter((c) => c.rarity === 'rare').length,
    common: poolCards.filter((c) => c.rarity === 'common').length,
  };

  const featuredIds = pool.featuredCardIds || [];
  const heroCard = featuredIds[0] ? CARD_MAP.get(featuredIds[0]) : undefined;
  const otherFeatured = featuredIds
    .slice(1)
    .map((id) => CARD_MAP.get(id))
    .filter((c): c is CardDefinition => Boolean(c));

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <div className="border-b border-gray-700 p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <button
            onClick={() => router.push('/card-draw')}
            className="text-sm hover:underline"
            style={{ color: 'var(--terminal-color)' }}
          >
            ← 返回抽卡
          </button>
          <CoinDisplay />
        </div>
      </div>

      {/* Hero section */}
      <div
        className="relative overflow-hidden border-b border-white/10"
        style={{
          background: `linear-gradient(135deg, ${theme.gradientFrom} 0%, ${theme.gradientTo} 100%)`,
        }}
      >
        {heroCard?.imageUrl && (
          <img
            src={heroCard.imageUrl}
            alt={heroCard.name}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.85) 100%)',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-12">
          {pool.type === 'event' && (
            <span
              className="inline-block text-[10px] px-2 py-1 rounded font-bold text-white mb-3"
              style={{ backgroundColor: theme.accent, color: '#000' }}
            >
              限定活動
            </span>
          )}
          {pool.tagline && (
            <div className="text-sm tracking-[0.3em] mb-2" style={{ color: theme.accent }}>
              {pool.tagline}
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-black mb-3 drop-shadow-lg">{pool.name}</h1>
          <p className="text-sm text-white/80 max-w-2xl mb-6">{pool.description}</p>
          {pool.lore && (
            <div
              className="text-xs text-white/70 max-w-2xl mb-6 italic border-l-2 pl-4"
              style={{ borderColor: theme.accent }}
            >
              {pool.lore}
            </div>
          )}

          {/* Stats bar */}
          <div className="flex flex-wrap gap-6 text-xs mb-6">
            <div>
              <div className="text-white/50">總卡牌</div>
              <div className="text-2xl font-bold" style={{ color: theme.accent }}>
                {poolCards.length}
              </div>
            </div>
            <div>
              <div className="text-white/50">傳說</div>
              <div className="text-2xl font-bold text-yellow-400">{rarityCount.legendary}</div>
            </div>
            <div>
              <div className="text-white/50">史詩</div>
              <div className="text-2xl font-bold text-purple-400">{rarityCount.epic}</div>
            </div>
            <div>
              <div className="text-white/50">稀有</div>
              <div className="text-2xl font-bold text-blue-400">{rarityCount.rare}</div>
            </div>
            <div>
              <div className="text-white/50">普通</div>
              <div className="text-2xl font-bold text-gray-300">{rarityCount.common}</div>
            </div>
          </div>

          {/* Draw buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSingleDraw}
              disabled={isDrawing || !canAfford(pool.singleDrawCost)}
              className="px-6 py-3 border-2 rounded-lg font-bold bg-black/50 backdrop-blur hover:bg-black/80 disabled:opacity-40 transition-all"
              style={{ borderColor: theme.accent, color: theme.accent }}
            >
              單抽 {pool.singleDrawCost} ◆
            </button>
            <button
              onClick={handleMultiDraw}
              disabled={isDrawing || !canAfford(pool.multiDrawCost)}
              className="px-6 py-3 border-2 rounded-lg font-bold bg-black/50 backdrop-blur hover:bg-black/80 disabled:opacity-40 transition-all"
              style={{ borderColor: theme.accent, color: theme.accent }}
            >
              十連抽 {pool.multiDrawCost} ◆
              <div className="text-[10px] opacity-70">保底稀有+</div>
            </button>
          </div>

          {collection && (
            <div className="text-[10px] text-white/50 mt-4">
              已抽 {collection.totalDraws} 次 | 保底計數 {collection.pityCounter}/10
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Featured cards showcase */}
        {featuredIds.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-bold mb-4 tracking-wider" style={{ color: theme.accent }}>
              ★ SIGNATURE CARDS
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {heroCard && (
                <FeaturedCardTile card={heroCard} hero accent={theme.accent} />
              )}
              {otherFeatured.slice(0, 4).map((c) => (
                <FeaturedCardTile key={c.id} card={c} accent={theme.accent} />
              ))}
            </div>
          </section>
        )}

        {/* Full card list */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold tracking-wider" style={{ color: theme.accent }}>
              ◆ ALL CARDS ({poolCards.length})
            </h2>
            <div className="flex gap-1 text-xs">
              {(['all', 'legendary', 'epic', 'rare', 'common'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRarityFilter(r)}
                  className={`px-2 py-1 border rounded transition-colors ${
                    rarityFilter === r
                      ? 'bg-white/10 border-white/60 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {r === 'all' ? '全部' : getRarityLabel(r as CardRarity)}
                </button>
              ))}
            </div>
          </div>

          {RARITY_ORDER.map((rarity) => {
            const cards = cardsByRarity[rarity];
            if (cards.length === 0) return null;
            return (
              <div key={rarity} className="mb-8">
                <div className={`text-xs font-bold mb-3 ${getRarityColor(rarity)}`}>
                  {getRarityLabel(rarity)} · {cards.length}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {cards.map((card) => (
                    <PoolCardRow key={card.id} card={card} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {drawnCards && (
        <DrawAnimation cards={drawnCards} onComplete={() => setDrawnCards(null)} />
      )}
    </div>
  );
}

// === Sub-components ===

function FeaturedCardTile({
  card,
  hero,
  accent,
}: {
  card: CardDefinition;
  hero?: boolean;
  accent: string;
}) {
  const { cardImageMap } = useCards();
  const img = card.imageUrl || cardImageMap[card.id] || '';

  return (
    <div
      className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 ${
        hero ? 'md:col-span-1 md:row-span-1' : ''
      }`}
      style={{
        borderColor: accent,
        boxShadow: hero ? `0 0 20px ${accent}55` : `0 0 8px ${accent}33`,
      }}
    >
      {img ? (
        <img src={img} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl bg-gray-900">
          {card.emoji}
        </div>
      )}
      <div className="absolute top-1 left-1 right-1 flex justify-between text-[10px]">
        <span className={`${getRarityColor(card.rarity)} font-bold bg-black/70 px-1 rounded`}>
          {getRarityLabel(card.rarity)}
        </span>
        <span className="bg-black/70 px-1 rounded">{getElementEmoji(card.element)}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent px-2 py-2">
        <div className="text-xs font-bold text-white truncate">
          {hero && <span style={{ color: accent }}>★ </span>}
          {card.name}
        </div>
        <div className="text-[10px] text-white/70 mt-0.5">
          ATK {card.baseAtk} · DEF {card.baseDef}
        </div>
      </div>
    </div>
  );
}

function PoolCardRow({ card }: { card: CardDefinition }) {
  const { cardImageMap } = useCards();
  const img = card.imageUrl || cardImageMap[card.id] || '';

  return (
    <div className="relative aspect-[3/4] rounded-lg border border-gray-700 bg-gray-900 overflow-hidden hover:border-gray-400 transition-colors">
      {img ? (
        <img src={img} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-4xl">
          {card.emoji}
        </div>
      )}
      <div className="absolute top-1 left-1 right-1 flex justify-between text-[10px]">
        <span className={`${getRarityColor(card.rarity)} font-bold bg-black/70 px-1 rounded`}>
          {getRarityLabel(card.rarity)}
        </span>
        <span className="bg-black/70 px-1 rounded">{getElementEmoji(card.element)}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent px-2 py-1.5">
        <div className="text-xs font-bold text-white truncate">{card.name}</div>
        <div className="text-[9px] text-white/60">
          ATK {card.baseAtk} · DEF {card.baseDef}
        </div>
      </div>
    </div>
  );
}
