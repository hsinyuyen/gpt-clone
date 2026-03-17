import { useEffect, useRef, useState, useCallback } from "react";
import { FiSend, FiMic } from "react-icons/fi";
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
import { uploadAvatarFrames } from "@/lib/firestore";
import {
  generateAvatarCreatorPrompt,
  generateQuestionnairePrompt,
  parseAvatarFromResponse,
  parseStartGenerationFromResponse,
  parseStudentInfoFromResponse,
  AVATAR_CREATOR_SYSTEM_PROMPT,
} from "@/data/avatarQuestions";
import {
  StoryPhase,
  StoryInfo,
  generateStoryHelperPrompt,
  generatePollinationsUrl,
  generateCharacterImagePrompt,
  generateSceneImagePrompt,
  parseStorySettingFromResponse,
  parseCharactersFromResponse,
  parsePlotFromResponse,
  parseStoryCompleteFromResponse,
  getStoryFallbackReplies,
} from "@/data/storyScript";

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

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showEmptyChat, setShowEmptyChat] = useState(true);
  const [conversation, setConversation] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar | null>(null);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [scriptPhase, setScriptPhase] = useState<ScriptPhase>("appearance");
  const [collectedInfo, setCollectedInfo] = useState<CollectedInfo>({});
  const [collectedStudentInfo, setCollectedStudentInfo] = useState<Record<string, any>>({});
  const [avatarPersonality, setAvatarPersonality] = useState<Record<string, string> | null>(null);
  const [isGeneratingInBackground, setIsGeneratingInBackground] = useState(false);
  const [scriptTurnCount, setScriptTurnCount] = useState(0);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [generatingTurnCount, setGeneratingTurnCount] = useState(0);
  const generationPromiseRef = useRef<Promise<any> | null>(null);
  const hasStartedGeneration = useRef(false);
  const FORCE_AVATAR_READY_TURNS = 5; // Force AVATAR_READY after 5 turns in generating phase

  // Story helper state
  const [storyPhase, setStoryPhase] = useState<StoryPhase>("intro");
  const [storyInfo, setStoryInfo] = useState<Partial<StoryInfo>>({});
  const [storyImages, setStoryImages] = useState<{ url: string; caption: string }[]>([]);
  const storyScriptInitialized = useRef(false);
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
  const { archiveConversation } = useConversation();
  const { trackEvent } = useAnalytics();
  const textAreaRef = useAutoResizeTextArea();
  const bottomOfChatRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scriptInitialized = useRef(false);
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

  // 當腳本啟動時，自動開始對話
  useEffect(() => {
    if (activeScript === "create-avatar" && !scriptInitialized.current) {
      scriptInitialized.current = true;
      // 重置所有狀態
      setConversation([]);
      setShowEmptyChat(false);
      setPendingAvatar(null);
      setScriptPhase("intro"); // 從課程介紹開始
      setCollectedInfo({});
      setCollectedStudentInfo({});
      setAvatarPersonality(null);
      setScriptTurnCount(0);
      setGeneratingTurnCount(0);
      setQuickReplies([]);
      hasStartedGeneration.current = false;

      // 發送初始訊息讓 AI 開始引導
      setTimeout(() => {
        sendScriptInitMessage();
      }, 500);
    }

    if (!activeScript) {
      scriptInitialized.current = false;
      storyScriptInitialized.current = false;
    }
  }, [activeScript]);

  // 故事腳本啟動
  useEffect(() => {
    if (activeScript === "story-helper" && !storyScriptInitialized.current) {
      storyScriptInitialized.current = true;
      setConversation([]);
      setShowEmptyChat(false);
      setStoryPhase("intro");
      setStoryInfo({});
      setStoryImages([]);
      setScriptTurnCount(0);
      setQuickReplies([]);

      setTimeout(() => {
        sendStoryInitMessage();
      }, 500);
    }
  }, [activeScript]);

  const sendStoryInitMessage = async () => {
    setIsLoading(true);
    setConversation([{ content: null, role: "system" }]);

    try {
      let introPrompt = generateStoryHelperPrompt("intro", {});
      if (user?.kidMode) {
        introPrompt += "\n\n## 重要：幼兒模式\n你的每次回覆必須在30個中文字以內，用最簡單的詞彙。\n注意：JSON 資料標記不算在30字限制內，請完整輸出。";
      }

      const response = await fetch(`/api/openai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ content: "開始故事創作", role: "user" }],
          model: selectedModel,
          systemPrompt: introPrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setConversation([{ content: data.message, role: "system" }]);
        generateQuickReplies(data.message);
      }
    } catch (error: any) {
      setErrorMessage(`ERROR: ${error.message}`);
    }
    setIsLoading(false);
  };

  const sendScriptInitMessage = async () => {
    setIsLoading(true);
    setConversation([{ content: null, role: "system" }]);

    try {
      // 使用 intro 階段的 prompt 來介紹課程
      let introPrompt = generateAvatarCreatorPrompt("intro", {});
      if (user?.kidMode) {
        introPrompt += "\n\n## 重要：幼兒模式\n你的每次回覆必須在30個中文字以內，用最簡單的詞彙，不要用複雜的句子。";
      }

      const response = await fetch(`/api/openai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ content: "開始課程", role: "user" }],
          model: selectedModel,
          systemPrompt: introPrompt,
        }),
      });

      if (response.ok) {
        const data = await response.json();
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

  // Fallback quick replies
  const getFallbackReplies = (): string[] => {
    if (activeScript === "create-avatar") {
      if (scriptPhase === "intro") return ["準備好了！", "開始吧！"];
      if (scriptPhase === "appearance") {
        if (!collectedInfo.characterType) return ["機器人", "小貓咪", "恐龍", "精靈"];
        if (!collectedInfo.color) return ["藍色", "紅色", "綠色", "彩虹色"];
        if (!collectedInfo.name) return ["小星", "阿寶", "酷比", "自己取名"];
        return ["不用配件", "帽子", "披風", "眼鏡"];
      }
      if (scriptPhase === "generating" || scriptPhase === "personality") {
        if (!collectedInfo.speakingStyle) return ["活潑開朗", "溫柔體貼", "酷酷的", "搞笑幽默"];
        if (!collectedInfo.specialAbility) return ["講故事", "解數學", "聊天陪伴", "鼓勵我"];
        return ["不用口頭禪", "讚啦！", "沒問題！", "交給我！"];
      }
      return [];
    }
    if (activeScript === "story-helper") {
      return getStoryFallbackReplies(storyPhase, storyInfo);
    }
    return ["告訴我更多", "換個話題", "幫我解釋", "謝謝"];
  };

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "24px";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [message, textAreaRef]);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Scroll on conversation change, pending avatar
  useEffect(() => {
    requestAnimationFrame(scrollToBottom);
  }, [conversation, pendingAvatar, scrollToBottom]);

  // Continuous scroll during streaming — poll until streaming finishes
  useEffect(() => {
    if (isLoading) {
      // While loading (waiting for API), scroll to show spinner
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

  const sendMessage = async (e: any, overrideMessage?: string) => {
    e.preventDefault();

    const msg = overrideMessage || message;

    if (msg.trim().length < 2) {
      setErrorMessage("ERROR: 請輸入至少 2 個字");
      return;
    } else {
      setErrorMessage("");
    }

    trackEvent("send.message", { message: msg });
    setIsLoading(true);
    setQuickReplies([]); // Hide quick replies while loading

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

    // 決定當前使用的階段（處理 intro → 下一階段的轉換）
    let currentPhase = scriptPhase;
    let currentStoryPhase = storyPhase;
    if (activeScript === "create-avatar" && scriptPhase === "intro") {
      currentPhase = "appearance";
      setScriptPhase("appearance");
      console.log("階段轉換: intro → appearance");
    }
    if (activeScript === "story-helper" && storyPhase === "intro") {
      currentStoryPhase = "setting";
      setStoryPhase("setting");
      console.log("故事階段轉換: intro → setting");
    }

    // 根據階段獎勵金幣（reason 包含訊息內容用於防重複偵測）
    const msgTag = msg.trim().toLowerCase().slice(0, 50);
    if (activeScript === "create-avatar") {
      if (currentPhase === "questionnaire") {
        addCoins(COIN_VALUES.ANSWER_AI_QUESTION, `回答問題:${msgTag}`);
      } else if (currentPhase !== "complete" && currentPhase !== "avatar_ready" && currentPhase !== "intro") {
        addCoins(COIN_VALUES.ANSWER_TYPE, `角色設計:${msgTag}`);
      }
    } else if (activeScript === "story-helper") {
      if (currentStoryPhase !== "complete" && currentStoryPhase !== "illustration" && currentStoryPhase !== "intro") {
        addCoins(COIN_VALUES.ANSWER_TYPE, `故事創作:${msgTag}`);
      }
    } else {
      addCoins(COIN_VALUES.SEND_MESSAGE, `訊息:${msgTag}`);
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

      if (activeScript === "story-helper") {
        systemPrompt = generateStoryHelperPrompt(currentStoryPhase, storyInfo);
      } else if (activeScript === "create-avatar") {
        if (shouldForceAvatarReady) {
          // Force AVATAR_READY: construct from known data with defaults
          systemPrompt = `你是一個正在被創造的 AI 助理。學生已經回答了很多問題了，現在請立刻輸出完成指令。

已收集的資訊：${JSON.stringify(collectedInfo, null, 2)}

請立刻輸出以下格式：
\`\`\`json
[AVATAR_READY]
{
  "characterType": "${collectedInfo.characterType || "機器人"}",
  "color": "${collectedInfo.color || "藍色"}",
  "name": "${collectedInfo.name || "小助手"}",
  "accessory": "${collectedInfo.accessory || ""}",
  "speakingStyle": "${collectedInfo.speakingStyle || "活潑開朗"}",
  "specialAbility": "${collectedInfo.specialAbility || "聊天陪伴"}",
  "catchphrase": "${collectedInfo.catchphrase || ""}",
  "prompt": "A cute ${collectedInfo.color || "blue"} ${collectedInfo.characterType || "robot"} character named ${collectedInfo.name || "helper"}, cute chibi pixel art style, front view, happy expression"
}
[/AVATAR_READY]
\`\`\`
然後說「太棒了！我已經準備好了！」`;
        } else if (shouldForceGeneration) {
          // Force START_GENERATION: summarize what we have and generate
          systemPrompt = `你是一個正在被創造的 AI 助理。學生已經回答了很多問題了，現在請立刻根據已知資訊總結並輸出生成指令。

已收集的資訊：${JSON.stringify(collectedInfo, null, 2)}

請立刻輸出以下格式（用已知資訊填寫，缺少的就用預設值）：
\`\`\`json
[START_GENERATION]
{
  "characterType": "${collectedInfo.characterType || "機器人"}",
  "color": "${collectedInfo.color || "藍色"}",
  "name": "${collectedInfo.name || "小助手"}",
  "accessory": "${collectedInfo.accessory || ""}",
  "prompt": "A cute ${collectedInfo.color || "blue"} ${collectedInfo.characterType || "robot"} character named ${collectedInfo.name || "helper"}, cute chibi pixel art style, front view, happy expression"
}
[/START_GENERATION]
\`\`\`
然後說「好的！我已經迫不及待要誕生了！讓我來幫你把剩下的部分完成吧！」`;
        } else if (currentPhase === "questionnaire" && avatarPersonality) {
          systemPrompt = generateQuestionnairePrompt(
            avatarPersonality.name || "AI助理",
            avatarPersonality.speakingStyle || "活潑開朗",
            avatarPersonality.catchphrase || "",
            collectedStudentInfo
          );
        } else {
          systemPrompt = generateAvatarCreatorPrompt(currentPhase, collectedInfo);
        }
      } else {
        systemPrompt = generateSystemPrompt(memory);
      }

      // Kid mode: append 30-char response limit (exclude JSON data blocks)
      if (isKidMode) {
        const markers = activeScript === "story-helper"
          ? "[STORY_SETTING]、[CHARACTERS_READY]、[PLOT_READY]、[STORY_COMPLETE]"
          : "[START_GENERATION]、[AVATAR_READY]";
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

        // 檢查是否要開始背景生成（收集完外觀資訊）
        const { shouldStartGeneration, basicData, cleanResponse: startGenCleanResponse } = parseStartGenerationFromResponse(finalResponse);
        if (shouldStartGeneration && basicData && !hasStartedGeneration.current) {
          hasStartedGeneration.current = true;
          finalResponse = startGenCleanResponse;

          // 更新已收集的外觀資訊
          const newCollectedInfo: CollectedInfo = {
            ...collectedInfo,
            characterType: basicData.characterType,
            color: basicData.color,
            name: basicData.name,
            accessory: basicData.accessory || "",
          };
          setCollectedInfo(newCollectedInfo);

          // 進入生成階段（同時收集個性）
          setScriptPhase("generating");
          console.log("階段轉換: appearance → generating", newCollectedInfo);

          // 開始背景生成
          startBackgroundGeneration(basicData);
        }

        // 檢查是否包含 Avatar 資料（完整資訊，包含個性）
        const { hasAvatar, avatarData, cleanResponse } = parseAvatarFromResponse(finalResponse);
        if (hasAvatar && avatarData) {
          finalResponse = cleanResponse;

          // 更新已收集的個性資訊
          const fullCollectedInfo: CollectedInfo = {
            ...collectedInfo,
            characterType: avatarData.characterType || collectedInfo.characterType,
            color: avatarData.color || collectedInfo.color,
            name: avatarData.name || collectedInfo.name,
            accessory: avatarData.accessory || collectedInfo.accessory,
            speakingStyle: avatarData.speakingStyle,
            specialAbility: avatarData.specialAbility,
            catchphrase: avatarData.catchphrase || "",
          };
          setCollectedInfo(fullCollectedInfo);

          // 進入 avatar_ready 階段
          setScriptPhase("avatar_ready");
          console.log("階段轉換: generating → avatar_ready", fullCollectedInfo);
        } else {
          finalResponse = cleanResponse;
        }

        // ===== 故事腳本解析 =====
        if (activeScript === "story-helper") {
          // 解析故事背景設定
          const { hasSetting, settingData } = parseStorySettingFromResponse(finalResponse);
          if (hasSetting && settingData) {
            const cleanedStory = finalResponse
              .replace(/```json\s*\[STORY_SETTING\][\s\S]*?\[\/STORY_SETTING\]\s*```/g, '')
              .replace(/\[STORY_SETTING\][\s\S]*?\[\/STORY_SETTING\]/g, '')
              .trim();
            finalResponse = cleanedStory;
            const newStoryInfo = { ...storyInfo, ...settingData };
            setStoryInfo(newStoryInfo);
            setStoryPhase("characters");
            console.log("故事階段轉換: setting → characters", newStoryInfo);
          }

          // 解析角色資料
          const { hasCharacters, characterData } = parseCharactersFromResponse(finalResponse);
          if (hasCharacters && characterData) {
            const cleanedChars = finalResponse
              .replace(/```json\s*\[CHARACTERS_READY\][\s\S]*?\[\/CHARACTERS_READY\]\s*```/g, '')
              .replace(/\[CHARACTERS_READY\][\s\S]*?\[\/CHARACTERS_READY\]/g, '')
              .trim();
            finalResponse = cleanedChars;

            const newStoryInfo = {
              ...storyInfo,
              heroName: characterData.heroName,
              heroAppearance: characterData.heroAppearance,
              heroPersonality: characterData.heroPersonality,
              sidekickName: characterData.sidekickName || undefined,
              sidekickAppearance: characterData.sidekickAppearance || undefined,
            };

            // 生成角色圖片 via Pollinations
            const heroImgPrompt = generateCharacterImagePrompt(
              characterData.heroName,
              characterData.heroAppearanceEN || characterData.heroAppearance,
              storyInfo.genre || "adventure"
            );
            const heroImgUrl = generatePollinationsUrl(heroImgPrompt, 512, 512);
            newStoryInfo.heroImageUrl = heroImgUrl;

            const newImages: { url: string; caption: string }[] = [
              { url: heroImgUrl, caption: `主角：${characterData.heroName}` },
            ];

            if (characterData.sidekickName && characterData.sidekickAppearanceEN) {
              const sidekickImgPrompt = generateCharacterImagePrompt(
                characterData.sidekickName,
                characterData.sidekickAppearanceEN || characterData.sidekickAppearance,
                storyInfo.genre || "adventure"
              );
              const sidekickImgUrl = generatePollinationsUrl(sidekickImgPrompt, 512, 512);
              newStoryInfo.sidekickImageUrl = sidekickImgUrl;
              newImages.push({ url: sidekickImgUrl, caption: `夥伴：${characterData.sidekickName}` });
            }

            setStoryInfo(newStoryInfo);
            setStoryImages(newImages);
            setStoryPhase("plot");
            console.log("故事階段轉換: characters → plot", newStoryInfo);
          }

          // 解析劇情資料
          const { hasPlot, plotData } = parsePlotFromResponse(finalResponse);
          if (hasPlot && plotData) {
            const cleanedPlot = finalResponse
              .replace(/```json\s*\[PLOT_READY\][\s\S]*?\[\/PLOT_READY\]\s*```/g, '')
              .replace(/\[PLOT_READY\][\s\S]*?\[\/PLOT_READY\]/g, '')
              .trim();
            finalResponse = cleanedPlot;

            const newStoryInfo = {
              ...storyInfo,
              plotGoal: plotData.plotGoal,
              plotObstacle: plotData.plotObstacle,
              plotResolution: plotData.plotResolution,
              storyTitle: plotData.storyTitle,
            };

            // 生成場景插圖 via Pollinations
            if (plotData.scenes && Array.isArray(plotData.scenes)) {
              const sceneImages = plotData.scenes.map((scene: any) => ({
                url: generatePollinationsUrl(
                  generateSceneImagePrompt(scene.description, storyInfo.setting || "", storyInfo.genre || ""),
                  768, 512
                ),
                caption: scene.caption,
              }));
              setStoryImages(prev => [...prev, ...sceneImages]);
              newStoryInfo.sceneImageUrls = sceneImages.map((s: any) => s.url);
            }

            setStoryInfo(newStoryInfo);
            setStoryPhase("illustration");
            console.log("故事階段轉換: plot → illustration", newStoryInfo);
          }

          // 解析完整故事
          const { hasStory, storyData } = parseStoryCompleteFromResponse(finalResponse);
          if (hasStory && storyData) {
            const cleanedFinal = finalResponse
              .replace(/```json\s*\[STORY_COMPLETE\][\s\S]*?\[\/STORY_COMPLETE\]\s*```/g, '')
              .replace(/\[STORY_COMPLETE\][\s\S]*?\[\/STORY_COMPLETE\]/g, '')
              .trim();

            // 把故事內容格式化成顯示文字
            const storyText = `📖 **${storyData.title}**\n\n${storyData.paragraphs.join("\n\n")}`;
            finalResponse = cleanedFinal + "\n\n" + storyText;

            setStoryInfo(prev => ({
              ...prev,
              storyTitle: storyData.title,
              storyContent: storyData.paragraphs.join("\n\n"),
            }));

            // 獎勵完成金幣
            addCoins(20, "完成故事創作");

            // 延遲完成腳本
            setStoryPhase("complete");
            console.log("故事階段轉換: illustration → complete");

            // 封存對話
            const archiveMessages = [
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
            archiveConversation(`故事：${storyData.title}`, archiveMessages);

            setTimeout(() => {
              setConversation([]);
              setShowEmptyChat(true);
              setQuickReplies([]);
              setStoryPhase("intro");
              setStoryInfo({});
              setStoryImages([]);
              setScriptTurnCount(0);
              storyScriptInitialized.current = false;
              onScriptComplete?.();
            }, 3000);
          }
        }

        // 檢查是否包含學生資訊
        const { hasStudentInfo, studentInfo, cleanResponse: cleanedStudentResponse } = parseStudentInfoFromResponse(finalResponse);
        if (hasStudentInfo && studentInfo) {
          finalResponse = cleanedStudentResponse;

          // 更新已收集的學生資訊
          setCollectedStudentInfo(studentInfo);

          // 保存學生資訊到記憶
          if (memory) {
            const personalInfo = {
              ...memory.personalInfo,
              nickname: studentInfo.nickname,
              occupation: `${studentInfo.grade}學生`,
              interests: studentInfo.hobbies,
              customFacts: [
                `喜歡的科目: ${studentInfo.favoriteSubject}`,
                `希望 AI 幫助: ${studentInfo.needsHelp}`,
              ],
            };
            console.log("Student info saved to memory:", personalInfo);
          }

          // 保存 Avatar 個性到記憶
          if (avatarPersonality) {
            console.log("Avatar personality saved to memory:", avatarPersonality);
          }

          // 封存對話到 sessions
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

          // 完成腳本並重置
          setScriptPhase("complete");
          console.log("階段轉換: questionnaire → complete");
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
        }

        const updatedConversation = [
          ...conversation,
          { content: msg, role: "user" },
          { content: finalResponse, role: "system" },
        ];

        setConversation(updatedConversation);

        // 如果有 Avatar 資料，開始生成圖片
        if (hasAvatar && avatarData) {
          generateAvatarImage(avatarData);
        }

        // 非腳本模式時，處理記憶
        if (!activeScript) {
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
      }

      setIsLoading(false);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(`ERROR: ${error.message}`);
      setIsLoading(false);
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
      sendMessage(e);
      e.preventDefault();
    }
  };

  const currentTime = new Date().toLocaleString("zh-TW");

  return (
    <div className="flex max-w-full flex-1 flex-col terminal-screen terminal-scanline terminal-flicker">
      {/* Terminal Header */}
      <div className="sticky top-0 z-10 border-b border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="md:hidden text-[var(--terminal-primary)] hover:glow-text"
              onClick={toggleComponentVisibility}
            >
              <RxHamburgerMenu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[var(--terminal-primary)] glow-text text-sm">
                {activeScript === "create-avatar" ? "◉ AVATAR_CREATOR" : activeScript === "story-helper" ? "◉ STORY_CREATOR" : "◉ LAB-TERMINAL v2.0"}
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
          <div className="flex items-center gap-2 sm:gap-4 text-xs">
            {/* 金幣顯示 */}
            <div data-tutorial="coin-display">
              <CoinDisplay className="border border-[var(--terminal-primary-dim)] px-2 py-1 rounded" />
            </div>

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
                  {activeScript === "create-avatar" ? (
                    <>
                      <div>+------------------------------------------------------------------+</div>
                      <div>| SCRIPT: CREATE_AVATAR | {currentTime}</div>
                      <div>| MODE: INTERACTIVE DESIGN</div>
                      <div>+------------------------------------------------------------------+</div>
                    </>
                  ) : activeScript === "story-helper" ? (
                    <>
                      <div>+------------------------------------------------------------------+</div>
                      <div>| SCRIPT: STORY_CREATOR | {currentTime}</div>
                      <div>| MODE: CREATIVE WRITING | PHASE: {storyPhase.toUpperCase()}</div>
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
                  const isLastSystem = message.role === "system"
                    && message.content !== null
                    && index === conversation.length - 1;
                  return (
                    <Message
                      key={index}
                      message={message}
                      avatarName={
                        activeScript === "create-avatar" && collectedInfo.name
                          ? collectedInfo.name
                          : activeScript === "story-helper"
                            ? "故事小幫手"
                            : undefined
                      }
                      streaming={isLastSystem}
                      onStreamComplete={scrollToBottom}
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
                        setQuickReplies([]);
                        textAreaRef.current?.focus();
                      }}
                      className="px-3 py-1.5 text-xs border border-dashed border-[var(--terminal-accent)] text-[var(--terminal-accent)] hover:border-[var(--terminal-primary)] hover:text-[var(--terminal-primary)] transition-all"
                    >
                      ✏️ 自己輸入
                    </button>
                  </div>
                )}

                {/* Story Images */}
                {activeScript === "story-helper" && storyImages.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="text-[var(--terminal-accent)] text-xs mb-2">{'>'} 生成的插圖：</div>
                    <div className="grid grid-cols-2 gap-3">
                      {storyImages.map((img, i) => (
                        <div key={i} className="border border-[var(--terminal-primary-dim)] p-1">
                          <div className="relative">
                            <div className="img-loading w-full h-32 flex items-center justify-center bg-gray-900 text-[var(--terminal-primary-dim)] text-xs">
                              <span className="animate-pulse">生成圖片中...</span>
                            </div>
                            <img
                              src={img.url}
                              alt={img.caption}
                              className="w-full h-auto object-cover"
                              style={{ display: "none" }}
                              onLoad={(e) => {
                                const el = e.target as HTMLImageElement;
                                el.style.display = "block";
                                const loader = el.previousElementSibling;
                                if (loader) (loader as HTMLElement).style.display = "none";
                              }}
                              onError={(e) => {
                                const el = e.target as HTMLImageElement;
                                const retried = el.dataset.retried;
                                if (!retried) {
                                  el.dataset.retried = "1";
                                  // Pollinations generates on-demand; retry after delay
                                  setTimeout(() => {
                                    el.src = img.url + "&retry=1";
                                  }, 5000);
                                } else {
                                  // Show error in the loading placeholder
                                  const loader = el.previousElementSibling;
                                  if (loader) {
                                    (loader as HTMLElement).innerHTML = '<span class="text-red-400">圖片載入失敗</span>';
                                  }
                                }
                              }}
                            />
                          </div>
                          <div className="text-[var(--terminal-primary)] text-xs text-center mt-1 px-1">
                            {img.caption}
                          </div>
                        </div>
                      ))}
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
                <div data-tutorial="chat-input" className="flex-1 flex items-center gap-2 terminal-border px-3 py-2">
                  <textarea
                    ref={textAreaRef}
                    value={message}
                    tabIndex={0}
                    style={{
                      height: "24px",
                      maxHeight: "100px",
                      overflowY: "hidden",
                    }}
                    placeholder="Enter command..."
                    className="flex-1 terminal-input resize-none text-sm"
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeypress}
                  />
                  <div className="flex items-center gap-1">
                    {isSpeechSupported && !showVoiceRecorder && (
                      <button
                        type="button"
                        onClick={openVoiceRecorder}
                        className="p-1 transition-colors text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)]"
                        title="語音輸入"
                      >
                        <FiMic className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      disabled={isLoading || message?.length === 0}
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
            <span>STATUS: {isLoading ? "PROCESSING..." : pendingAvatar?.isGenerating ? "GENERATING..." : storyPhase === "illustration" && activeScript === "story-helper" ? "ILLUSTRATING..." : "READY"}</span>
            <span className="hidden sm:inline">
              {activeScript ? `SCRIPT: ${activeScript}` : `MEM: ${memory?.topicSummaries.length || 0} | MODEL: ${selectedModel.id}`}
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
                    <div>storyInfo: {JSON.stringify(storyInfo)}</div>
                    <div>storyImages: {storyImages.length}</div>
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
