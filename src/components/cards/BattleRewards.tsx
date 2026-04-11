// Post-battle reward screen
import { BattleState, PveOpponent } from '@/types/Card';

interface BattleRewardsProps {
  state: BattleState;
  opponent?: PveOpponent;
  onClose: () => void;
}

export default function BattleRewards({ state, opponent, onClose }: BattleRewardsProps) {
  const isVictory = state.phase === 'victory';

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border-2 border-[var(--terminal-color)] rounded-lg max-w-sm w-full p-6 text-center">
        {/* Result */}
        <div className="text-4xl mb-4">
          {isVictory ? '🏆' : '💀'}
        </div>
        <h2
          className="text-2xl font-bold mb-2"
          style={{ color: isVictory ? 'var(--terminal-color)' : '#ef4444' }}
        >
          {isVictory ? '勝利！' : '戰敗...'}
        </h2>

        <p className="text-gray-400 text-sm mb-4">
          {isVictory
            ? '恭喜你贏得了這場戰鬥！'
            : '不要灰心，下次一定能贏！'}
        </p>

        {/* Stats */}
        <div className="bg-black/50 rounded p-4 mb-4 text-left">
          <div className="text-xs text-gray-400 mb-2">{">>>"} 戰鬥統計</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-400">回合數:</span>
            <span style={{ color: 'var(--terminal-color)' }}>{state.turn - 1}</span>
            <span className="text-gray-400">我方存活:</span>
            <span style={{ color: 'var(--terminal-color)' }}>
              {state.playerTeam.filter((c) => !c.isDefeated).length}/{state.playerTeam.length}
            </span>
            <span className="text-gray-400">敵方擊敗:</span>
            <span style={{ color: 'var(--terminal-color)' }}>
              {state.enemyTeam.filter((c) => c.isDefeated).length}/{state.enemyTeam.length}
            </span>
          </div>
        </div>

        {/* Rewards */}
        {isVictory && opponent && (
          <div className="bg-black/50 rounded p-4 mb-4 text-left">
            <div className="text-xs text-gray-400 mb-2">{">>>"} 獎勵</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-yellow-400">◆ 金幣</span>
                <span style={{ color: 'var(--terminal-color)' }}>+{opponent.rewardCoins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-400">✦ 經驗值</span>
                <span style={{ color: 'var(--terminal-color)' }}>+{opponent.rewardXp} / 卡</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 px-4 rounded font-bold border-2 transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
          style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
        >
          確認
        </button>
      </div>
    </div>
  );
}
