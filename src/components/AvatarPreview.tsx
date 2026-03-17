import React, { useState, useEffect, useMemo, useRef } from "react";
import SpriteAnimator from "./SpriteAnimator";

interface AvatarPreviewProps {
  avatarData: Record<string, string>;
  isGenerating: boolean;
  imageUrl?: string;
  frames?: string[];
  spriteSheet?: boolean;
  frameCount?: number;
  gridCols?: number;
  gridRows?: number;
  error?: string;
  onConfirm: () => void;
  generationProgress?: number; // 0-100
}

const AvatarPreview: React.FC<AvatarPreviewProps> = ({
  avatarData,
  isGenerating,
  imageUrl,
  frames,
  spriteSheet = false,
  frameCount = 8,
  gridCols = 4,
  gridRows = 2,
  error,
  onConfirm,
  generationProgress = 0,
}) => {
  const [fps] = useState(8);
  const [animationPhase, setAnimationPhase] = useState<"waiting" | "celebrate" | "idle" | "fly" | "done">("waiting");

  const hasAnimation = (frames && frames.length > 1) || spriteSheet;
  const actualFrameCount = frames ? frames.length : frameCount;

  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const hasConfirmedRef = useRef(false);
  const hasStartedFlowRef = useRef(false);

  // Derived: image is ready to show
  const imageReady = !!imageUrl && !isGenerating && !error;

  // 隨機生成粒子位置（只在 mount 時生成一次）
  const particles = useMemo(() =>
    [...Array(20)].map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      size: 12 + Math.random() * 12,
      symbol: ["✦", "◆", "★", "✧", "◇"][Math.floor(Math.random() * 5)],
    })),
  []);

  const handleConfirm = () => {
    if (hasConfirmedRef.current) return;
    hasConfirmedRef.current = true;
    console.log("[AvatarPreview] handleConfirm called");
    setAnimationPhase("fly");
    // 飛走動畫結束後呼叫 onConfirm
    setTimeout(() => {
      setAnimationPhase("done");
      onConfirmRef.current();
    }, 1000);
  };

  // 當圖片就緒時，啟動慶祝 → idle → 自動確認的流程
  useEffect(() => {
    if (!imageReady) return;
    if (hasStartedFlowRef.current) return; // ref guard，不會被 cleanup 重置
    hasStartedFlowRef.current = true;

    console.log("[AvatarPreview] Image ready, starting celebration flow");
    hasConfirmedRef.current = false;
    setAnimationPhase("celebrate");

    // 慶祝動畫 2.5 秒後切到 idle
    const idleTimer = setTimeout(() => {
      console.log("[AvatarPreview] → idle phase");
      setAnimationPhase("idle");
    }, 2500);

    // idle 展示 3 秒後自動確認（共 5.5 秒）
    const autoConfirmTimer = setTimeout(() => {
      if (!hasConfirmedRef.current) {
        console.log("[AvatarPreview] Auto-confirm triggered");
        handleConfirm();
      }
    }, 5500);

    return () => {
      clearTimeout(idleTimer);
      clearTimeout(autoConfirmTimer);
    };
  }, [imageReady]);

  return (
    <div className="mx-4 my-4 p-4 border border-[var(--terminal-primary)] bg-[var(--terminal-bg)] relative overflow-hidden">
      <style>{`
        @keyframes avatar-scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes avatar-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
        @keyframes avatar-idle-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes avatar-fly-right {
          0% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
          50% {
            opacity: 0.8;
            transform: translateX(150px) scale(0.7);
          }
          100% {
            opacity: 0;
            transform: translateX(400px) scale(0.3);
          }
        }
        @keyframes avatar-particle {
          0% {
            opacity: 1;
            transform: translateY(0) scale(0);
          }
          30% {
            opacity: 1;
            transform: translateY(-100px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-250px) scale(0.5);
          }
        }
        @keyframes avatar-text-glow {
          0%, 100% {
            text-shadow: 0 0 10px rgba(250, 204, 21, 0.8), 0 0 20px rgba(250, 204, 21, 0.4);
          }
          50% {
            text-shadow: 0 0 20px rgba(250, 204, 21, 1), 0 0 40px rgba(250, 204, 21, 0.6);
          }
        }
        @keyframes avatar-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes btn-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(250, 204, 21, 0.4); }
          50% { box-shadow: 0 0 20px rgba(250, 204, 21, 0.8); }
        }
      `}</style>

      <div className="text-[var(--terminal-accent)] text-xs mb-3">
        +-- AVATAR_CREATION --+
      </div>

      {/* DEBUG: animation phase */}
      <div className="text-yellow-400 text-[10px] mb-1">[DBG] animPhase: {animationPhase} | imgReady: {String(imageReady)} | confirmed: {String(hasConfirmedRef.current)}</div>

      {/* 生成中 - 顯示進度條 */}
      {isGenerating && (
        <div className="flex flex-col items-center py-8">
          <div className="w-32 h-32 border border-[var(--terminal-primary-dim)] flex items-center justify-center mb-4 relative overflow-hidden">
            <div
              className="text-4xl text-[var(--terminal-primary)]"
              style={{ animation: "avatar-spin 1s linear infinite" }}
            >
              *
            </div>
            <div
              className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--terminal-primary)] to-transparent opacity-20"
              style={{ animation: "avatar-scan 2s linear infinite" }}
            />
          </div>

          <div className="w-full max-w-xs mb-4">
            <div className="flex justify-between text-xs text-[var(--terminal-primary-dim)] mb-1">
              <span>生成中...</span>
              <span>{generationProgress}%</span>
            </div>
            <div className="h-2 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] overflow-hidden">
              <div
                className="h-full bg-[var(--terminal-primary)] transition-all duration-300"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
          </div>

          <div className="text-[var(--terminal-primary)] text-sm">
            正在生成 {avatarData.name} 的像素藝術...
          </div>
          <div className="text-[var(--terminal-primary-dim)] text-xs mt-2 text-center">
            {generationProgress < 50
              ? "正在創建角色外觀..."
              : "正在製作動畫效果..."
            }
          </div>
        </div>
      )}

      {/* 錯誤 */}
      {error && !isGenerating && (
        <div className="flex flex-col items-center py-8">
          <div className="w-32 h-32 border border-[var(--terminal-red)] flex items-center justify-center mb-4">
            <div className="text-4xl text-[var(--terminal-red)]">!</div>
          </div>
          <div className="text-[var(--terminal-red)] text-sm mb-4">
            生成失敗: {error}
          </div>
        </div>
      )}

      {/* 成功動畫 + 展示 */}
      {imageReady && animationPhase !== "done" && animationPhase !== "waiting" && (
        <div
          className="flex flex-col items-center"
          style={animationPhase === "fly" ? {
            animation: "avatar-fly-right 1s ease-in-out forwards"
          } : {}}
        >
          {/* 慶祝粒子效果 */}
          {animationPhase === "celebrate" && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {particles.map((p) => (
                <div
                  key={p.id}
                  className="absolute text-yellow-400"
                  style={{
                    left: `${p.left}%`,
                    bottom: "20%",
                    fontSize: `${p.size}px`,
                    animation: `avatar-particle 1.5s ease-out forwards`,
                    animationDelay: `${p.delay}s`,
                  }}
                >
                  {p.symbol}
                </div>
              ))}
            </div>
          )}

          <div
            className="relative mb-4"
            style={
              animationPhase === "celebrate"
                ? { animation: "avatar-bounce 0.5s ease-in-out infinite" }
                : animationPhase === "idle"
                ? { animation: "avatar-idle-float 2s ease-in-out infinite" }
                : {}
            }
          >
            <div className={`border-2 p-1 transition-all duration-300 ${
              animationPhase === "celebrate"
                ? "border-yellow-400 shadow-lg shadow-yellow-400/50"
                : "border-[var(--terminal-primary)]"
            }`}>
              {hasAnimation ? (
                <SpriteAnimator
                  frames={frames}
                  spriteSheetUrl={spriteSheet ? imageUrl : undefined}
                  frameCount={actualFrameCount}
                  gridCols={gridCols}
                  gridRows={gridRows}
                  fps={fps}
                  width={160}
                  height={160}
                  playing={true}
                />
              ) : (
                <img
                  src={imageUrl}
                  alt={avatarData.name}
                  className="w-40 h-40 object-contain bg-white"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
            </div>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[var(--terminal-bg)] px-2 text-[var(--terminal-primary)] text-sm glow-text">
              {avatarData.name}
            </div>
          </div>

          {animationPhase === "celebrate" && (
            <>
              <div
                className="text-yellow-400 text-lg mt-4 text-center font-bold"
                style={{ animation: "avatar-text-glow 1s ease-in-out infinite" }}
              >
                ✨ {avatarData.name} 誕生了！✨
              </div>
              <div className="text-[var(--terminal-primary)] text-sm mt-2">
                +10 ◆ 完成創建獎勵！
              </div>
            </>
          )}

          {/* idle 狀態：展示 avatar 並提示確認 */}
          {animationPhase === "idle" && (
            <>
              <div className="text-[var(--terminal-primary)] text-sm mt-4 text-center">
                你的 AI 助理 <span className="text-yellow-400 font-bold">{avatarData.name}</span> 已經準備好了！
              </div>
              <button
                onClick={handleConfirm}
                className="mt-4 px-8 py-3 text-sm font-bold border-2 border-yellow-400 text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400 hover:text-[var(--terminal-bg)] transition-all"
                style={{ animation: "btn-pulse 1.5s ease-in-out infinite" }}
              >
                確認使用 {avatarData.name}！
              </button>
              <div className="text-[var(--terminal-primary-dim)] text-xs mt-2">
                3 秒後自動確認...
              </div>
            </>
          )}

          {animationPhase === "fly" && (
            <div className="text-[var(--terminal-primary-dim)] text-xs mt-2">
              {avatarData.name} 出發了！
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AvatarPreview;
