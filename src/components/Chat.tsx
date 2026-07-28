import { useEffect, useRef, useState, useCallback, type ComponentType } from "react";
import { useRouter } from "next/router";
import { FiSend, FiMic, FiImage, FiFilm, FiMusic, FiFileText, FiDownload, FiPlay, FiPause } from "react-icons/fi";
import { RxHamburgerMenu } from "react-icons/rx";
import { HiOutlineBeaker } from "react-icons/hi";
import useAnalytics from "@/hooks/useAnalytics";
import useAutoResizeTextArea from "@/hooks/useAutoResizeTextArea";
import useSpeechRecognition from "@/hooks/useSpeechRecognition";
import Message from "./Message";
import AvatarPreview from "./AvatarPreview";
import VoiceRecorder from "./VoiceRecorder";
import CoinDisplay from "./CoinDisplay";
import { DEFAULT_OPENAI_MODEL } from "@/shared/Constants";
import { useZhuyin } from "@/contexts/ZhuyinContext";
import { useMemory } from "@/contexts/MemoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCoin, COIN_VALUES } from "@/contexts/CoinContext";
import { useConversation } from "@/contexts/ConversationContext";
import generateSystemPrompt from "@/utils/generateSystemPrompt";
import { ActiveScript, UserAvatar, AvatarPersonality } from "@/types/Script";
import { uploadAvatarFrames, uploadStoryAudio } from "@/lib/firestore";
import { getScript } from "@/scripts";
import type { ScriptDefinition, ParseResult } from "@/scripts/types";
import type { StoryPhase } from "@/hooks/useStoryHelper";
import { useStoryHelper } from "@/hooks/useStoryHelper";
import StorySlideshow from "./StorySlideshow";
import {
  generateQuestionnairePrompt,
  generateForceStartGenerationPrompt,
  generateForceAvatarReadyPrompt,
} from "@/scripts/create-avatar";

interface ChatProps {
  toggleComponentVisibility: () => void;
  toggleScriptPanel?: () => void;
  isScriptPanelOpen?: boolean;
  activeScript: ActiveScript;
  onScriptComplete?: () => void;
}

interface PendingAvatar {
  data: Record<string, string>;
  isGenerating: boolean;
  imageUrl?: string;
  // 獨立幀模式（PixelLab）
  frames?: string[];
  // Sprite sheet 模式（DALL-E）
  spriteSheet?: boolean;
  frameCount?: number;
  gridCols?: number;
  gridRows?: number;
  error?: string;
  generationProgress?: number; // 0-100
}

type LabToolMode = "text" | "image" | "video" | "music";

interface LabToolConfig {
  id: LabToolMode;
  label: string;
  shortLabel: string;
  statusLabel: string;
  icon: ComponentType<{ className?: string }>;
  assetUrl: string;
  downloadUrl?: string;
  downloadName: string;
  title: string;
  description: string;
  placeholder: string;
  doneMeta: string;
}

const LAB_TOOL_RESULT_PREFIX = "[LAB_TOOL_RESULT]";
const LAB_TOOL_WORKSHEET_ID = "S3W01";
const LAB_TOOL_MEDIA_ACCESS_KEY = "lab-terminal:s3w01-media-access";
const LAB_TOOL_VIDEO_POLL_ATTEMPTS = 3;
const LAB_TOOL_VIDEO_POLL_INTERVAL_MS = 15000;

const LAB_TOOL_MODES: LabToolMode[] = ["text", "image", "video", "music"];

const LAB_TOOL_RING_COLORS: Record<LabToolMode, string> = {
  text: "var(--terminal-primary)",
  image: "#38bdf8",
  video: "#f59e0b",
  music: "#d946ef",
};

const LAB_TOOL_CONFIG: Record<LabToolMode, LabToolConfig> = {
  text: {
    id: "text",
    label: "Terminal",
    shortLabel: "文字",
    statusLabel: "TEXT",
    icon: FiFileText,
    assetUrl: "/games/assets/s3-w01/tool-text.png",
    downloadName: "s3-w01-text-result.txt",
    title: "文字測試成果",
    description: "已依照提示詞整理成預設文字內容。這是 S3W01 MVP 測試資料，沒有呼叫外部 API。",
    placeholder: "輸入文字提示詞，例如：把 AI 工具使用提醒整理成 3 點",
    doneMeta: "TEXT_CHAT_READY",
  },
  image: {
    id: "image",
    label: "Lab Image",
    shortLabel: "圖片",
    statusLabel: "IMAGE",
    icon: FiImage,
    assetUrl: "/games/assets/s3-w01/tool-image.png",
    downloadUrl: "/games/assets/s3-w01/tool-image.png",
    downloadName: "s3-w01-image-result.png",
    title: "圖片測試成果",
    description: "已依照提示詞產生預設圖片。這是 S3W01 MVP 測試資料，沒有呼叫外部 API。",
    placeholder: "輸入圖片提示詞，例如：生成一張藍白亮晶晶的冰雪寶箱圖片",
    doneMeta: "PNG_PRESET_READY",
  },
  video: {
    id: "video",
    label: "Lab Video",
    shortLabel: "影片",
    statusLabel: "VIDEO",
    icon: FiFilm,
    assetUrl: "/games/assets/s3-w01/tool-video.png",
    downloadUrl: "/games/assets/s3-w01/tool-video.png",
    downloadName: "s3-w01-video-preview.png",
    title: "影片測試成果",
    description: "影片生成完成後會顯示可播放的影片；生成中會持續等待 API 結果。",
    placeholder: "輸入影片提示詞，例如：生成 5 秒寶箱冒光的短影片",
    doneMeta: "MP4_PRESET_THUMBNAIL_READY",
  },
  music: {
    id: "music",
    label: "Lab Music",
    shortLabel: "音樂",
    statusLabel: "MUSIC",
    icon: FiMusic,
    assetUrl: "/games/assets/s3-w01/tool-music.png",
    downloadUrl: "/games/assets/neon-grid.mp3",
    downloadName: "s3-w01-music-result.mp3",
    title: "音樂測試成果",
    description: "已依照提示詞產生預設音樂封面。MVP 階段先用圖片代表音樂結果。",
    placeholder: "輸入音樂提示詞，例如：生成 30 秒明亮有節奏的背景音樂",
    doneMeta: "AUDIO_PRESET_COVER_READY",
  },
};

const buildLabToolDemoResponse = (mode: LabToolMode, prompt: string): string => {
  return LAB_TOOL_RESULT_PREFIX + JSON.stringify({
    mode,
    prompt: prompt.trim(),
    createdAt: new Date().toISOString(),
    cached: false,
  });
};

const getLabToolDemoReplies = (mode: LabToolMode): string[] => {
  if (mode === "text") {
    return ["整理成三點提醒", "改成小學生看得懂", "列出工具選擇理由"];
  }
  if (mode === "image") {
    return ["生成寶箱圖片", "生成森林入口圖片", "生成工具地圖圖片"];
  }
  if (mode === "video") {
    return ["生成 5 秒短影片", "生成寶箱冒光動畫", "生成角色登場影片"];
  }
  return ["生成 30 秒音樂", "生成成功音效", "生成熱血背景音樂"];
};

interface LabToolResultPayload {
  mode: LabToolMode;
  prompt: string;
  createdAt?: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  downloadUrl?: string;
  cached?: boolean;
  status?: string;
  fileName?: string;
  videoId?: string;
  provider?: string;
  fallback?: boolean;
  fallbackReason?: string;
  backgroundTracking?: boolean;
  backgroundVideoId?: string;
  error?: string;
}

const parseLabToolResult = (content: string | null): LabToolResultPayload | null => {
  if (!content?.startsWith(LAB_TOOL_RESULT_PREFIX)) return null;
  try {
    const payload = JSON.parse(content.slice(LAB_TOOL_RESULT_PREFIX.length)) as LabToolResultPayload;
    return LAB_TOOL_MODES.includes(payload.mode) ? payload : null;
  } catch {
    return null;
  }
};

const hasLabToolMediaAccess = () => {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(LAB_TOOL_MEDIA_ACCESS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.worksheetId === LAB_TOOL_WORKSHEET_ID && parsed?.status === "open";
  } catch {
    return false;
  }
};

const buildDownloadHref = (href: string) => {
  if (!href || !href.startsWith("/api/lab-tools/asset")) return href;
  return `${href}${href.includes("?") ? "&" : "?"}download=1`;
};

const formatLabToolApiError = (error: unknown, details?: unknown) => {
  const baseMessage = error instanceof Error ? error.message : String(error || "未知錯誤");
  const detailsText =
    typeof details === "string"
      ? details
      : details
      ? JSON.stringify(details)
      : "";
  const fullMessage = detailsText ? `${baseMessage} - ${detailsText}` : baseMessage;

  if (/quota|limit:\s*0|rate[- ]?limit|too many|429|resource[_ -]?exhausted|exceeded/i.test(fullMessage)) {
    return `API 已連上，但目前專案沒有可用額度。原始訊息：${fullMessage}`;
  }

  if (/missing_permissions|music_generation|unauthorized|401/i.test(fullMessage)) {
    return `API key 已連上，但缺少這個功能的權限。原始訊息：${fullMessage}`;
  }

  return fullMessage;
};

const getTextDemoResult = (prompt: string) => [
  "1. 先看清楚任務要產出文字、圖片、影片或音樂。",
  "2. 選對工具後，再把主題、用途和細節寫進提示詞。",
  "3. 生成後要自己檢查，不符合就修改提示詞再試一次。",
  "",
  `學生提示詞：${prompt}`,
].join("\n");

