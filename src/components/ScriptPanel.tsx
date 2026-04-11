import React, { useState } from "react";
import { Script, ActiveScript } from "@/types/Script";
import { getDisplayScripts } from "@/scripts";
import { useAuth } from "@/contexts/AuthContext";
import { useCoin } from "@/contexts/CoinContext";
import SpriteAnimator from "./SpriteAnimator";
import { uploadAvatarFrames } from "@/lib/firestore";

interface ScriptPanelProps {
  isOpen: boolean;
  activeScript: ActiveScript;
  onStartScript: (scriptId: string) => void;
  onStopScript: () => void;
  completedScripts?: Set<string>;
}

const ScriptPanel: React.FC<ScriptPanelProps> = ({
  isOpen,
  activeScript,
  onStartScript,
  onStopScript,
  completedScripts = new Set(),
}) => {
  const [scripts] = useState<Script[]>(getDisplayScripts());
  const { user, updateUser } = useAuth();
  const { spendCoins, canAfford, COIN_VALUES } = useCoin();
  const [fps, setFps] = useState(8);
  const [isRegenerating, setIsRegenerating] = useState(false);

  if (!isOpen) return null;

  const handleScriptClick = (scriptId: string) => {
    const script = scripts.find(s => s.id === scriptId);
    if (!script?.isAvailable) return;

    if (activeScript === scriptId) {
      onStopScript();
      return;
    }

    // Story helper: first time free, after that costs 30 coins
    if (scriptId === "story-helper" && completedScripts.has("story-helper")) {
      if (!canAfford(COIN_VALUES.STORY_SCRIPT_COST)) {
        alert(`需要 ${COIN_VALUES.STORY_SCRIPT_COST} ◆ 才能再次使用故事創作！`);
        return;
      }
      if (!confirm(`再次使用故事創作需要花費 ${COIN_VALUES.STORY_SCRIPT_COST} ◆，確定嗎？`)) {
        return;
      }
      const success = spendCoins(COIN_VALUES.STORY_SCRIPT_COST, "使用故事創作小幫手");
      if (!success) {
        alert("金幣不足！");
        return;
      }
    }

    onStartScript(scriptId);
  };

  const handleRegenerateAvatar = async () => {
    if (!user?.avatar || !canAfford(COIN_VALUES.REGENERATE_AVATAR)) {
      alert(`需要 ${COIN_VALUES.REGENERATE_AVATAR} ◆ 才能重新生成！`);
      return;
    }

    if (!confirm(`確定要花費 ${COIN_VALUES.REGENERATE_AVATAR} ◆ 重新生成角色嗎？`)) {
      return;
    }

    setIsRegenerating(true);

    try {
      // 花費金幣
      const success = spendCoins(COIN_VALUES.REGENERATE_AVATAR, "重新生成 AI 助理");
      if (!success) {
        alert("金幣不足！");
        setIsRegenerating(false);
        return;
      }

      // 呼叫 API 重新生成
      const response = await fetch("/api/generate-avatar-pixellab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: user.avatar.prompt,
          name: user.avatar.name,
        }),
      });

      const result = await response.json();

      if (result.success && result.frames) {
        // Upload to Firebase Storage
        let frames = result.frames;
        let imageUrl = result.frames[0];
        try {
          const avatarId = user.avatar.id || `avatar_${Date.now()}`;
          const urls = await uploadAvatarFrames(user.id, avatarId, result.frames);
          frames = urls;
          imageUrl = urls[0];
        } catch (e) {
          console.error("Failed to upload frames:", e);
        }

        const updatedAvatar = {
          ...user.avatar,
          imageUrl,
          frames,
          frameCount: result.frameCount || frames.length,
        };

        updateUser({ ...user, avatar: updatedAvatar });
        alert("重新生成成功！");
      } else {
        alert("生成失敗: " + (result.error || "未知錯誤"));
        // 退回金幣
        // TODO: 實作退款邏輯
      }
    } catch (error: any) {
      alert("生成失敗: " + error.message);
    }

    setIsRegenerating(false);
  };

  const avatar = user?.avatar;
  const hasAnimation = (avatar?.frames && avatar.frames.length > 1) || avatar?.spriteSheetUrl || (avatar?.frameCount && avatar.frameCount > 1);

  return (
    <div className="h-full flex flex-col bg-[var(--terminal-bg)] border-l border-[var(--terminal-primary-dim)]">
      {/* Header */}
      <div className="p-3 border-b border-[var(--terminal-primary-dim)]">
        <pre className="text-[var(--terminal-primary)] glow-text text-[10px] leading-tight text-center">
{`+------------------+
|   SCRIPT_LAB     |
+------------------+`}
        </pre>
      </div>

      {/* User Avatar Display */}
      {avatar?.imageUrl && (
        <div className="p-3 border-b border-[var(--terminal-primary-dim)]">
          <div className="text-[var(--terminal-accent)] text-xs mb-2 text-center">
            {'>'} 我的 AI 助理
          </div>
          <div className="flex flex-col items-center">
            <div className="border-2 border-[var(--terminal-primary)] p-1">
              {hasAnimation ? (
                <SpriteAnimator
                  frames={avatar.frames}
                  spriteSheetUrl={avatar.spriteSheetUrl || (!avatar.frames ? avatar.imageUrl : undefined)}
                  frameCount={avatar.frames?.length || avatar.frameCount || 8}
                  gridCols={avatar.gridCols || 4}
                  gridRows={avatar.gridRows || 2}
                  fps={fps}
                  width={96}
                  height={96}
                  playing={true}
                />
              ) : (
                <img
                  src={avatar.imageUrl}
                  alt={avatar.name}
                  className="w-24 h-24 object-contain bg-white"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
            </div>
            <div className="text-[var(--terminal-primary)] text-sm mt-2 glow-text">
              {avatar.name}
            </div>

            {/* FPS 控制 */}
            {hasAnimation && (
              <div className="flex items-center gap-2 mt-2 text-xs w-full">
                <span className="text-[var(--terminal-primary-dim)]">速度:</span>
                <input
                  type="range"
                  min="2"
                  max="16"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="flex-1 accent-[var(--terminal-primary)]"
                />
                <span className="text-[var(--terminal-primary)] w-8">{fps}</span>
              </div>
            )}

            {/* 重新生成按鈕 */}
            <button
              onClick={handleRegenerateAvatar}
              disabled={isRegenerating || !canAfford(COIN_VALUES.REGENERATE_AVATAR)}
              className={`mt-3 w-full terminal-btn text-xs py-2 flex items-center justify-center gap-2 ${
                !canAfford(COIN_VALUES.REGENERATE_AVATAR)
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)]"
              }`}
              title={!canAfford(COIN_VALUES.REGENERATE_AVATAR) ? "金幣不足" : ""}
            >
              {isRegenerating ? (
                <>
                  <span className="animate-spin">*</span>
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <span>🔄 重新生成</span>
                  <span className="text-yellow-400">(-{COIN_VALUES.REGENERATE_AVATAR} ◆)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Script List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="text-[var(--terminal-accent)] text-xs mb-2">
          {'>'} 選擇要執行的腳本：
        </div>

        {scripts.map((script) => {
          const isActive = activeScript === script.id;
          const isCompleted = completedScripts.has(script.id);
          // 如果用戶已經有 avatar，隱藏 create-avatar 選項
          const isHidden = script.id === "create-avatar" && avatar?.imageUrl;
          // Story helper: costs coins after first use
          const needsCoin = script.id === "story-helper" && isCompleted && !isActive;
          const cantAfford = needsCoin && !canAfford(COIN_VALUES.STORY_SCRIPT_COST);

          if (isHidden) return null;

          return (
            <button
              key={script.id}
              data-tutorial={`script-${script.id}`}
              onClick={() => handleScriptClick(script.id)}
              disabled={!script.isAvailable || cantAfford}
              className={`
                w-full text-left p-3 border transition-all
                ${isActive
                  ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/20"
                  : cantAfford
                    ? "border-[var(--terminal-primary-dim)]/30 opacity-50 cursor-not-allowed"
                    : isCompleted
                      ? "border-green-500/50 bg-green-500/10"
                      : script.isAvailable
                        ? "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)]/10 cursor-pointer"
                        : "border-[var(--terminal-primary-dim)]/30 opacity-40 cursor-not-allowed"
                }
              `}
            >
              <div className="flex items-start gap-3">
                <div className={`text-lg ${isCompleted ? "text-green-400" : "text-[var(--terminal-primary)]"}`}>
                  {isCompleted ? "[✓]" : (
                    <>
                      {script.id === "create-avatar" && "[+]"}
                      {script.id === "story-helper" && "[S]"}
                      {script.id === "math-tutor" && "[#]"}
                      {script.id === "english-buddy" && "[A]"}
                    </>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold flex items-center gap-2 ${isCompleted ? "text-green-400" : "text-[var(--terminal-primary)]"}`}>
                    {script.name}
                    {isActive && (
                      <span className="text-[8px] text-[var(--terminal-bg)] bg-[var(--terminal-primary)] px-1">
                        執行中
                      </span>
                    )}
                    {isCompleted && !isActive && (
                      <span className="text-[8px] text-green-900 bg-green-400 px-1">
                        已完成
                      </span>
                    )}
                    {needsCoin && (
                      <span className={`text-[8px] px-1 ${cantAfford ? "text-red-400 border border-red-400/50" : "text-yellow-400 border border-yellow-400/50"}`}>
                        {COIN_VALUES.STORY_SCRIPT_COST} ◆
                      </span>
                    )}
                    {!script.isAvailable && (
                      <span className="text-[8px] text-[var(--terminal-primary-dim)] border border-[var(--terminal-primary-dim)]/50 px-1">
                        即將推出
                      </span>
                    )}
                  </div>
                  <div className="text-[var(--terminal-primary-dim)] text-xs mt-1">
                    {script.description}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Script Info */}
      {activeScript && (
        <div className="p-3 border-t border-[var(--terminal-primary-dim)]">
          <button
            onClick={onStopScript}
            className="w-full terminal-btn text-xs py-2 hover:bg-[var(--terminal-red)] hover:border-[var(--terminal-red)]"
          >
            [X] 結束腳本
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="p-2 border-t border-[var(--terminal-primary-dim)] text-center">
        <div className="text-[8px] text-[var(--terminal-primary-dim)]">
          SCRIPT_LAB v1.0 | {scripts.filter(s => s.isAvailable).length}/{scripts.length} 可用
        </div>
      </div>
    </div>
  );
};

export default ScriptPanel;
