import React from "react";
import { ActivityComponentProps } from "@/types/Activity";

const DemoActivity: React.FC<ActivityComponentProps> = ({ activity, onComplete }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8 text-center">
      <div className="max-w-lg w-full">
        <div className="text-[var(--terminal-primary)] glow-text text-2xl mb-4">
          ◉ {activity.name}
        </div>
        <div className="text-[var(--terminal-primary-dim)] text-sm mb-8 leading-relaxed">
          {activity.description}
        </div>

        <div className="border border-[var(--terminal-primary-dim)] p-6 mb-8">
          <div className="text-[var(--terminal-primary)] text-sm mb-2">
            ═══ 活動說明 ═══
          </div>
          <div className="text-[var(--terminal-primary-dim)] text-xs leading-loose">
            這是一個示範活動。
            <br />
            在正式活動中，這裡會顯示活動專屬的互動介面。
            <br />
            點擊下方按鈕完成活動。
          </div>
        </div>

        <div className="text-[var(--terminal-accent)] text-xs mb-4">
          完成獎勵: +{activity.coinReward} ◆
        </div>

        <button
          onClick={onComplete}
          className="terminal-btn px-8 py-3 text-sm hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-colors"
        >
          {">"} 完成活動
        </button>
      </div>
    </div>
  );
};

export default DemoActivity;
