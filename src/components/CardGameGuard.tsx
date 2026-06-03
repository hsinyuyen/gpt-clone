import { useRouter } from "next/router";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

/**
 * Wrap any card-game page with this component.
 * When cardGameEnabled is false, it shows a locked screen
 * and prevents access.
 */
export default function CardGameGuard({ children }: { children: React.ReactNode }) {
  const { cardGameEnabled } = useFeatureFlags();
  const router = useRouter();

  if (!cardGameEnabled) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center p-4">
        <div className="border border-red-400/50 bg-red-400/5 p-8 max-w-sm text-center">
          <div className="text-4xl mb-4">🔒</div>
          <div className="text-red-400 font-bold text-lg mb-2">遊戲目前未開放</div>
          <div className="text-[var(--terminal-primary-dim)] text-sm mb-6">
            老師目前關閉了卡片遊戲功能，請先專心上課喔！
          </div>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 text-sm border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] hover:border-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-colors"
          >
            返回主頁
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
