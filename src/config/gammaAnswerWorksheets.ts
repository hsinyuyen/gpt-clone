import type { Worksheet } from "@/types/Worksheet";
import type {
  GammaAnswerAiReviewMode,
  GammaAnswerExpectedKind,
  GammaAnswerQuestionConfig,
  GammaAnswerPromptReviewCriteria,
  GammaAnswerReadCheck,
  GammaAnswerReviewCriteria,
  GammaAnswerToolId,
  GammaAnswerWorksheetConfig,
} from "@/types/GammaAnswerWorksheet";

export type {
  GammaAnswerAiReviewMode,
  GammaAnswerExpectedKind,
  GammaAnswerQuestionConfig,
  GammaAnswerPromptReviewCriteria,
  GammaAnswerReadCheck,
  GammaAnswerReviewCriteria,
  GammaAnswerToolId,
  GammaAnswerWorksheetConfig,
} from "@/types/GammaAnswerWorksheet";

export const LAB_TOOL_MEDIA_ACCESS_KEY = "lab-terminal:worksheet-media-access";

const LEGACY_S3W01_GAMMA_ANSWER_CONFIG: GammaAnswerWorksheetConfig = {
  schemaVersion: 2,
  id: "S3W01",
  courseId: "S3-W01",
  title: "S3 W01｜工具選擇與初次使用",
  shortTitle: "S3 W01",
  semester: "S3",
  week: 1,
  gammaUrl: "https://gamma.app/docs/S3-W01-hixa52whtzl6aas",
  gammaFallbackUrl: "https://gamma.app/embed/S3-W01-hixa52whtzl6aas",
  source: "gamma-answer-worksheet",
  storageVersion: "v22-gamma-answer-worksheet-20260729",
  draftField: "gammaAnswerDraft",
  mediaAccessKey: LAB_TOOL_MEDIA_ACCESS_KEY,
  questions: [
    {
      id: "q1",
      taskId: "S3-W01-A-Q1",
      code: "第 1 題",
      label: "AI 工具使用提醒",
      title: "AI 工具使用提醒",
      prompt: "請看左側 GAMMA 第 1 題，整理 AI 工具使用規則。",
      toolPrompt:
        "請把 AI 工具使用規則整理成 3 點文字提醒，讓小學生上課前快速看懂。每一點要短、清楚，並提醒同學不要輸入個人資料、要檢查 AI 回答、要照老師指定任務使用工具。",
      placeholder: "請貼上你用 Lab Terminal 整理出的 3 點提醒。",
      toolId: "terminal",
      expectedKind: "text",
      coins: 60,
      accept: "text/plain",
      uploadLabel: "",
      reviewHint: "需要至少 3 點清楚提醒，內容要和 AI 工具使用有關。",
      readCheck: {
        question: "這一題要先產出哪一種成果？",
        options: ["一張圖片", "整理後的文字提醒", "一段音樂"],
        answerIndex: 1,
        successFeedback: "小測通過，這題使用文字工具整理提醒。",
        retryFeedback: "再看一次題目，這題要整理成文字提醒。",
      },
      reviewBrief: {
        task: "學生要整理 AI 工具使用前的注意事項。",
        expectedOutput: "一段文字或條列，能提醒同學安全、正確地使用 AI 工具。",
        mustInclude: ["提醒不要輸入個人資料", "提醒要檢查 AI 回答", "內容和課堂 AI 工具有關"],
        rejectIf: ["空白或亂打", "只複製題目沒有回答", "內容和 AI 工具使用無關"],
      },
      textMinimumLength: 18,
      textMaximumLength: 260,
      textRequiresThreePoints: true,
      textKeywords: ["AI", "個資", "隱私", "檢查", "確認", "老師", "資料", "來源", "不要", "提示詞"],
      textMinimumKeywordMatches: 2,
      reviewCriteria: {
        minLength: 18,
        maxLength: 260,
        requiresThreePoints: true,
        keywords: ["AI", "個資", "隱私", "檢查", "確認", "老師", "資料", "來源", "不要", "提示詞"],
        minimumKeywordMatches: 2,
        aiReviewMode: "local-only",
      },
    },
    {
      id: "q2",
      taskId: "S3-W01-A-Q2",
      code: "第 2 題",
      label: "小狗玩球圖片",
      title: "小狗玩球圖片",
      prompt: "請看左側 GAMMA 第 2 題，用 Lab Image 產出圖片後上傳。",
      toolPrompt:
        "請生成一張小狗在草地上玩紅色球的圖片。畫面明亮、乾淨、可愛，可以清楚看到小狗和紅色球，不要出現文字。",
      placeholder: "",
      toolId: "image",
      expectedKind: "image",
      coins: 60,
      accept: "image/png,image/jpeg,image/webp",
      uploadLabel: "上傳圖片",
      reviewHint: "需要圖片附件，且主題要能對應小狗玩球。",
      readCheck: {
        question: "小狗玩球這一題最適合使用哪個工具？",
        options: ["Lab Terminal 文字工具", "Lab Music 音樂工具", "Lab Image 圖片工具"],
        answerIndex: 2,
        successFeedback: "小測通過，這題使用圖片工具產生圖片。",
        retryFeedback: "再看一次題目，這題要產出圖片。",
      },
      reviewBrief: {
        task: "學生要用 Lab Image 產生並上傳一張小狗玩紅色球的圖片。",
        expectedOutput: "一個可正常開啟的圖片作品，主題應能看出小狗和紅色球。",
        mustInclude: ["有圖片附件", "圖片主題和小狗玩球有關", "不是空白或錯誤檔案"],
        rejectIf: ["沒有附件", "附件不是圖片", "圖片明顯與題目無關"],
      },
      promptReviewCriteria: {
        passConditions: ["小狗", "草地", "紅色球"],
        minimumCharacterMatchRatio: 0.5,
      },
      reviewCriteria: {
        minAttachments: 1,
        maxAttachments: 1,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        aiReviewMode: "local-only",
      },
    },
    {
      id: "q3",
      taskId: "S3-W01-A-Q3",
      code: "第 3 題",
      label: "咖啡廳爵士樂",
      title: "咖啡廳爵士樂",
      prompt: "請看左側 GAMMA 第 3 題，用 Lab Music 產出音樂後上傳。",
      toolPrompt:
        "請生成一段 30 秒咖啡廳爵士樂，風格溫暖、放鬆、輕快，適合下午在咖啡廳閱讀或聊天，不要人聲，不要太吵。",
      placeholder: "",
      toolId: "music",
      expectedKind: "audio",
      coins: 60,
      accept: "audio/mpeg,audio/mp3,audio/wav,audio/mp4,.mp3,.wav,.m4a",
      uploadLabel: "上傳音樂",
      reviewHint: "需要音訊附件，且能對應咖啡廳爵士樂主題。",
      readCheck: {
        question: "咖啡廳爵士樂這一題要交什麼作品？",
        options: ["一張圖片", "一段音樂檔", "一段滑雪影片"],
        answerIndex: 1,
        successFeedback: "小測通過，這題使用音樂工具產生音訊。",
        retryFeedback: "再看一次題目，這題要交音樂檔。",
      },
      reviewBrief: {
        task: "學生要用 Lab Music 產生並上傳一段咖啡廳爵士樂。",
        expectedOutput: "一個可播放的音訊檔，應是音樂或配樂作品。",
        mustInclude: ["有音訊附件", "音訊檔案格式正確", "不是空白或錯誤檔案"],
        rejectIf: ["沒有附件", "附件不是音訊", "檔案無法播放或明顯錯誤"],
      },
      promptReviewCriteria: {
        passConditions: ["咖啡廳", "爵士樂", "溫暖放鬆", "沒有人聲"],
        minimumCharacterMatchRatio: 0.5,
      },
      reviewCriteria: {
        minAttachments: 1,
        maxAttachments: 1,
        allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/mp4"],
        aiReviewMode: "local-only",
      },
    },
    {
      id: "q4",
      taskId: "S3-W01-A-Q4",
      code: "第 4 題",
      label: "滑雪短影片",
      title: "滑雪短影片",
      prompt: "請看左側 GAMMA 第 4 題，用 Lab Video 產出影片後上傳。",
      toolPrompt:
        "請生成一段 5 秒滑雪影片：一位滑雪者穿著藍色外套，在白色雪地山坡上往下滑，滑雪時有雪花飛起來。白天陽光、畫面清楚、動作流暢、有速度感，不要出現文字。",
      placeholder: "",
      toolId: "video",
      expectedKind: "video",
      coins: 70,
      accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
      uploadLabel: "上傳影片",
      reviewHint: "需要影片附件，且能對應滑雪短影片主題。",
      readCheck: {
        question: "滑雪短影片這一題最適合使用哪個工具？",
        options: ["Lab Image 圖片工具", "Lab Music 音樂工具", "Lab Video 影片工具"],
        answerIndex: 2,
        successFeedback: "小測通過，這題使用影片工具產生短影片。",
        retryFeedback: "再看一次題目，這題要產出影片。",
      },
      reviewBrief: {
        task: "學生要用 Lab Video 產生並上傳一段滑雪短影片。",
        expectedOutput: "一個可播放的影片檔，主題應能對應滑雪動作。",
        mustInclude: ["有影片附件", "影片檔案格式正確", "不是空白或錯誤檔案"],
        rejectIf: ["沒有附件", "附件不是影片", "檔案無法播放或明顯錯誤"],
      },
      promptReviewCriteria: {
        passConditions: ["滑雪者", "藍色外套", "白色雪地", "往下滑"],
        minimumCharacterMatchRatio: 0.5,
      },
      reviewCriteria: {
        minAttachments: 1,
        maxAttachments: 1,
        allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
        aiReviewMode: "local-only",
      },
    },
  ],
};

