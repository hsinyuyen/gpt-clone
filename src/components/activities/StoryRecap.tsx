import React, { useState, useEffect, useRef } from "react";

// ============================================================
// YouTube Rewind-style text recap animation
// ============================================================

interface RecapSlide {
  lines: { text: string; style: "title" | "body" | "highlight" | "question" | "answer" }[];
  duration: number; // ms before auto-advance
}

const RECAP_SLIDES: RecapSlide[] = [
  {
    lines: [
      { text: "你完成了一個了不起的挑戰", style: "title" },
    ],
    duration: 2500,
  },
  {
    lines: [
      { text: "上一次，你學會了", style: "body" },
      { text: "簡單的影片製作", style: "highlight" },
    ],
    duration: 3000,
  },
  {
    lines: [
      { text: "但其實...", style: "title" },
    ],
    duration: 2000,
  },
  {
    lines: [
      { text: "那些影片的內容", style: "body" },
      { text: "都是我們預先設定好的", style: "highlight" },
    ],
    duration: 3000,
  },
  {
    lines: [
      { text: "這一次不一樣了", style: "title" },
    ],
    duration: 2000,
  },
  {
    lines: [
      { text: "你學會了用 AI 生成", style: "body" },
      { text: "圖片和影片", style: "highlight" },
      { text: "需要的句子結構", style: "body" },
    ],
    duration: 3500,
  },
  {
    lines: [
      { text: "你知道了要怎麼", style: "body" },
      { text: "描述場景、角色、動作", style: "highlight" },
      { text: "才能讓 AI 理解你的想法", style: "body" },
    ],
    duration: 4000,
  },
  {
    lines: [
      { text: "但是...", style: "title" },
    ],
    duration: 2000,
  },
  {
    lines: [
      { text: "你有注意到", style: "body" },
      { text: "這次生成的影片", style: "body" },
      { text: "有什麼問題嗎?", style: "question" },
    ],
    duration: 3500,
  },
  {
    lines: [
      { text: "影片風格不連貫?", style: "question" },
      { text: "角色長得不一樣?", style: "question" },
      { text: "想更改劇情卻很難?", style: "question" },
    ],
    duration: 4000,
  },
  {
    lines: [
      { text: "能夠發現這些問題", style: "body" },
      { text: "並且思考解決方法", style: "highlight" },
    ],
    duration: 3500,
  },
  {
    lines: [
      { text: "就是接下來", style: "body" },
      { text: "要培養的能力", style: "highlight" },
    ],
    duration: 3000,
  },
  {
    lines: [
      { text: "也是 AI 時代", style: "body" },
      { text: "最重要的技能", style: "title" },
    ],
    duration: 4000,
  },
];

interface StoryRecapProps {
  onComplete: () => void;
}

