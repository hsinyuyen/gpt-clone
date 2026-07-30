import type { Worksheet } from "@/types/Worksheet";
import type {
  GammaAnswerAiReviewMode,
  GammaAnswerExpectedKind,
  GammaAnswerQuestionConfig,
  GammaAnswerReviewCriteria,
  GammaAnswerToolId,
  GammaAnswerWorksheetConfig,
} from "@/types/GammaAnswerWorksheet";

export type {
  GammaAnswerAiReviewMode,
  GammaAnswerExpectedKind,
  GammaAnswerQuestionConfig,
  GammaAnswerReviewCriteria,
  GammaAnswerToolId,
  GammaAnswerWorksheetConfig,
} from "@/types/GammaAnswerWorksheet";

export const LAB_TOOL_MEDIA_ACCESS_KEY = "lab-terminal:worksheet-media-access";

export const S3W01_GAMMA_ANSWER_CONFIG: GammaAnswerWorksheetConfig = {
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
      reviewBrief: {
        task: "學生要用 Lab Image 產生並上傳一張小狗玩紅色球的圖片。",
        expectedOutput: "一個可正常開啟的圖片作品，主題應能看出小狗和紅色球。",
        mustInclude: ["有圖片附件", "圖片主題和小狗玩球有關", "不是空白或錯誤檔案"],
        rejectIf: ["沒有附件", "附件不是圖片", "圖片明顯與題目無關"],
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
      reviewBrief: {
        task: "學生要用 Lab Music 產生並上傳一段咖啡廳爵士樂。",
        expectedOutput: "一個可播放的音訊檔，應是音樂或配樂作品。",
        mustInclude: ["有音訊附件", "音訊檔案格式正確", "不是空白或錯誤檔案"],
        rejectIf: ["沒有附件", "附件不是音訊", "檔案無法播放或明顯錯誤"],
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
      reviewBrief: {
        task: "學生要用 Lab Video 產生並上傳一段滑雪短影片。",
        expectedOutput: "一個可播放的影片檔，主題應能對應滑雪動作。",
        mustInclude: ["有影片附件", "影片檔案格式正確", "不是空白或錯誤檔案"],
        rejectIf: ["沒有附件", "附件不是影片", "檔案無法播放或明顯錯誤"],
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

const GAMMA_ANSWER_CONFIGS: Record<string, GammaAnswerWorksheetConfig> = {
  [S3W01_GAMMA_ANSWER_CONFIG.id]: S3W01_GAMMA_ANSWER_CONFIG,
};

export function normalizeWorksheetId(id: string) {
  return id.toUpperCase().replace(/[-_\s]/g, "");
}

function isEmbeddableGammaSourceUrl(url: string | null | undefined) {
  const value = typeof url === "string" ? url.trim() : "";
  return /gamma\.app\/(?:docs|public|embed)\/[^/?#]+/.test(value);
}

const VALID_TOOL_IDS: GammaAnswerToolId[] = ["terminal", "image", "music", "video"];
const VALID_EXPECTED_KINDS: GammaAnswerExpectedKind[] = ["text", "image", "audio", "video"];
const VALID_AI_REVIEW_MODES: GammaAnswerAiReviewMode[] = [
  "local-only",
  "after-local-rules",
  "always",
];

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

function normalizeReviewBrief(
  rawQuestion: Record<string, unknown>,
  fallbackQuestion: GammaAnswerQuestionConfig | undefined
) {
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
  const modeSource = rawCriteria.aiReviewMode ?? fallbackCriteria.aiReviewMode ?? "local-only";
  const aiReviewMode = VALID_AI_REVIEW_MODES.includes(modeSource as GammaAnswerAiReviewMode)
    ? (modeSource as GammaAnswerAiReviewMode)
    : "local-only";

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
      title: asString(raw.title, fallbackQuestion?.title, `${path}.title`, errors),
      prompt: asString(raw.prompt, fallbackQuestion?.prompt, `${path}.prompt`, errors),
      toolPrompt: asString(raw.toolPrompt, fallbackQuestion?.toolPrompt, `${path}.toolPrompt`, errors),
      placeholder: asString(raw.placeholder, fallbackQuestion?.placeholder || "", `${path}.placeholder`, errors, false),
      toolId: asEnum(raw.toolId, fallbackQuestion?.toolId, VALID_TOOL_IDS, `${path}.toolId`, errors),
      expectedKind: asEnum(
        raw.expectedKind,
        fallbackQuestion?.expectedKind,
        VALID_EXPECTED_KINDS,
        `${path}.expectedKind`,
        errors
      ),
      coins: asNumber(raw.coins, fallbackQuestion?.coins, `${path}.coins`, errors),
      accept: asString(raw.accept, fallbackQuestion?.accept || "", `${path}.accept`, errors, false),
      uploadLabel: asString(raw.uploadLabel, fallbackQuestion?.uploadLabel || "", `${path}.uploadLabel`, errors, false),
      reviewHint: asString(raw.reviewHint, fallbackQuestion?.reviewHint || "", `${path}.reviewHint`, errors, false),
      reviewBrief,
      reviewCriteria: criteria,
      textMinimumLength: criteria.minLength,
      textMaximumLength: criteria.maxLength,
      textRequiresThreePoints: criteria.requiresThreePoints,
      textKeywords: criteria.keywords,
      textMinimumKeywordMatches: criteria.minimumKeywordMatches,
    };
  });

  const gammaUrl = asString(input.gammaUrl, fallback?.gammaUrl, "gammaUrl", errors);

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
      errors
    ),
    source: asString(input.source, fallback?.source || "gamma-answer-worksheet", "source", errors),
    storageVersion: asString(input.storageVersion, fallback?.storageVersion, "storageVersion", errors),
    draftField: "gammaAnswerDraft",
    mediaAccessKey: LAB_TOOL_MEDIA_ACCESS_KEY,
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
