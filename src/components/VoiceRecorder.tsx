import React, { useEffect, useState, useMemo } from "react";
import { FiMic, FiX } from "react-icons/fi";

interface VoiceRecorderProps {
  isListening: boolean;
  isProcessing: boolean;
  error: string | null;
  onComplete: () => void;
  onCancel: () => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  isListening,
  isProcessing,
  error,
  onComplete,
  onCancel,
}) => {
  const [recordingTime, setRecordingTime] = useState(0);

  // 預先計算波形高度，避免每次渲染重新計算
  const waveHeights = useMemo(() => [24, 16, 28, 12, 20], []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isListening) {
      setRecordingTime(0);
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isListening]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="border border-[var(--terminal-primary)] bg-[var(--terminal-bg)] p-4 mx-4 max-w-sm w-full shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[var(--terminal-accent)] text-xs">
            +-- VOICE_INPUT --+
          </span>
          <button
            onClick={onCancel}
            className="text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-red)] p-1"
            title="取消"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="text-center py-4">
            <div className="text-[var(--terminal-red)] text-sm mb-3">
              {error}
            </div>
            <button
              onClick={onCancel}
              className="terminal-btn py-2 px-4 text-sm"
            >
              關閉
            </button>
          </div>
        ) : isProcessing ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3 voice-spinner">*</div>
            <div className="text-[var(--terminal-primary)] text-sm">
              正在轉換語音...
            </div>
          </div>
        ) : isListening ? (
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="relative">
                <FiMic className="h-8 w-8 text-[var(--terminal-red)]" />
                <span className="absolute -top-1 -right-1 h-3 w-3 bg-[var(--terminal-red)] rounded-full voice-pulse" />
              </div>
              <div className="text-[var(--terminal-primary)] text-2xl font-mono">
                {formatTime(recordingTime)}
              </div>
            </div>

            {/* 使用 CSS 動畫的音波效果 */}
            <div className="flex items-center justify-center gap-1 mb-4 h-8">
              {waveHeights.map((height, i) => (
                <div
                  key={i}
                  className="w-1 bg-[var(--terminal-primary)] voice-wave"
                  style={{
                    height: `${height}px`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>

            <div className="text-[var(--terminal-primary-dim)] text-xs mb-4">
              請說話... 完成後點擊下方按鈕
            </div>

            <button
              onClick={onComplete}
              className="terminal-btn py-2 px-6 text-sm hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)]"
            >
              完成錄音
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default VoiceRecorder;