const LabToolResultMessage: React.FC<{
  payload: LabToolResultPayload;
  avatarName?: string;
}> = ({ payload, avatarName }) => {
  const tool = LAB_TOOL_CONFIG[payload.mode];
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timestamp = new Date(payload.createdAt || Date.now()).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const textResult = payload.text || getTextDemoResult(payload.prompt);
  const imageUrl = payload.imageUrl || tool.assetUrl;
  const audioUrl = payload.audioUrl || tool.downloadUrl || "";
  const videoUrl = payload.videoUrl || "";
  const hasError = Boolean(payload.error);
  const isProcessing = payload.status === "processing";
  const downloadHref = buildDownloadHref(
    payload.mode === "text"
      ? `data:text/plain;charset=utf-8,${encodeURIComponent(textResult)}`
      : payload.downloadUrl || videoUrl || audioUrl || imageUrl || tool.downloadUrl || tool.assetUrl
  );
  const downloadName = payload.fileName || tool.downloadName;

  const togglePlayback = async () => {
    if (payload.mode === "music" && audioRef.current) {
      if (audioRef.current.paused) {
        await audioRef.current.play();
        setIsPreviewPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPreviewPlaying(false);
      }
      return;
    }
    if (payload.mode === "video" && videoRef.current) {
      if (videoRef.current.paused) {
        await videoRef.current.play();
        setIsPreviewPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPreviewPlaying(false);
      }
      return;
    }
    setIsPreviewPlaying((value) => !value);
  };

  return (
    <div className="terminal-message px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="text-[var(--terminal-green-dim)] text-xs shrink-0 font-mono">
          [{timestamp}]
        </span>
        <span className="shrink-0 font-bold text-[var(--terminal-amber)]">
          {avatarName || "AI"}@LAB:~$
        </span>
        <div className="flex-1 min-w-0 text-[var(--terminal-green)]">
          <div className="border border-[var(--terminal-primary-dim)] bg-black/30 p-3 max-w-xl">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--terminal-primary-dim)] pb-2">
              <div>
                <div className="text-[var(--terminal-highlight)] font-bold">{tool.title}</div>
                <div className="text-[var(--terminal-primary-dim)] text-xs mt-0.5">
                  {tool.label} ·{" "}
                  {payload.cached
                    ? "已重用快取"
                    : payload.status === "processing"
                    ? "生成處理中"
                    : tool.doneMeta}
                </div>
              </div>
              {!hasError && !isProcessing && (
                <a
                  href={downloadHref}
                  download={downloadName}
                  className="terminal-btn inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                >
                  <FiDownload className="h-3.5 w-3.5" />
                  下載
                </a>
              )}
            </div>

            <div className="mt-3">
              {hasError ? (
                <div className="border border-[var(--terminal-red)] bg-red-900/20 p-3 text-xs leading-relaxed text-[var(--terminal-red)]">
                  API 生成失敗：{payload.error}
                </div>
              ) : payload.mode === "text" ? (
                <pre className="whitespace-pre-wrap border border-[var(--terminal-primary-dim)] bg-[var(--terminal-primary)]/5 p-3 text-xs leading-relaxed">
                  {textResult}
                </pre>
              ) : (
                <div className="space-y-2">
                  {payload.mode === "image" && (
                    <img
                      src={imageUrl}
                      alt={tool.title}
                      className="w-full max-w-sm border border-[var(--terminal-primary-dim)] bg-black object-cover"
                    />
                  )}

                  {payload.mode === "video" && (
                    <>
                      {isProcessing ? (
                        <div className="flex min-h-[180px] w-full max-w-sm items-center justify-center border border-[var(--terminal-primary-dim)] bg-black/60 p-4">
                          <div className="text-center text-xs text-[var(--terminal-amber)]">
                            <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-[var(--terminal-highlight)] border-t-transparent" />
                            <div className="font-bold">影片生成中</div>
                            <div className="mt-1 text-[var(--terminal-primary-dim)]">
                              正在等待 API 完成，完成後會保存成影片。
                            </div>
                          </div>
                        </div>
                      ) : videoUrl ? (
                        <video
                          ref={videoRef}
                          src={videoUrl}
                          className="w-full max-w-sm border border-[var(--terminal-primary-dim)] bg-black"
                          controls
                          onPause={() => setIsPreviewPlaying(false)}
                          onPlay={() => setIsPreviewPlaying(true)}
                        />
                      ) : (
                        <div className="relative w-full max-w-sm overflow-hidden border border-[var(--terminal-primary-dim)] bg-black">
                          <img
                            src={tool.assetUrl}
                            alt={tool.title}
                            className={`w-full object-cover transition-transform duration-700 ${
                              isPreviewPlaying ? "scale-105" : ""
                            }`}
                          />
                          {isPreviewPlaying && (
                            <div className="absolute inset-0 border-4 border-[var(--terminal-highlight)]/40 animate-pulse" />
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {payload.mode === "music" && (
                    <>
                      <img
                        src={tool.assetUrl}
                        alt={tool.title}
                        className="w-full max-w-sm border border-[var(--terminal-primary-dim)] bg-black object-cover"
                      />
                      <audio
                        ref={audioRef}
                        src={audioUrl}
                        className="w-full max-w-sm"
                        controls
                        onPause={() => setIsPreviewPlaying(false)}
                        onPlay={() => setIsPreviewPlaying(true)}
                      />
                    </>
                  )}

                  {(payload.mode === "video" || payload.mode === "music") && !isProcessing && (
                    <button
                      type="button"
                      onClick={togglePlayback}
                      className="terminal-btn inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                    >
                      {isPreviewPlaying ? (
                        <FiPause className="h-3.5 w-3.5" />
                      ) : (
                        <FiPlay className="h-3.5 w-3.5" />
                      )}
                      {isPreviewPlaying ? "暫停" : "播放"}
                    </button>
                  )}

                  {payload.cached && (
                    <div className="text-[var(--terminal-highlight)] text-xs">
                      已找到相似提示詞，直接使用 S3W01 暫存成果。
                    </div>
                  )}

                  {payload.fallback && payload.backgroundTracking && (
                    <div className="text-[var(--terminal-primary-dim)] text-xs">
                      已先提供保存影片，原本 API 影片會在背景完成後保存。
                    </div>
                  )}

                  {payload.status === "processing" && (
                    <div className="text-[var(--terminal-amber)] text-xs">
                      影片仍在生成中，正在等待 API 完成。
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 text-[var(--terminal-primary-dim)] text-xs leading-relaxed">
              <div>{tool.description}</div>
              <div className="mt-1">學生提示詞：{payload.prompt}</div>
              <div className="mt-1 text-[var(--terminal-highlight)]">
                下一步：回到 S3W01 學習單，把這個測試成果回填到對應題目。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Archived story player — uses stored audio URLs from Firebase Storage
const ArchivedStoryPlayer: React.FC<{
  title: string;
  info: string;
  panels: { imageUrl: string; text: string; audioUrl?: string }[];
}> = ({ title, info, panels }) => {
  // Convert audio URLs to the format StorySlideshow expects
  // StorySlideshow uses audioBase64, but we can also support URL-based audio
  const slideshowPanels = panels.map((p) => ({
    imageUrl: p.imageUrl,
    text: p.text,
    audioUrl: p.audioUrl,
  }));

  return (
    <div>
      <div className="px-4 py-3 border-b border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/5">
        <div className="text-[var(--terminal-primary)] text-base font-bold glow-text mb-1">
          {title}
        </div>
        <div className="text-[var(--terminal-primary-dim)] text-xs">{info}</div>
      </div>
      {slideshowPanels.length > 0 && (
        <StorySlideshow
          panels={slideshowPanels}
          storyTitle={title}
          roundNumber={0}
          onComplete={() => {}}
        />
      )}
    </div>
  );
};

// 腳本階段（更細緻的流程控制）
type ScriptPhase =
  | "intro"           // 課程介紹
  | "appearance"      // 收集外觀資訊
  | "generating"      // 背景生成中，同時收集個性
  | "personality"     // 收集個性資訊
  | "avatar_ready"    // Avatar 完成，展示中
  | "questionnaire"   // 了解學生
  | "complete";       // 全部完成

// 已收集的資訊追蹤
interface CollectedInfo {
  [key: string]: string | undefined;
  characterType?: string;
  color?: string;
  name?: string;
  accessory?: string;
  speakingStyle?: string;
  specialAbility?: string;
  catchphrase?: string;
}

const Chat = (props: ChatProps) => {
  const {
    toggleComponentVisibility,
    toggleScriptPanel,
    isScriptPanelOpen,
    activeScript,
    onScriptComplete,
  } = props;
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showEmptyChat, setShowEmptyChat] = useState(true);
  const [conversation, setConversation] = useState<any[]>([]);
  const [activelyStreaming, setActivelyStreaming] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [labToolMode, setLabToolMode] = useState<LabToolMode>("text");
  const [isLabToolMenuOpen, setIsLabToolMenuOpen] = useState(false);
  const [labToolFeedback, setLabToolFeedback] = useState("Lab Text 已就緒，輸入提示詞後按送出。");
  const [isLabToolSwitching, setIsLabToolSwitching] = useState(false);
  const [isLabToolGenerating, setIsLabToolGenerating] = useState(false);
  const [labToolMediaAccess, setLabToolMediaAccess] = useState(false);
  const [scriptPhase, setScriptPhase] = useState<ScriptPhase>("appearance");
  const [collectedInfo, setCollectedInfo] = useState<CollectedInfo>({});
  const [collectedStudentInfo, setCollectedStudentInfo] = useState<Record<string, any>>({});
  const [avatarPersonality, setAvatarPersonality] = useState<Record<string, string> | null>(null);
  const [isGeneratingInBackground, setIsGeneratingInBackground] = useState(false);
  const [scriptTurnCount, setScriptTurnCount] = useState(0);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [showInputGuide, setShowInputGuide] = useState(false);
  const [generatingTurnCount, setGeneratingTurnCount] = useState(0);
  const generationPromiseRef = useRef<Promise<any> | null>(null);
  const sendMessageInFlightRef = useRef(false);
  const hasStartedGeneration = useRef(false);
  const FORCE_AVATAR_READY_TURNS = 5; // Force AVATAR_READY after 5 turns in generating phase

  // Story helper state (managed by hook)
  // First time: 3 rounds free. After that (paid): 1 round only.
  const isStoryPaid = (() => {
    try {
      const saved = localStorage.getItem("completedScripts");
      return saved ? (JSON.parse(saved) as string[]).includes("story-helper") : false;
    } catch { return false; }
  })();
  const story = useStoryHelper(isStoryPaid ? 1 : 3);
  const storyPhase = story.storyPhase;
  const storyScriptInitialized = story.initialized;
  const { zhuyinMode, setZhuyinMode } = useZhuyin();
  const { user, updateUser } = useAuth();
  const { addCoins, coins } = useCoin();
  const {
    memory,
    isExtracting,
    triggerMemoryExtraction,
    shouldTriggerExtraction,
    incrementMessageCount,
  } = useMemory();
  const {
    archiveConversation,
    currentConversation,
    updateConversationMessages,
    createNewConversation,
  } = useConversation();
  const { trackEvent } = useAnalytics();
  const textAreaRef = useAutoResizeTextArea();
  const bottomOfChatRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scriptInitialized = useRef(false);
  const labToolFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    isListening,
    transcript,
    isSupported: isSpeechSupported,
    error: speechError,
    isProcessing: isSpeechProcessing,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  const selectedModel = DEFAULT_OPENAI_MODEL;
  const prevConversationIdRef = useRef<string | null>(null);

  // Get current script definition from registry
  const currentScript = activeScript ? getScript(activeScript) : undefined;

  // Sync with ConversationContext: load messages when switching sessions
  useEffect(() => {
    if (activeScript) return; // Scripts manage their own conversation state
    const newId = currentConversation?.id || null;
    if (newId === prevConversationIdRef.current) return;
    prevConversationIdRef.current = newId;

    if (currentConversation && currentConversation.messages.length > 0) {
      // Load existing conversation
      const loaded = currentConversation.messages.map((m) => ({
        content: m.content,
        role: m.role === "user" ? "user" : "system",
      }));
      setConversation(loaded);
      setShowEmptyChat(false);
    } else {
      // New or empty conversation
      setConversation([]);
      setShowEmptyChat(true);
    }
    setQuickReplies([]);
    setMessage("");
    setErrorMessage("");
  }, [currentConversation?.id, activeScript]);

  // 當腳本啟動時，自動開始對話（統一處理所有腳本）
  useEffect(() => {
    if (!activeScript || !currentScript) {
      scriptInitialized.current = false;
      storyScriptInitialized.current = false;
      return;
    }

    // Use per-script ref to prevent double init
    const initRef = activeScript === "create-avatar" ? scriptInitialized : storyScriptInitialized;
    if (initRef.current) return;
    initRef.current = true;

    // Reset common state
    setConversation([]);
    setShowEmptyChat(false);
    setScriptTurnCount(0);
    setQuickReplies([]);

    // Reset script-specific state
    if (activeScript === "create-avatar") {
      setPendingAvatar(null);
      setScriptPhase("intro");
      setCollectedInfo({});
      setCollectedStudentInfo({});
      setAvatarPersonality(null);
      setGeneratingTurnCount(0);
      hasStartedGeneration.current = false;
    } else if (activeScript === "story-helper") {
      story.reset();
    }

    // Send init message
    setTimeout(() => {
      sendScriptInitMessage(currentScript);
    }, 500);
  }, [activeScript]);

  const sendScriptInitMessage = async (script: ScriptDefinition) => {
    setIsLoading(true);
    setConversation([{ content: null, role: "system" }]);

    try {
      let introPrompt = script.getInitPrompt({});
      if (user?.kidMode) {
        const markers = script.getKidModeMarkers();
        introPrompt += `\n\n## 重要：幼兒模式\n你的每次回覆必須在30個中文字以內，用最簡單的詞彙，不要用複雜的句子。\n注意：JSON 資料標記（如 ${markers} 等）不算在30字限制內，請完整輸出。`;
      }

      const response = await fetch(`/api/openai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ content: script.getInitUserMessage(), role: "user" }],
          model: selectedModel,
          systemPrompt: introPrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setActivelyStreaming(true);
        setConversation([{ content: data.message, role: "system" }]);
        generateQuickReplies(data.message);
      }
    } catch (error: any) {
      setErrorMessage(`ERROR: ${error.message}`);
    }
    setIsLoading(false);
  };

  const isKidMode = user?.kidMode ?? true;
  const FORCE_GENERATION_TURNS = 10;

  // Script progress calculation (uses registry)
  const getScriptProgress = (): number => {
    if (!activeScript || !currentScript) return 0;
    const currentPhaseForProgress = activeScript === "create-avatar" ? scriptPhase : storyPhase;
    // Special case: avatar_ready with image = 100%
    if (activeScript === "create-avatar" && scriptPhase === "avatar_ready" && pendingAvatar && !pendingAvatar.isGenerating && pendingAvatar.imageUrl) {
      return 100;
    }
    return currentScript.getProgress(currentPhaseForProgress, scriptTurnCount);
  };

  const scriptProgress = getScriptProgress();

  // Auto-complete script when max turns reached
  useEffect(() => {
    if (!activeScript || !currentScript) return;
    const currentPhaseVal = activeScript === "create-avatar" ? scriptPhase : storyPhase;
    if (scriptTurnCount >= currentScript.maxTurns && currentPhaseVal !== "complete") {
      if (activeScript === "create-avatar") {
        setScriptPhase("complete");
        setTimeout(() => {
          setConversation([]);
          setShowEmptyChat(true);
          setQuickReplies([]);
          setScriptPhase("appearance");
          setPendingAvatar(null);
          setCollectedInfo({});
          setAvatarPersonality(null);
          setScriptTurnCount(0);
          setGeneratingTurnCount(0);
          hasStartedGeneration.current = false;
          onScriptComplete?.();
        }, 1500);
      } else if (activeScript === "story-helper") {
        story.setStoryPhase("complete");
        setTimeout(() => {
          setConversation([]);
          setShowEmptyChat(true);
          setQuickReplies([]);
          story.reset();
          setScriptTurnCount(0);
          onScriptComplete?.();
        }, 1500);
      }
    }
  }, [scriptTurnCount, activeScript, scriptPhase, storyPhase]);

  // Generate quick replies via a second API call
  const generateQuickReplies = async (aiMessage: string) => {
    try {
      const response = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ content: `AI 剛剛說了：「${aiMessage.slice(0, 200)}」\n\n請針對這段回覆，生成 3 個適合小學生使用的簡短回覆選項。\n只回傳 JSON 陣列格式，例如：["選項1", "選項2", "選項3"]\n不要加任何其他文字。`, role: "user" }],
          model: selectedModel,
          systemPrompt: "你是一個快速回覆選項產生器。只回傳 JSON 陣列，不要加任何解釋。選項要簡短（10字以內），且跟 AI 的訊息相關。",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.message.trim();
        // Parse JSON array from response
        const match = text.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]) as string[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setQuickReplies(parsed.slice(0, 4));
            return;
          }
        }
      }
    } catch (err) {
      console.warn("Quick replies generation failed, using fallback");
    }
    // Fallback
    setQuickReplies(getFallbackReplies());
  };

  // Fallback quick replies (uses registry)
  const getFallbackReplies = (): string[] => {
    if (currentScript) {
      const phase = activeScript === "create-avatar" ? scriptPhase : storyPhase;
      const state = activeScript === "create-avatar"
        ? { collectedInfo }
        : { rerollCount: story.rerollCount, maxRerolls: story.maxRerolls, completedRounds: story.completedRounds };
      return currentScript.getFallbackReplies(phase, state);
    }
    return ["告訴我更多", "換個話題", "幫我解釋", "謝謝"];
  };

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "24px";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [message, textAreaRef]);

  // Track whether user has manually scrolled up
  const userScrolledUp = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (userScrolledUp.current) return; // Don't force scroll if user scrolled up
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Detect user scrolling up
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      // If user is within 100px of bottom, consider them "at bottom"
      userScrolledUp.current = distanceFromBottom > 100;
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll on conversation change (new message added)
  useEffect(() => {
    userScrolledUp.current = false; // Reset on new message
    requestAnimationFrame(scrollToBottom);
  }, [conversation, pendingAvatar, scrollToBottom]);

  // Scroll during streaming — poll but respect user scroll
  useEffect(() => {
    if (isLoading) {
      userScrolledUp.current = false;
      scrollToBottom();
      return;
    }
    // After response arrives, poll scroll for streaming text duration
    const timer = setInterval(scrollToBottom, 80);
    const cleanup = setTimeout(() => clearInterval(timer), 15000);
    return () => {
      clearInterval(timer);
      clearTimeout(cleanup);
    };
  }, [conversation, scrollToBottom, isLoading]);

  useEffect(() => {
    if (transcript) {
      setMessage(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (speechError) {
      setErrorMessage(speechError);
    }
  }, [speechError]);

  const refreshLabToolMediaAccess = useCallback(() => {
    setLabToolMediaAccess(hasLabToolMediaAccess());
  }, []);

  useEffect(() => {
    refreshLabToolMediaAccess();
    window.addEventListener("focus", refreshLabToolMediaAccess);
    window.addEventListener("storage", refreshLabToolMediaAccess);
    return () => {
      window.removeEventListener("focus", refreshLabToolMediaAccess);
      window.removeEventListener("storage", refreshLabToolMediaAccess);
    };
  }, [refreshLabToolMediaAccess]);

  useEffect(() => {
    if (activeScript || labToolMode === "text" || labToolMediaAccess) return;
    setLabToolMode("text");
    setIsLabToolMenuOpen(false);
    setLabToolFeedback("請先從 S3W01 學習單開啟任務，才可以使用圖片、影片、音樂生成。Terminal 文字模式仍可使用。");
  }, [activeScript, labToolMediaAccess, labToolMode]);

  useEffect(() => {
    if (!router.isReady || activeScript) return;
    const rawMode = router.query.labTool;
    const nextMode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
    if (!nextMode || !LAB_TOOL_MODES.includes(nextMode as LabToolMode)) return;

    const mode = nextMode as LabToolMode;
    const tool = LAB_TOOL_CONFIG[mode];
    if (mode !== "text" && !labToolMediaAccess) {
      setLabToolMode("text");
      setIsLabToolMenuOpen(false);
      setIsLabToolSwitching(false);
      setLabToolFeedback("請先從 S3W01 學習單開啟任務，才可以使用圖片、影片、音樂生成。");
      return;
    }
    setLabToolMode(mode);
    setIsLabToolMenuOpen(false);
    setIsLabToolSwitching(true);
    setLabToolFeedback(`${tool.label} 已由學習單切換完成，可以直接生成${tool.shortLabel}。`);

    setLabToolFeedback(
      mode === "text"
        ? "已切回 Terminal，文字會使用原本的對話模式。"
        : `${tool.label} 已由學習單切換完成，可以生成${tool.shortLabel}。`
    );

    if (labToolFeedbackTimerRef.current) {
      clearTimeout(labToolFeedbackTimerRef.current);
    }
    labToolFeedbackTimerRef.current = setTimeout(() => {
      setIsLabToolSwitching(false);
      setLabToolFeedback(`${tool.label} 已就緒，輸入提示詞後按送出。`);
      setLabToolFeedback(
        mode === "text"
          ? "Terminal 已就緒，輸入文字後會使用原本的對話模式。"
          : `${tool.label} 已就緒，輸入提示詞後按送出。`
      );
    }, 1400);
  }, [router.isReady, router.query.labTool, activeScript, labToolMediaAccess]);

  useEffect(() => {
    return () => {
      if (labToolFeedbackTimerRef.current) {
        clearTimeout(labToolFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeScript) return;

    const tool = LAB_TOOL_CONFIG[labToolMode];
    setLabToolFeedback(
      labToolMode === "text"
        ? "\u5df2\u5207\u56de Terminal\uff0c\u6587\u5b57\u6703\u4f7f\u7528\u539f\u672c\u7684\u5c0d\u8a71\u6a21\u5f0f\u3002"
        : `${tool.label} \u5df2\u5207\u63db\u5a92\u9ad4\u751f\u6210\u6a21\u5f0f\u3002`
    );

    const readyFeedbackTimer = setTimeout(() => {
      setLabToolFeedback(
        labToolMode === "text"
          ? "Terminal \u5df2\u5c31\u7dd2\uff0c\u8f38\u5165\u6587\u5b57\u5f8c\u6703\u4f7f\u7528\u539f\u672c\u7684\u5c0d\u8a71\u6a21\u5f0f\u3002"
          : `${tool.label} \u5df2\u5c31\u7dd2\uff0c\u8f38\u5165\u63d0\u793a\u8a5e\u5f8c\u6703\u751f\u6210\u5a92\u9ad4\u3002`
      );
    }, 1500);

    return () => clearTimeout(readyFeedbackTimer);
  }, [activeScript, labToolMode]);

  const handleLabToolModeChange = (mode: LabToolMode) => {
    const tool = LAB_TOOL_CONFIG[mode];
    if (mode !== "text" && !labToolMediaAccess) {
      setLabToolMode("text");
      setIsLabToolMenuOpen(false);
      setIsLabToolSwitching(false);
      setLabToolFeedback("請先從 S3W01 學習單開啟任務，才可以使用圖片、影片、音樂生成。");
      textAreaRef.current?.focus();
      return;
    }
    setLabToolMode(mode);
    setIsLabToolMenuOpen(false);
    setIsLabToolSwitching(true);
    setLabToolFeedback(`${tool.label} 已切換完成，現在會生成${tool.shortLabel}測試成果。`);

    if (labToolFeedbackTimerRef.current) {
      clearTimeout(labToolFeedbackTimerRef.current);
    }

    labToolFeedbackTimerRef.current = setTimeout(() => {
      setIsLabToolSwitching(false);
      setLabToolFeedback(`${tool.label} 已就緒，輸入提示詞後按送出。`);
    }, 1200);

    textAreaRef.current?.focus();
  };

  const saveDemoConversation = (messages: { content: string | null; role: "user" | "system" }[]) => {
    const messagesToSave = messages
      .filter((m) => m.content)
      .map((m) => ({
        content: m.content as string,
        role: m.role,
        timestamp: new Date().toISOString(),
      }));

    if (!currentConversation) {
      createNewConversation(messagesToSave);
      return;
    }

    updateConversationMessages(messagesToSave);
  };

  const pollLabToolVideoResult = async (prompt: string, videoId: string) => {
    let latestData: any = { status: "processing", videoId };

    for (let attempt = 1; attempt <= LAB_TOOL_VIDEO_POLL_ATTEMPTS; attempt += 1) {
      setLabToolFeedback(
        `Lab Video 生成中，正在等待影片完成 (${attempt}/${LAB_TOOL_VIDEO_POLL_ATTEMPTS})...`
      );
      await new Promise((resolve) => setTimeout(resolve, LAB_TOOL_VIDEO_POLL_INTERVAL_MS));

      const response = await fetch("/api/lab-tools/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          worksheetId: "S3W01",
          videoId,
        }),
      });
      let data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(formatLabToolApiError(data.error || "Lab Tool video polling failed", data.details));
      }

      latestData = data;
      if (data.status !== "processing" || data.videoUrl || data.cached) {
        return data;
      }
    }

    setLabToolFeedback("Lab Video 等待時間已到，改用已保存的影片素材...");
    const fallbackResponse = await fetch("/api/lab-tools/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt.trim(),
        worksheetId: "S3W01",
        fallbackOnly: true,
        videoId,
      }),
    });
    const fallbackData = await fallbackResponse.json().catch(() => ({}));

    if (!fallbackResponse.ok) {
      throw new Error(
        formatLabToolApiError(fallbackData.error || "Lab Tool video fallback failed", fallbackData.details)
      );
    }

    if (fallbackData.videoUrl || fallbackData.cached) {
      return fallbackData;
    }

    return latestData;
  };

  const completeLabToolDemoGeneration = async (prompt: string, mode: LabToolMode) => {
    const tool = LAB_TOOL_CONFIG[mode];
    setIsLabToolGenerating(true);
    setLabToolFeedback(`${tool.label} 正在生成測試內容...`);

    await new Promise((resolve) => setTimeout(resolve, mode === "video" ? 900 : 650));

    let finalResponse = buildLabToolDemoResponse(mode, prompt);
    let completionFeedback = `${tool.label} 已完成，請回到 S3W01 學習單回填成果。`;

    try {
      const response = await fetch(`/api/lab-tools/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          task: "S3W01 學習單 MVP 內容生成測試",
          worksheetId: "S3W01",
          duration: mode === "video" ? 5 : undefined,
          durationMs: mode === "music" ? 30000 : undefined,
        }),
      });
      let data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(formatLabToolApiError(data.error || "Lab Tool API request failed", data.details));
      }

      if (mode === "video" && data.status === "processing" && data.videoId) {
        data = await pollLabToolVideoResult(prompt.trim(), data.videoId);
      }

      finalResponse =
        LAB_TOOL_RESULT_PREFIX +
        JSON.stringify({
          mode,
          prompt: prompt.trim(),
          createdAt: new Date().toISOString(),
          text: data.text,
          imageUrl: data.imageUrl,
          videoUrl: data.videoUrl,
          audioUrl: data.audioUrl,
          downloadUrl: data.downloadUrl,
          cached: Boolean(data.cached),
          status: data.status,
          fileName: data.fileName,
          videoId: data.videoId,
          provider: data.provider,
          fallback: data.fallback,
          fallbackReason: data.fallbackReason,
          backgroundTracking: data.backgroundTracking,
          backgroundVideoId: data.backgroundVideoId,
        });

      if (data.fallback) {
        completionFeedback = `${tool.label} 等待時間已到，已改用保存素材。`;
      } else if (data.cached) {
        completionFeedback = `${tool.label} 找到相似提示詞，已重用 S3W01 暫存成果。`;
      } else if (data.status === "processing") {
        completionFeedback = `${tool.label} 已送出生成，先顯示測試預覽。`;
      }
    } catch (error) {
      const formattedApiError = formatLabToolApiError(error);
      console.warn("Lab Tool API error:", error);
      finalResponse =
        LAB_TOOL_RESULT_PREFIX +
        JSON.stringify({
          mode,
          prompt: prompt.trim(),
          createdAt: new Date().toISOString(),
          cached: false,
          error: formattedApiError,
        });
      completionFeedback = `${tool.label} API 生成失敗，請檢查 server key 或 API 回應。`;
    }

    const updatedConversation = [
      ...conversation,
      { content: prompt, role: "user" as const },
      { content: finalResponse, role: "system" as const },
    ];

    setActivelyStreaming(false);
    setConversation(updatedConversation);
    setShowEmptyChat(false);
    setIsLoading(false);
    setIsLabToolGenerating(false);
    setLabToolFeedback(completionFeedback);
    setQuickReplies(getLabToolDemoReplies(mode));
    saveDemoConversation(updatedConversation);
  };

  const openVoiceRecorder = () => {
    setShowVoiceRecorder(true);
    resetTranscript();
    startListening();
  };

  const handleVoiceComplete = () => {
    stopListening();
    // UI will show processing state, transcript will be set when ready
  };

  const handleVoiceCancel = () => {
    stopListening();
    setShowVoiceRecorder(false);
    resetTranscript();
  };

  // Close voice recorder when transcript is ready
  useEffect(() => {
    if (showVoiceRecorder && transcript && !isSpeechProcessing && !isListening) {
      setShowVoiceRecorder(false);
    }
  }, [transcript, isSpeechProcessing, isListening, showVoiceRecorder]);

  // 背景生成（不顯示預覽）
  const startBackgroundGeneration = async (basicData: Record<string, string>) => {
    if (isGeneratingInBackground) return; // 已經在生成中

    setIsGeneratingInBackground(true);
    console.log("開始背景生成 avatar...", basicData);

    const generationPromise = fetch("/api/generate-avatar-pixellab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: basicData.prompt,
        name: basicData.name,
      }),
    }).then(res => res.json());

    generationPromiseRef.current = generationPromise;

    // 不等待，讓它在背景執行
    generationPromise.then(() => {
      console.log("背景生成完成");
      setIsGeneratingInBackground(false);
    }).catch(error => {
      console.error("背景生成失敗:", error);
      setIsGeneratingInBackground(false);
      generationPromiseRef.current = null;
    });
  };

  const generateAvatarImage = async (avatarData: Record<string, string>) => {
    // 保存角色個性設定
    setAvatarPersonality(avatarData);
    setPendingAvatar({ data: avatarData, isGenerating: true, generationProgress: 0 });

    let result;

    // 檢查是否已經在背景生成中
    if (generationPromiseRef.current) {
      console.log("使用背景生成的結果...");
      // 使用背景生成的結果
      setPendingAvatar(prev => prev ? { ...prev, generationProgress: 80 } : prev);

      try {
        result = await generationPromiseRef.current;
        generationPromiseRef.current = null;
      } catch (error) {
        console.error("背景生成失敗，重新生成:", error);
        generationPromiseRef.current = null;
        // 繼續下面的正常生成流程
      }
    }

    if (!result) {
      // 模擬進度更新
      const progressInterval = setInterval(() => {
        setPendingAvatar(prev => {
          if (!prev || !prev.isGenerating) return prev;
          const newProgress = Math.min((prev.generationProgress || 0) + 5, 90);
          return { ...prev, generationProgress: newProgress };
        });
      }, 500);

      try {
        // 使用 PixelLab API 生成像素藝術動畫
        const response = await fetch("/api/generate-avatar-pixellab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: avatarData.prompt,
            name: avatarData.name,
          }),
        });

        clearInterval(progressInterval);
        result = await response.json();
      } catch (error: any) {
        clearInterval(progressInterval);
        setPendingAvatar({
          data: avatarData,
          isGenerating: false,
          error: error.message,
          generationProgress: 0,
        });
        return;
      }
    }

    // 處理結果
    if (result.success) {
      // PixelLab 返回獨立幀陣列
      if (result.frames && result.frames.length > 0) {
        setPendingAvatar({
          data: avatarData,
          isGenerating: false,
          imageUrl: result.frames[0],
          frames: result.frames,
          frameCount: result.frameCount || result.frames.length,
          generationProgress: 100,
        });
      } else {
        setPendingAvatar({
          data: avatarData,
          isGenerating: false,
          imageUrl: result.imageUrl,
          frameCount: 1,
          generationProgress: 100,
        });
      }
    } else {
      setPendingAvatar({
        data: avatarData,
        isGenerating: false,
        error: result.error,
        generationProgress: 0,
      });
    }
  };

  const handleConfirmAvatar = useCallback(async () => {
    console.log("[handleConfirmAvatar] called, pendingAvatar:", !!pendingAvatar?.imageUrl, "user:", !!user);
    if (!pendingAvatar?.imageUrl || !user) return;

    // 從 avatarPersonality 或 pendingAvatar.data 取得個性設定
    const personalityData = avatarPersonality || pendingAvatar.data;

    // 建立 AvatarPersonality 物件（全域儲存）
    const personality: AvatarPersonality = {
      characterType: personalityData.characterType || collectedInfo.characterType || "",
      color: personalityData.color || collectedInfo.color || "",
      accessory: personalityData.accessory || collectedInfo.accessory,
      speakingStyle: personalityData.speakingStyle || "活潑開朗",
      specialAbility: personalityData.specialAbility || "",
      catchphrase: personalityData.catchphrase,
    };

    const avatarId = `avatar_${Date.now()}`;

    // Upload frames to Firebase Storage (base64 → URL)
    let imageUrl = pendingAvatar.imageUrl;
    let frames = pendingAvatar.frames;
    try {
      if (frames && frames.length > 0) {
        const urls = await uploadAvatarFrames(user.id, avatarId, frames);
        frames = urls;
        imageUrl = urls[0];
      } else if (imageUrl.startsWith("data:")) {
        const urls = await uploadAvatarFrames(user.id, avatarId, [imageUrl]);
        imageUrl = urls[0];
      }
    } catch (e) {
      console.error("Failed to upload avatar to Storage, using base64 fallback:", e);
    }

    const newAvatar: UserAvatar = {
      id: avatarId,
      userId: user.id,
      name: pendingAvatar.data.name,
      prompt: pendingAvatar.data.prompt,
      imageUrl,
      frames,
      spriteSheetUrl: pendingAvatar.spriteSheet ? imageUrl : undefined,
      frameCount: pendingAvatar.frameCount,
      gridCols: pendingAvatar.gridCols,
      gridRows: pendingAvatar.gridRows,
      createdAt: new Date().toISOString(),
      isActive: true,
      personality,
    };

    updateUser({ ...user, avatar: newAvatar });

    // 獎勵金幣
    addCoins(COIN_VALUES.COMPLETE_AVATAR, "完成創建 AI 助理");

    // 完成腳本並關閉
    setScriptPhase("complete");
    console.log("[handleConfirmAvatar] Avatar saved, calling onScriptComplete in 500ms");

    // 封存對話到 sessions
    const archiveMessages = conversation
      .filter((m) => m.content)
      .map((m) => ({
        content: m.content,
        role: m.role as "user" | "system",
        timestamp: new Date().toISOString(),
      }));
    const avatarName = pendingAvatar.data.name || "AI 助理";
    archiveConversation(`創建 ${avatarName}`, archiveMessages);

    // 延遲清除狀態，讓飛行動畫完成後再卸載組件
    setTimeout(() => {
      console.log("[handleConfirmAvatar] Resetting state and calling onScriptComplete");
      setPendingAvatar(null);
      // 重置 Chat 狀態開始新對話
      setConversation([]);
      setShowEmptyChat(true);
      setQuickReplies([]);
      setScriptPhase("appearance");
      setCollectedInfo({});
      setCollectedStudentInfo({});
      setAvatarPersonality(null);
      setScriptTurnCount(0);
      setGeneratingTurnCount(0);
      hasStartedGeneration.current = false;
      onScriptComplete?.();
    }, 500);
  }, [pendingAvatar, user, updateUser, addCoins, avatarPersonality, collectedInfo, onScriptComplete, conversation, archiveConversation]);

  // 開始問卷階段
  const startQuestionnairePhase = async (avatarName: string, speakingStyle: string, catchphrase: string) => {
    setIsLoading(true);

    // 使用動態生成的問卷 prompt（初始時沒有收集任何學生資訊）
    const systemPrompt = generateQuestionnairePrompt(
      avatarName,
      speakingStyle,
      catchphrase,
      {} // 初始時沒有收集任何學生資訊
    );

    try {
      const response = await fetch(`/api/openai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ content: "開始自我介紹並了解學生", role: "user" }],
          model: selectedModel,
          systemPrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setActivelyStreaming(true);
        setConversation(prev => [
          ...prev,
          { content: data.message, role: "system" },
        ]);
      }
    } catch (error) {
      console.error("Failed to start questionnaire:", error);
    }

    setIsLoading(false);
  };

  // Handle story quick reply actions that don't need an AI call
  const handleStoryQuickAction = async (msg: string): Promise<boolean> => {
    const phase = storyPhase;

    if (phase === "choose_world") {
      const worldMap: Record<string, string> = {
        "魔法森林": "magic forest",
        "外太空": "outer space",
        "海底世界": "underwater",
        "機械都市": "cyber city",
        "恐龍島": "dinosaur island",
      };
      const world = worldMap[msg] || msg;
      setConversation((prev) => [
        ...prev,
        { content: msg, role: "user" },
        { content: `${msg}！接下來選你的角色，先選外觀風格！`, role: "system" },
      ]);
      story.setWorld(world, msg);
      addCoins(COIN_VALUES.ANSWER_TYPE, `故事創作:選世界`);
      setTimeout(() => {
        setQuickReplies(["帥氣的", "漂亮的", "威猛的", "神秘的", "可愛的"]);
      }, 300);
      return true;
    }

    if (phase === "choose_appearance") {
      setConversation((prev) => [
        ...prev,
        { content: msg, role: "user" },
        { content: `${msg}角色！是男生、女生、還是...？`, role: "system" },
      ]);
      story.setAppearance(msg);
      setTimeout(() => {
        setQuickReplies(["男生", "女生", "動物", "機器人", "精靈"]);
      }, 300);
      return true;
    }

    if (phase === "choose_gender") {
      setConversation((prev) => [
        ...prev,
        { content: msg, role: "user" },
        { content: `最後，選一個職業吧！`, role: "system" },
      ]);
      story.setGender(msg);
      setTimeout(() => {
        setQuickReplies(["魔法師", "戰士", "弓箭手", "忍者", "美人魚"]);
      }, 300);
      return true;
    }

    if (phase === "choose_class") {
      setConversation((prev) => [
        ...prev,
        { content: msg, role: "user" },
        { content: `正在生成你的角色...`, role: "system" },
      ]);
      story.setCharacterClass(msg);
      setTimeout(() => {
        setQuickReplies(["就決定是你了！", "換一個"]);
      }, 300);
      return true;
    }

    if (phase === "preview_character") {
      if (msg === "換一個" || msg === "換一個角色") {
        const nextCount = story.rerollCount + 1;
        story.rerollCharacter();
        const remaining = story.maxRerolls - nextCount;
        setConversation((prev) => [
          ...prev,
          { content: msg, role: "user" },
          { content: `換一個新造型！${remaining > 0 ? `（還可以換 ${remaining} 次）` : "（最後一次囉！）"}`, role: "system" },
        ]);
        setTimeout(() => {
          if (remaining > 0) {
            setQuickReplies(["就決定是你了！", "換一個"]);
          } else {
            setQuickReplies(["就決定是你了！"]);
          }
        }, 300);
        return true;
      }
      // Confirm character
      story.confirmCharacter();
      setConversation((prev) => [
        ...prev,
        { content: msg, role: "user" },
        { content: "角色確定！選一個故事類型吧！", role: "system" },
      ]);
      setTimeout(() => {
        setQuickReplies(["衝突冒險", "團隊合作", "交新朋友", "解開謎題", "拯救夥伴"]);
      }, 300);
      return true;
    }

    if (phase === "choose_event") {
      story.setEvent(msg, msg);
      setConversation((prev) => [
        ...prev,
        { content: msg, role: "user" },
        { content: "好的！正在為你創作故事和插圖，請稍等...", role: "system" },
      ]);
      addCoins(COIN_VALUES.ANSWER_TYPE, `故事創作:選事件`);
      // Now we DO need an AI call for generating_story
      setIsLoading(true);
      generateStoryboard();
      return true;
    }

    if (phase === "pick_favorite") {
      const match = msg.match(/故事\s*(\d)/);
      const roundIndex = match ? parseInt(match[1]) - 1 : 0;
      const chosen = story.pickFavorite(roundIndex);
      if (chosen) {
        addCoins(20, "完成故事創作");

        // Upload audio to Firebase Storage, then archive with URLs
        const storyId = `story_${Date.now()}`;
        const audioFiles = chosen.panels
          .map((p, i) => p.audioBase64 ? { base64: p.audioBase64, index: i } : null)
          .filter((f): f is { base64: string; index: number } => f !== null);

        let audioUrls = new Map<number, string>();
        if (user && audioFiles.length > 0) {
          try {
            audioUrls = await uploadStoryAudio(user.id, storyId, audioFiles);
          } catch (e) {
            console.error("Failed to upload story audio:", e);
          }
        }

        const storyMessages = chosen.panels.map((panel, i) => {
          const audioUrl = audioUrls.get(i);
          return {
            content: `[STORY_PANEL]\n[IMG]${panel.imageUrl}[/IMG]\n${audioUrl ? `[AUDIO_URL]${audioUrl}[/AUDIO_URL]\n` : ""}${panel.text}`,
            role: "system" as const,
            timestamp: new Date().toISOString(),
          };
        });
        const headerMsg = {
          content: `[STORY_HEADER]${chosen.storyTitle}[/STORY_HEADER]\n世界：${chosen.worldLabel} | 角色：${chosen.appearance}${chosen.gender}${chosen.characterClass} | 事件：${chosen.eventLabel}`,
          role: "system" as const,
          timestamp: new Date().toISOString(),
        };
        archiveConversation(`故事：${chosen.storyTitle}`, [headerMsg, ...storyMessages]);

        setConversation((prev) => [
          ...prev,
          { content: msg, role: "user" },
          { content: `你選了「${chosen.storyTitle}」！已經幫你存起來囉！`, role: "system" },
        ]);

        setTimeout(() => {
          setConversation([]);
          setShowEmptyChat(true);
          setQuickReplies([]);
          story.reset();
          setScriptTurnCount(0);
          storyScriptInitialized.current = false;
          onScriptComplete?.();
        }, 2000);
      }
      return true;
    }

    return false;
  };

  // Handle slideshow "繼續" button
  const handleSlideshowDone = () => {
    const isLastRound = story.currentRound >= story.totalRounds;
    story.onSlideshowComplete(); // This updates round counter and phase

    if (isLastRound) {
      setConversation((prev) => [
        ...prev,
        { content: "3 個故事都完成了！你最喜歡哪一個？", role: "system" },
      ]);
      setTimeout(() => {
        setQuickReplies(["故事 1", "故事 2", "故事 3"]);
      }, 300);
    } else {
      const nextRound = story.currentRound + 1;
      setConversation((prev) => [
        ...prev,
        { content: `第 ${story.currentRound} 個故事完成！來創作第 ${nextRound} 個吧！選一個世界！`, role: "system" },
      ]);
      setTimeout(() => {
        setQuickReplies(["魔法森林", "外太空", "海底世界", "機械都市", "恐龍島"]);
      }, 300);
    }
  };

  // Generate storyboard via AI call
  const generateStoryboard = async () => {
    try {
      const prompt = currentScript!.generatePrompt("generating_story", {
        currentRound: story.currentRound,
        totalRounds: story.totalRounds,
        world: story.currentRoundData.worldLabel,
        eventType: story.currentRoundData.eventLabel,
        characterPrompt: story.currentRoundData.characterPrompt,
        appearance: story.currentRoundData.appearance,
        gender: story.currentRoundData.gender,
        characterClass: story.currentRoundData.characterClass,
      });

      const response = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ content: "生成故事", role: "user" }],
          model: selectedModel,
          systemPrompt: prompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Parse the STORYBOARD_READY tag
        const parseResults = currentScript!.parseResponse(data.message);
        for (const result of parseResults) {
          if (result.tag === "STORYBOARD_READY") {
            await story.generateStory(result.data as any);
            break;
          }
        }
      }
    } catch (error: any) {
      console.error("Storyboard generation error:", error);
      setErrorMessage("故事生成失敗，請再試一次");
    }
    setIsLoading(false);
  };

  const sendMessage = async (e: any, overrideMessage?: string) => {
    e.preventDefault();

    const msg = overrideMessage || message;

    if (msg.trim().length < 2) {
      setErrorMessage("ERROR: 請輸入至少 2 個字");
      return;
    } else {
      setErrorMessage("");
    }

    if (sendMessageInFlightRef.current || isLoading || activelyStreaming || isLabToolGenerating) {
      setErrorMessage("目前正在生成，請等這次完成後再送出。");
      setLabToolFeedback("生成處理中，請等待目前這次完成。");
      return;
    }

    sendMessageInFlightRef.current = true;

    if (!activeScript && labToolMode !== "text" && !labToolMediaAccess) {
      setLabToolMode("text");
      setLabToolFeedback("請先從 S3W01 學習單開啟任務，才可以使用圖片、影片、音樂生成。");
      setErrorMessage("請先從 S3W01 學習單開啟任務，才可以使用圖片、影片、音樂生成。");
      sendMessageInFlightRef.current = false;
      return;
    }

    trackEvent("send.message", { message: msg });
    setQuickReplies([]); // Hide quick replies while loading
    setShowInputGuide(false);

    // Story helper: handle phase-specific quick reply actions (no AI call needed)
    if (activeScript === "story-helper") {
      const handled = await handleStoryQuickAction(msg);
      if (handled) {
        setMessage("");
        sendMessageInFlightRef.current = false;
        return;
      }
    }

    setIsLoading(true);

    // Track script turns
    const newTurnCount = activeScript ? scriptTurnCount + 1 : 0;
    if (activeScript) setScriptTurnCount(newTurnCount);

    const newConversation = [
      ...conversation,
      { content: msg, role: "user" },
      { content: null, role: "system" },
    ];

    setConversation(newConversation);
    setMessage("");
    setShowEmptyChat(false);

    // 決定當前使用的階段（處理 intro → 下一階段的轉換，uses registry）
    let currentPhase: string = scriptPhase;
    let currentStoryPhase: string = storyPhase;
    if (currentScript) {
      const nextPhase = currentScript.getPhaseAfterIntro();
      if (activeScript === "create-avatar" && scriptPhase === "intro") {
        currentPhase = nextPhase;
        setScriptPhase(nextPhase as ScriptPhase);
        console.log(`階段轉換: intro → ${nextPhase}`);
      }
      if (activeScript === "story-helper" && storyPhase === "intro") {
        currentStoryPhase = nextPhase;
        story.setStoryPhase(nextPhase as StoryPhase);
        console.log(`故事階段轉換: intro → ${nextPhase}`);
      }
    }

    // 根據階段獎勵金幣（uses registry）
    const msgTag = msg.trim().toLowerCase().slice(0, 50);
    if (currentScript) {
      const phase = activeScript === "create-avatar" ? currentPhase : currentStoryPhase;
      const reward = currentScript.getCoinReward(phase);
      if (reward) {
        addCoins(reward.amount, `${reward.reasonPrefix}:${msgTag}`);
      }
    } else {
      addCoins(COIN_VALUES.SEND_MESSAGE, `訊息:${msgTag}`);
    }

    if (!activeScript && labToolMode !== "text") {
      try {
        await completeLabToolDemoGeneration(msg, labToolMode);
      } finally {
        sendMessageInFlightRef.current = false;
      }
      return;
    }

    try {
      // 根據階段選擇 System Prompt
      let systemPrompt: string;

      // Force START_GENERATION after FORCE_GENERATION_TURNS turns
      const shouldForceGeneration = activeScript === "create-avatar"
        && newTurnCount >= FORCE_GENERATION_TURNS
        && !hasStartedGeneration.current
        && currentPhase !== "avatar_ready"
        && currentPhase !== "complete";

      // Force AVATAR_READY after FORCE_AVATAR_READY_TURNS turns in generating phase
      const shouldForceAvatarReady = activeScript === "create-avatar"
        && hasStartedGeneration.current
        && !pendingAvatar
        && (currentPhase === "generating" || currentPhase === "personality")
        && generatingTurnCount >= FORCE_AVATAR_READY_TURNS;

      // Track generating phase turns
      if (activeScript === "create-avatar" && (currentPhase === "generating" || currentPhase === "personality")) {
        setGeneratingTurnCount(prev => prev + 1);
      }

      if (activeScript === "create-avatar") {
        // Avatar has special force prompts and questionnaire phase
        if (shouldForceAvatarReady) {
          systemPrompt = generateForceAvatarReadyPrompt(collectedInfo);
        } else if (shouldForceGeneration) {
          systemPrompt = generateForceStartGenerationPrompt(collectedInfo);
        } else if (currentPhase === "questionnaire" && avatarPersonality) {
          systemPrompt = generateQuestionnairePrompt(
            avatarPersonality.name || "AI助理",
            avatarPersonality.speakingStyle || "活潑開朗",
            avatarPersonality.catchphrase || "",
            collectedStudentInfo
          );
        } else {
          systemPrompt = currentScript!.generatePrompt(currentPhase, { collectedInfo });
        }
      } else if (currentScript) {
        // Generic script prompt generation
        const phase = activeScript === "story-helper" ? currentStoryPhase : currentPhase;
        const state = activeScript === "story-helper"
          ? {
              currentRound: story.currentRound,
              totalRounds: story.totalRounds,
              world: story.currentRoundData.worldLabel,
              eventType: story.currentRoundData.eventLabel,
              characterPrompt: story.currentRoundData.characterPrompt,
            }
          : {};
        systemPrompt = currentScript.generatePrompt(phase, state);
      } else {
        systemPrompt = generateSystemPrompt(memory);
      }

      // Kid mode: append 30-char response limit (exclude JSON data blocks)
      if (isKidMode && currentScript) {
        const markers = currentScript.getKidModeMarkers();
        systemPrompt += `\n\n## 重要：幼兒模式\n你的對話文字必須在30個中文字以內，用最簡單的詞彙，不要用複雜的句子。\n注意：JSON 資料標記（如 ${markers} 等）不算在30字限制內，這些資料塊請完整輸出。`;
      }

      console.log("Current phase:", currentPhase, "turns:", newTurnCount, "collectedInfo:", collectedInfo);

      const response = await fetch(`/api/openai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...conversation, { content: msg, role: "user" }],
          model: selectedModel,
          systemPrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        let finalResponse = data.message;

        // ===== Parse response using registry =====
        let avatarDataForGeneration: Record<string, any> | null = null;

        if (currentScript) {
          const parseResults = currentScript.parseResponse(finalResponse);
          for (const result of parseResults) {
            finalResponse = result.cleanResponse;
            console.log(`Parsed tag: ${result.tag}, nextPhase: ${result.nextPhase}`);

            // Handle side effects per tag
            switch (result.tag) {
              case "START_GENERATION": {
                if (!hasStartedGeneration.current) {
                  hasStartedGeneration.current = true;
                  const newCollectedInfo: CollectedInfo = {
                    ...collectedInfo,
                    characterType: result.data.characterType,
                    color: result.data.color,
                    name: result.data.name,
                    accessory: result.data.accessory || "",
                  };
                  setCollectedInfo(newCollectedInfo);
                  setScriptPhase("generating");
                  startBackgroundGeneration(result.data as Record<string, string>);
                }
                break;
              }
              case "AVATAR_READY": {
                const fullCollectedInfo: CollectedInfo = {
                  ...collectedInfo,
                  characterType: result.data.characterType || collectedInfo.characterType,
                  color: result.data.color || collectedInfo.color,
                  name: result.data.name || collectedInfo.name,
                  accessory: result.data.accessory || collectedInfo.accessory,
                  speakingStyle: result.data.speakingStyle,
                  specialAbility: result.data.specialAbility,
                  catchphrase: result.data.catchphrase || "",
                };
                setCollectedInfo(fullCollectedInfo);
                setScriptPhase("avatar_ready");
                avatarDataForGeneration = result.data;
                break;
              }
              case "STUDENT_INFO": {
                setCollectedStudentInfo(result.data);
                if (memory) {
                  console.log("Student info saved to memory:", result.data);
                }
                if (avatarPersonality) {
                  console.log("Avatar personality saved to memory:", avatarPersonality);
                }
                const questArchiveMessages = [
                  ...conversation,
                  { content: msg, role: "user" },
                  { content: finalResponse, role: "system" },
                ]
                  .filter((m) => m.content)
                  .map((m) => ({
                    content: m.content,
                    role: m.role as "user" | "system",
                    timestamp: new Date().toISOString(),
                  }));
                archiveConversation("了解學生問卷", questArchiveMessages);
                setScriptPhase("complete");
                setTimeout(() => {
                  setConversation([]);
                  setShowEmptyChat(true);
                  setQuickReplies([]);
                  setScriptPhase("appearance");
                  setCollectedInfo({});
                  setCollectedStudentInfo({});
                  setAvatarPersonality(null);
                  setScriptTurnCount(0);
                  hasStartedGeneration.current = false;
                  onScriptComplete?.();
                }, 500);
                break;
              }
              case "STORYBOARD_READY": {
                // AI generated the 3-panel storyboard — hand off to hook for TTS + slideshow
                story.generateStory(result.data as any);
                break;
              }
            }
          }
        }

        const updatedConversation = [
          ...conversation,
          { content: msg, role: "user" },
          { content: finalResponse, role: "system" },
        ];

        setActivelyStreaming(true);
        setConversation(updatedConversation);

        // 如果有 Avatar 資料，開始生成圖片
        if (avatarDataForGeneration) {
          generateAvatarImage(avatarDataForGeneration as Record<string, string>);
        }

        // 非腳本模式時，保存對話到 ConversationContext
        if (!activeScript) {
          const messagesToSave = updatedConversation
            .filter((m) => m.content)
            .map((m) => ({
              content: m.content,
              role: m.role as "user" | "system",
              timestamp: new Date().toISOString(),
            }));
          if (!currentConversation) {
            createNewConversation(messagesToSave);
          } else {
            updateConversationMessages(messagesToSave);
          }

          const newCount = incrementMessageCount();
          if (shouldTriggerExtraction(newCount)) {
            const recentMessages = updatedConversation
              .slice(-10)
              .map((m) => ({
                role: m.role === "user" ? "user" : "assistant",
                content: m.content,
              }))
              .filter((m) => m.content);
            triggerMemoryExtraction(recentMessages as any);
          }
        }
        // Generate quick replies via second API call
        generateQuickReplies(finalResponse);
      } else {
        console.error(response);
        setErrorMessage(`ERROR: ${response.statusText}`);
        sendMessageInFlightRef.current = false;
      }

      setIsLoading(false);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(`ERROR: ${error.message}`);
      setIsLoading(false);
      sendMessageInFlightRef.current = false;
    }
  };

  // Handle quick reply button click
  const handleQuickReply = (reply: string) => {
    setMessage(reply);
    // Auto-submit by directly calling sendMessage
    setTimeout(() => {
      sendMessage({ preventDefault: () => {} }, reply);
    }, 50);
  };

  const handleKeypress = (e: any) => {
    if (e.keyCode == 13 && !e.shiftKey) {
      if (sendMessageInFlightRef.current || isInputBusy) {
        e.preventDefault();
        return;
      }
      sendMessage(e);
      e.preventDefault();
    }
  };

  const currentTime = new Date().toLocaleString("zh-TW");
  const activeLabTool = LAB_TOOL_CONFIG[labToolMode];
  const ActiveLabToolIcon = activeLabTool.icon;
  const labToolRingColor = LAB_TOOL_RING_COLORS[labToolMode];
  const activeLabToolDisplayLabel =
    labToolMode === "text" ? "文字" : activeLabTool.shortLabel;
  const isInputBusy = isLoading || activelyStreaming || isLabToolGenerating;
  const chatInputPlaceholder = activeScript
    ? "Enter command..."
    : labToolMode === "text"
    ? "輸入文字訊息，像以前一樣和 AI 對話。"
    : activeLabTool.placeholder;

  return (
    <div className="flex max-w-full flex-1 flex-col terminal-screen terminal-scanline terminal-flicker">
      {/* Terminal Header */}
      <div className="sticky top-0 z-10 border-b border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={`md:hidden text-[var(--terminal-primary)] ${activeScript ? "opacity-30 cursor-not-allowed" : "hover:glow-text"}`}
              onClick={activeScript ? undefined : toggleComponentVisibility}
            >
              <RxHamburgerMenu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[var(--terminal-primary)] glow-text text-sm">
                {currentScript ? `◉ ${currentScript.terminalTitle}` : "◉ LAB-TERMINAL v2.0"}
              </span>
              {!activeScript && (
                <span className="text-[var(--terminal-primary-dim)] text-xs hidden sm:inline">
                  | MODEL: {selectedModel.name}
                </span>
              )}
              {isExtracting && (
                <span className="text-[var(--terminal-accent)] text-xs animate-pulse">
                  | MEMORY_SYNC...
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <div data-tutorial="coin-display">
              <CoinDisplay className="border border-[var(--terminal-primary-dim)] px-2 py-1 rounded" />
            </div>
            <button
              onClick={() => window.location.href = "/shop"}
              className="terminal-btn text-xs py-1 px-2"
              data-tutorial="sidebar-shop"
            >
              SHOP
            </button>
            <button
              onClick={() => setZhuyinMode(!zhuyinMode)}
              className={`terminal-btn text-xs py-1 px-2 ${
                zhuyinMode ? "bg-[var(--terminal-primary)] text-black" : ""
              }`}
            >
              注音
            </button>
            {toggleScriptPanel && (
              <button
                onClick={toggleScriptPanel}
                className={`md:hidden terminal-btn text-xs py-1 px-2 ${
                  isScriptPanelOpen ? "bg-[var(--terminal-primary)] text-black" : ""
                }`}
                title="腳本庫"
              >
                <HiOutlineBeaker className="h-4 w-4" />
              </button>
            )}
            <span className="text-[var(--terminal-primary-dim)] hidden sm:inline">
              {user?.username || "GUEST"}@LAB
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative h-full w-full flex flex-col overflow-hidden flex-1 min-w-0 matrix-bg">
        <div className="flex-1 overflow-hidden">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto">
            {!showEmptyChat && conversation.length > 0 ? (
              <div className="flex flex-col">
                {/* Session Info */}
                <div className="px-4 py-2 border-b border-[var(--terminal-primary-dim)] text-xs text-[var(--terminal-primary-dim)]">
                  {currentScript ? (
                    <>
                      <div>+------------------------------------------------------------------+</div>
                      <div>| SCRIPT: {currentScript.terminalTitle} | {currentTime}</div>
                      <div>| MODE: {currentScript.sessionMode}{activeScript === "story-helper" ? ` | ROUND: ${story.currentRound}/${story.totalRounds} | ${storyPhase.toUpperCase()}` : ""}</div>
                      <div>+------------------------------------------------------------------+</div>
                    </>
                  ) : (
                    <>
                      <div>+------------------------------------------------------------------+</div>
                      <div>| SESSION INITIALIZED | {currentTime}</div>
                      <div>| AI_CORE: ACTIVE | MEMORY: {memory?.topicSummaries.length || 0} BLOCKS</div>
                      <div>+------------------------------------------------------------------+</div>
                    </>
                  )}
                </div>

                {/* Messages */}
                {conversation.map((message, index) => {
                  const isLastSystem = activelyStreaming
                    && message.role === "system"
                    && message.content !== null
                    && index === conversation.length - 1;

                  // Render archived story — collect all STORY_PANEL + STORY_HEADER into a slideshow
                  if (message.content?.startsWith("[STORY_HEADER]")) {
                    const titleMatch = message.content.match(/\[STORY_HEADER\](.*?)\[\/STORY_HEADER\]/);
                    const title = titleMatch ? titleMatch[1] : "";
                    const info = message.content.replace(/\[STORY_HEADER\].*?\[\/STORY_HEADER\]\n?/, "").trim();

                    // Collect subsequent STORY_PANEL messages
                    const archivedPanels: { imageUrl: string; text: string; audioUrl?: string }[] = [];
                    for (let j = index + 1; j < conversation.length; j++) {
                      const m = conversation[j];
                      if (!m.content?.startsWith("[STORY_PANEL]")) break;
                      const pImgMatch = m.content.match(/\[IMG\](.*?)\[\/IMG\]/);
                      const pAudioUrlMatch = m.content.match(/\[AUDIO_URL\](.*?)\[\/AUDIO_URL\]/);
                      const pText = m.content
                        .replace(/\[STORY_PANEL\]\n?/, "")
                        .replace(/\[IMG\].*?\[\/IMG\]\n?/, "")
                        .replace(/\[AUDIO_URL\].*?\[\/AUDIO_URL\]\n?/, "")
                        .trim();
                      archivedPanels.push({
                        imageUrl: pImgMatch ? pImgMatch[1] : "",
                        text: pText,
                        audioUrl: pAudioUrlMatch ? pAudioUrlMatch[1] : undefined,
                      });
                    }

                    return (
                      <ArchivedStoryPlayer
                        key={index}
                        title={title}
                        info={info}
                        panels={archivedPanels}
                      />
                    );
                  }

                  // Skip individual STORY_PANEL messages (already consumed by STORY_HEADER above)
                  if (message.content?.startsWith("[STORY_PANEL]")) {
                    return null;
                  }

                  const labToolResult = parseLabToolResult(message.content);
                  if (message.role === "system" && labToolResult) {
                    return (
                      <LabToolResultMessage
                        key={index}
                        payload={labToolResult}
                        avatarName={
                          currentScript
                            ? currentScript.getAvatarName({ collectedInfo })
                            : undefined
                        }
                      />
                    );
                  }

                  return (
                    <Message
                      key={index}
                      message={message}
                      avatarName={
                        currentScript
                          ? currentScript.getAvatarName({ collectedInfo })
                          : undefined
                      }
                      streaming={isLastSystem}
                      onStreamComplete={() => {
                        setActivelyStreaming(false);
                        sendMessageInFlightRef.current = false;
                        scrollToBottom();
                      }}
                    />
                  );
                })}

                {/* Quick Reply Buttons */}
                {quickReplies.length > 0 && !isLoading && (
                  <div className="px-4 py-2 flex flex-wrap gap-2">
                    {quickReplies.map((reply, i) => (
                      <button
                        key={i}
                        onClick={() => handleQuickReply(reply)}
                        className="px-3 py-1.5 text-xs border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] hover:border-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)] transition-all"
                      >
                        {reply}
                      </button>
                    ))}
                    {/* Always show "自己輸入" as last option */}
                    <button
                      onClick={() => {
                        setShowInputGuide(true);
                        textAreaRef.current?.focus();
                      }}
                      className={`px-3 py-1.5 text-xs border border-dashed transition-all ${
                        showInputGuide
                          ? "border-[var(--terminal-primary)] text-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10"
                          : "border-[var(--terminal-accent)] text-[var(--terminal-accent)] hover:border-[var(--terminal-primary)] hover:text-[var(--terminal-primary)]"
                      }`}
                    >
                      ✏️ 自己輸入
                    </button>
                  </div>
                )}

                {/* Input Guide - shown when "自己輸入" is clicked */}
                {showInputGuide && (
                  <div className="px-4 py-2 flex items-center gap-2 animate-pulse">
                    <span className="text-[var(--terminal-primary)] text-lg">↓</span>
                    <span className="text-[var(--terminal-primary)] text-xs">
                      在下方輸入框打字，或按麥克風用語音輸入！
                    </span>
                    <span className="text-[var(--terminal-primary)] text-lg">↓</span>
                  </div>
                )}

                {/* Story: Character Preview */}
                {activeScript === "story-helper" && storyPhase === "preview_character" && story.currentCharacterUrl && (
                  <div className="px-4 py-3">
                    <div className="text-[var(--terminal-accent)] text-xs mb-2">{'>'} 你的角色：</div>
                    <div className="border border-[var(--terminal-primary)] p-1 w-[400px] max-w-full mx-auto">
                      <div className="relative">
                        <div className="w-full aspect-square flex items-center justify-center bg-black text-[var(--terminal-primary-dim)] text-xs">
                          <span className="animate-pulse">生成角色中...</span>
                        </div>
                        <img
                          key={story.currentCharacterUrl}
                          src={story.currentCharacterUrl}
                          alt="Character"
                          className="w-full h-auto object-cover"
                          style={{ display: "none" }}
                          onLoad={(e) => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = "block";
                            const loader = el.previousElementSibling as HTMLElement;
                            if (loader) loader.style.display = "none";
                          }}
                          onError={(e) => {
                            const el = e.target as HTMLImageElement;
                            const retried = el.dataset.retried;
                            if (!retried) {
                              el.dataset.retried = "1";
                              setTimeout(() => {
                                el.src = story.currentCharacterUrl + "&retry=1";
                              }, 4000);
                            } else if (retried === "1") {
                              el.dataset.retried = "2";
                              setTimeout(() => {
                                el.src = story.currentCharacterUrl + "&retry=2";
                              }, 5000);
                            } else {
                              const loader = el.previousElementSibling as HTMLElement;
                              if (loader) loader.innerHTML = '<span class="text-red-400">載入失敗，按「換一個」重試</span>';
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-[var(--terminal-primary-dim)] text-[10px] text-center mt-1">
                      已換 {story.rerollCount}/{story.maxRerolls} 次
                    </div>
                  </div>
                )}

                {/* Story: Slideshow */}
                {activeScript === "story-helper" && storyPhase === "slideshow" && story.slideshowPanels.length > 0 && (
                  <StorySlideshow
                    panels={story.slideshowPanels}
                    storyTitle={story.slideshowTitle}
                    roundNumber={story.currentRound}
                    onComplete={handleSlideshowDone}
                  />
                )}

                {/* Story: Pick Favorite */}
                {activeScript === "story-helper" && storyPhase === "pick_favorite" && story.completedRounds.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="text-[var(--terminal-accent)] text-xs mb-3">{'>'} 你的 3 個故事：</div>
                    <div className="grid grid-cols-3 gap-2">
                      {story.completedRounds.map((round, i) => (
                        <div key={i} className="border border-[var(--terminal-primary-dim)] p-1 text-center">
                          {round.panels[0] && (
                            <img
                              src={round.panels[0].imageUrl}
                              alt={round.storyTitle}
                              className="w-full h-20 object-cover"
                            />
                          )}
                          <div className="text-[var(--terminal-primary)] text-[10px] mt-1 truncate px-1">
                            {round.storyTitle}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Story: Generating indicator */}
                {activeScript === "story-helper" && storyPhase === "generating_story" && story.isGenerating && (
                  <div className="px-4 py-6 text-center">
                    <div className="text-[var(--terminal-primary)] text-sm animate-pulse glow-text">
                      正在創作故事和插圖...
                    </div>
                    <div className="text-[var(--terminal-primary-dim)] text-xs mt-2">
                      生成圖片和配音中，請稍等
                    </div>
                  </div>
                )}

                {/* Avatar Preview */}
                {pendingAvatar && (
                  <AvatarPreview
                    avatarData={pendingAvatar.data}
                    isGenerating={pendingAvatar.isGenerating}
                    imageUrl={pendingAvatar.imageUrl}
                    frames={pendingAvatar.frames}
                    spriteSheet={pendingAvatar.spriteSheet}
                    frameCount={pendingAvatar.frameCount}
                    gridCols={pendingAvatar.gridCols}
                    gridRows={pendingAvatar.gridRows}
                    error={pendingAvatar.error}
                    onConfirm={handleConfirmAvatar}
                    generationProgress={pendingAvatar.generationProgress || 0}
                  />
                )}

                <div className="h-32 md:h-48"></div>
                <div ref={bottomOfChatRef}></div>
              </div>
            ) : null}

            {showEmptyChat ? (
              <div className="h-full flex flex-col items-center justify-center p-8">
                <div className="text-center space-y-4 boot-animation">
                  <pre className="text-[var(--terminal-primary)] glow-text text-xs sm:text-sm leading-tight">
{`
 ██╗      █████╗ ██████╗     ████████╗███████╗██████╗ ███╗   ███╗
 ██║     ██╔══██╗██╔══██╗    ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║
 ██║     ███████║██████╔╝       ██║   █████╗  ██████╔╝██╔████╔██║
 ██║     ██╔══██║██╔══██╗       ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║
 ███████╗██║  ██║██████╔╝       ██║   ███████╗██║  ██║██║ ╚═╝ ██║
 ╚══════╝╚═╝  ╚═╝╚═════╝        ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝
`}
                  </pre>
                  <div className="text-[var(--terminal-primary-dim)] text-sm space-y-1">
                    <p>{'>'} SYSTEM BOOT COMPLETE</p>
                    <p>{'>'} AI CORE INITIALIZED</p>
                    <p>{'>'} AWAITING USER INPUT...</p>
                  </div>
                  <div className="mt-8 text-[var(--terminal-accent)] text-xs">
                    [ 輸入指令開始對話 ]
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 w-full border-t border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)]">
          {/* Script Progress Bar (fixed above input) */}
          {activeScript && !showEmptyChat && (
            <div className="px-4 py-1.5 border-b border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)]">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[var(--terminal-primary)] shrink-0">
                  {currentScript?.terminalTitle || activeScript}
                </span>
                <div className="flex-1 h-3 border border-[var(--terminal-primary-dim)] bg-black/50 relative overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ease-out ${scriptProgress >= 100 ? "bg-green-400" : "bg-[var(--terminal-primary)]"}`}
                    style={{ width: `${scriptProgress}%` }}
                  />
                  <div
                    className="absolute inset-0 flex items-center justify-center text-[8px] font-bold"
                    style={{ color: scriptProgress > 50 ? "var(--terminal-bg)" : "var(--terminal-primary)" }}
                  >
                    {scriptProgress}%
                  </div>
                </div>
                {scriptProgress >= 100 && (
                  <span className="text-green-400 text-[10px] shrink-0 animate-pulse">COMPLETE</span>
                )}
              </div>
            </div>
          )}

          {/* Voice Recorder Popup */}
          {showVoiceRecorder && (
            <VoiceRecorder
              isListening={isListening}
              isProcessing={isSpeechProcessing}
              error={speechError}
              onComplete={handleVoiceComplete}
              onCancel={handleVoiceCancel}
            />
          )}

          <form className="p-4">
            <div className="flex flex-col gap-2">
              {errorMessage && (
                <div className="text-[var(--terminal-red)] text-xs px-2 py-1 border border-[var(--terminal-red)] bg-red-900/20">
                  {errorMessage}
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[var(--terminal-highlight)] shrink-0 hidden sm:inline">
                  {user?.username || "USER"}@LAB:~$
                </span>
                <span className="text-[var(--terminal-highlight)] shrink-0 sm:hidden">
                  $
                </span>
                <div data-tutorial="chat-input" className={`relative flex-1 flex items-center gap-2 terminal-border px-3 py-2 transition-all ${showInputGuide ? "border-[var(--terminal-primary)] shadow-[0_0_12px_var(--terminal-primary)]" : ""}`}>
                  {!activeScript && (
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        aria-expanded={isLabToolMenuOpen}
                        aria-label={`工具選單，目前：${activeLabToolDisplayLabel}`}
                        title={`${labToolFeedback} 目前：${activeLabToolDisplayLabel}`}
                        disabled={isInputBusy}
                        onClick={() => setIsLabToolMenuOpen((value) => !value)}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed bg-black/50 text-[var(--terminal-highlight)] transition-all hover:bg-[var(--terminal-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--terminal-highlight)] disabled:cursor-not-allowed disabled:opacity-50 ${
                          isLabToolSwitching ? "animate-pulse" : ""
                        }`}
                        style={{
                          borderColor: labToolRingColor,
                          boxShadow: isLabToolMenuOpen
                            ? `0 0 0 2px ${labToolRingColor}55, 0 0 12px ${labToolRingColor}`
                            : `0 0 8px ${labToolRingColor}88`,
                        }}
                      >
                        <ActiveLabToolIcon className="h-4 w-4" />
                        <span className="sr-only">{labToolFeedback}</span>
                      </button>

                      {isLabToolMenuOpen && (
                        <div className="absolute bottom-10 left-0 z-30 grid w-40 grid-cols-2 gap-1 border border-[var(--terminal-primary-dim)] bg-black/95 p-1 shadow-[0_0_12px_var(--terminal-primary-glow)]">
                          {LAB_TOOL_MODES.map((mode) => {
                            const tool = LAB_TOOL_CONFIG[mode];
                            const Icon = tool.icon;
                            const active = labToolMode === mode;
                            const locked = mode !== "text" && !labToolMediaAccess;

                            return (
                              <button
                                key={mode}
                                type="button"
                                aria-pressed={active}
                                disabled={isInputBusy || locked}
                                onClick={() => handleLabToolModeChange(mode)}
                                className={`flex h-9 items-center justify-center gap-1 border px-1.5 text-[11px] transition-all ${
                                  active
                                    ? "border-[var(--terminal-highlight)] bg-[var(--terminal-primary)] text-[var(--terminal-bg)]"
                                    : locked
                                    ? "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] opacity-50"
                                    : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] hover:border-[var(--terminal-highlight)] hover:bg-[var(--terminal-primary)]/10"
                                }`}
                                title={locked ? "請先從 S3W01 學習單開啟任務" : `切換到 ${tool.label}`}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span>{mode === "text" ? "文字" : tool.shortLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <textarea
                    ref={textAreaRef}
                    value={message}
                    tabIndex={0}
                    style={{
                      height: "24px",
                      maxHeight: "100px",
                      overflowY: "hidden",
                    }}
                    placeholder={chatInputPlaceholder}
                    className="flex-1 terminal-input resize-none text-sm"
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeypress}
                  />
                  <div className="flex items-center gap-1">
                    {isSpeechSupported && !showVoiceRecorder && (
                      <button
                        type="button"
                        disabled={isInputBusy}
                        onClick={openVoiceRecorder}
                        className="p-1 transition-colors text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                        title="語音輸入"
                      >
                        <FiMic className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      disabled={isInputBusy || message?.trim().length === 0}
                      onClick={sendMessage}
                      className="p-1 text-[var(--terminal-primary)] hover:glow-text disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <FiSend className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* Status Bar */}
          <div className="terminal-status text-[10px]">
            <span>STATUS: {isLoading ? "PROCESSING..." : pendingAvatar?.isGenerating ? "GENERATING..." : story.isGenerating ? "CREATING_STORY..." : "READY"}</span>
            <span className="hidden sm:inline">
              {activeScript
                ? `SCRIPT: ${activeScript}`
                : labToolMode === "text"
                ? `TERMINAL: TEXT | MEM: ${memory?.topicSummaries.length || 0}`
                : `LAB_TOOL: ${LAB_TOOL_CONFIG[labToolMode].statusLabel} | MEM: ${memory?.topicSummaries.length || 0}`}
            </span>
            <span>{currentTime}</span>
          </div>

          {/* DEBUG PANEL */}
          {(activeScript === "create-avatar" || activeScript === "story-helper") && (
            <details className="absolute top-0 right-0 z-50 bg-black/90 border border-yellow-500 text-yellow-300 text-[10px] font-mono max-w-[350px] max-h-[300px] overflow-auto">
              <summary className="px-2 py-1 cursor-pointer bg-yellow-900/50 text-yellow-400 font-bold">DEBUG</summary>
              <div className="p-2 space-y-1">
                {activeScript === "create-avatar" && (
                  <>
                    <div>phase: <b>{scriptPhase}</b></div>
                    <div>generatingTurnCount: {generatingTurnCount}</div>
                    <div>hasStartedGen: {String(hasStartedGeneration.current)}</div>
                    <div>isGenInBg: {String(isGeneratingInBackground)}</div>
                    <div>pendingAvatar: {pendingAvatar ? `gen=${pendingAvatar.isGenerating} img=${!!pendingAvatar.imageUrl} err=${pendingAvatar.error || "none"} progress=${pendingAvatar.generationProgress}` : "null"}</div>
                    <div>collectedInfo: {JSON.stringify(collectedInfo)}</div>
                    <div>avatarPersonality: {avatarPersonality ? JSON.stringify(avatarPersonality) : "null"}</div>
                    <div>forceGenAt: {FORCE_GENERATION_TURNS} | forceAvatarAt: {FORCE_AVATAR_READY_TURNS}</div>
                  </>
                )}
                {activeScript === "story-helper" && (
                  <>
                    <div>storyPhase: <b>{storyPhase}</b></div>
                    <div>round: {story.currentRound}/{story.totalRounds}</div>
                    <div>rerolls: {story.rerollCount}/{story.maxRerolls}</div>
                    <div>roundData: {JSON.stringify(story.currentRoundData)}</div>
                    <div>completedRounds: {story.completedRounds.length}</div>
                  </>
                )}
                <div>scriptTurnCount: {scriptTurnCount}</div>
                <div>kidMode: {String(isKidMode)}</div>
                <div>conversation msgs: {conversation.length}</div>
                <div className="border-t border-yellow-700 pt-1 mt-1">Last AI msg (tail 200):</div>
                <div className="whitespace-pre-wrap break-all text-yellow-200/70">
                  {conversation.filter(m => m.role === "system" && m.content).slice(-1)[0]?.content?.slice(-200) || "(none)"}
                </div>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chat;
