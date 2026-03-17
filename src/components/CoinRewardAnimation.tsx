import React, { useEffect, useState } from "react";

interface CoinRewardAnimationProps {
  amount: number;
  onComplete?: () => void;
}

const CoinRewardAnimation: React.FC<CoinRewardAnimationProps> = ({
  amount,
  onComplete,
}) => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      onComplete?.();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <div className="coin-reward-animation">
        {/* 金幣圖標 */}
        <div className="coin-icon">◆</div>
        {/* 金幣數量 */}
        <div className="coin-amount">+{amount}</div>
      </div>

      <style jsx>{`
        .coin-reward-animation {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          animation: coinPop 2s ease-out forwards;
        }

        .coin-icon {
          font-size: 4rem;
          color: #fbbf24;
          animation: coinSpin 0.6s ease-out;
          text-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
        }

        .coin-amount {
          font-size: 2rem;
          font-weight: bold;
          color: #fbbf24;
          font-family: monospace;
          animation: amountFloat 2s ease-out;
          text-shadow: 0 0 10px rgba(251, 191, 36, 0.6);
        }

        @keyframes coinPop {
          0% {
            opacity: 0;
            transform: scale(0.5) translateY(50px);
          }
          20% {
            opacity: 1;
            transform: scale(1.2) translateY(0);
          }
          40% {
            transform: scale(1) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(0.8) translateY(-100px);
          }
        }

        @keyframes coinSpin {
          0% {
            transform: rotateY(0deg);
          }
          100% {
            transform: rotateY(720deg);
          }
        }

        @keyframes amountFloat {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          30% {
            opacity: 1;
            transform: translateY(0);
          }
          70% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-50px);
          }
        }
      `}</style>
    </div>
  );
};

export default CoinRewardAnimation;