const S3W01_IMPORTED_CONFIG: GammaAnswerWorksheetConfig = {
  schemaVersion: 2,
  id: "S3W01",
  courseId: "S3-W01",
  title: "S3 W01｜工具選擇與初次使用",
  shortTitle: "S3 W01",
  semester: "S3",
  week: 1,
  gammaUrl: "https://gamma.app/docs/S3-W01-hixa52whtzl6aas",
  gammaFallbackUrl: "https://gamma.app/embed/S3-W01-hixa52whtzl6aas",
  source: "gamma-answer-worksheet",
  storageVersion: "v23-s3w01-worksheet-20260805",
  draftField: "gammaAnswerDraft",
  mediaAccessKey: LAB_TOOL_MEDIA_ACCESS_KEY,
  questions: [
    {
      id: "A",
      taskId: "S3-W01-A-1",
      code: "題目 A",
      label: "任務 A｜AI 工具使用提醒",
      title: "AI 工具使用提醒",
      prompt: "請使用 Lab Terminal，把使用 AI 工具的注意事項整理成 3 點提醒，讓同學一看就懂。",
      toolPrompt: "請把下面內容整理成 3 點提醒，對象是小四學生。每一點要短、清楚、容易懂。請只輸出 3 個條列。\n\n內容：使用 AI 工具前要先看清楚任務，不要亂輸入無關內容。如果不知道怎麼寫提示詞，可以先找出任務中的關鍵字。生成結果後要自己檢查，不能直接交出去。如果結果不符合需求，要修改提示詞再試一次。生成的關鍵詞很重要請善用你的複製貼上快捷鍵。",
      placeholder: "請貼上 Lab Terminal 產生的 3 點提醒",
      toolId: "terminal",
      expectedKind: "text",
      coins: 40,
      accept: "text/plain",
      uploadLabel: "",
      reviewHint: "請確認答案有 3 點、每點短而清楚，並提醒如何使用 AI 工具。",
      readChecks: [
        {
          question: "題目要你整理成 3 點提醒，最後要交什麼？",
          options: ["文字", "圖片", "音樂"],
          answerIndex: 0,
          successFeedback: "答對了！這題最後要交文字。",
          retryFeedback: "再看一次題目：要整理成 3 點提醒。",
        },
        {
          question: "任務 A 應該打開哪一個工具？",
          options: ["Lab Image", "Lab Terminal", "Lab Video"],
          answerIndex: 1,
          successFeedback: "答對了！要做文字就選 Lab Terminal。",
          retryFeedback: "要交文字提醒，請找文字工具。",
        },
      ],
      textMinimumLength: 18,
      textMaximumLength: 260,
      textRequiresThreePoints: true,
      textKeywords: ["AI", "任務", "提示詞", "檢查", "生成", "修改", "複製"],
      textMinimumKeywordMatches: 2,
      reviewCriteria: {
        minLength: 18,
        maxLength: 260,
        requiresThreePoints: true,
        keywords: ["AI", "任務", "提示詞", "檢查", "生成", "修改", "複製"],
        minimumKeywordMatches: 2,
        aiReviewMode: "local-only",
      },
    },
    {
      id: "B",
      taskId: "S3-W01-A-2",
      code: "題目 B",
      label: "任務 B｜小狗玩球圖片",
      title: "小狗玩球圖片",
      prompt: "請使用 Lab Image 生成一張清楚可愛的小狗玩球圖片。",
      toolPrompt: "一張可愛插畫風圖片：一隻小狗在綠色草地上開心玩紅色球。畫面明亮、乾淨、可愛，適合小四學生的學習單。請讓小狗和球都很清楚，不要出現文字。",
      placeholder: "",
      toolId: "image",
      expectedKind: "image",
      coins: 40,
      accept: "image/png,image/jpeg,image/webp",
      uploadLabel: "上傳圖片",
      reviewHint: "請確認圖片看得出小狗正在玩球，畫面清楚可愛。",
      readChecks: [
        {
          question: "題目最後要看到小狗玩球的畫面，你要交什麼？",
          options: ["圖片", "文字", "影片"],
          answerIndex: 0,
          successFeedback: "答對了！這題要交圖片。",
          retryFeedback: "想想看，畫面成果是哪一種檔案？",
        },
        {
          question: "要生成一張小狗玩球圖片，應該選哪個工具？",
          options: ["Lab Music", "Lab Image", "Lab Terminal"],
          answerIndex: 1,
          successFeedback: "答對了！圖片要使用 Lab Image。",
          retryFeedback: "再想想看：哪個工具是做圖片的？",
        },
      ],
      promptReviewCriteria: { passConditions: ["小狗", "球", "草地"], minimumCharacterMatchRatio: 0.5 },
      reviewCriteria: {
        minAttachments: 1,
        maxAttachments: 1,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        aiReviewMode: "local-only",
      },
    },
    {
      id: "C",
      taskId: "S3-W01-A-3",
      code: "題目 C",
      label: "任務 C｜咖啡廳爵士樂",
      title: "咖啡廳爵士樂",
      prompt: "請使用 Lab Music 生成一段 30 秒、適合在咖啡廳聽的溫暖放鬆爵士樂。",
      toolPrompt: "請生成一段 30 秒的咖啡廳爵士樂。風格溫暖、放鬆、輕快，有鋼琴、低音提琴和輕柔鼓刷。適合下午在咖啡廳閱讀或聊天時播放。不要太吵，不要恐怖，不要有人聲。",
      placeholder: "",
      toolId: "music",
      expectedKind: "audio",
      coins: 40,
      accept: "audio/mpeg,audio/mp3,audio/wav,audio/mp4,.mp3,.wav,.m4a",
      uploadLabel: "上傳音樂",
      reviewHint: "請確認音訊約 30 秒，聽起來溫暖放鬆，像咖啡廳爵士樂。",
      readChecks: [
        {
          question: "30 秒咖啡廳爵士樂最後要交什麼？",
          options: ["音樂", "圖片", "文字"],
          answerIndex: 0,
          successFeedback: "答對了！這題要交音樂。",
          retryFeedback: "想想看，咖啡廳爵士樂是哪一種成果？",
        },
        {
          question: "要生成一段背景音樂，應該選哪個工具？",
          options: ["Lab Video", "Lab Music", "Lab Image"],
          answerIndex: 1,
          successFeedback: "答對了！音樂要使用 Lab Music。",
          retryFeedback: "再想想看：哪個工具是做音樂的？",
        },
      ],
      promptReviewCriteria: { passConditions: ["咖啡廳", "爵士", "30 秒"], minimumCharacterMatchRatio: 0.5 },
      reviewCriteria: {
        minAttachments: 1,
        maxAttachments: 1,
        allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/mp4"],
        aiReviewMode: "local-only",
      },
    },
    {
      id: "D",
      taskId: "S3-W01-A-4",
      code: "題目 D",
      label: "任務 D｜滑雪短影片",
      title: "滑雪短影片",
      prompt: "請使用 Lab Video 生成一段 5 秒滑雪影片，畫面要看得出雪地、滑雪者和往下滑的動作。",
      toolPrompt: "請生成一段 5 秒滑雪影片：一位滑雪者穿著藍色外套，在白色雪地山坡上往下滑，滑雪時有雪花飛起來。白天陽光、畫面清楚、動作流暢、有速度感。不要出現文字。",
      placeholder: "",
      toolId: "video",
      expectedKind: "video",
      coins: 50,
      accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
      uploadLabel: "上傳影片",
      reviewHint: "請確認影片約 5 秒，看得出雪地、滑雪者和往下滑的動作。",
      readChecks: [
        {
          question: "題目說看得出滑雪者往下滑，最後要交什麼？",
          options: ["影片", "圖片", "音樂"],
          answerIndex: 0,
          successFeedback: "答對了！這題要交影片。",
          retryFeedback: "有動作的畫面要用哪一種成果？",
        },
        {
          question: "要生成會動的滑雪畫面，應該選哪個工具？",
          options: ["Lab Terminal", "Lab Video", "Lab Music"],
          answerIndex: 1,
          successFeedback: "答對了！影片要使用 Lab Video。",
          retryFeedback: "再想想看：哪個工具是做影片的？",
        },
      ],
      promptReviewCriteria: { passConditions: ["滑雪", "雪地", "往下滑"], minimumCharacterMatchRatio: 0.5 },
      reviewCriteria: {
        minAttachments: 1,
        maxAttachments: 1,
        allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
        aiReviewMode: "local-only",
      },
    },
    {
      id: "E",
      taskId: "S3-W01-A-5",
      code: "題目 E",
      label: "任務 E｜校園環保海報圖片",
      title: "校園環保海報圖片",
      prompt: "請使用 Lab Image 生成一張校園環保日海報風插圖，畫面有學生做垃圾分類，並且看得出校園很乾淨。",
      toolPrompt: "一張明亮可愛的校園環保日海報風插圖：兩位小學生在校園裡把寶特瓶和紙類放進不同的回收桶，旁邊有乾淨的草地和樹木。畫面清楚、色彩明亮、適合小四學生，不要出現文字。",
      placeholder: "",
      toolId: "image",
      expectedKind: "image",
      coins: 40,
      accept: "image/png,image/jpeg,image/webp",
      uploadLabel: "上傳圖片",
      reviewHint: "請確認是圖片，看得出學生做垃圾分類，也看得出乾淨校園。",
      readChecks: [
        {
          question: "題目出現海報風插圖，最後最需要的是什麼？",
          options: ["圖片", "音樂", "文字"],
          answerIndex: 0,
          successFeedback: "答對了！海報風插圖要交圖片。",
          retryFeedback: "海報風插圖最後會看到什麼？",
        },
        {
          question: "即使題目換成環保主題，想做出圖片還是要選哪個工具？",
          options: ["Lab Image", "Lab Video", "Lab Terminal"],
          answerIndex: 0,
          successFeedback: "答對了！要做圖片就選 Lab Image。",
          retryFeedback: "先看最後成果：這題要交的是圖片。",
        },
      ],
      promptReviewCriteria: { passConditions: ["學生", "垃圾分類", "校園"], minimumCharacterMatchRatio: 0.5 },
      reviewCriteria: {
        minAttachments: 1,
        maxAttachments: 1,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        aiReviewMode: "local-only",
      },
    },
    {
      id: "F",
      taskId: "S3-W01-A-6",
      code: "題目 F",
      label: "任務 F｜圖片任務小幫手",
      title: "圖片任務小幫手",
      prompt: "請使用 Lab Terminal，把做圖片前要先想清楚的事情整理成 3 點短提醒。這題最後要交的是文字。",
      toolPrompt: "請把下面內容整理成給小四學生看的 3 點短提醒，每一點不超過 18 個字，只輸出條列文字。\n\n做圖片前，先想清楚主角是誰、在哪裡、正在做什麼。再加上想要的顏色或風格。生成後要檢查圖片有沒有符合題目。",
      placeholder: "請貼上 Lab Terminal 產生的 3 點短提醒",
      toolId: "terminal",
      expectedKind: "text",
      coins: 40,
      accept: "text/plain",
      uploadLabel: "",
      reviewHint: "請確認有 3 點短文字，提到主角、場景或動作，並提醒生成後要檢查。",
      readChecks: [
        {
          question: "本題在教你怎麼描述圖片，但最後要交 3 點提醒，應該選什麼？",
          options: ["Lab Terminal", "Lab Image", "Lab Music"],
          answerIndex: 0,
          successFeedback: "答對了！這題最後要交文字，所以選 Lab Terminal。",
          retryFeedback: "不要只看題目談圖片；先看最後要交的成果。",
        },
        {
          question: "選工具時最先看的是什麼？",
          options: ["題目字數最多的詞", "最後要交的成果類型", "同學剛剛用的工具"],
          answerIndex: 1,
          successFeedback: "答對了！先看最後要交的成果類型。",
          retryFeedback: "口訣是：先看任務，再選工具。",
        },
      ],
      textMinimumLength: 18,
      textMaximumLength: 180,
      textRequiresThreePoints: true,
      textKeywords: ["主角", "場景", "動作", "顏色", "風格", "檢查", "圖片"],
      textMinimumKeywordMatches: 2,
      reviewCriteria: {
        minLength: 18,
        maxLength: 180,
        requiresThreePoints: true,
        keywords: ["主角", "場景", "動作", "顏色", "風格", "檢查", "圖片"],
        minimumKeywordMatches: 2,
        aiReviewMode: "local-only",
      },
    },
  ],
};

