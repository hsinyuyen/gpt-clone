import React, { useState, useEffect, useRef, useCallback } from "react";

export interface StoryPanel {
  imageUrl: string;
  text: string;
  audioBase64?: string; // base64 mp3 (used during live generation)
  audioUrl?: string;    // Firebase Storage URL (used for archived replays)
}

interface StorySlideshowProps {
  panels: StoryPanel[];
  storyTitle: string;
  roundNumber: number;
  onComplete: () => void;
}

const StorySlideshow: React.FC<StorySlideshowProps> = ({
  panels,
  storyTitle,
  roundNumber,
  onComplete,
}) => {
  const [currentPanel, setCurrentPanel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false); // Don't auto-play until ready
  const [showComplete, setShowComplete] = useState(false);
  const [allImagesReady, setAllImagesReady] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Preload all images before starting playback
  useEffect(() => {
    if (panels.length === 0) return;

    let loaded = 0;
    const total = panels.length;

    panels.forEach((panel) => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        setLoadedCount(loaded);
        if (loaded >= total) {
          setAllImagesReady(true);
          setIsPlaying(true); // Auto-start when all loaded
        }
      };
      img.onerror = () => {
        // Retry once
        const retry = new Image();
        retry.onload = () => {
          loaded++;
          setLoadedCount(loaded);
          if (loaded >= total) {
            setAllImagesReady(true);
            setIsPlaying(true);
          }
        };
        retry.onerror = () => {
          // Count as loaded to not block forever
          loaded++;
          setLoadedCount(loaded);
          if (loaded >= total) {
            setAllImagesReady(true);
            setIsPlaying(true);
          }
        };
        retry.src = panel.imageUrl + "&retry=1";
      };
      img.src = panel.imageUrl;
    });
  }, [panels]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goToPanel = useCallback(
    (index: number) => {
      stopAudio();
      if (index >= panels.length) {
        setShowComplete(true);
        setIsPlaying(false);
        return;
      }
      setCurrentPanel(index);
      setShowComplete(false);
    },
    [panels.length, stopAudio]
  );

  // Auto-advance: play audio then move to next panel
  useEffect(() => {
    if (!isPlaying || showComplete || !allImagesReady) return;

    const panel = panels[currentPanel];
    if (!panel) return;

    const audioSrc = panel.audioBase64
      ? `data:audio/mp3;base64,${panel.audioBase64}`
      : panel.audioUrl || null;

    if (audioSrc) {
      const audio = new Audio(audioSrc);
      audioRef.current = audio;
      audio.play().catch(() => {
        timerRef.current = setTimeout(() => goToPanel(currentPanel + 1), 6000);
      });
      audio.onended = () => {
        timerRef.current = setTimeout(() => goToPanel(currentPanel + 1), 1200);
      };
    } else {
      timerRef.current = setTimeout(() => goToPanel(currentPanel + 1), 5000);
    }

    return () => stopAudio();
  }, [currentPanel, isPlaying, showComplete, allImagesReady, panels, goToPanel, stopAudio]);

  const handlePrev = () => {
    setIsPlaying(false);
    if (currentPanel > 0) goToPanel(currentPanel - 1);
  };

  const handleNext = () => {
    setIsPlaying(false);
    goToPanel(currentPanel + 1);
  };

  const handleReplay = () => {
    setShowComplete(false);
    setIsPlaying(true);
    goToPanel(0);
  };

  const panel = panels[currentPanel];

  return (
    <div className="border border-[var(--terminal-primary)] bg-black/80 my-2 max-w-[80%] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--terminal-primary-dim)]">
        <span className="text-[var(--terminal-accent)] text-xs">
          {roundNumber > 0 ? `ROUND ${roundNumber}/3` : "REPLAY"}
        </span>
        <span className="text-[var(--terminal-primary)] text-xs glow-text truncate mx-2">
          {storyTitle}
        </span>
        <span className="text-[var(--terminal-primary-dim)] text-xs">
          {!allImagesReady ? `LOADING ${loadedCount}/${panels.length}` : showComplete ? "END" : `${currentPanel + 1}/${panels.length}`}
        </span>
      </div>

      {/* Loading screen — wait for all images */}
      {!allImagesReady ? (
        <div className="p-8 text-center">
          <div className="text-[var(--terminal-primary)] text-sm animate-pulse glow-text">
            載入圖片中... {loadedCount}/{panels.length}
          </div>
          <div className="mt-3 mx-auto w-48 h-2 border border-[var(--terminal-primary-dim)] bg-black/50">
            <div
              className="h-full bg-[var(--terminal-primary)] transition-all duration-300"
              style={{ width: `${(loadedCount / panels.length) * 100}%` }}
            />
          </div>
        </div>
      ) : showComplete ? (
        /* Completion screen */
        <div className="p-4 text-center space-y-3">
          <div className="text-[var(--terminal-primary)] text-sm glow-text">
            故事播放完畢！
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={handleReplay} className="terminal-btn text-xs px-4 py-2">
              重看一次
            </button>
            {roundNumber > 0 && (
              <button
                onClick={onComplete}
                className="terminal-btn text-xs px-4 py-2 bg-[var(--terminal-primary)] text-[var(--terminal-bg)]"
              >
                繼續 →
              </button>
            )}
          </div>
        </div>
      ) : panel ? (
        /* Panel display */
        <div>
          {/* Image — fixed container, full image visible, no cropping */}
          <div className="relative w-full bg-black flex items-center justify-center" style={{ height: "280px" }}>
            <img
              src={panel.imageUrl}
              alt={`Panel ${currentPanel + 1}`}
              className="max-w-full max-h-full object-contain"
            />
            {/* Panel indicator dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
              {panels.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setIsPlaying(false); goToPanel(i); }}
                  className={`w-2.5 h-2.5 rounded-full border transition-all ${
                    i === currentPanel
                      ? "bg-[var(--terminal-primary)] border-[var(--terminal-primary)] scale-125"
                      : "bg-transparent border-white/60 hover:bg-white/30"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Story text */}
          <div className="px-3 py-2 text-[var(--terminal-primary)] text-sm leading-relaxed border-t border-[var(--terminal-primary-dim)]">
            {panel.text}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--terminal-primary-dim)]">
            <button
              onClick={handlePrev}
              disabled={currentPanel === 0}
              className="terminal-btn text-xs px-3 py-1 disabled:opacity-30"
            >
              ◁ 上一張
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="terminal-btn text-xs px-3 py-1"
            >
              {isPlaying ? "⏸ 暫停" : "▶ 播放"}
            </button>
            <button onClick={handleNext} className="terminal-btn text-xs px-3 py-1">
              下一張 ▷
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StorySlideshow;
