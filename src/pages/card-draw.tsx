// Card draw / gacha page
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import { useCoin } from '@/contexts/CoinContext';
import CoinDisplay from '@/components/CoinDisplay';
import PoolBanner from '@/components/cards/PoolBanner';
import DrawAnimation from '@/components/cards/DrawAnimation';
import { getActivePools } from '@/data/cards/pools';
import { CardDefinition } from '@/types/Card';

export default function CardDrawPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { drawSingle, drawMulti, collection } = useCards();
  const { coins, canAfford } = useCoin();

  const [selectedPoolId, setSelectedPoolId] = useState<string>('basic');
  const [drawnCards, setDrawnCards] = useState<CardDefinition[] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const pools = getActivePools();
  const selectedPool = pools.find((p) => p.id === selectedPoolId);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  const handleSingleDraw = async () => {
    if (!selectedPool || isDrawing) return;
    if (!canAfford(selectedPool.singleDrawCost)) {
      alert('金幣不足！');
      return;
    }
    setIsDrawing(true);
    const card = await drawSingle(selectedPoolId);
    if (card) {
      setDrawnCards([card]);
    }
    setIsDrawing(false);
  };

  const handleMultiDraw = async () => {
    if (!selectedPool || isDrawing) return;
    if (!canAfford(selectedPool.multiDrawCost)) {
      alert('金幣不足！');
      return;
    }
    setIsDrawing(true);
    const cards = await drawMulti(selectedPoolId);
    if (cards.length > 0) {
      setDrawnCards(cards);
    }
    setIsDrawing(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-700 p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/cards')}
              className="text-sm hover:underline"
              style={{ color: 'var(--terminal-color)' }}
            >
              ← 返回收藏
            </button>
            <h1 className="text-xl font-bold" style={{ color: 'var(--terminal-color)' }}>
              🎰 抽卡
            </h1>
          </div>
          <CoinDisplay />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Pity counter */}
        {collection && (
          <div className="text-xs text-gray-500 mb-4 text-right">
            已抽 {collection.totalDraws} 次 | 保底計數: {collection.pityCounter}/10
          </div>
        )}

        {/* Pool Selection */}
        <div className="space-y-4 mb-8">
          <h2 className="text-sm text-gray-400 mb-2">{">>>"}選擇卡池</h2>
          {pools.map((pool) => (
            <PoolBanner
              key={pool.id}
              pool={pool}
              selected={pool.id === selectedPoolId}
              onClick={() => setSelectedPoolId(pool.id)}
              onDetailClick={() => router.push(`/card-draw/${pool.id}`)}
            />
          ))}
        </div>

        {/* Draw Buttons */}
        {selectedPool && (
          <div className="flex gap-4 justify-center">
            <button
              onClick={handleSingleDraw}
              disabled={isDrawing || !canAfford(selectedPool.singleDrawCost)}
              className="px-8 py-3 border-2 rounded-lg font-bold text-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              style={{
                borderColor: 'var(--terminal-color)',
                color: 'var(--terminal-color)',
              }}
            >
              單抽 ({selectedPool.singleDrawCost} ◆)
            </button>
            <button
              onClick={handleMultiDraw}
              disabled={isDrawing || !canAfford(selectedPool.multiDrawCost)}
              className="px-8 py-3 border-2 rounded-lg font-bold text-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 bg-[var(--terminal-color)]/10"
              style={{
                borderColor: 'var(--terminal-color)',
                color: 'var(--terminal-color)',
              }}
            >
              十連抽 ({selectedPool.multiDrawCost} ◆)
              <div className="text-xs opacity-70">保底稀有+</div>
            </button>
          </div>
        )}

        {isDrawing && (
          <div className="text-center mt-8 animate-pulse" style={{ color: 'var(--terminal-color)' }}>
            抽卡中...
          </div>
        )}
      </div>

      {/* Draw Animation Overlay */}
      {drawnCards && (
        <DrawAnimation
          cards={drawnCards}
          onComplete={() => setDrawnCards(null)}
        />
      )}
    </div>
  );
}