export const S3W01_GAMMA_ANSWER_CONFIG = S3W01_IMPORTED_CONFIG;

const GAMMA_ANSWER_CONFIGS: Record<string, GammaAnswerWorksheetConfig> = {
  [S3W01_IMPORTED_CONFIG.id]: S3W01_IMPORTED_CONFIG,
};

export function normalizeWorksheetId(id: string) {
  return id.toUpperCase().replace(/[-_\s]/g, "");
}

export function normalizeGammaAnswerTaskId(taskId: string) {
  return taskId.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function gammaAnswerTaskOrdinal(taskId: string) {
  const match = taskId.trim().match(/(?:^|[-_\s])(?:A|Q)[-_\s]?(\d+)$/i);
  if (!match) return null;
  const ordinal = Number(match[1]);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

/** Resolves equivalent task IDs such as `S3-W01-A-1` and legacy `S3W01-Q1`. */
export function findGammaAnswerQuestion(
  config: GammaAnswerWorksheetConfig | null | undefined,
  taskId: string | null | undefined
): GammaAnswerQuestionConfig | undefined {
  if (!config || !taskId) return undefined;
  const normalizedTaskId = normalizeGammaAnswerTaskId(taskId);
  const exactOrNormalized = config.questions.find(
    (question) =>
      question.taskId === taskId ||
      normalizeGammaAnswerTaskId(question.taskId) === normalizedTaskId
  );
  if (exactOrNormalized) return exactOrNormalized;

  const ordinal = gammaAnswerTaskOrdinal(taskId);
  return ordinal ? config.questions[ordinal - 1] : undefined;
}

/**
 * Progress may contain task IDs written by an older worksheet configuration.
 * Match by resolved question ID instead of trusting the denormalized counter.
 */
export function isGammaAnswerQuestionCompleted(
  tasks: Record<string, { completed?: boolean } | undefined> | null | undefined,
  config: GammaAnswerWorksheetConfig,
  question: GammaAnswerQuestionConfig
) {
  return Object.entries(tasks || {}).some(([taskId, progress]) => {
    if (!progress?.completed) return false;
    return findGammaAnswerQuestion(config, taskId)?.id === question.id;
  });
}

function isEmbeddableGammaSourceUrl(url: string | null | undefined) {
  const value = typeof url === "string" ? url.trim() : "";
  return /gamma\.app\/(?:docs|public|embed)\/[^/?#]+/.test(value);
}

const VALID_TOOL_IDS: GammaAnswerToolId[] = ["terminal", "image", "music", "video"];
const VALID_EXPECTED_KINDS: GammaAnswerExpectedKind[] = ["text", "image", "audio", "video"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(
  value: unknown,
  fallback: unknown,
  field: string,
  errors: string[],
  required = true
) {
  const next = typeof value === "string" ? value : fallback;
  if (typeof next === "string") {
    const trimmed = next.trim();
    if (trimmed || !required) return trimmed;
  }
  if (required) errors.push(`${field} must be a non-empty string.`);
  return "";
}

function asNumber(
  value: unknown,
  fallback: unknown,
  field: string,
  errors: string[],
  min = 0
) {
  const next = typeof value === "number" ? value : fallback;
  if (typeof next === "number" && Number.isFinite(next) && next >= min) {
    return next;
  }
  errors.push(`${field} must be a number >= ${min}.`);
  return min;
}

function asOptionalNumber(value: unknown, fallback: unknown) {
  const next = typeof value === "number" ? value : fallback;
  return typeof next === "number" && Number.isFinite(next) ? next : undefined;
}

function asOptionalBoolean(value: unknown, fallback: unknown) {
  const next = typeof value === "boolean" ? value : fallback;
  return typeof next === "boolean" ? next : undefined;
}

function asStringArray(value: unknown, fallback: unknown) {
  const next = Array.isArray(value) ? value : fallback;
  return Array.isArray(next)
    ? next.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : undefined;
}

const TOOL_READ_CHECK_LABELS: Record<GammaAnswerToolId, string> = {
  terminal: "Lab Terminal 文字工具",
  image: "Lab Image 圖片工具",
  music: "Lab Music 音樂工具",
  video: "Lab Video 影片工具",
};

function defaultReadCheck(
  title: string,
  toolId: GammaAnswerToolId
): GammaAnswerReadCheck {
  const correct = TOOL_READ_CHECK_LABELS[toolId];
  const options = [
    correct,
    ...Object.entries(TOOL_READ_CHECK_LABELS)
      .filter(([id]) => id !== toolId)
      .map(([, label]) => label)
      .slice(0, 3),
  ];

  return {
    type: "choice",
    question: `這一題「${title}」最適合先使用哪一個工具？`,
    options,
    answerIndex: 0,
    successFeedback: "小測通過，前往下一題。",
    retryFeedback: "再看一次題目，找出這題真正需要的工具。",
  };
}

function normalizeReadCheck(
  rawQuestion: Record<string, unknown>,
  fallbackQuestion: GammaAnswerQuestionConfig | undefined,
  title: string,
  toolId: GammaAnswerToolId
): GammaAnswerReadCheck {
  const raw = isRecord(rawQuestion.readCheck)
    ? rawQuestion.readCheck
    : isRecord(rawQuestion.checkpointQuiz)
    ? rawQuestion.checkpointQuiz
    : {};
  const fallback = fallbackQuestion?.readCheck;
  const base = fallback || defaultReadCheck(title, toolId);
  const rawType = (raw as Record<string, unknown>).type;
  const type = rawType === "text" ? "text" : "choice";
  const question = asString(
    (raw as Record<string, unknown>).question,
    base.question,
    "readCheck.question",
    [],
    false
  );
  const successFeedback = asString(
    (raw as Record<string, unknown>).successFeedback,
    base.successFeedback || "小測通過，前往下一題。",
    "readCheck.successFeedback",
    [],
    false
  );
  const retryFeedback = asString(
    (raw as Record<string, unknown>).retryFeedback,
    base.retryFeedback || "再看一次題目，找出正確答案。",
    "readCheck.retryFeedback",
    [],
    false
  );

  if (type === "text") {
    const fallbackAnswers = fallback?.type === "text" ? fallback.acceptedAnswers || [] : [];
    const acceptedAnswers =
      asStringArray((raw as Record<string, unknown>).acceptedAnswers, fallbackAnswers)
        ?.filter((answer) => answer.trim().length > 0)
        .slice(0, 8) || [];
    // 文字小測採與遊戲模擬器相同的寬鬆判定：學生答案只要包含任一可接受
    // 同義詞即可通過，例如「公開網址」可命中「網址」。需要嚴格填空時，
    // 題目設定仍可明確指定 matchMode: "exact"。
    const matchMode = (raw as Record<string, unknown>).matchMode === "exact" ? "exact" : "includes";
    return {
      type,
      question,
      options: [],
      answerIndex: 0,
      acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : ["請填寫正確答案"],
      matchMode,
      successFeedback,
      retryFeedback,
    };
  }

  const rawOptions = asStringArray((raw as Record<string, unknown>).options, base.options) || base.options;
  const options = rawOptions.length >= 2 ? rawOptions.slice(0, 4) : base.options;
  const rawAnswerIndex = (raw as Record<string, unknown>).answerIndex;
  const answerIndex =
    typeof rawAnswerIndex === "number" &&
    Number.isFinite(rawAnswerIndex) &&
    rawAnswerIndex >= 0 &&
    rawAnswerIndex < options.length
      ? Math.floor(rawAnswerIndex)
      : Math.min(base.answerIndex, options.length - 1);

  return {
    type,
    question,
    options,
    answerIndex,
    successFeedback,
    retryFeedback,
  };
}

function normalizeReadCheckValue(
  rawCheck: Record<string, unknown>,
  fallback: GammaAnswerReadCheck | undefined,
  title: string,
  toolId: GammaAnswerToolId
) {
  return normalizeReadCheck(
    { readCheck: rawCheck },
    fallback ? ({ readCheck: fallback } as GammaAnswerQuestionConfig) : undefined,
    title,
    toolId
  );
}

function normalizeReadChecks(
  rawQuestion: Record<string, unknown>,
  fallbackQuestion: GammaAnswerQuestionConfig | undefined,
  title: string,
  toolId: GammaAnswerToolId
) {
  const rawChecks = Array.isArray(rawQuestion.readChecks) ? rawQuestion.readChecks : null;
  if (rawChecks) {
    return rawChecks
      .filter(isRecord)
      .slice(0, 8)
      .map((check, index) =>
        normalizeReadCheckValue(
          check,
          fallbackQuestion?.readChecks?.[index] || fallbackQuestion?.readCheck,
          title,
          toolId
        )
      );
  }
  if (fallbackQuestion?.readChecks?.length && !isRecord(rawQuestion.readCheck)) {
    return fallbackQuestion.readChecks;
  }
  return [normalizeReadCheck(rawQuestion, fallbackQuestion, title, toolId)];
}

function normalizeReviewBrief(
  rawQuestion: Record<string, unknown>,
  fallbackQuestion: GammaAnswerQuestionConfig | undefined
) {
  if (!isRecord(rawQuestion.reviewBrief) && !fallbackQuestion?.reviewBrief) {
    return undefined;
  }
  const rawBrief = isRecord(rawQuestion.reviewBrief) ? rawQuestion.reviewBrief : {};
  const fallbackBrief = fallbackQuestion?.reviewBrief;
  const title =
    typeof rawQuestion.title === "string"
      ? rawQuestion.title.trim()
      : fallbackQuestion?.title || "這一題";
  const prompt =
    typeof rawQuestion.prompt === "string"
      ? rawQuestion.prompt.trim()
      : fallbackQuestion?.prompt || "";
  const defaultTask = prompt ? `${title}：${prompt}` : `完成「${title}」這一題。`;

  return {
    task: asString(rawBrief.task, fallbackBrief?.task || defaultTask, "reviewBrief.task", [], false),
    expectedOutput: asString(
      rawBrief.expectedOutput,
      fallbackBrief?.expectedOutput || "學生提交的答案需要能對應題目要求。",
      "reviewBrief.expectedOutput",
      [],
      false
    ),
    mustInclude:
      asStringArray(rawBrief.mustInclude, fallbackBrief?.mustInclude) ||
      ["答案需要和題目有關", "不是空白或亂打"],
    rejectIf:
      asStringArray(rawBrief.rejectIf, fallbackBrief?.rejectIf) ||
      ["空白或亂打", "完全無關", "只複製題目沒有回答"],
  };
}

function asEnum<T extends string>(
  value: unknown,
  fallback: unknown,
  allowed: readonly T[],
  field: string,
  errors: string[]
) {
  const next = typeof value === "string" ? value : fallback;
  if (typeof next === "string" && allowed.includes(next as T)) return next as T;
  errors.push(`${field} must be one of: ${allowed.join(", ")}.`);
  return allowed[0];
}

function normalizeReviewCriteria(
  rawQuestion: Record<string, unknown>,
  fallbackQuestion: GammaAnswerQuestionConfig | undefined
): GammaAnswerReviewCriteria {
  const rawCriteria = isRecord(rawQuestion.reviewCriteria) ? rawQuestion.reviewCriteria : {};
  const fallbackCriteria = fallbackQuestion?.reviewCriteria || {};
  const aiReviewMode: GammaAnswerAiReviewMode = "local-only";

  return {
    minLength: asOptionalNumber(
      rawCriteria.minLength ?? rawQuestion.textMinimumLength,
      fallbackCriteria.minLength ?? fallbackQuestion?.textMinimumLength
    ),
    maxLength: asOptionalNumber(
      rawCriteria.maxLength ?? rawQuestion.textMaximumLength,
      fallbackCriteria.maxLength ?? fallbackQuestion?.textMaximumLength
    ),
    requiresThreePoints: asOptionalBoolean(
      rawCriteria.requiresThreePoints ?? rawQuestion.textRequiresThreePoints,
      fallbackCriteria.requiresThreePoints ?? fallbackQuestion?.textRequiresThreePoints
    ),
    keywords: asStringArray(
      rawCriteria.keywords ?? rawQuestion.textKeywords,
      fallbackCriteria.keywords ?? fallbackQuestion?.textKeywords
    ),
    minimumKeywordMatches: asOptionalNumber(
      rawCriteria.minimumKeywordMatches ?? rawQuestion.textMinimumKeywordMatches,
      fallbackCriteria.minimumKeywordMatches ?? fallbackQuestion?.textMinimumKeywordMatches
    ),
    minAttachments: asOptionalNumber(rawCriteria.minAttachments, fallbackCriteria.minAttachments),
    maxAttachments: asOptionalNumber(rawCriteria.maxAttachments, fallbackCriteria.maxAttachments),
    allowedMimeTypes: asStringArray(rawCriteria.allowedMimeTypes, fallbackCriteria.allowedMimeTypes),
    aiReviewMode,
  };
}

function normalizePromptReviewCriteria(
  rawQuestion: Record<string, unknown>,
  fallbackQuestion: GammaAnswerQuestionConfig | undefined,
  reviewBrief: GammaAnswerQuestionConfig["reviewBrief"],
  expectedKind: GammaAnswerExpectedKind
): GammaAnswerPromptReviewCriteria | undefined {
  if (!isRecord(rawQuestion.promptReviewCriteria) && !fallbackQuestion?.promptReviewCriteria) {
    return undefined;
  }
  const raw = isRecord(rawQuestion.promptReviewCriteria)
    ? rawQuestion.promptReviewCriteria
    : {};
  const fallback = fallbackQuestion?.promptReviewCriteria;
  const configuredConditions =
    asStringArray(raw.passConditions, fallback?.passConditions) || [];
  const derivedConditions = (expectedKind === "text" ? [] : reviewBrief?.mustInclude || []).filter(
    (condition) =>
      !/(附件|檔案|格式|空白|錯誤|上傳|開啟|播放|下載)/u.test(condition)
  );
  const passConditions = configuredConditions.length > 0
    ? configuredConditions
    : derivedConditions;
  const configuredRatio = asOptionalNumber(
    raw.minimumCharacterMatchRatio,
    fallback?.minimumCharacterMatchRatio ?? 0.5
  );

  return {
    passConditions: passConditions.slice(0, 8),
    minimumCharacterMatchRatio: Math.max(0.1, Math.min(1, configuredRatio ?? 0.5)),
  };
}

function normalizeAssetCacheLimits(
  input: Record<string, unknown>,
  fallback?: GammaAnswerWorksheetConfig | null
) {
  const raw = isRecord(input.assetCacheLimits) ? input.assetCacheLimits : {};
  const limits: Partial<Record<"image" | "music" | "video", number>> = {};
  (["image", "music", "video"] as const).forEach((kind) => {
    const value = asOptionalNumber(raw[kind], fallback?.assetCacheLimits?.[kind]);
    if (value !== undefined) limits[kind] = Math.max(1, Math.min(100, Math.floor(value)));
  });
  return Object.keys(limits).length > 0 ? limits : undefined;
}

export function normalizeGammaAnswerWorksheetConfig(
  input: unknown,
  fallback?: GammaAnswerWorksheetConfig | null
): GammaAnswerWorksheetConfig {
  if (!isRecord(input)) {
    if (fallback) return fallback;
    throw new Error("Config must be a JSON object.");
  }

  const errors: string[] = [];
  const fallbackQuestionsById = new Map(
    (fallback?.questions || []).map((question) => [question.id, question])
  );
  const rawQuestions = Array.isArray(input.questions)
    ? input.questions
    : fallback?.questions || [];

  if (rawQuestions.length === 0) {
    errors.push("questions must contain at least one question.");
  }

  const questionIds = new Set<string>();
  const taskIds = new Set<string>();
  const questions: GammaAnswerQuestionConfig[] = rawQuestions.map((rawQuestion, index) => {
    const raw = isRecord(rawQuestion) ? rawQuestion : {};
    const fallbackQuestion =
      fallbackQuestionsById.get(String(raw.id || "")) || fallback?.questions[index];
    const path = `questions[${index}]`;
    const id = asString(raw.id, fallbackQuestion?.id, `${path}.id`, errors);
    const taskId = asString(raw.taskId, fallbackQuestion?.taskId, `${path}.taskId`, errors);
    const criteria = normalizeReviewCriteria(raw, fallbackQuestion);
    const reviewBrief = normalizeReviewBrief(raw, fallbackQuestion);
    const expectedKind = asEnum(
      raw.expectedKind,
      fallbackQuestion?.expectedKind,
      VALID_EXPECTED_KINDS,
      `${path}.expectedKind`,
      errors
    );
    const promptReviewCriteria = normalizePromptReviewCriteria(
      raw,
      fallbackQuestion,
      reviewBrief,
      expectedKind
    );
    const title = asString(raw.title, fallbackQuestion?.title, `${path}.title`, errors);
    const toolId = asEnum(raw.toolId, fallbackQuestion?.toolId, VALID_TOOL_IDS, `${path}.toolId`, errors);
    const readChecks = normalizeReadChecks(raw, fallbackQuestion, title, toolId);

    if (id) {
      if (questionIds.has(id)) errors.push(`${path}.id is duplicated.`);
      questionIds.add(id);
    }
    if (taskId) {
      if (taskIds.has(taskId)) errors.push(`${path}.taskId is duplicated.`);
      taskIds.add(taskId);
    }

    return {
      id,
      taskId,
      code: asString(raw.code, fallbackQuestion?.code, `${path}.code`, errors),
      label: asString(raw.label, fallbackQuestion?.label, `${path}.label`, errors),
      title,
      prompt: asString(raw.prompt, fallbackQuestion?.prompt, `${path}.prompt`, errors),
      toolPrompt: asString(raw.toolPrompt, fallbackQuestion?.toolPrompt, `${path}.toolPrompt`, errors),
      placeholder: asString(raw.placeholder, fallbackQuestion?.placeholder || "", `${path}.placeholder`, errors, false),
      toolId,
      expectedKind,
      coins: asNumber(raw.coins, fallbackQuestion?.coins, `${path}.coins`, errors),
      accept: asString(raw.accept, fallbackQuestion?.accept || "", `${path}.accept`, errors, false),
      uploadLabel: asString(raw.uploadLabel, fallbackQuestion?.uploadLabel || "", `${path}.uploadLabel`, errors, false),
      reviewHint: asString(raw.reviewHint, fallbackQuestion?.reviewHint || "", `${path}.reviewHint`, errors, false),
      readCheck: readChecks[0],
      readChecks,
      reviewBrief,
      promptReviewCriteria,
      reviewCriteria: criteria,
      textMinimumLength: criteria.minLength,
      textMaximumLength: criteria.maxLength,
      textRequiresThreePoints: criteria.requiresThreePoints,
      textKeywords: criteria.keywords,
      textMinimumKeywordMatches: criteria.minimumKeywordMatches,
    };
  });

  const gammaUrl = asString(input.gammaUrl, fallback?.gammaUrl || "", "gammaUrl", errors, false);

  const normalized: GammaAnswerWorksheetConfig = {
    schemaVersion: asNumber(input.schemaVersion, fallback?.schemaVersion || 2, "schemaVersion", errors, 1),
    id: normalizeWorksheetId(asString(input.id, fallback?.id, "id", errors)),
    courseId: asString(input.courseId, fallback?.courseId, "courseId", errors),
    title: asString(input.title, fallback?.title, "title", errors),
    shortTitle: asString(input.shortTitle, fallback?.shortTitle, "shortTitle", errors),
    semester: asString(input.semester, fallback?.semester, "semester", errors),
    week: asNumber(input.week, fallback?.week, "week", errors, 1),
    gammaUrl,
    gammaFallbackUrl: asString(
      input.gammaFallbackUrl,
      fallback?.gammaFallbackUrl || gammaUrl,
      "gammaFallbackUrl",
      errors,
      false
    ),
    source: asString(input.source, fallback?.source || "gamma-answer-worksheet", "source", errors),
    storageVersion: asString(input.storageVersion, fallback?.storageVersion, "storageVersion", errors),
    draftField: "gammaAnswerDraft",
    mediaAccessKey: LAB_TOOL_MEDIA_ACCESS_KEY,
    assetCacheLimits: normalizeAssetCacheLimits(input, fallback),
    questions,
  };

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return normalized;
}

export function getGammaAnswerWorksheetConfig(
  worksheetId: string | null | undefined
): GammaAnswerWorksheetConfig | null {
  if (!worksheetId) return null;
  return GAMMA_ANSWER_CONFIGS[normalizeWorksheetId(worksheetId)] || null;
}

export function resolveGammaAnswerWorksheetConfig(
  worksheet: Worksheet | null | undefined
): GammaAnswerWorksheetConfig | null {
  if (!worksheet) return null;
  const base = getGammaAnswerWorksheetConfig(worksheet.id);
  if (!base && !worksheet.gammaAnswerConfig) return null;

  try {
    const config = normalizeGammaAnswerWorksheetConfig(worksheet.gammaAnswerConfig || base, base);
    const worksheetGammaUrl = isEmbeddableGammaSourceUrl(worksheet.gammaUrl)
      ? worksheet.gammaUrl
      : "";
    const configGammaUrl = isEmbeddableGammaSourceUrl(config.gammaUrl)
      ? config.gammaUrl
      : base?.gammaUrl || "";
    const configGammaFallbackUrl = isEmbeddableGammaSourceUrl(config.gammaFallbackUrl)
      ? config.gammaFallbackUrl
      : base?.gammaFallbackUrl || configGammaUrl;
    return {
      ...config,
      id: normalizeWorksheetId(worksheet.id || config.id),
      title: worksheet.title || config.title,
      semester: worksheet.semester || config.semester,
      week: worksheet.week || config.week,
      gammaUrl: worksheetGammaUrl || configGammaUrl,
      gammaFallbackUrl: configGammaFallbackUrl || worksheetGammaUrl || configGammaUrl,
    };
  } catch {
    return base;
  }
}

export function getGammaAnswerWorksheetConfigs() {
  return Object.values(GAMMA_ANSWER_CONFIGS);
}

export function gammaAnswerConfigToWorksheet(
  config: GammaAnswerWorksheetConfig
): Worksheet {
  const now = "2026-07-29T00:00:00.000Z";
  return {
    id: config.id,
    title: config.title,
    semester: config.semester,
    week: config.week,
    markdownContent: [
      `# ${config.title}`,
      "",
      "這份學習單使用左側 GAMMA 搭配右側答題區完成。",
      "",
      ...config.questions.map(
        (q) => `### ${q.code}｜${q.label}（${q.coins} 金幣）\n${q.prompt}`
      ),
    ].join("\n"),
    tasks: config.questions.map((q) => ({
      taskId: q.taskId,
      label: q.label,
      description: q.prompt,
      coins: q.coins,
      isOptional: false,
    })),
    classId: "builtin",
    classIds: [],
    isPublished: true,
    publishedAt: now,
    createdAt: now,
    createdBy: "system",
    updatedAt: now,
    styledHtmlUrl: null,
    styledHtmlGeneratedAt: null,
    styledHtmlStatus: "pending",
    gammaUrl: config.gammaUrl,
    gammaAnswerConfig: config,
  };
}

export function getBuiltinGammaAnswerWorksheet(
  worksheetId: string | null | undefined
): Worksheet | null {
  const config = getGammaAnswerWorksheetConfig(worksheetId);
  return config ? gammaAnswerConfigToWorksheet(config) : null;
}

export function getBuiltinGammaAnswerWorksheets(): Worksheet[] {
  return getGammaAnswerWorksheetConfigs().map(gammaAnswerConfigToWorksheet);
}
