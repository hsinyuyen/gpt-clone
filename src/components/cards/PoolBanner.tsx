// Card pool banner display
import { CardPool } from '@/types/Card';

interface PoolBannerProps {
  pool: CardPool;
  selected: boolean;
  onClick: () => void;
}

export default function PoolBanner({ pool, selected, onClick }: PoolBannerProps) {
  const isEvent = pool.type === 'event';

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
        selected
          ? 'border-[var(--terminal-color)] bg-[var(--terminal-color)]/10'
          : isEvent
          ? 'border-purple-600 bg-purple-900/20 hover:bg-purple-900/30'
          : 'border-gray-600 bg-gray-800/50 hover:bg-gray-800/80'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold" style={{ color: 'var(--terminal-color)' }}>
              {pool.name}
            </h3>
            {isEvent && (
              <span className="text-xs px-2 py-0.5 bg-purple-600 rounded text-white">限定</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">{pool.description}</p>
        </div>
        <div className="text-right text-xs">
          <div style={{ color: 'var(--terminal-color)' }}>單抽: {pool.singleDrawCost} ◆</div>
          <div style={{ color: 'var(--terminal-color)' }}>十連: {pool.multiDrawCost} ◆</div>
        </div>
      </div>

      {/* Rates */}
      <div className="flex gap-3 mt-3 text-xs">
        <span className="text-gray-400">普通 {(pool.rates.common * 100).toFixed(0)}%</span>
        <span className="text-blue-400">稀有 {(pool.rates.rare * 100).toFixed(0)}%</span>
        <span className="text-purple-400">史詩 {(pool.rates.epic * 100).toFixed(0)}%</span>
        <span className="text-yellow-400">傳說 {(pool.rates.legendary * 100).toFixed(0)}%</span>
      </div>

      {isEvent && pool.endDate && (
        <div className="text-xs text-gray-500 mt-2">
          活動期間: {pool.startDate?.slice(0, 10)} ~ {pool.endDate.slice(0, 10)}
        </div>
      )}
    </button>
  );
}
