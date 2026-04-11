// Card collection page - view cards, manage deck, strengthen
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import { useCoin } from '@/contexts/CoinContext';
import CoinDisplay from '@/components/CoinDisplay';
import CardGrid from '@/components/cards/CardGrid';
import { CARD_MAP } from '@/data/cards/pools';

type Tab = 'collection' | 'deck';

export default function CardsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { collection, isLoading: cardsLoading, updateDeck, getCardDef } = useCards();
  const { coins } = useCoin();
  const [activeTab, setActiveTab] = useState<Tab>('collection');
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (collection) {
      setSelectedDeckIds(collection.activeDeckCardIds);
    }
  }, [collection]);

  if (authLoading || cardsLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  const collectionCards = (collection?.cards || []).map((pc) => ({
    definition: getCardDef(pc.cardId)!,
    playerCard: pc,
  })).filter((c) => c.definition);

  const deckCards = collectionCards.filter((c) =>
    selectedDeckIds.includes(c.definition.id)
  );

  const handleDeckToggle = (cardId: string) => {
    setSelectedDeckIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= 20) return prev;
      return [...prev, cardId];
    });
  };

  const handleSaveDeck = () => {
    updateDeck(selectedDeckIds);
    alert('牌組已儲存！');
  };

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
          <div className="flex items-center gap-4">
            <CoinDisplay />
            <button
              onClick={() => router.push('/card-draw')}
              className="px-3 py-1 text-sm border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              抽卡
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

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex gap-4 mb-4">
          {[
            { id: 'collection' as Tab, label: `📦 收藏 (${collectionCards.length})` },
            { id: 'deck' as Tab, label: `🗂️ 牌組 (${selectedDeckIds.length}/20)` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm rounded-t border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[var(--terminal-color)]'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
              style={activeTab === tab.id ? { color: 'var(--terminal-color)' } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Collection Tab */}
        {activeTab === 'collection' && (
          <CardGrid cards={collectionCards} />
        )}

        {/* Deck Tab */}
        {activeTab === 'deck' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-400">
                點選卡牌來加入/移除牌組（最多 20 張）
              </p>
              <button
                onClick={handleSaveDeck}
                className="px-4 py-1 text-sm border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
                style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
              >
                💾 儲存牌組
              </button>
            </div>
            <CardGrid
              cards={collectionCards}
              selectionMode
              selectedCardIds={selectedDeckIds}
              onCardSelect={handleDeckToggle}
              maxSelection={20}
            />
          </div>
        )}
      </div>
    </div>
  );
}