const StoryRecap: React.FC<StoryRecapProps> = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [showCursor, setShowCursor] = useState(true);
  const [fadeState, setFadeState] = useState<"in" | "visible" | "out">("in");
  const [allDone, setAllDone] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const slide = RECAP_SLIDES[currentSlide];
  const isLastSlide = currentSlide >= RECAP_SLIDES.length - 1;

  // Typewriter effect
  useEffect(() => {
    if (!slide || allDone) return;

    const currentLine = slide.lines[lineIndex];
    if (!currentLine) return;

    if (charIndex < currentLine.text.length) {
      const speed = currentLine.style === "title" ? 80 : 50;
      const timer = setTimeout(() => setCharIndex((c) => c + 1), speed);
      return () => clearTimeout(timer);
    } else if (lineIndex < slide.lines.length - 1) {
      // Move to next line after a pause
      const timer = setTimeout(() => {
        setLineIndex((l) => l + 1);
        setCharIndex(0);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [charIndex, lineIndex, slide, allDone]);

  // Auto-advance slides
  useEffect(() => {
    if (!slide || allDone) return;

    const currentLine = slide.lines[lineIndex];
    if (!currentLine) return;

    // All lines typed?
    const allTyped = lineIndex >= slide.lines.length - 1 && charIndex >= slide.lines[slide.lines.length - 1].text.length;

    if (allTyped) {
      timerRef.current = setTimeout(() => {
        if (isLastSlide) {
          setAllDone(true);
        } else {
          // Fade out then advance
          setFadeState("out");
          setTimeout(() => {
            setCurrentSlide((s) => s + 1);
            setLineIndex(0);
            setCharIndex(0);
            setFadeState("in");
            setTimeout(() => setFadeState("visible"), 50);
          }, 500);
        }
      }, slide.duration - 1500); // subtract typing time approximation
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [charIndex, lineIndex, slide, isLastSlide, allDone]);

  // Cursor blink
  useEffect(() => {
    const timer = setInterval(() => setShowCursor((c) => !c), 500);
    return () => clearInterval(timer);
  }, []);

  // Click to skip to next slide
  const handleClick = () => {
    if (allDone) {
      onComplete();
      return;
    }

    const currentLine = slide?.lines[lineIndex];
    if (!currentLine) return;

    // If still typing, finish current slide immediately
    const allTyped = lineIndex >= slide.lines.length - 1 && charIndex >= slide.lines[slide.lines.length - 1].text.length;

    if (!allTyped) {
      // Skip typing - show all text
      setLineIndex(slide.lines.length - 1);
      setCharIndex(slide.lines[slide.lines.length - 1].text.length);
    } else if (isLastSlide) {
      setAllDone(true);
    } else {
      // Advance to next slide
      if (timerRef.current) clearTimeout(timerRef.current);
      setFadeState("out");
      setTimeout(() => {
        setCurrentSlide((s) => s + 1);
        setLineIndex(0);
        setCharIndex(0);
        setFadeState("in");
        setTimeout(() => setFadeState("visible"), 50);
      }, 300);
    }
  };

  const getLineStyle = (style: string) => {
    switch (style) {
      case "title": return "text-[var(--terminal-primary)] glow-text text-xl md:text-2xl font-bold";
      case "highlight": return "text-[var(--terminal-accent)] text-lg md:text-xl font-bold";
      case "question": return "text-[var(--terminal-red)] text-base md:text-lg italic";
      case "answer": return "text-[var(--terminal-highlight)] text-base md:text-lg font-bold";
      default: return "text-[var(--terminal-primary-dim)] text-base md:text-lg";
    }
  };

  return (
    <div
      onClick={handleClick}
      className="fixed inset-0 z-[10000] bg-[var(--terminal-bg)] flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ transition: "opacity 0.5s" }}
    >
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)",
      }} />

      {/* Content */}
      <div
        className={`max-w-lg mx-auto px-8 text-center transition-all duration-500 ${
          fadeState === "out" ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        }`}
      >
        {slide && slide.lines.map((line, li) => {
          if (li > lineIndex) return null;
          const displayText = li === lineIndex
            ? line.text.substring(0, charIndex)
            : line.text;

          return (
            <div key={`${currentSlide}-${li}`} className={`mb-3 ${getLineStyle(line.style)}`}>
              {displayText}
              {li === lineIndex && charIndex < line.text.length && showCursor && (
                <span className="inline-block w-[2px] h-[1em] bg-[var(--terminal-primary)] ml-1 align-middle" />
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-8 text-[var(--terminal-primary-dim)] text-xs animate-pulse">
        {allDone ? "點擊繼續..." : "點擊跳過"}
      </div>

      {/* Slide counter */}
      <div className="absolute bottom-4 flex gap-1">
        {RECAP_SLIDES.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === currentSlide ? "bg-[var(--terminal-primary)] scale-125" :
              i < currentSlide ? "bg-[var(--terminal-primary-dim)]" : "bg-[var(--terminal-border)]"
            }`}
          />
        ))}
      </div>

      {/* Done button */}
      {allDone && (
        <div className="absolute bottom-16 slide-up">
          <button
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
            className="terminal-btn px-8 py-3 text-sm hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-all duration-300 complete-btn-glow"
          >
            {">"} 開始完成活動
          </button>
        </div>
      )}
    </div>
  );
};

export default StoryRecap;
