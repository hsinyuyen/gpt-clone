import React, { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ActivityComponentProps } from "@/types/Activity";
import {
  GENRES,
  INSPIRATION_HINTS,
  FREE_WRITING_CONFIG,
  GenreOption,
  TemplateSegment,
} from "@/data/storyCreatorData";
import { uploadStoryImage } from "@/lib/firestore";
import DungeonQuizGame from "./DungeonQuizGame";
import StoryRecap from "./StoryRecap";

// ============================================================
// Types
// ============================================================
type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface StoryResult {
  title: string;
  pages: { text: string; imagePrompt: string }[];
}

// ============================================================
// Step Indicator
// ============================================================
const StepIndicator: React.FC<{ current: Step }> = ({ current }) => {
  const steps = [
    { n: 1, label: "選主題" },
    { n: 2, label: "造句子" },
    { n: 3, label: "寫故事" },
    { n: 4, label: "畫圖中" },
    { n: 5, label: "拍影片" },
    { n: 6, label: "完成" },
  ];
  return (
    <div className="flex items-center justify-center gap-1 py-4">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-500 ${
                s.n < current
                  ? "bg-[var(--terminal-primary)] text-[var(--terminal-bg)] step-completed"
                  : s.n === current
                  ? "border-2 border-[var(--terminal-primary)] text-[var(--terminal-primary)] step-active"
                  : "border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)]"
              }`}
            >
              {s.n < current ? "V" : s.n}
            </div>
            <span
              className={`text-[9px] ${
                s.n === current
                  ? "text-[var(--terminal-primary)] glow-text"
                  : "text-[var(--terminal-primary-dim)]"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-6 h-px mt-[-12px] ${
                s.n < current
                  ? "bg-[var(--terminal-primary)]"
                  : "bg-[var(--terminal-primary-dim)]"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ============================================================
// Step 1: Genre Selector
// ============================================================
const GenreSelector: React.FC<{
  onSelect: (genre: GenreOption) => void;
  selected: GenreOption | null;
}> = ({ onSelect, selected }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="step-content">
      <h2 className="text-center text-lg glow-text mb-2">
        -- 選一個故事主題 --
      </h2>
      <p className="text-center text-[var(--terminal-primary-dim)] text-xs mb-6">
        點選你最喜歡的主題
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto px-4">
        {GENRES.map((genre) => {
          const isSelected = selected?.id === genre.id;
          const isOther = selected && !isSelected;
          return (
            <button
              key={genre.id}
              onClick={() => onSelect(genre)}
              onMouseEnter={() => setHoveredId(genre.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`relative rounded-lg overflow-hidden transition-all duration-500 cursor-pointer group
                ${isSelected ? "ring-2 ring-[var(--terminal-primary)] card-selected scale-105" : ""}
                ${isOther ? "opacity-40 scale-95" : ""}
                ${!selected && hoveredId === genre.id ? "scale-105" : ""}
                ${!selected ? "hover:ring-1 hover:ring-[var(--terminal-primary-dim)]" : ""}
              `}
            >
              <div className="aspect-[4/3] bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] rounded-lg overflow-hidden">
                <img
                  src={genre.imageUrl}
                  alt={genre.label}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  loading="lazy"
                />
                {isSelected && (
                  <div className="absolute inset-0 card-glow-overlay" />
                )}
              </div>
              <div
                className={`mt-2 text-sm font-bold text-center pb-1 transition-colors ${
                  isSelected
                    ? "text-[var(--terminal-primary)] glow-text"
                    : "text-[var(--terminal-primary-dim)]"
                }`}
              >
                {genre.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// Step 2: Fill-in-the-Blank
// ============================================================
const FillInTheBlank: React.FC<{
  genre: GenreOption;
  blanks: Record<string, string>;
  onBlanksChange: (blanks: Record<string, string>) => void;
}> = ({ genre, blanks, onBlanksChange }) => {
  const allFilled = genre.fillTemplate.segments
    .filter((s) => s.type === "blank")
    .every((s) => blanks[s.blankId!]);

  const handleChange = (blankId: string, value: string) => {
    onBlanksChange({ ...blanks, [blankId]: value });
  };

  const completedSentence = genre.fillTemplate.segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      return blanks[seg.blankId!] || "___";
    })
    .join("");

  return (
    <div className="step-content">
      <h2 className="text-center text-lg glow-text mb-2">
        -- 完成句子 --
      </h2>
      <p className="text-center text-[var(--terminal-primary-dim)] text-xs mb-6">
        選擇下拉選單中的詞語，完成故事的開頭
      </p>
      <div className="max-w-2xl mx-auto px-4">
        <div className="border border-[var(--terminal-primary-dim)] rounded-lg p-6 bg-[rgba(212,160,86,0.03)]">
          <div className="text-base leading-[2.5] flex flex-wrap items-baseline">
            {genre.fillTemplate.segments.map((seg, i) => {
              if (seg.type === "text") {
                return (
                  <span key={i} className="text-[var(--terminal-primary)]">
                    {seg.text}
                  </span>
                );
              }
              return (
                <select
                  key={i}
                  value={blanks[seg.blankId!] || ""}
                  onChange={(e) => handleChange(seg.blankId!, e.target.value)}
                  className={`inline-block mx-1 px-3 py-1 rounded-lg border-2 text-base font-bold
                    bg-[var(--terminal-bg)] cursor-pointer transition-all duration-300 focus:outline-none
                    ${blanks[seg.blankId!]
                      ? "border-[var(--terminal-primary)] text-[var(--terminal-primary)] dropdown-filled"
                      : "border-[var(--terminal-accent)] text-[var(--terminal-accent)] animate-pulse"
                    }`}
                >
                  <option value="" disabled>v 選一個</option>
                  {seg.options!.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              );
            })}
          </div>
        </div>
        {allFilled && (
          <div className="mt-6 slide-up">
            <div className="text-[var(--terminal-primary-dim)] text-xs mb-2 text-center">
              === 你的故事開頭 ===
            </div>
            <div className="border border-[var(--terminal-primary)] rounded-lg p-4 text-[var(--terminal-accent)] text-sm leading-relaxed text-center typewriter-text">
              {completedSentence}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Step 3: Free Writing
// ============================================================
const FreeWriting: React.FC<{
  openingSentence: string;
  text: string;
  onTextChange: (text: string) => void;
}> = ({ openingSentence, text, onTextChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const charCount = text.length;

  const insertHint = (hintText: string) => {
    const newText = text + hintText;
    if (newText.length <= FREE_WRITING_CONFIG.maxChars) {
      onTextChange(newText);
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="step-content">
      <h2 className="text-center text-lg glow-text mb-2">-- 寫下你的故事 --</h2>
      <p className="text-center text-[var(--terminal-primary-dim)] text-xs mb-6">
        繼續寫下去，讓故事更精彩
      </p>
      <div className="max-w-2xl mx-auto px-4">
        <div className="border border-[var(--terminal-primary-dim)] rounded-lg p-4 mb-4 bg-[rgba(212,160,86,0.05)]">
          <div className="text-[10px] text-[var(--terminal-primary-dim)] mb-1">故事開頭:</div>
          <div className="text-[var(--terminal-primary)] text-sm leading-relaxed">{openingSentence}</div>
        </div>
        <div className="border border-[var(--terminal-primary-dim)] rounded-lg p-4 focus-within:border-[var(--terminal-primary)] transition-colors">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              if (e.target.value.length <= FREE_WRITING_CONFIG.maxChars) onTextChange(e.target.value);
            }}
            placeholder={FREE_WRITING_CONFIG.placeholder}
            rows={5}
            className="w-full bg-transparent text-[var(--terminal-accent)] text-base leading-relaxed resize-none
              placeholder:text-[var(--terminal-primary-dim)] placeholder:opacity-50
              focus:outline-none caret-[var(--terminal-primary)]"
            style={{ fontSize: "16px" }}
          />
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--terminal-border)]">
            <span className={`text-xs ${charCount < FREE_WRITING_CONFIG.minChars ? "text-[var(--terminal-red)]" : "text-[var(--terminal-primary-dim)]"}`}>
              {charCount} / {FREE_WRITING_CONFIG.maxChars} 字
              {charCount < FREE_WRITING_CONFIG.minChars && ` (至少 ${FREE_WRITING_CONFIG.minChars} 字)`}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[10px] text-[var(--terminal-primary-dim)] mb-2">靈感提示 (點擊插入):</div>
          <div className="flex flex-wrap gap-2">
            {INSPIRATION_HINTS.map((hint) => (
              <button
                key={hint.id}
                onClick={() => insertHint(hint.text)}
                className="text-xs px-3 py-1.5 rounded-full border border-[var(--terminal-primary-dim)]
                  text-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]
                  hover:text-[var(--terminal-primary)] hover:bg-[rgba(212,160,86,0.05)]
                  transition-all duration-200 cursor-pointer"
              >
                {hint.text}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Step 4: Story + Image Generation (shows image preview)
// ============================================================
const StoryImageGenScreen: React.FC<{
  phase: "story" | "image" | "done";
  progress: number;
  imageUrl: string | null;
  storyTitle: string | null;
  storyText: string | null;
  onNext: () => void;
}> = ({ phase, progress, imageUrl, storyTitle, storyText, onNext }) => {
  const phaseLabels = {
    story: "正在寫故事...",
    image: "正在畫圖片...",
    done: "完成!",
  };

  return (
    <div className="step-content flex flex-col items-center justify-center min-h-[400px]">
      {/* Show image if ready */}
      {imageUrl && (
        <div className="w-full max-w-lg mx-auto px-4 mb-6 slide-up">
          <div className="rounded-lg overflow-hidden border border-[var(--terminal-primary)] shadow-lg">
            <img src={imageUrl} alt="Story illustration" className="w-full aspect-video object-cover" />
          </div>
          {storyTitle && (
            <div className="text-center mt-3 text-[var(--terminal-primary)] glow-text text-base">
              {storyTitle}
            </div>
          )}
          {storyText && (
            <div className="mt-2 border border-[var(--terminal-primary-dim)] rounded-lg p-3 bg-[rgba(212,160,86,0.03)]">
              <div className="text-[var(--terminal-accent)] text-xs leading-relaxed">{storyText}</div>
            </div>
          )}
        </div>
      )}

      {/* Spinner when still generating */}
      {phase !== "done" && (
        <>
          <div className="relative w-20 h-20 mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--terminal-primary-dim)] generating-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[var(--terminal-primary)] generating-spin-reverse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[var(--terminal-primary)] text-xl generating-pulse">*</span>
            </div>
          </div>
          <div className="text-[var(--terminal-primary)] glow-text text-sm mb-3">{phaseLabels[phase]}</div>
          <div className="w-48 h-2 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--terminal-primary)] transition-all duration-1000 rounded-full progress-glow"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-[var(--terminal-primary-dim)] text-xs mt-1">{Math.round(progress)}%</div>
        </>
      )}

      {/* Done - show next button */}
      {phase === "done" && (
        <div className="text-center slide-up mt-4">
          <div className="text-[var(--terminal-primary)] glow-text text-sm mb-4">
            故事和圖片都準備好了!
          </div>
          <button
            onClick={onNext}
            className="terminal-btn px-8 py-3 text-sm hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-all duration-300 complete-btn-glow"
          >
            開始製作影片 {">"}
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Step 5: Video Generation with Mini-Game
// ============================================================
const VideoGenWithGame: React.FC<{
  progress: number;
  currentSegment: number;
  totalSegments: number;
  videoReady: boolean;
  imageUrl: string | null;
  onVideoReady: () => void;
}> = ({ progress, currentSegment, totalSegments, videoReady, imageUrl, onVideoReady }) => {
  const hasNotified = useRef(false);

  useEffect(() => {
    if (videoReady && !hasNotified.current) {
      hasNotified.current = true;
      setTimeout(() => onVideoReady(), 1500);
    }
  }, [videoReady, onVideoReady]);

  return (
    <div className="step-content">
      <h2 className="text-center text-lg glow-text mb-2">
        {videoReady ? "-- 影片完成了! --" : "-- 正在製作影片 --"}
      </h2>
      <p className="text-center text-[var(--terminal-primary-dim)] text-xs mb-4">
        {videoReady ? "馬上就可以看囉!" : "影片正在生成中，先來玩個小遊戲吧!"}
      </p>

      <div className="max-w-lg mx-auto px-4">
        {/* Segment indicator */}
        <div className="flex items-center justify-center gap-2 mb-3">
          {[...Array(totalSegments)].map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  i < currentSegment
                    ? "bg-[var(--terminal-primary)] text-[var(--terminal-bg)]"
                    : i === currentSegment && !videoReady
                    ? "border-2 border-[var(--terminal-primary)] text-[var(--terminal-primary)] step-active"
                    : i === currentSegment && videoReady
                    ? "bg-[var(--terminal-primary)] text-[var(--terminal-bg)]"
                    : "border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)]"
                }`}
              >
                {i < currentSegment || (i === currentSegment && videoReady) ? "V" : i + 1}
              </div>
              {i < totalSegments - 1 && (
                <div className={`w-4 h-px ${i < currentSegment ? "bg-[var(--terminal-primary)]" : "bg-[var(--terminal-primary-dim)]"}`} />
              )}
            </div>
          ))}
          <span className="text-[var(--terminal-primary-dim)] text-[10px] ml-2">
            {videoReady ? "全部完成!" : `第 ${currentSegment + 1}/${totalSegments} 段`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[var(--terminal-primary-dim)] text-xs">總進度</span>
            <span className={`text-xs ${videoReady ? "text-[var(--terminal-accent)] glow-text" : "text-[var(--terminal-primary)]"}`}>
              {videoReady ? "100% - 完成!" : `${Math.round(progress)}%`}
            </span>
          </div>
          <div className="w-full h-3 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 rounded-full progress-glow ${videoReady ? "bg-[var(--terminal-accent)]" : "bg-[var(--terminal-primary)]"}`}
              style={{ width: videoReady ? "100%" : `${progress}%` }}
            />
          </div>
        </div>

        {/* Image preview (small) */}
        {imageUrl && (
          <div className="mb-4 rounded-lg overflow-hidden border border-[var(--terminal-primary-dim)] opacity-60">
            <img src={imageUrl} alt="" className="w-full h-24 object-cover" />
          </div>
        )}

        {/* Mini game */}
        {!videoReady && <DungeonQuizGame />}

        <div className="mt-3 text-center">
          <span className="text-[var(--terminal-primary-dim)] text-[10px]">
            {videoReady
              ? "準備播放中..."
              : progress < 20
              ? "正在上傳圖片..."
              : progress < 50
              ? "正在渲染第一段..."
              : progress < 80
              ? "繼續生成中..."
              : "快好了..."}
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Step 6: Final Result (Single merged video + QR code)
// ============================================================
const StoryViewer: React.FC<{
  videoUrl: string;
  storyTitle: string;
  storyText: string;
  onComplete: () => void;
  coinReward: number;
}> = ({ videoUrl, storyTitle, storyText, onComplete, coinReward }) => {
  const [hasPlayed, setHasPlayed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoEnded = () => {
    setHasPlayed(true);
  };

  // QR code points to the video URL (only works for http URLs, not data URIs)
  const isDownloadable = videoUrl.startsWith("http");

  return (
    <div className="step-content flex flex-col items-center justify-center">
      <h2 className="text-lg glow-text mb-4 text-center slide-up">
        -- {storyTitle || "你的故事"} --
      </h2>

      {/* Video player */}
      <div className="w-full max-w-2xl mx-auto px-4 mb-3">
        <div className="relative rounded-lg overflow-hidden border border-[var(--terminal-primary)] slide-up">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            autoPlay
            onEnded={handleVideoEnded}
            className="w-full aspect-video bg-black"
          />
        </div>
        {!hasPlayed && (
          <div className="text-center mt-2">
            <span className="text-[var(--terminal-primary-dim)] text-[10px]">
              請看完影片後才能完成活動...
            </span>
          </div>
        )}
      </div>

      {/* Story text */}
      <div className="max-w-2xl mx-auto px-4 mb-4 w-full">
        <div className="border border-[var(--terminal-primary-dim)] rounded-lg p-3 bg-[rgba(212,160,86,0.03)]">
          <div className="text-[var(--terminal-primary)] text-sm leading-relaxed whitespace-pre-line">
            {storyText}
          </div>
        </div>
      </div>

      {/* QR Code + Complete - only after video ends */}
      {hasPlayed ? (
        <div className="slide-up flex flex-col items-center gap-4">
          {/* QR Code for download */}
          {isDownloadable && (
            <div className="flex items-center gap-4 border border-[var(--terminal-primary-dim)] rounded-lg p-4 bg-[rgba(212,160,86,0.03)]">
              <div className="bg-white p-2 rounded">
                <QRCodeSVG value={videoUrl} size={80} />
              </div>
              <div className="text-left">
                <div className="text-[var(--terminal-primary)] text-xs font-bold mb-1">
                  掃碼下載影片
                </div>
                <div className="text-[var(--terminal-primary-dim)] text-[10px]">
                  用手機掃描 QR Code
                  <br />
                  即可下載你的故事影片
                </div>
              </div>
            </div>
          )}

          <div className="text-center">
            <div className="text-[var(--terminal-accent)] text-xs mb-3">
              完成獎勵: +{coinReward} coins
            </div>
            <button
              onClick={onComplete}
              className="terminal-btn px-8 py-3 text-sm hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-all duration-300 complete-btn-glow"
            >
              {">"} 完成活動
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className="text-[var(--terminal-primary-dim)] text-xs opacity-50">
            看完影片後即可完成活動
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================
const StoryCreatorActivity: React.FC<ActivityComponentProps> = ({
  activity,
  onComplete,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [selectedGenre, setSelectedGenre] = useState<GenreOption | null>(null);
  const [blanks, setBlanks] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");

  // Generation state
  const [storyImgPhase, setStoryImgPhase] = useState<"story" | "image" | "done">("story");
  const [storyImgProgress, setStoryImgProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  const [storyResult, setStoryResult] = useState<StoryResult | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecap, setShowRecap] = useState(false);

  // Ref to always have latest imageUrl (avoids stale closure in setTimeout)
  const imageUrlRef = useRef<string | null>(null);
  const storyResultRef = useRef<StoryResult | null>(null);

  // Build the completed fill-in sentence
  const getFilledSentence = useCallback((): string => {
    if (!selectedGenre) return "";
    return selectedGenre.fillTemplate.segments
      .map((seg) => {
        if (seg.type === "text") return seg.text;
        return blanks[seg.blankId!] || "___";
      })
      .join("");
  }, [selectedGenre, blanks]);

  const allBlanksFilled = selectedGenre
    ? selectedGenre.fillTemplate.segments
        .filter((s: TemplateSegment) => s.type === "blank")
        .every((s: TemplateSegment) => blanks[s.blankId!])
    : false;

  const canProceedStep3 =
    freeText.length >= FREE_WRITING_CONFIG.minChars &&
    freeText.length <= FREE_WRITING_CONFIG.maxChars;

  // Auto-advance from Step 1
  const handleGenreSelect = (genre: GenreOption) => {
    setSelectedGenre(genre);
    setBlanks({});
    setTimeout(() => setStep(2), 600);
  };

  const goNext = () => {
    if (step === 2 && allBlanksFilled) {
      setStep(3);
    } else if (step === 3 && canProceedStep3) {
      setStep(4);
      startStoryAndImageGeneration();
    }
  };

  const goBack = () => {
    if (step === 2) { setStep(1); setSelectedGenre(null); }
    else if (step === 3) { setStep(2); }
  };

  // ====== Phase 1: Story + Image Generation ======
  const startStoryAndImageGeneration = async () => {
    setStoryImgPhase("story");
    setStoryImgProgress(0);
    setError(null);

    const filledSentence = getFilledSentence();

    try {
      // Generate story
      const p1 = setInterval(() => setStoryImgProgress((p) => Math.min(p + 3, 45)), 300);

      const storyRes = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre: selectedGenre!.id,
          genreLabel: selectedGenre!.label,
          fillInSentence: filledSentence,
          freeWriting: freeText,
        }),
      });
      clearInterval(p1);

      if (!storyRes.ok) throw new Error("故事生成失敗");
      const storyData: StoryResult = await storyRes.json();
      setStoryResult(storyData);
      storyResultRef.current = storyData;
      setStoryImgProgress(50);

      // Generate image
      setStoryImgPhase("image");
      const p2 = setInterval(() => setStoryImgProgress((p) => Math.min(p + 2, 90)), 400);

      const mainPrompt =
        storyData.pages.map((p) => p.imagePrompt).join(", ") +
        ", " + selectedGenre!.imagePrompt +
        ", children book illustration, vibrant colors, cute, detailed, wide shot";

      const imageRes = await fetch("/api/generate-image-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: mainPrompt }),
      });
      clearInterval(p2);

      if (imageRes.ok) {
        const imageData = await imageRes.json();
        setImageUrl(imageData.imageUrl);
        imageUrlRef.current = imageData.imageUrl;
      }

      setStoryImgProgress(100);
      setStoryImgPhase("done");
      // Wait for user to click "next" button (handled by StoryImageGenScreen onNext)
    } catch (err: any) {
      setError(err.message || "生成過程發生錯誤");
      setStoryImgProgress(100);
      setStoryImgPhase("done");
    }
  };

  // ====== Phase 2: Video Chain Generation (3 segments, runs while mini-game plays) ======
  const handleAdvanceToVideo = () => {
    setStep(5);
    startVideoChainGeneration();
  };

  const startVideoChainGeneration = async () => {
    setVideoProgress(0);
    setCurrentSegment(0);
    setVideoReady(false);
    setVideoUrls([]);

    const currentImageUrl = imageUrlRef.current;
    const currentStory = storyResultRef.current;

    // Upload image to Firebase Storage first
    let publicImageUrl: string | null = null;
    if (currentImageUrl && currentImageUrl.startsWith("data:")) {
      try {
        console.log("Uploading story image to Firebase Storage...");
        setVideoProgress(5);
        publicImageUrl = await uploadStoryImage(currentImageUrl, "story_scene.png");
        console.log("Image uploaded:", publicImageUrl?.substring(0, 60));
        setVideoProgress(10);
      } catch (uploadErr) {
        console.error("Failed to upload image:", uploadErr);
      }
    } else if (currentImageUrl) {
      publicImageUrl = currentImageUrl;
      setVideoProgress(10);
    }

    // Simulate progress while waiting for chain API
    const pInterval = setInterval(() => {
      setVideoProgress((p) => {
        if (p >= 95) return p;
        return p + (95 - p) * 0.015;
      });
    }, 2000);

    try {
      const pages = currentStory?.pages || [];

      const videoRes = await fetch("/api/generate-video-chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: publicImageUrl,
          storyPages: pages,
        }),
      });

      clearInterval(pInterval);

      if (videoRes.ok) {
        const videoData = await videoRes.json();
        const segmentUrls: string[] = videoData.videoUrls || [];

        if (segmentUrls.length > 0) {
          setCurrentSegment(segmentUrls.length);
          setVideoProgress(85);

          // Concat all segments into one video
          if (segmentUrls.length > 1) {
            console.log(`Concatenating ${segmentUrls.length} segments...`);
            try {
              const concatRes = await fetch("/api/concat-videos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoUrls: segmentUrls }),
              });

              if (concatRes.ok) {
                const concatData = await concatRes.json();
                if (concatData.videoUrl) {
                  // Upload concatenated video to Firebase Storage for a persistent URL + QR code
                  try {
                    const storageUrl = await uploadStoryImage(concatData.videoUrl, "story_video.mp4");
                    setVideoUrls([storageUrl]);
                  } catch {
                    // Use data URL as fallback
                    setVideoUrls([concatData.videoUrl]);
                  }
                } else {
                  setVideoUrls(segmentUrls);
                }
              } else {
                // Concat failed, fall back to first segment
                setVideoUrls([segmentUrls[0]]);
              }
            } catch (concatErr) {
              console.error("Concat failed:", concatErr);
              setVideoUrls([segmentUrls[0]]);
            }
          } else {
            setVideoUrls(segmentUrls);
          }
          setVideoReady(true);
        }
      }
    } catch (err) {
      console.error("Video chain generation failed:", err);
      clearInterval(pInterval);
    }

    setVideoProgress(100);
  };

  const fullStoryText = storyResult
    ? storyResult.pages.map((p) => p.text).join("\n\n")
    : getFilledSentence() + freeText;

  return (
    <div className="flex flex-col h-full">
      <StepIndicator current={step} />

      <div className="flex-1 overflow-y-auto relative">
        {/* Step 1 */}
        <div className={`step-transition ${step === 1 ? "step-visible" : "step-hidden"}`}>
          {step === 1 && <GenreSelector onSelect={handleGenreSelect} selected={selectedGenre} />}
        </div>

        {/* Step 2 */}
        <div className={`step-transition ${step === 2 ? "step-visible" : "step-hidden"}`}>
          {step === 2 && selectedGenre && (
            <FillInTheBlank genre={selectedGenre} blanks={blanks} onBlanksChange={setBlanks} />
          )}
        </div>

        {/* Step 3 */}
        <div className={`step-transition ${step === 3 ? "step-visible" : "step-hidden"}`}>
          {step === 3 && (
            <FreeWriting openingSentence={getFilledSentence()} text={freeText} onTextChange={setFreeText} />
          )}
        </div>

        {/* Step 4: Story + Image generating (manual advance) */}
        <div className={`step-transition ${step === 4 ? "step-visible" : "step-hidden"}`}>
          {step === 4 && (
            <StoryImageGenScreen
              phase={storyImgPhase}
              progress={storyImgProgress}
              imageUrl={imageUrl}
              storyTitle={storyResult?.title || null}
              storyText={storyResult ? storyResult.pages.map((p) => p.text).join(" ") : null}
              onNext={handleAdvanceToVideo}
            />
          )}
        </div>

        {/* Step 5: Video chain gen + mini-game */}
        <div className={`step-transition ${step === 5 ? "step-visible" : "step-hidden"}`}>
          {step === 5 && (
            <VideoGenWithGame
              progress={videoProgress}
              currentSegment={currentSegment}
              totalSegments={3}
              videoReady={videoReady}
              imageUrl={imageUrl}
              onVideoReady={() => setStep(6)}
            />
          )}
        </div>

        {/* Step 6: Final result (only when merged video is ready) */}
        <div className={`step-transition ${step === 6 ? "step-visible" : "step-hidden"}`}>
          {step === 6 && videoUrls.length > 0 && (
            <StoryViewer
              videoUrl={videoUrls[0]}
              storyTitle={storyResult?.title || "你的故事"}
              storyText={fullStoryText}
              onComplete={() => setShowRecap(true)}
              coinReward={activity.coinReward}
            />
          )}
        </div>

        {error && (step === 5 || step === 6) && (
          <div className="text-center text-[var(--terminal-red)] text-xs mt-2 px-4">{error}</div>
        )}
      </div>

      {/* Navigation Bar */}
      {(step === 2 || step === 3) && (
        <div className="border-t border-[var(--terminal-primary-dim)] px-4 py-3 flex items-center justify-between">
          <button onClick={goBack} className="terminal-btn px-4 py-2 text-xs">{"<"} 上一步</button>
          <button
            onClick={goNext}
            disabled={(step === 2 && !allBlanksFilled) || (step === 3 && !canProceedStep3)}
            className="terminal-btn px-6 py-2 text-xs"
          >
            {step === 3 ? "開始創作 >" : "下一步 >"}
          </button>
        </div>
      )}

      {/* Recap animation overlay */}
      {showRecap && (
        <StoryRecap onComplete={onComplete} />
      )}
    </div>
  );
};

export default StoryCreatorActivity;
