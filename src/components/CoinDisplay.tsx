import React, { useState, useEffect } from "react";
import { useCoin } from "@/contexts/CoinContext";

interface CoinDisplayProps {
  className?: string;
  showAnimation?: boolean;
}

const CoinDisplay: React.FC<CoinDisplayProps> = ({
  className = "",
  showAnimation = true,
}) => {
  const { coins, transactions } = useCoin();
  const [recentReward, setRecentReward] = useState<number | null>(null);
  const [prevCoins, setPrevCoins] = useState(coins);

  // 監聽金幣變化顯示動畫
  useEffect(() => {
    if (showAnimation && coins > prevCoins) {
      const diff = coins - prevCoins;
      setRecentReward(diff);
      const timer = setTimeout(() => {
        setRecentReward(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
    setPrevCoins(coins);
  }, [coins, prevCoins, showAnimation]);

  return (
    <div className={`relative flex items-center gap-1 ${className}`}>
      {/* 金幣圖標 */}
      <span className="text-yellow-400 text-sm">◆</span>

      {/* 金幣數量 */}
      <span className="text-[var(--terminal-primary)] text-sm font-mono">
        {coins}
      </span>

      {/* 獎勵動畫 */}
      {recentReward !== null && (
        <span
          className="absolute -top-4 left-1/2 -translate-x-1/2 text-yellow-400 text-xs font-bold animate-bounce"
          style={{
            animation: "coinPop 1.5s ease-out forwards",
          }}
        >
          +{recentReward}
        </span>
      )}

      <style jsx>{`
        @keyframes coinPop {
          0% {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px);
          }
        }
      `}</style>
    </div>
  );
};

// 獎勵提示組件 - 顯示在問題旁邊
export const CoinRewardHint: React.FC<{ amount: number; className?: string }> = ({
  amount,
  className = "",
}) => {
  return (
    <span className={`inline-flex items-center gap-1 text-yellow-400 text-xs ${className}`}>
      <span>◆</span>
      <span>+{amount}</span>
    </span>
  );
};

export default CoinDisplay;
