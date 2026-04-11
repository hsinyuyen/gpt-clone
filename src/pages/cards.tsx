// Card collection page - view cards, strengthen
// Deck management has moved to the /decks dashboard.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import CoinDisplay from '@/components/CoinDisplay';
import CardGrid from '@/components/cards/CardGrid';

export default function CardsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { collection, isLoading: cardsLoading, getCardDef, activeDeck } = useCards();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || cardsLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  const collectionCards = (collection?.cards || [])
    .map((pc) => ({
      definition: getCardDef(pc.cardId)!,
      playerCard: pc,
    }))
    .filter((c) => c.definition);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-sm hover:underline"
              style={{ color: 'var(--terminal-color)' }}
            >
              ← 返回
            </button>
            <h1 className="text-xl font-bold" style={{ color: 'var(--terminal-color)' }}>
              🃏 卡牌收藏
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <CoinDisplay />
            <button
              onClick={() => router.push('/card-draw')}
              className="px-3 py-1 text-sm border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              🎰 抽卡
            </button>
            <button
              onClick={() => router.push('/decks')}
              className="px-3 py-1 text-sm border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              🗂️ 牌組
            </button>
            <button
              onClick={() => router.push('/battle')}
              className="px-3 py-1 text-sm border-2 rounded font-bold transition-colors hover:bg-red-600 hover:text-white"
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              ⚔️ 對戰
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Active deck strip */}
        <div className="mb-4 flex items-center justify-between p-3 border border-gray-700 rounded bg-gray-900/40">
          <div className="text-sm">
            <span className="text-gray-400">出戰牌組：</span>
            <span className="text-white font-bold ml-1">
              {activeDeck?.name || '（尚未設定）'}
            </span>
            <span className="text-gray-400 text-xs ml-2">
              ({activeDeck?.cardIds.length || 0} 張)
            </span>
          </div>
          <button
            onClick={() => router.push('/decks')}
            className="px-3 py-1 text-xs border border-gray-600 rounded hover:border-[var(--terminal-color)] hover:text-[var(--terminal-color)] transition-colors"
          >
            管理牌組 →
          </button>
        </div>

        <div className="text-sm text-gray-400 mb-3">
          📦 我的收藏 ({collectionCards.length} 張)
        </div>
        <CardGrid cards={collectionCards} />
      </div>
    </div>
  );
}
