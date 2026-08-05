import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import {
  getWorksheets,
  saveWorksheet,
  deleteWorksheet,
  getClassrooms,
  Classroom,
} from "@/lib/firestore";
import {
  getBuiltinGammaAnswerWorksheets,
  getGammaAnswerWorksheetConfig,
  resolveGammaAnswerWorksheetConfig,
  gammaAnswerConfigToWorksheet,
  LAB_TOOL_MEDIA_ACCESS_KEY,
  normalizeGammaAnswerWorksheetConfig,
  normalizeWorksheetId,
} from "@/config/gammaAnswerWorksheets";
import type {
  GammaAnswerAiReviewMode,
  GammaAnswerExpectedKind,
  GammaAnswerQuestionConfig,
  GammaAnswerReadCheck,
  GammaAnswerReviewBrief,
  GammaAnswerReviewCriteria,
  GammaAnswerToolId,
  GammaAnswerWorksheetConfig,
} from "@/types/GammaAnswerWorksheet";
import { Worksheet, Task } from "@/types/Worksheet";
import { parseWorksheetMarkdown, extractWorksheetTitle, extractSemesterAndWeek } from "@/utils/worksheetParser";
import { ParsedTask, ParseResult } from "@/types/Worksheet";
import {
  parseGammaAnswerMarkdown,
  type ParsedGammaAnswerMarkdownTask,
} from "@/utils/gammaAnswerMarkdownParser";

import NumberField from "@/components/admin/NumberField";
const ADMIN_USERNAMES = ["admin", "teacher", "老師"];
const BUILTIN_WORKSHEET_IDS = new Set(
  getBuiltinGammaAnswerWorksheets().map((worksheet) => worksheet.id)
);

const GAMMA_ANSWER_MODULES: Record<
  GammaAnswerExpectedKind,
  {
    label: string;
    toolId: GammaAnswerToolId;
    accept: string;
    uploadLabel: string;
    reviewHint: string;
    placeholder: string;
    reviewCriteria: NonNullable<GammaAnswerQuestionConfig["reviewCriteria"]>;
  }
> = {
  text: {
    label: "文字填入",
    toolId: "terminal",
    accept: "text/plain",
    uploadLabel: "",
    reviewHint: "文字答案會先用本機規則檢查。",
    placeholder: "請在這裡輸入答案。",
    reviewCriteria: {
      minLength: 18,
      maxLength: 260,
      requiresThreePoints: false,
      keywords: [],
      minimumKeywordMatches: 0,
      aiReviewMode: "local-only",
    },
  },
  image: {
    label: "圖片上傳",
    toolId: "image",
    accept: "image/png,image/jpeg,image/webp",
    uploadLabel: "上傳圖片",
    reviewHint: "請上傳圖片檔，成功後會出現預覽。",
    placeholder: "",
    reviewCriteria: {
      minAttachments: 1,
      maxAttachments: 1,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      aiReviewMode: "local-only",
    },
  },
  audio: {
    label: "音樂上傳",
    toolId: "music",
    accept: "audio/mpeg,audio/mp3,audio/wav,audio/mp4,.mp3,.wav,.m4a",
    uploadLabel: "上傳音樂",
    reviewHint: "請上傳音樂或音訊檔，成功後可以播放預覽。",
    placeholder: "",
    reviewCriteria: {
      minAttachments: 1,
      maxAttachments: 1,
      allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/mp4"],
      aiReviewMode: "local-only",
    },
  },
  video: {
    label: "影片上傳",
    toolId: "video",
    accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
    uploadLabel: "上傳影片",
    reviewHint: "請上傳影片檔，成功後可以播放預覽。",
    placeholder: "",
    reviewCriteria: {
      minAttachments: 1,
      maxAttachments: 1,
      allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
      aiReviewMode: "local-only",
    },
  },
};

function parseGammaAnswerEditorJson(value: string):
  | { config: GammaAnswerWorksheetConfig; error: null }
  | { config: null; error: string } {
  try {
    const parsed = JSON.parse(value) as GammaAnswerWorksheetConfig;
    if (!parsed || !Array.isArray(parsed.questions)) {
      return { config: null, error: "JSON 需要包含 questions 陣列。" };
    }
    return {
      config: normalizeGammaAnswerWorksheetConfig(
        parsed,
        getGammaAnswerWorksheetConfig(parsed.id)
      ),
      error: null,
    };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function stringifyGammaAnswerConfig(config: GammaAnswerWorksheetConfig) {
  const normalized = normalizeGammaAnswerWorksheetConfig(
    config,
    getGammaAnswerWorksheetConfig(config.id)
  );
  return JSON.stringify(normalized, null, 2);
}

function updateQuestionInConfig(
  config: GammaAnswerWorksheetConfig,
  questionIndex: number,
  updater: (question: GammaAnswerQuestionConfig) => GammaAnswerQuestionConfig
) {
  return {
    ...config,
    questions: config.questions.map((question, index) =>
      index === questionIndex ? updater(question) : question
    ),
  };
}

function numberOrUndefined(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function commaListToArray(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const DEFAULT_GAMMA_ANSWER_TEMPLATE_ID = "S3W01";
const AUTHORING_JSON_START = "LAB_TERMINAL_WORKSHEET_CONFIG_START";
const AUTHORING_JSON_END = "LAB_TERMINAL_WORKSHEET_CONFIG_END";
const AUTHORING_MODULES = ["text", "image", "audio", "video"] as const;
const AUTHORING_REVIEW_PRESETS = [
  "text-any",
  "text-length",
  "text-keywords",
  "text-three-points",
  "file-required",
  "ai-assisted",
  "custom",
] as const;
const AUTHORING_STRICTNESS = ["loose", "normal", "strict"] as const;
const TEXT_STRICTNESS_RULES: Record<
  GammaAnswerAuthoringStrictness,
  { minLength: number; maxLength: number; minimumKeywordMatches: number }
> = {
  loose: { minLength: 10, maxLength: 260, minimumKeywordMatches: 0 },
  normal: { minLength: 18, maxLength: 260, minimumKeywordMatches: 1 },
  strict: { minLength: 36, maxLength: 320, minimumKeywordMatches: 2 },
};
const TEXT_THREE_POINTS_MIN_LENGTH: Record<GammaAnswerAuthoringStrictness, number> = {
  loose: 18,
  normal: 24,
  strict: 36,
};

type GammaAnswerAuthoringModule = (typeof AUTHORING_MODULES)[number];
type GammaAnswerAuthoringReviewPreset = (typeof AUTHORING_REVIEW_PRESETS)[number];
type GammaAnswerAuthoringStrictness = (typeof AUTHORING_STRICTNESS)[number];

type GammaAnswerAuthoringQuestion = {
  id?: string;
  title?: string;
  module?: GammaAnswerAuthoringModule | "music";
  coins?: number;
  prompt?: string;
  studentPrompt?: string;
  toolPrompt?: string;
  readCheck?: Partial<GammaAnswerReadCheck>;
  readChecks?: Partial<GammaAnswerReadCheck>[];
  checkpointQuiz?: Partial<GammaAnswerReadCheck>;
  reviewBrief?: Partial<GammaAnswerReviewBrief>;
  promptReviewCriteria?: {
    passConditions?: string[];
    minimumCharacterMatchRatio?: number;
  };
  reviewPreset?: GammaAnswerAuthoringReviewPreset;
  strictness?: GammaAnswerAuthoringStrictness;
  requiredConcepts?: string[];
  minLength?: number;
  maxLength?: number;
  requiresThreePoints?: boolean;
  minimumKeywordMatches?: number;
  needsAiReview?: boolean;
  aiReviewMode?: GammaAnswerAiReviewMode;
};

type GammaAnswerAuthoringConfig = {
  schemaVersion?: number;
  worksheetType?: string;
  id?: string;
  title?: string;
  shortTitle?: string;
  semester?: string;
  week?: number;
  gammaUrl?: string;
  questions?: GammaAnswerAuthoringQuestion[];
};

function paddedWeek(week: number) {
  const value = Number.isFinite(week) ? Math.max(1, Math.floor(week)) : 1;
  return String(value).padStart(2, "0");
}

function buildGammaAnswerWorksheetId(semester: string, week: number) {
  return normalizeWorksheetId(`${semester || "S3"}W${paddedWeek(week)}`);
}

function cleanOneLine(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stripTaskPrefix(label: string) {
  return cleanOneLine(label).replace(/^任務\s*[A-Z]\s*[｜|:：\-－]?\s*/, "");
}

function truncatePrompt(value: string, fallbackTitle: string) {
  const cleaned = cleanOneLine(value);
  const fallback = `請完成「${stripTaskPrefix(fallbackTitle) || fallbackTitle}」。請依照左側 GAMMA 目錄作答。`;
  const prompt = cleaned || fallback;
  return prompt.length > 120 ? `${prompt.slice(0, 118)}...` : prompt;
}

function buildConciseTaskPrompt(task: ParsedTask) {
  return truncatePrompt("", task.label);
}

function defaultReviewBrief(
  title: string,
  prompt: string,
  expectedKind: GammaAnswerExpectedKind
): GammaAnswerReviewBrief {
  const normalizedTitle = cleanOneLine(title) || "這一題";
  const normalizedPrompt = cleanOneLine(prompt);
  if (expectedKind === "text") {
    return {
      task: normalizedPrompt
        ? `${normalizedTitle}：${normalizedPrompt}`
        : `學生要完成「${normalizedTitle}」的文字回答。`,
      expectedOutput: "學生應提交一段能對應題目要求、看得出有理解任務的文字答案。",
      mustInclude: ["內容和題目有關", "不是空白或亂打", "不是只複製題目"],
      rejectIf: ["空白或亂打", "完全無關", "只寫完成了或只複製題目"],
    };
  }

  const fileLabel =
    expectedKind === "image" ? "圖片" : expectedKind === "audio" ? "音訊" : "影片";
  return {
    task: normalizedPrompt
      ? `${normalizedTitle}：${normalizedPrompt}`
      : `學生要上傳符合「${normalizedTitle}」要求的${fileLabel}作品。`,
    expectedOutput: `學生應提交一個可正常開啟、格式正確，且能對應題目的${fileLabel}檔案。`,
    mustInclude: [`有${fileLabel}附件`, "檔案格式正確", "不是空白或明顯錯誤檔案"],
    rejectIf: ["沒有附件", `附件不是${fileLabel}`, "檔案無法開啟或明顯錯誤"],
  };
}

function defaultReadCheckForQuestion(
  title: string,
  expectedKind: GammaAnswerExpectedKind
): GammaAnswerReadCheck {
  const target = stripTaskPrefix(title) || title || "這一題";
  const optionsByKind: Record<
    GammaAnswerExpectedKind,
    { options: string[]; answerIndex: number }
  > = {
    text: { options: ["圖片工具", "文字工具", "音樂工具"], answerIndex: 1 },
    image: { options: ["文字工具", "音樂工具", "圖片工具"], answerIndex: 2 },
    audio: { options: ["音樂工具", "影片工具", "圖片工具"], answerIndex: 0 },
    video: { options: ["音樂工具", "影片工具", "文字工具"], answerIndex: 1 },
  };
  const picked = optionsByKind[expectedKind];

  return {
    type: "choice",
    question: `完成「${target}」時，應該使用哪個工具？`,
    options: picked.options,
    answerIndex: picked.answerIndex,
    successFeedback: "答對了，你有看懂這題要用的工具。",
    retryFeedback: "再看一次題目，找出這題需要的工具。",
  };
}

function normalizeBriefList(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.map(cleanOneLine).filter(Boolean)
    : fallback;
}

function reviewBriefFromAuthoringQuestion(
  question: GammaAnswerAuthoringQuestion,
  title: string,
  prompt: string,
  expectedKind: GammaAnswerExpectedKind
): GammaAnswerReviewBrief {
  const fallback = defaultReviewBrief(title, prompt, expectedKind);
  const rawBrief = question.reviewBrief || {};
  const concepts = conceptsFromAuthoring(question);
  const legacyMustInclude =
    concepts.length > 0
      ? concepts.slice(0, 6)
      : fallback.mustInclude;

  return {
    task:
      cleanOneLine(rawBrief.task) ||
      cleanOneLine(question.toolPrompt) ||
      fallback.task,
    expectedOutput:
      cleanOneLine(rawBrief.expectedOutput) ||
      (expectedKind === "text"
        ? "學生應提交一段文字，內容需要能對應題目、整理出重點，並使用自己的話回答。"
        : fallback.expectedOutput),
    mustInclude: normalizeBriefList(rawBrief.mustInclude, legacyMustInclude),
    rejectIf: normalizeBriefList(rawBrief.rejectIf, fallback.rejectIf),
  };
}

function promptReviewCriteriaFromAuthoringQuestion(
  question: GammaAnswerAuthoringQuestion,
  reviewBrief: GammaAnswerReviewBrief,
  expectedKind: GammaAnswerExpectedKind
) {
  const configured = question.promptReviewCriteria;
  const concepts = conceptsFromAuthoring(question);
  const passConditions = Array.isArray(configured?.passConditions)
    ? configured!.passConditions!.map(cleanOneLine).filter(Boolean)
    : expectedKind === "text"
      ? []
      : concepts.length > 0
      ? concepts
      : reviewBrief.mustInclude.filter(
          (condition) => !/(附件|檔案|格式|空白|錯誤|上傳|開啟|播放|下載)/u.test(condition)
        );
  const ratio = configured?.minimumCharacterMatchRatio;

  return {
    passConditions: passConditions.slice(0, 8),
    minimumCharacterMatchRatio:
      typeof ratio === "number" && Number.isFinite(ratio)
        ? Math.max(0.1, Math.min(1, ratio))
        : 0.5,
  };
}

function normalizeAuthoringReadCheck(
  raw: Partial<GammaAnswerReadCheck> | undefined
): GammaAnswerReadCheck | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const prompt = cleanOneLine(raw.question);
  const type = raw.type === "text" ? "text" : "choice";
  const acceptedAnswers = Array.isArray(raw.acceptedAnswers)
    ? raw.acceptedAnswers
        .filter((answer): answer is string => typeof answer === "string" && answer.trim().length > 0)
        .map(cleanOneLine)
        .filter(Boolean)
    : [];
  if (type === "text") {
    if (!prompt || acceptedAnswers.length === 0) return undefined;
    return {
      type,
      question: prompt,
      options: [],
      answerIndex: 0,
      acceptedAnswers: acceptedAnswers.slice(0, 8),
      matchMode: raw.matchMode === "includes" ? "includes" : "exact",
      successFeedback: cleanOneLine(raw.successFeedback),
      retryFeedback: cleanOneLine(raw.retryFeedback),
    };
  }
  const options = Array.isArray(raw.options)
    ? raw.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0)
    : [];
  const answerIndex =
    typeof raw.answerIndex === "number" && Number.isFinite(raw.answerIndex)
      ? Math.floor(raw.answerIndex)
      : undefined;
  if (!prompt || options.length < 2 || answerIndex === undefined || answerIndex < 0 || answerIndex >= options.length) {
    return undefined;
  }

  return {
    type,
    question: prompt,
    options,
    answerIndex,
    successFeedback: cleanOneLine(raw.successFeedback),
    retryFeedback: cleanOneLine(raw.retryFeedback),
  };
}

function readChecksFromAuthoringQuestion(question: GammaAnswerAuthoringQuestion) {
  const rawChecks = Array.isArray(question.readChecks)
    ? question.readChecks
    : [question.readCheck || question.checkpointQuiz];
  return rawChecks
    .map((raw) => normalizeAuthoringReadCheck(raw))
    .filter((check): check is GammaAnswerReadCheck => Boolean(check));
}

function cleanAuthoringJsonBlock(block: string) {
  return block
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractGammaAnswerAuthoringConfig(markdown: string): GammaAnswerAuthoringConfig | null {
  const markerPattern = new RegExp(
    `<!--\\s*${AUTHORING_JSON_START}\\s*-->\\s*([\\s\\S]*?)\\s*<!--\\s*${AUTHORING_JSON_END}\\s*-->`,
    "i"
  );
  const match = markdown.match(markerPattern);
  if (!match) return null;

  const jsonText = cleanAuthoringJsonBlock(match[1]);
  if (!jsonText) {
    throw new Error("LAB_TERMINAL_WORKSHEET_CONFIG 區塊是空的。");
  }

  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LAB_TERMINAL_WORKSHEET_CONFIG 必須是 JSON object。");
  }

  return parsed as GammaAnswerAuthoringConfig;
}

function normalizeAuthoringModule(value: unknown, questionIndex: number): GammaAnswerExpectedKind {
  const moduleName = cleanOneLine(value).toLowerCase();
  if (moduleName === "music") return "audio";
  if (AUTHORING_MODULES.includes(moduleName as GammaAnswerAuthoringModule)) {
    return moduleName as GammaAnswerExpectedKind;
  }
  throw new Error(`questions[${questionIndex}].module 必須是 text、image、audio、video。`);
}

function normalizeReviewPreset(
  value: unknown,
  expectedKind: GammaAnswerExpectedKind
): GammaAnswerAuthoringReviewPreset {
  const preset = cleanOneLine(value).toLowerCase();
  const normalized = AUTHORING_REVIEW_PRESETS.includes(preset as GammaAnswerAuthoringReviewPreset)
    ? (preset as GammaAnswerAuthoringReviewPreset)
    : expectedKind === "text"
      ? "text-keywords"
      : "file-required";

  if (expectedKind === "text" && normalized === "file-required") return "text-keywords";
  if (expectedKind !== "text" && normalized.startsWith("text-")) return "file-required";
  return normalized;
}

function normalizeStrictness(value: unknown): GammaAnswerAuthoringStrictness {
  const strictness = cleanOneLine(value).toLowerCase();
  return AUTHORING_STRICTNESS.includes(strictness as GammaAnswerAuthoringStrictness)
    ? (strictness as GammaAnswerAuthoringStrictness)
    : "normal";
}

function normalizeAiReviewMode(
  value: unknown,
  needsAiReview: unknown,
  reviewPreset: GammaAnswerAuthoringReviewPreset
): GammaAnswerAiReviewMode {
  void value;
  void needsAiReview;
  void reviewPreset;
  return "local-only";
}

function numberFromAuthoring(value: unknown, fallback: number, min = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= min
    ? Math.floor(value)
    : fallback;
}

function conceptsFromAuthoring(question: GammaAnswerAuthoringQuestion) {
  return Array.isArray(question.requiredConcepts)
    ? question.requiredConcepts.map(cleanOneLine).filter(Boolean)
    : [];
}

function buildReviewCriteriaFromAuthoringQuestion(
  question: GammaAnswerAuthoringQuestion,
  expectedKind: GammaAnswerExpectedKind
): GammaAnswerReviewCriteria {
  const defaults = GAMMA_ANSWER_MODULES[expectedKind].reviewCriteria;
  const reviewPreset = normalizeReviewPreset(question.reviewPreset, expectedKind);
  const strictness = normalizeStrictness(question.strictness);
  const aiReviewMode = normalizeAiReviewMode(
    question.aiReviewMode,
    question.needsAiReview,
    reviewPreset
  );

  if (expectedKind !== "text") {
    return {
      ...defaults,
      aiReviewMode,
    };
  }

  const concepts = conceptsFromAuthoring(question);
  const strictnessRules = TEXT_STRICTNESS_RULES[strictness];
  const shouldCheckKeywords =
    reviewPreset === "text-keywords" ||
    reviewPreset === "ai-assisted" ||
    reviewPreset === "custom";
  const minimumKeywordMatches = shouldCheckKeywords
    ? Math.min(
        concepts.length,
        numberFromAuthoring(
          question.minimumKeywordMatches,
          concepts.length > 0 ? strictnessRules.minimumKeywordMatches : 0
        )
      )
    : 0;
  const minLengthFallback =
    reviewPreset === "text-any"
      ? 1
      : reviewPreset === "text-three-points"
        ? TEXT_THREE_POINTS_MIN_LENGTH[strictness]
        : strictnessRules.minLength;
  const requiresThreePoints =
    typeof question.requiresThreePoints === "boolean"
      ? question.requiresThreePoints
      : reviewPreset === "text-three-points";

  return {
    ...defaults,
    minLength: numberFromAuthoring(question.minLength, minLengthFallback),
    maxLength: numberFromAuthoring(question.maxLength, strictnessRules.maxLength, 1),
    requiresThreePoints,
    keywords: concepts,
    minimumKeywordMatches,
    aiReviewMode,
  };
}

function createGammaAnswerQuestion(index: number, worksheetId: string): GammaAnswerQuestionConfig {
  const questionNumber = index + 1;
  const defaults = GAMMA_ANSWER_MODULES.text;
  return {
    id: `q${questionNumber}`,
    taskId: `${normalizeWorksheetId(worksheetId)}-Q${questionNumber}`,
    code: `第 ${questionNumber} 題`,
    label: `第 ${questionNumber} 題`,
    title: `第 ${questionNumber} 題`,
    prompt: "請依照左側 GAMMA 目錄完成這一題。",
    toolPrompt: "請在 Lab Terminal 產生或整理這一題需要的內容。",
    placeholder: defaults.placeholder,
    toolId: defaults.toolId,
    expectedKind: "text",
    coins: 60,
    accept: defaults.accept,
    uploadLabel: defaults.uploadLabel,
    reviewHint: defaults.reviewHint,
    readChecks: [],
    reviewCriteria: { ...defaults.reviewCriteria },
    textMinimumLength: defaults.reviewCriteria.minLength,
    textMaximumLength: defaults.reviewCriteria.maxLength,
    textRequiresThreePoints: defaults.reviewCriteria.requiresThreePoints,
    textKeywords: defaults.reviewCriteria.keywords,
    textMinimumKeywordMatches: defaults.reviewCriteria.minimumKeywordMatches,
  };
}

function detectGammaUrlFromMarkdown(markdown: string) {
  const match = markdown.match(/https:\/\/gamma\.app\/(?:docs|public|embed)\/[^\s)]+/i);
  return match ? match[0].trim() : "";
}

function inferGammaAnswerKindFromText(text: string): GammaAnswerExpectedKind {
  if (/影片|短片|video|mp4|webm|mov|lab\s*video/i.test(text)) return "video";
  if (/音樂|音訊|聲音|歌曲|配樂|audio|music|mp3|wav|m4a|lab\s*music/i.test(text)) {
    return "audio";
  }
  if (/圖片|影像|照片|圖像|插圖|image|photo|png|jpe?g|webp|lab\s*image/i.test(text)) {
    return "image";
  }
  return "text";
}

function gammaAnswerQuestionFromParsedTask(
  task: ParsedGammaAnswerMarkdownTask,
  index: number,
  worksheetId: string
): GammaAnswerQuestionConfig {
  const expectedKind = task.expectedKind;
  const defaults = GAMMA_ANSWER_MODULES[expectedKind];
  const title = task.label.trim() || `第 ${index + 1} 題`;
  const prompt = truncatePrompt(task.prompt, title);
  const question = createGammaAnswerQuestion(index, worksheetId);
  const reviewCriteria = { ...defaults.reviewCriteria };
  return {
    ...question,
    code: `第 ${index + 1} 題`,
    label: title,
    title,
    prompt,
    toolPrompt: prompt,
    placeholder: expectedKind === "text" ? defaults.placeholder : "",
    toolId: defaults.toolId,
    expectedKind,
    coins: task.coins > 0 ? task.coins : question.coins,
    accept: defaults.accept,
    uploadLabel: defaults.uploadLabel,
    reviewHint: defaults.reviewHint,
    readCheck: undefined,
    readChecks: [],
    reviewBrief: undefined,
    promptReviewCriteria: undefined,
    reviewCriteria,
    textMinimumLength: reviewCriteria.minLength,
    textMaximumLength: reviewCriteria.maxLength,
    textRequiresThreePoints: reviewCriteria.requiresThreePoints,
    textKeywords: reviewCriteria.keywords,
    textMinimumKeywordMatches: reviewCriteria.minimumKeywordMatches,
  };
}

function gammaAnswerQuestionFromAuthoringQuestion(
  rawQuestion: GammaAnswerAuthoringQuestion,
  index: number,
  worksheetId: string
): GammaAnswerQuestionConfig {
  const expectedKind = normalizeAuthoringModule(rawQuestion.module, index);
  const defaults = GAMMA_ANSWER_MODULES[expectedKind];
  const question = createGammaAnswerQuestion(index, worksheetId);
  const title = cleanOneLine(rawQuestion.title) || `第 ${index + 1} 題`;
  const prompt = truncatePrompt(
    cleanOneLine(rawQuestion.studentPrompt) || cleanOneLine(rawQuestion.prompt),
    title
  );
  const reviewCriteria = buildReviewCriteriaFromAuthoringQuestion(rawQuestion, expectedKind);
  const reviewBrief = reviewBriefFromAuthoringQuestion(rawQuestion, title, prompt, expectedKind);
  const promptReviewCriteria = promptReviewCriteriaFromAuthoringQuestion(
    rawQuestion,
    reviewBrief,
    expectedKind
  );
  const readChecks = readChecksFromAuthoringQuestion(rawQuestion);
  const readCheck = readChecks[0] || defaultReadCheckForQuestion(title, expectedKind);

  return {
    ...question,
    id: cleanOneLine(rawQuestion.id) || `q${index + 1}`,
    taskId: `${worksheetId}-Q${index + 1}`,
    code: `第 ${index + 1} 題`,
    label: title,
    title,
    prompt,
    toolPrompt: prompt,
    placeholder: expectedKind === "text" ? defaults.placeholder : "",
    toolId: defaults.toolId,
    expectedKind,
    coins: numberFromAuthoring(rawQuestion.coins, question.coins),
    accept: defaults.accept,
    uploadLabel: defaults.uploadLabel,
    reviewHint: defaults.reviewHint,
    readCheck,
    readChecks: readChecks.length > 0 ? readChecks : [readCheck],
    reviewBrief,
    promptReviewCriteria,
    reviewCriteria,
    textMinimumLength: reviewCriteria.minLength,
    textMaximumLength: reviewCriteria.maxLength,
    textRequiresThreePoints: reviewCriteria.requiresThreePoints,
    textKeywords: reviewCriteria.keywords,
    textMinimumKeywordMatches: reviewCriteria.minimumKeywordMatches,
  };
}

function parseResultFromGammaAnswerQuestions(
  questions: GammaAnswerQuestionConfig[],
  warnings: string[] = []
): ParseResult {
  return {
    success: true,
    tasks: questions.map((question) => ({
      taskId: question.taskId,
      label: question.label,
      description: question.prompt,
      coins: question.coins,
      isOptional: false,
      coinsMissing: false,
    })),
    warnings,
    errors: [],
  };
}

function createGammaAnswerConfigFromAuthoring(
  authoringConfig: GammaAnswerAuthoringConfig,
  markdown: string,
  fileName: string,
  currentConfig: GammaAnswerWorksheetConfig
) {
  const schemaVersion = authoringConfig.schemaVersion || 2;
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error("LAB_TERMINAL_WORKSHEET_CONFIG.schemaVersion 目前只支援 1 或 2。");
  }
  if (authoringConfig.worksheetType !== "gamma-answer") {
    throw new Error("LAB_TERMINAL_WORKSHEET_CONFIG.worksheetType 必須是 gamma-answer。");
  }
  if (!Array.isArray(authoringConfig.questions) || authoringConfig.questions.length === 0) {
    throw new Error("LAB_TERMINAL_WORKSHEET_CONFIG.questions 至少需要 1 題。");
  }

  const detected = extractSemesterAndWeek(
    `${authoringConfig.title || ""} ${authoringConfig.id || ""} ${fileName}`
  );
  const semester = cleanOneLine(authoringConfig.semester || detected.semester || currentConfig.semester || "S3").toUpperCase();
  const week = numberFromAuthoring(authoringConfig.week, detected.week || currentConfig.week || 1, 1);
  const worksheetId = normalizeWorksheetId(
    cleanOneLine(authoringConfig.id) || buildGammaAnswerWorksheetId(semester, week)
  );
  const title =
    cleanOneLine(authoringConfig.title) || extractWorksheetTitle(markdown).trim() || currentConfig.title;
  const gammaUrl =
    cleanOneLine(authoringConfig.gammaUrl) || detectGammaUrlFromMarkdown(markdown) || currentConfig.gammaUrl;
  const questions = authoringConfig.questions.map((question, index) =>
    gammaAnswerQuestionFromAuthoringQuestion(question, index, worksheetId)
  );
  const questionIds = new Set<string>();
  questions.forEach((question, index) => {
    if (questionIds.has(question.id)) {
      throw new Error(`questions[${index}].id 重複：${question.id}`);
    }
    questionIds.add(question.id);
  });

  const config = normalizeGammaAnswerWorksheetConfig(
    {
      ...currentConfig,
      schemaVersion: 2,
      id: worksheetId,
      courseId: `${semester}-W${paddedWeek(week)}`,
      title,
      shortTitle: cleanOneLine(authoringConfig.shortTitle) || `${semester} W${paddedWeek(week)}`,
      semester,
      week,
      gammaUrl,
      gammaFallbackUrl: gammaUrl,
      source: "gamma-answer-worksheet",
      storageVersion: `draft-${worksheetId.toLowerCase()}-${Date.now()}`,
      questions,
    },
    currentConfig
  );

  return {
    config,
    worksheetId,
    parseResult: parseResultFromGammaAnswerQuestions(config.questions),
  };
}

function createGammaAnswerConfigFromMarkdown(
  markdown: string,
  fileName: string,
  currentConfig: GammaAnswerWorksheetConfig
) {
  const title = extractWorksheetTitle(markdown).trim();
  const detected = extractSemesterAndWeek(`${title} ${fileName}`);
  const semester = detected.semester || currentConfig.semester || "S3";
  const week = detected.week || currentConfig.week || 1;
  const worksheetId = buildGammaAnswerWorksheetId(semester, week);
  const gammaUrl = detectGammaUrlFromMarkdown(markdown);
  const parsed = parseGammaAnswerMarkdown(markdown);
  if (parsed.tasks.length === 0) {
    throw new Error(parsed.errors.join("\n") || "Markdown 中沒有可匯入的任務。");
  }
  const questions = parsed.tasks.map((task, index) =>
    gammaAnswerQuestionFromParsedTask(task, index, worksheetId)
  );

  const config = normalizeGammaAnswerWorksheetConfig(
    {
      ...currentConfig,
      schemaVersion: 2,
      id: worksheetId,
      courseId: `${semester}-W${paddedWeek(week)}`,
      title: title || currentConfig.title,
      shortTitle: `${semester} W${paddedWeek(week)}`,
      semester,
      week,
      gammaUrl,
      gammaFallbackUrl: gammaUrl,
      source: "gamma-answer-worksheet",
      storageVersion: `draft-${worksheetId.toLowerCase()}-${Date.now()}`,
      questions,
    },
    undefined
  );

  return {
    config,
    worksheetId,
    parseResult: parseResultFromGammaAnswerQuestions(config.questions, parsed.warnings),
  };
}

function createGammaAnswerDraftConfig(): GammaAnswerWorksheetConfig {
  return {
    schemaVersion: 2,
    id: "",
    courseId: "",
    title: "",
    shortTitle: "",
    semester: "S3",
    week: 1,
    gammaUrl: "",
    gammaFallbackUrl: "",
    source: "gamma-answer-worksheet",
    storageVersion: `draft-new-${Date.now()}`,
    draftField: "gammaAnswerDraft",
    mediaAccessKey: LAB_TOOL_MEDIA_ACCESS_KEY,
    questions: [],
  };
}

function prepareGammaAnswerConfigForSave(
  config: GammaAnswerWorksheetConfig,
  worksheetIdInput: string
) {
  const worksheetId = normalizeWorksheetId(
    worksheetIdInput || buildGammaAnswerWorksheetId(config.semester, config.week)
  );
  const semester = (config.semester || "S3").trim().toUpperCase();
  const week = Number.isFinite(config.week) ? Math.max(1, Math.floor(config.week)) : 1;
  const fallback = getGammaAnswerWorksheetConfig(worksheetId);
  const questions = config.questions.map((question, index) => {
    const title = question.title.trim() || question.label.trim() || `第 ${index + 1} 題`;
    const criteria = {
      ...(question.reviewCriteria || {}),
      aiReviewMode: question.reviewCriteria?.aiReviewMode || "local-only",
    };
    const prompt = question.prompt.trim() || "請依照左側 GAMMA 目錄完成這一題。";
    return {
      ...question,
      id: question.id.trim() || `q${index + 1}`,
      taskId: `${worksheetId}-Q${index + 1}`,
      code: question.code.trim() || `第 ${index + 1} 題`,
      label: question.label.trim() || title,
      title,
      prompt,
      toolPrompt: prompt,
      reviewCriteria: criteria,
      textMinimumLength: criteria.minLength,
      textMaximumLength: criteria.maxLength,
      textRequiresThreePoints: criteria.requiresThreePoints,
      textKeywords: criteria.keywords,
      textMinimumKeywordMatches: criteria.minimumKeywordMatches,
    };
  });

  return normalizeGammaAnswerWorksheetConfig(
    {
      ...config,
      schemaVersion: 2,
      id: worksheetId,
      courseId: config.courseId.trim() || `${semester}-W${paddedWeek(week)}`,
      title: config.title.trim(),
      shortTitle: config.shortTitle.trim() || `${semester} W${paddedWeek(week)}`,
      semester,
      week,
      gammaFallbackUrl: config.gammaFallbackUrl.trim() || config.gammaUrl.trim(),
      source: config.source.trim() || "gamma-answer-worksheet",
      storageVersion:
        config.storageVersion.trim() || `v${worksheetId.toLowerCase()}-gamma-answer-worksheet`,
      draftField: "gammaAnswerDraft",
      mediaAccessKey: config.mediaAccessKey.trim(),
      questions,
    },
    fallback
  );
}

export default function WorksheetsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<{ id: string; html: string } | null>(null);
  const [editingGammaId, setEditingGammaId] = useState<string | null>(null);
  const [gammaUrlInput, setGammaUrlInput] = useState("");
  const [editingGammaAnswerId, setEditingGammaAnswerId] = useState<string | null>(null);
  const [gammaAnswerJsonInput, setGammaAnswerJsonInput] = useState("");
  const [gammaAnswerJsonError, setGammaAnswerJsonError] = useState("");
  const [savingGammaAnswerJson, setSavingGammaAnswerJson] = useState(false);
  const [editingClassesId, setEditingClassesId] = useState<string | null>(null);
  const [classSel, setClassSel] = useState<string[]>([]);
  const [savingClasses, setSavingClasses] = useState(false);
  const [showGammaAnswerCreate, setShowGammaAnswerCreate] = useState(false);
  const [assetManagerWorksheet, setAssetManagerWorksheet] = useState<Worksheet | null>(null);

  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ws, cls] = await Promise.all([getWorksheets(), getClassrooms()]);
    const deletedIds = new Set(
      ws.filter((worksheet) => worksheet.isDeleted).map((worksheet) => worksheet.id)
    );
    const worksheetMap = new Map<string, Worksheet>();
    getBuiltinGammaAnswerWorksheets()
      .filter((worksheet) => !deletedIds.has(worksheet.id))
      .forEach((worksheet) => {
        worksheetMap.set(worksheet.id, worksheet);
      });
    ws.filter((worksheet) => !worksheet.isDeleted).forEach((worksheet) => {
      worksheetMap.set(worksheet.id, worksheet);
    });
    setWorksheets(Array.from(worksheetMap.values()).sort((a, b) => {
      if (a.semester !== b.semester) return b.semester.localeCompare(a.semester);
      return b.week - a.week;
    }));
    setClassrooms(cls.sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) { router.replace("/login"); return; }
    if (user && isAdmin) loadData();
  }, [user, isLoading, isAdmin, router, loadData]);

  const getClassName = (classId: string) =>
    classrooms.find((c) => c.id === classId)?.name || classId;

  // 可看見班級：新資料讀 classIds，舊資料退回單一 classId
  const visibleClassIds = (ws: Worksheet): string[] => {
    const ids = (ws.classIds && ws.classIds.length > 0 ? ws.classIds : ws.classId ? [ws.classId] : [])
      .filter((id) => id && id !== "builtin");
    if (ids.length > 0) return ids;
    return classrooms[0] ? [classrooms[0].id] : [];
  };

  const isBuiltinWorksheet = (ws: Worksheet) =>
    BUILTIN_WORKSHEET_IDS.has(ws.id) && ws.createdBy === "system";

  const hasBuiltinFallback = (ws: Worksheet) => BUILTIN_WORKSHEET_IDS.has(ws.id);

  const prepareWorksheetForSave = (
    ws: Worksheet,
    patch: Partial<Worksheet> = {}
  ): Worksheet => {
    const now = new Date().toISOString();
    const merged = { ...ws, ...patch };
    const ids = visibleClassIds(merged);
    const primary =
      merged.classId && merged.classId !== "builtin" && ids.includes(merged.classId)
        ? merged.classId
        : ids[0] || classrooms[0]?.id || merged.classId || "demo";
    const classIds = Array.from(
      new Set([primary, ...ids].filter((id) => id && id !== "builtin"))
    );
    const fallbackConfig = getGammaAnswerWorksheetConfig(ws.id);

    return {
      ...merged,
      classId: classIds[0] || primary,
      classIds,
      createdAt: isBuiltinWorksheet(ws) ? now : merged.createdAt || now,
      createdBy: isBuiltinWorksheet(ws) || !merged.createdBy || merged.createdBy === "system"
        ? user?.id || user?.username || "admin"
        : merged.createdBy,
      updatedAt: now,
      gammaAnswerConfig: merged.gammaAnswerConfig || fallbackConfig || null,
    };
  };

  const isGammaAnswerWorksheet = (ws: Worksheet) =>
    !!ws.gammaAnswerConfig || !!getGammaAnswerWorksheetConfig(ws.id);

  const isNativeHtmlWorksheet = (ws: Worksheet) => {
    if (ws.sourceFormat === "html") return true;
    if (ws.styledHtmlStatus === "ready" && ws.styledHtmlUrl && !ws.styledHtmlGeneratedAt) {
      return true;
    }
    const content = (ws.markdownContent || "").trim();
    return /^<(?:!doctype|html|head|body|main|section|article|div)\b/i.test(content);
  };

  const togglePublish = async (ws: Worksheet) => {
    if (
      !ws.isPublished &&
      isGammaAnswerWorksheet(ws) &&
      !/^https:\/\/(?:www\.)?gamma\.app\/(?:docs|public|embed)\//i.test(
        (ws.gammaUrl || ws.gammaAnswerConfig?.gammaUrl || "").trim()
      )
    ) {
      alert("發布答題版學習單前，請先加入有效的 Gamma 網址。");
      return;
    }
    await saveWorksheet(
      prepareWorksheetForSave(ws, {
        isPublished: !ws.isPublished,
        publishedAt: !ws.isPublished ? new Date().toISOString() : null,
        isDeleted: false,
      })
    );
    await loadData();
  };

  const handleDelete = async (ws: Worksheet) => {
    if (!confirm(`確定要刪除「${ws.title}」？此操作無法復原。`)) return;
    if (hasBuiltinFallback(ws)) {
      await saveWorksheet(
        prepareWorksheetForSave(ws, {
          isPublished: false,
          publishedAt: null,
          isDeleted: true,
        })
      );
    } else {
      await deleteWorksheet(ws.id);
    }
    await loadData();
  };

  const openWorksheetAdmin = async (ws: Worksheet) => {
    if (isBuiltinWorksheet(ws)) {
      await saveWorksheet(prepareWorksheetForSave(ws, { isDeleted: false }));
      await loadData();
    }
    router.push(`/admin/worksheets/${ws.id}`);
  };

  const openGammaAnswerEditor = (ws: Worksheet) => {
    if (editingGammaAnswerId === ws.id) {
      setEditingGammaAnswerId(null);
      setGammaAnswerJsonInput("");
      setGammaAnswerJsonError("");
      return;
    }

    const fallback = getGammaAnswerWorksheetConfig(ws.id);
    const source = ws.gammaAnswerConfig || fallback;
    if (!source) return;

    const normalized = normalizeGammaAnswerWorksheetConfig(
      {
        ...source,
        id: ws.id,
        title: ws.title || source.title,
        semester: ws.semester || source.semester,
        week: ws.week || source.week,
        gammaUrl: ws.gammaUrl || source.gammaUrl,
      },
      fallback
    );
    setEditingGammaAnswerId(ws.id);
    setGammaAnswerJsonInput(JSON.stringify(normalized, null, 2));
    setGammaAnswerJsonError("");
  };

  const handleSaveGammaAnswerJson = async (ws: Worksheet) => {
    setGammaAnswerJsonError("");
    setSavingGammaAnswerJson(true);
    try {
      const parsed = JSON.parse(gammaAnswerJsonInput);
      const fallback = getGammaAnswerWorksheetConfig(ws.id);
      const config = normalizeGammaAnswerWorksheetConfig(parsed, fallback);
      const generated = gammaAnswerConfigToWorksheet(config);
      const ids = visibleClassIds(ws);

      await saveWorksheet(
        prepareWorksheetForSave(ws, {
          title: generated.title,
          semester: generated.semester,
          week: generated.week,
          markdownContent: generated.markdownContent,
          tasks: generated.tasks,
          classId: ids[0],
          classIds: ids,
          isPublished: ws.isPublished,
          publishedAt: ws.publishedAt,
          gammaUrl: config.gammaUrl,
          gammaAnswerConfig: config,
          isDeleted: false,
        })
      );

      setEditingGammaAnswerId(null);
      setGammaAnswerJsonInput("");
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGammaAnswerJsonError(message);
    } finally {
      setSavingGammaAnswerJson(false);
    }
  };

  const updateGammaAnswerEditorConfig = useCallback(
    (updater: (config: GammaAnswerWorksheetConfig) => GammaAnswerWorksheetConfig) => {
      const parsed = parseGammaAnswerEditorJson(gammaAnswerJsonInput);
      if (!parsed.config) {
        setGammaAnswerJsonError(parsed.error);
        return;
      }
      const next = updater(parsed.config);
      setGammaAnswerJsonInput(stringifyGammaAnswerConfig(next));
      setGammaAnswerJsonError("");
    },
    [gammaAnswerJsonInput]
  );

  const openClassEditor = (ws: Worksheet) => {
    setEditingClassesId(editingClassesId === ws.id ? null : ws.id);
    setClassSel(visibleClassIds(ws));
  };

  const handleSaveClasses = async (ws: Worksheet) => {
    if (classSel.length === 0) { alert("至少要選一個班級"); return; }
    setSavingClasses(true);
    // 保留原主帶班級為第一個（若仍在勾選中），否則以第一個勾選者為主帶
    const primary = classSel.includes(ws.classId) && ws.classId !== "builtin" ? ws.classId : classSel[0];
    const ordered = [primary, ...classSel.filter((c) => c !== primary)];
    await saveWorksheet(
      prepareWorksheetForSave(ws, {
        classId: primary,
        classIds: ordered,
        isDeleted: false,
      })
    );
    setSavingClasses(false);
    setEditingClassesId(null);
    await loadData();
  };

  const handleSaveGammaUrl = async (ws: Worksheet, nextUrl = gammaUrlInput) => {
    const url = nextUrl.trim();
    if (url && !url.includes("gamma.app")) {
      alert("請貼上有效的 Gamma 連結（包含 gamma.app）");
      return;
    }
    await saveWorksheet(
      prepareWorksheetForSave(ws, {
        gammaUrl: url || null,
        gammaAnswerConfig: ws.gammaAnswerConfig
          ? { ...ws.gammaAnswerConfig, gammaUrl: url || ws.gammaAnswerConfig.gammaUrl, gammaFallbackUrl: url || ws.gammaAnswerConfig.gammaFallbackUrl }
          : ws.gammaAnswerConfig,
        isDeleted: false,
      })
    );
    setEditingGammaId(null);
    setGammaUrlInput("");
    await loadData();
  };

  const handleGenerate = async (ws: Worksheet) => {
    setGeneratingId(ws.id);
    try {
      await saveWorksheet(
        prepareWorksheetForSave(ws, {
          styledHtmlStatus: "generating",
          isDeleted: false,
        })
      );

      const res = await fetch("/api/generate-worksheet-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdownContent: ws.markdownContent, title: ws.title }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || "Generation failed");
      }

      const { html } = await res.json();

      await saveWorksheet(
        prepareWorksheetForSave(ws, {
          styledHtmlUrl: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
          styledHtmlStatus: "ready",
          styledHtmlGeneratedAt: new Date().toISOString(),
          isDeleted: false,
        })
      );

      setPreviewHtml({ id: ws.id, html });
      await loadData();
    } catch (err: any) {
      console.error("Generate failed:", err);
      await saveWorksheet(
        prepareWorksheetForSave(ws, {
          styledHtmlStatus: "error",
          isDeleted: false,
        })
      );
      alert(`生成失敗：${err.message}`);
      await loadData();
    } finally {
      setGeneratingId(null);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-[var(--terminal-primary)]">
        載入中...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[var(--terminal-bg)] flex items-center justify-center text-red-400">
        無權限存取
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--terminal-bg)] text-[var(--terminal-primary)] p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push("/admin")}
              className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] mb-2 block"
            >
              ← 返回後台
            </button>
            <h1 className="text-xl font-bold">學習單管理</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/admin/worksheets/visibility")}
              className="px-4 py-2 border border-cyan-500 text-cyan-400 hover:bg-cyan-900/20 transition-colors"
            >
              🏫 班級 × 系列
            </button>
            <button
              onClick={() => setShowGammaAnswerCreate(true)}
              className="px-4 py-2 border border-emerald-500 text-emerald-300 hover:bg-emerald-900/20 transition-colors"
            >
              + 新增答題版學習單
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-2 bg-[var(--terminal-primary)] text-[var(--terminal-bg)] font-bold hover:opacity-90 transition-opacity"
            >
              + 新增學習單
            </button>
          </div>
        </div>

        {worksheets.length === 0 ? (
          <div className="text-center py-12 text-[var(--terminal-primary-dim)]">
            尚無學習單，點擊右上角新增
          </div>
        ) : (
          <div className="space-y-3">
            {worksheets.map((ws) => {
              const visibleIds = visibleClassIds(ws);
              const classLabel = visibleIds.length > 0
                ? visibleIds.map(getClassName).join("、")
                : "尚未設定";
              const showHtmlActions = !isNativeHtmlWorksheet(ws) && !isGammaAnswerWorksheet(ws);
              return (
              <div
                key={ws.id}
                className="border border-[var(--terminal-primary-dim)] p-4 transition-colors hover:border-[var(--terminal-primary)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 ${
                        ws.isPublished
                          ? "bg-green-900/50 text-green-400 border border-green-700"
                          : "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
                      }`}>
                        {ws.isPublished ? "已發布" : "草稿"}
                      </span>
                      <span className="text-xs text-[var(--terminal-primary-dim)]">
                        {ws.semester} W{String(ws.week).padStart(2, "0")}
                      </span>
                      <span className="text-xs text-cyan-400/90" title="可見班級">
                        班級：{classLabel}
                      </span>
                    </div>
                    <h2 className="font-bold truncate">{ws.title}</h2>
                    <div className="text-xs text-[var(--terminal-primary-dim)] mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {ws.tasks.length} 個任務 ·{" "}
                        {ws.tasks.reduce((sum, t) => sum + t.coins, 0)} 金幣
                        {ws.tasks.some((t) => t.isOptional) && " · 含選修"}
                      </span>
                      {ws.styledHtmlStatus === "ready" && (
                        <span className="px-1.5 py-0.5 bg-cyan-900/40 text-cyan-400 border border-cyan-700">
                          樣式已生成
                        </span>
                      )}
                      {ws.styledHtmlStatus === "generating" && (
                        <span className="px-1.5 py-0.5 bg-yellow-900/40 text-yellow-400 border border-yellow-700 animate-pulse">
                          生成中
                        </span>
                      )}
                      {ws.styledHtmlStatus === "error" && (
                        <span className="px-1.5 py-0.5 bg-red-900/40 text-red-400 border border-red-700">
                          生成失敗
                        </span>
                      )}
                      {ws.gammaUrl && (
                        <span className="px-1.5 py-0.5 bg-purple-900/40 text-purple-400 border border-purple-700">
                          Gamma 連結
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => openWorksheetAdmin(ws)}
                      className="px-3 py-1.5 text-xs border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
                    >
                      查看/編輯
                    </button>
                    <button
                      onClick={() => openClassEditor(ws)}
                      className={`px-3 py-1.5 text-xs border ${
                        editingClassesId === ws.id
                          ? "border-cyan-500 text-cyan-300 bg-cyan-900/30"
                          : "border-cyan-700 text-cyan-400 hover:bg-cyan-900/20"
                      }`}
                    >
                      可見班級
                    </button>
                    <button
                      onClick={() => {
                        setEditingGammaId(editingGammaId === ws.id ? null : ws.id);
                        setGammaUrlInput(ws.gammaUrl || "");
                      }}
                      className={`px-3 py-1.5 text-xs border ${
                        ws.gammaUrl
                          ? "border-purple-600 text-purple-400 hover:bg-purple-900/30"
                          : "border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
                      }`}
                    >
                      {ws.gammaUrl ? "修改 Gamma" : "加入 Gamma"}
                    </button>
                    {isGammaAnswerWorksheet(ws) && (
                      <>
                        <button
                          onClick={() => openGammaAnswerEditor(ws)}
                          className={`px-3 py-1.5 text-xs border ${
                            editingGammaAnswerId === ws.id
                              ? "border-emerald-400 bg-emerald-900/30 text-emerald-200"
                              : "border-emerald-700 text-emerald-300 hover:bg-emerald-900/20"
                          }`}
                        >
                          JSON 題目設定
                        </button>
                        <button
                          onClick={() => setAssetManagerWorksheet(ws)}
                          className="border border-orange-700 px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-900/20"
                        >
                          管理生成素材
                        </button>
                      </>
                    )}
                    {showHtmlActions && ws.styledHtmlStatus === "ready" && ws.styledHtmlUrl ? (
                      <button
                        onClick={() => {
                          const html = decodeURIComponent(ws.styledHtmlUrl!.replace("data:text/html;charset=utf-8,", ""));
                          setPreviewHtml({ id: ws.id, html });
                        }}
                        className="px-3 py-1.5 text-xs border border-blue-600 text-blue-400 hover:bg-blue-900/30"
                      >
                        預覽 HTML
                      </button>
                    ) : null}
                    {showHtmlActions && (
                      <button
                        onClick={() => handleGenerate(ws)}
                        disabled={generatingId === ws.id}
                        className={`px-3 py-1.5 text-xs border ${
                          generatingId === ws.id
                            ? "border-[var(--terminal-primary-dim)] opacity-50 animate-pulse"
                            : "border-cyan-600 text-cyan-400 hover:bg-cyan-900/30"
                        }`}
                      >
                        {generatingId === ws.id
                          ? "生成中..."
                          : ws.styledHtmlStatus === "ready"
                          ? "重新生成"
                          : "生成 HTML"}
                      </button>
                    )}
                    <button
                      onClick={() => togglePublish(ws)}
                      className={`px-3 py-1.5 text-xs border ${
                        ws.isPublished
                          ? "border-yellow-600 text-yellow-400 hover:bg-yellow-900/30"
                          : "border-green-600 text-green-400 hover:bg-green-900/30"
                      }`}
                    >
                      {ws.isPublished ? "下架" : "發布"}
                    </button>
                    <button
                      onClick={() => handleDelete(ws)}
                      className="px-3 py-1.5 text-xs border border-red-700 text-red-400 hover:bg-red-900/30"
                    >
                      刪除
                    </button>
                  </div>
                </div>
                {/* Inline 可看見班級 editor */}
                {editingClassesId === ws.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--terminal-primary-dim)]/30">
                    <p className="text-xs text-[var(--terminal-primary-dim)] mb-2">
                      勾選可看見這份學習單的班級（可多選）：
                    </p>
                    {classrooms.length === 0 ? (
                      <p className="text-yellow-400 text-sm">尚無班級</p>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {classrooms.map((c) => {
                          const checked = classSel.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={`flex items-center gap-2 px-3 py-2 border cursor-pointer text-sm ${
                                checked
                                  ? "border-cyan-500 bg-cyan-900/20 text-cyan-300"
                                  : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] hover:border-cyan-600"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setClassSel((prev) =>
                                    prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                                  )
                                }
                                className="accent-cyan-500"
                              />
                              <span className="truncate">{c.name}</span>
                              {checked && (classSel.includes(ws.classId) ? ws.classId : classSel[0]) === c.id && (
                                <span className="ml-auto text-[10px] px-1 bg-cyan-500/20 border border-cyan-700">主帶</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => handleSaveClasses(ws)}
                        disabled={savingClasses || classSel.length === 0}
                        className="px-3 py-1.5 text-xs bg-cyan-600 text-black font-bold hover:opacity-90 disabled:opacity-40"
                      >
                        {savingClasses ? "儲存中..." : "儲存"}
                      </button>
                      <button
                        onClick={() => setEditingClassesId(null)}
                        className="px-3 py-1.5 text-xs border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
                {/* Inline Gamma URL editor */}
                {editingGammaId === ws.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--terminal-primary-dim)]/30">
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        value={gammaUrlInput}
                        onChange={(e) => setGammaUrlInput(e.target.value)}
                        placeholder="貼上 Gamma 分享連結，例：https://gamma.app/docs/xxxxx"
                        className="flex-1 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-1.5 text-xs outline-none focus:border-purple-500"
                      />
                      <button
                        onClick={() => handleSaveGammaUrl(ws)}
                        className="px-3 py-1.5 text-xs bg-purple-700 text-white hover:bg-purple-600"
                      >
                        儲存
                      </button>
                      {ws.gammaUrl && (
                        <button
                          onClick={() => handleSaveGammaUrl(ws, "")}
                          className="px-3 py-1.5 text-xs border border-red-700 text-red-400 hover:bg-red-900/30"
                        >
                          移除
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                      在 Gamma 建好學習單後，點右上角「Share」→ 複製連結貼到這裡
                    </p>
                  </div>
                )}
                {editingGammaAnswerId === ws.id && (
                  <div className="mt-3 space-y-3 border-t border-emerald-700/50 pt-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-emerald-300">GAMMA 答題 JSON 設定</h3>
                        <p className="mt-1 text-xs text-[var(--terminal-primary-dim)]">
                          可修改題目、工具、上傳格式、prompt 生成前門檻與繳交審核條件。
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingGammaAnswerId(null);
                          setGammaAnswerJsonInput("");
                          setGammaAnswerJsonError("");
                        }}
                        className="shrink-0 border border-[var(--terminal-primary-dim)] px-3 py-1.5 text-xs hover:bg-[var(--terminal-primary)]/10"
                      >
                        關閉
                      </button>
                    </div>
                    {(() => {
                      const parsed = parseGammaAnswerEditorJson(gammaAnswerJsonInput);
                      if (!parsed.config) {
                        return (
                          <div className="border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
                            JSON 格式錯誤，修正後會恢復可視化表單：{parsed.error}
                          </div>
                        );
                      }
                      return (
                        <GammaAnswerVisualEditor
                          config={parsed.config}
                          onChange={(nextConfig) =>
                            updateGammaAnswerEditorConfig(() => nextConfig)
                          }
                        />
                      );
                    })()}
                    <details className="border border-emerald-800/70 bg-black/30">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-emerald-300">
                        進階 JSON
                      </summary>
                      <textarea
                        value={gammaAnswerJsonInput}
                        onChange={(event) => {
                          setGammaAnswerJsonInput(event.target.value);
                          setGammaAnswerJsonError("");
                        }}
                        spellCheck={false}
                        className="h-96 w-full resize-y border-t border-emerald-800 bg-black/40 p-3 font-mono text-xs leading-relaxed text-emerald-50 outline-none focus:border-emerald-400"
                      />
                    </details>
                    {gammaAnswerJsonError && (
                      <pre className="max-h-36 overflow-auto whitespace-pre-wrap border border-red-700 bg-red-950/40 p-3 text-xs text-red-200">
                        {gammaAnswerJsonError}
                      </pre>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-[var(--terminal-primary-dim)]">
                        圖片、音樂與影片會先做本地防呆與 AI 題意審查；媒體繳交只驗證附件與簽章。
                      </div>
                      <button
                        onClick={() => handleSaveGammaAnswerJson(ws)}
                        disabled={savingGammaAnswerJson}
                        className="shrink-0 border border-emerald-400 bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        {savingGammaAnswerJson ? "儲存中..." : "儲存 JSON"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* HTML Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="flex items-center justify-between p-3 bg-[var(--terminal-bg)] border-b border-[var(--terminal-primary)]">
            <span className="text-sm text-[var(--terminal-primary)]">樣式版本預覽</span>
            <button
              onClick={() => setPreviewHtml(null)}
              className="px-3 py-1 text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] border border-[var(--terminal-primary-dim)]"
            >
              關閉預覽
            </button>
          </div>
          <iframe
            srcDoc={previewHtml.html}
            className="flex-1 w-full bg-white"
            title="Worksheet Preview"
            sandbox="allow-same-origin"
          />
        </div>
      )}

      {showUpload && (
        <UploadModal
          classrooms={classrooms}
          userId={user!.id}
          userName={user!.displayName || user!.username}
          onClose={() => setShowUpload(false)}
          onSaved={() => { setShowUpload(false); loadData(); }}
        />
      )}

      {showGammaAnswerCreate && (
        <GammaAnswerCreateModal
          classrooms={classrooms}
          worksheets={worksheets}
          userId={user!.id || user!.username}
          onClose={() => setShowGammaAnswerCreate(false)}
          onSaved={() => { setShowGammaAnswerCreate(false); loadData(); }}
        />
      )}

      {assetManagerWorksheet && user && (
        <LabToolAssetManager
          worksheet={assetManagerWorksheet}
          adminUserId={user.id}
          onClose={() => setAssetManagerWorksheet(null)}
        />
      )}
    </div>
  );
}

type AdminLabToolAsset = {
  worksheetId: string;
  kind: "image" | "music" | "video";
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  prompt: string;
  taskId: string;
  task: string;
  signatureStatus: "signed" | "missing";
  indexed: boolean;
  assetUrl: string;
};

const ASSET_KIND_LABEL = { image: "圖片", music: "音樂", video: "影片" } as const;

function formatAssetSize(size: number) {
  if (!size) return "未知大小";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function LabToolAssetManager({
  worksheet,
  adminUserId,
  onClose,
}: {
  worksheet: Worksheet;
  adminUserId: string;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<AdminLabToolAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState("");
  const [message, setMessage] = useState("");
  const [savingLimits, setSavingLimits] = useState(false);
  const [assetCacheLimits, setAssetCacheLimits] = useState(() => ({
    image: worksheet.gammaAnswerConfig?.assetCacheLimits?.image ?? 10,
    music: worksheet.gammaAnswerConfig?.assetCacheLimits?.music ?? 3,
    video: worksheet.gammaAnswerConfig?.assetCacheLimits?.video ?? 5,
  }));

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ worksheetId: worksheet.id, adminUserId });
      const response = await fetch(`/api/admin/lab-tool-assets?${query.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "素材清單讀取失敗");
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [adminUserId, worksheet.id]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const saveAssetCacheLimits = async () => {
    const config = resolveGammaAnswerWorksheetConfig(worksheet);
    if (!config) {
      setMessage("找不到這份學習單的 JSON 設定，無法儲存素材上限。");
      return;
    }
    setSavingLimits(true);
    setMessage("");
    try {
      await saveWorksheet({
        ...worksheet,
        updatedAt: new Date().toISOString(),
        gammaAnswerConfig: {
          ...config,
          assetCacheLimits,
        },
      });
      setMessage("素材上限已儲存。達到上限後，學生生成時會回傳已保存的同類素材。 ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingLimits(false);
    }
  };

  const deleteAssets = async (params: {
    scope: "asset" | "kind" | "worksheet";
    kind?: AdminLabToolAsset["kind"];
    fileName?: string;
  }) => {
    const label = params.scope === "asset"
      ? params.fileName
      : params.scope === "kind"
      ? `${ASSET_KIND_LABEL[params.kind!]}全部素材`
      : `${worksheet.id} 全部生成素材`;
    if (!confirm(`確定刪除 ${label}？這會同步刪除雲端與本機快取，無法復原。`)) return;
    setDeleting(`${params.scope}:${params.kind || "all"}:${params.fileName || "all"}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/lab-tool-assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminUserId,
          worksheetId: worksheet.id,
          ...params,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) {
        throw new Error(data.error || "素材刪除失敗");
      }
      const failedCount = Array.isArray(data.failed) ? data.failed.length : 0;
      setMessage(
        `刪除完成：實際刪除 ${data.deleted || 0} 筆` +
          (failedCount
            ? `，${data.failed
                .slice(0, 3)
                .map((item: { fileName?: string; error?: string }) => `${item.fileName || "項目"}：${item.error || "未完成"}`)
                .join("；")}`
            : "，沒有失敗項目。")
      );
      await loadAssets();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting("");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 p-4">
      <div className="my-8 w-full max-w-6xl border-2 border-orange-600 bg-[var(--terminal-bg)] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-800 p-4">
          <div>
            <h2 className="font-bold text-orange-200">管理生成素材 · {worksheet.id}</h2>
            <p className="mt-1 text-xs text-[var(--terminal-primary-dim)]">{worksheet.title}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => deleteAssets({ scope: "worksheet" })}
              disabled={!!deleting || assets.length === 0}
              className="border border-red-600 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-40"
            >
              清空整份學習單
            </button>
            <button type="button" onClick={onClose} className="border border-orange-700 px-3 py-2 text-xs text-orange-200">
              關閉
            </button>
          </div>
        </div>

        <div className="space-y-5 p-4">
          {message && <div className="border border-orange-800 bg-orange-950/20 p-3 text-sm text-orange-100">{message}</div>}
          <section className="border border-cyan-800/80 bg-cyan-950/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-cyan-200">每種素材的保存上限</h3>
                <p className="mt-1 text-xs text-[var(--terminal-primary-dim)]">
                  已保存筆數大於等於上限時，不再呼叫外部生成 API，直接回傳已保存的對應素材。
                </p>
              </div>
              <button
                type="button"
                onClick={saveAssetCacheLimits}
                disabled={savingLimits}
                className="border border-cyan-500 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-900/30 disabled:opacity-40"
              >
                {savingLimits ? "儲存中..." : "儲存上限"}
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(["image", "music", "video"] as const).map((kind) => (
                <label key={kind} className="block">
                  <span className="mb-1 block text-xs font-bold text-cyan-100">
                    {ASSET_KIND_LABEL[kind]}上限（目前 {assets.filter((asset) => asset.kind === kind).length} 筆）
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={assetCacheLimits[kind]}
                    onChange={(event) =>
                      setAssetCacheLimits((current) => ({
                        ...current,
                        [kind]: Math.max(1, Math.min(100, Number(event.target.value) || 1)),
                      }))
                    }
                    className="w-full border border-cyan-800 bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-cyan-400"
                  />
                </label>
              ))}
            </div>
          </section>
          {loading ? (
            <div className="py-12 text-center text-[var(--terminal-primary-dim)]">正在合併索引與 Storage 清單...</div>
          ) : assets.length === 0 ? (
            <div className="py-12 text-center text-[var(--terminal-primary-dim)]">這份學習單目前沒有生成素材。</div>
          ) : (
            (["image", "music", "video"] as const).map((kind) => {
              const kindAssets = assets.filter((asset) => asset.kind === kind);
              return (
                <section key={kind} className="border border-orange-900/70 bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-bold text-orange-200">{ASSET_KIND_LABEL[kind]} · {kindAssets.length} 筆</h3>
                    <button
                      type="button"
                      onClick={() => deleteAssets({ scope: "kind", kind })}
                      disabled={!!deleting || kindAssets.length === 0}
                      className="border border-red-800 px-3 py-1.5 text-xs text-red-300 disabled:opacity-40"
                    >
                      清空{ASSET_KIND_LABEL[kind]}
                    </button>
                  </div>
                  {kindAssets.length === 0 ? (
                    <p className="text-sm text-[var(--terminal-primary-dim)]">沒有{ASSET_KIND_LABEL[kind]}素材。</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {kindAssets.map((asset) => (
                        <article key={`${kind}:${asset.fileName}`} className="overflow-hidden border border-[var(--terminal-primary-dim)]/60 bg-black/30">
                          <div className="flex h-44 items-center justify-center bg-black/60 p-2">
                            {kind === "image" ? (
                              <img src={asset.assetUrl} alt={asset.fileName} className="max-h-full max-w-full object-contain" />
                            ) : kind === "music" ? (
                              <audio src={asset.assetUrl} controls className="w-full" />
                            ) : (
                              <video src={asset.assetUrl} controls className="max-h-full max-w-full" />
                            )}
                          </div>
                          <div className="space-y-1.5 p-3 text-xs">
                            <div className="break-all font-mono text-orange-100">{asset.fileName}</div>
                            <div className="text-[var(--terminal-primary-dim)]">
                              {formatAssetSize(asset.size)} · {asset.createdAt ? new Date(asset.createdAt).toLocaleString("zh-TW") : "日期未知"}
                            </div>
                            <div>題目：{asset.task || asset.taskId || "索引缺失"}</div>
                            <div className="line-clamp-3">Prompt：{asset.prompt || "索引缺失"}</div>
                            <div className="flex flex-wrap gap-1">
                              <span className={asset.signatureStatus === "signed" ? "text-emerald-300" : "text-yellow-300"}>
                                簽章：{asset.signatureStatus === "signed" ? "有" : "缺少"}
                              </span>
                              {!asset.indexed && <span className="text-red-300">· 孤兒檔案</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteAssets({ scope: "asset", kind, fileName: asset.fileName })}
                              disabled={!!deleting}
                              className="mt-2 w-full border border-red-700 px-3 py-2 font-bold text-red-300 disabled:opacity-40"
                            >
                              單筆刪除
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function OptionalNumberInput({
  label,
  value,
  min = 0,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">{label}</span>
      <input
        type="number"
        min={min}
        value={value ?? ""}
        onChange={(event) => onChange(numberOrUndefined(event.target.value))}
        className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
      />
    </label>
  );
}

function GammaAnswerVisualEditor({
  config,
  onChange,
}: {
  config: GammaAnswerWorksheetConfig;
  onChange: (config: GammaAnswerWorksheetConfig) => void;
}) {
  const updateConfig = (patch: Partial<GammaAnswerWorksheetConfig>) => {
    onChange({ ...config, ...patch });
  };

  const updateQuestion = (
    questionIndex: number,
    updater: (question: GammaAnswerQuestionConfig) => GammaAnswerQuestionConfig
  ) => {
    onChange(updateQuestionInConfig(config, questionIndex, updater));
  };

  const patchQuestion = (questionIndex: number, patch: Partial<GammaAnswerQuestionConfig>) => {
    updateQuestion(questionIndex, (question) => ({ ...question, ...patch }));
  };

  const patchCriteria = (
    questionIndex: number,
    patch: NonNullable<GammaAnswerQuestionConfig["reviewCriteria"]>
  ) => {
    updateQuestion(questionIndex, (question) => {
      const reviewCriteria = { ...(question.reviewCriteria || {}), ...patch };
      return {
        ...question,
        reviewCriteria,
        textMinimumLength: reviewCriteria.minLength,
        textMaximumLength: reviewCriteria.maxLength,
        textRequiresThreePoints: reviewCriteria.requiresThreePoints,
        textKeywords: reviewCriteria.keywords,
        textMinimumKeywordMatches: reviewCriteria.minimumKeywordMatches,
      };
    });
  };

  const currentReadChecks = (question: GammaAnswerQuestionConfig) =>
    Array.isArray(question.readChecks)
      ? [...question.readChecks]
      : question.readCheck
      ? [question.readCheck]
      : [];

  const patchReadCheck = (
    questionIndex: number,
    readCheckIndex: number,
    patch: Partial<GammaAnswerReadCheck>
  ) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      const base = readChecks[readCheckIndex] || defaultReadCheckForQuestion(question.title, question.expectedKind);
      const options = patch.options || base.options;
      const rawAnswerIndex =
        typeof patch.answerIndex === "number" ? patch.answerIndex : base.answerIndex;
      const answerIndex = Math.min(Math.max(rawAnswerIndex, 0), Math.max(options.length - 1, 0));

      readChecks[readCheckIndex] = {
          ...base,
          ...patch,
          options,
          answerIndex,
      };
      return {
        ...question,
        readCheck: readChecks[0],
        readChecks,
      };
    });
  };

  const changeReadCheckType = (
    questionIndex: number,
    readCheckIndex: number,
    type: "choice" | "text"
  ) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      const base = readChecks[readCheckIndex];
      readChecks[readCheckIndex] =
        type === "text"
          ? {
              ...base,
              type,
              options: [],
              answerIndex: 0,
              acceptedAnswers:
                base.acceptedAnswers?.length ? base.acceptedAnswers : ["請填寫可接受答案"],
              matchMode: base.matchMode || "exact",
            }
          : {
              ...base,
              type,
              options:
                base.options.length >= 2
                  ? base.options
                  : defaultReadCheckForQuestion(question.title, question.expectedKind).options,
              answerIndex: 0,
            };
      return { ...question, readCheck: readChecks[0], readChecks };
    });
  };

  const updateReadCheckOption = (
    questionIndex: number,
    readCheckIndex: number,
    optionIndex: number,
    value: string
  ) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      const base = readChecks[readCheckIndex];
      const options = base.options.map((option, index) =>
        index === optionIndex ? value : option
      );
      readChecks[readCheckIndex] = { ...base, options };
      return { ...question, readCheck: readChecks[0], readChecks };
    });
  };

  const addReadCheckOption = (questionIndex: number, readCheckIndex: number) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      const base = readChecks[readCheckIndex];
      if (base.options.length >= 4) return question;
      readChecks[readCheckIndex] = { ...base, options: [...base.options, "新的混淆選項"] };
      return { ...question, readCheck: readChecks[0], readChecks };
    });
  };

  const removeReadCheckOption = (questionIndex: number, readCheckIndex: number, optionIndex: number) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      const base = readChecks[readCheckIndex];
      if (base.options.length <= 2) return question;
      const options = base.options.filter((_, index) => index !== optionIndex);
      const answerIndex =
        base.answerIndex === optionIndex
          ? 0
          : base.answerIndex > optionIndex
            ? base.answerIndex - 1
            : base.answerIndex;
      readChecks[readCheckIndex] = { ...base, options, answerIndex: Math.min(answerIndex, options.length - 1) };
      return { ...question, readCheck: readChecks[0], readChecks };
    });
  };

  const addReadCheck = (questionIndex: number) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      readChecks.push(defaultReadCheckForQuestion(question.title, question.expectedKind));
      return { ...question, readCheck: readChecks[0], readChecks };
    });
  };

  const removeReadCheck = (questionIndex: number, readCheckIndex: number) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      readChecks.splice(readCheckIndex, 1);
      return { ...question, readCheck: readChecks[0], readChecks };
    });
  };

  const moveReadCheck = (
    questionIndex: number,
    readCheckIndex: number,
    direction: -1 | 1
  ) => {
    updateQuestion(questionIndex, (question) => {
      const readChecks = currentReadChecks(question);
      const target = readCheckIndex + direction;
      if (target < 0 || target >= readChecks.length) return question;
      [readChecks[readCheckIndex], readChecks[target]] = [
        readChecks[target],
        readChecks[readCheckIndex],
      ];
      return { ...question, readCheck: readChecks[0], readChecks };
    });
  };

  const changeQuestionModule = (
    questionIndex: number,
    expectedKind: GammaAnswerExpectedKind
  ) => {
    const defaults = GAMMA_ANSWER_MODULES[expectedKind];
    updateQuestion(questionIndex, (question) => {
      const reviewCriteria = {
        ...defaults.reviewCriteria,
        aiReviewMode: question.reviewCriteria?.aiReviewMode || defaults.reviewCriteria.aiReviewMode,
      };
      return {
        ...question,
        expectedKind,
        toolId: defaults.toolId,
        accept: defaults.accept,
        uploadLabel: defaults.uploadLabel,
        reviewHint: defaults.reviewHint,
        placeholder: expectedKind === "text" ? question.placeholder || defaults.placeholder : "",
        reviewCriteria,
        textMinimumLength: reviewCriteria.minLength,
        textMaximumLength: reviewCriteria.maxLength,
        textRequiresThreePoints: reviewCriteria.requiresThreePoints,
        textKeywords: reviewCriteria.keywords,
        textMinimumKeywordMatches: reviewCriteria.minimumKeywordMatches,
      };
    });
  };

  const addQuestion = () => {
    onChange({
      ...config,
      questions: [
        ...config.questions,
        createGammaAnswerQuestion(config.questions.length, config.id),
      ],
    });
  };

  const removeQuestion = (questionIndex: number) => {
    if (config.questions.length <= 1) {
      alert("至少需要保留一題。");
      return;
    }
    onChange({
      ...config,
      questions: config.questions.filter((_, index) => index !== questionIndex),
    });
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-3 border border-emerald-800/70 bg-emerald-950/15 p-3 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">學習單標題</span>
          <input
            value={config.title}
            onChange={(event) => updateConfig({ title: event.target.value })}
            className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">Gamma 連結</span>
          <input
            value={config.gammaUrl}
            onChange={(event) =>
              updateConfig({ gammaUrl: event.target.value, gammaFallbackUrl: event.target.value })
            }
            className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">系列</span>
            <input
              value={config.semester}
              onChange={(event) => updateConfig({ semester: event.target.value })}
              className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">週次</span>
            <NumberField
              min={1}
              max={40}
              value={config.week}
              onChange={(value) => updateConfig({ week: value })}
              className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
            />
          </label>
        </div>
      </section>

      <div className="flex items-center justify-between border border-emerald-800/70 bg-black/20 px-3 py-2">
        <div className="text-sm font-bold text-emerald-200">
          題目內容 · {config.questions.length} 題
        </div>
        <button
          type="button"
          onClick={addQuestion}
          className="border border-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-900/20"
        >
          + 新增題目
        </button>
      </div>

      {config.questions.map((question, questionIndex) => {
        const criteria = {
          ...(question.reviewCriteria || {}),
          aiReviewMode: question.reviewCriteria?.aiReviewMode || "local-only",
        };
        const moduleLabel = GAMMA_ANSWER_MODULES[question.expectedKind]?.label || question.expectedKind;
        const isText = question.expectedKind === "text";
        const readChecks = currentReadChecks(question);
        return (
          <section
            key={question.id || questionIndex}
            className="space-y-3 border border-[var(--terminal-primary-dim)]/70 bg-black/20 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-emerald-300">
                  第 {questionIndex + 1} 題 · {moduleLabel}
                </div>
                <div className="text-xs text-[var(--terminal-primary-dim)]">taskId: {question.taskId}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-28">
                  <NumberField
                    min={0}
                    max={999}
                    value={question.coins}
                    onChange={(value) => patchQuestion(questionIndex, { coins: value })}
                    className="w-full border border-yellow-500/60 bg-yellow-950/20 px-3 py-2 text-right text-sm font-bold text-yellow-200 outline-none focus:border-yellow-300"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeQuestion(questionIndex)}
                  className="border border-red-700 px-2 py-2 text-xs text-red-300 hover:bg-red-900/30"
                >
                  移除
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">作答模組</span>
                <select
                  value={question.expectedKind}
                  onChange={(event) =>
                    changeQuestionModule(questionIndex, event.target.value as GammaAnswerExpectedKind)
                  }
                  className="w-full border border-emerald-700 bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
                >
                  {Object.entries(GAMMA_ANSWER_MODULES).map(([kind, module]) => (
                    <option key={kind} value={kind}>
                      {module.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">回主頁工具</span>
                <select
                  value={question.toolId}
                  onChange={(event) =>
                    patchQuestion(questionIndex, { toolId: event.target.value as GammaAnswerToolId })
                  }
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
                >
                  <option value="terminal">Lab Terminal</option>
                  <option value="image">Lab Image</option>
                  <option value="music">Lab Music</option>
                  <option value="video">Lab Video</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">題號顯示</span>
                <input
                  value={question.code}
                  onChange={(event) => patchQuestion(questionIndex, { code: event.target.value })}
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">題目標題</span>
                <input
                  value={question.title}
                  onChange={(event) =>
                    patchQuestion(questionIndex, {
                      title: event.target.value,
                      label: event.target.value,
                    })
                  }
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">題目 ID</span>
                <input
                  value={question.id}
                  onChange={(event) => patchQuestion(questionIndex, { id: event.target.value })}
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs text-[var(--terminal-primary-dim)]">
                <span>題目內容</span>
                <span>{question.prompt.length} 字，可直接拉大欄位調整文字長度</span>
              </span>
              <textarea
                value={question.prompt}
                onChange={(event) => patchQuestion(questionIndex, { prompt: event.target.value })}
                rows={3}
                className="w-full resize-y border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm leading-relaxed text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
              />
            </label>

            <div className="space-y-3 border border-sky-700/70 bg-sky-950/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-sky-200">讀題小測（{readChecks.length} 題）</div>
                  <p className="mt-1 text-xs text-[var(--terminal-primary-dim)]">
                    本題通過後依序顯示，全部答對才會前往下一題。
                  </p>
                </div>
                <button type="button" onClick={() => addReadCheck(questionIndex)} className="border border-sky-500 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-900/30">
                  + 新增小測
                </button>
              </div>
              {readChecks.map((readCheck, readCheckIndex) => (
              <div key={readCheckIndex} className="grid gap-3 border border-sky-800/70 bg-sky-950/20 p-3 md:grid-cols-2">
              <div className="flex items-center justify-between md:col-span-2">
                <span className="text-xs font-bold text-sky-200">小測 {readCheckIndex + 1}</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => moveReadCheck(questionIndex, readCheckIndex, -1)} disabled={readCheckIndex === 0} className="border border-sky-700 px-2 py-1 text-xs text-sky-200 disabled:opacity-30">上移</button>
                  <button type="button" onClick={() => moveReadCheck(questionIndex, readCheckIndex, 1)} disabled={readCheckIndex === readChecks.length - 1} className="border border-sky-700 px-2 py-1 text-xs text-sky-200 disabled:opacity-30">下移</button>
                  <button type="button" onClick={() => removeReadCheck(questionIndex, readCheckIndex)} className="border border-red-700 px-2 py-1 text-xs text-red-300">移除小測</button>
                </div>
              </div>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">小測題目</span>
                <input
                  value={readCheck.question}
                  onChange={(event) =>
                    patchReadCheck(questionIndex, readCheckIndex, { question: event.target.value })
                  }
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">小測題型</span>
                <select
                  value={readCheck.type || "choice"}
                  onChange={(event) =>
                    changeReadCheckType(questionIndex, readCheckIndex, event.target.value as "choice" | "text")
                  }
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                >
                  <option value="choice">選擇題</option>
                  <option value="text">打字回答</option>
                </select>
              </label>
              {readCheck.type === "text" ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">比對方式</span>
                    <select
                      value={readCheck.matchMode || "exact"}
                      onChange={(event) =>
                        patchReadCheck(questionIndex, readCheckIndex, {
                          matchMode: event.target.value as "exact" | "includes",
                        })
                      }
                      className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                    >
                      <option value="exact">完整相符</option>
                      <option value="includes">答案包含關鍵詞即可</option>
                    </select>
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">可接受答案，一行一個</span>
                    <textarea
                      value={(readCheck.acceptedAnswers || []).join("\n")}
                      onChange={(event) =>
                        patchReadCheck(questionIndex, readCheckIndex, {
                          acceptedAnswers: event.target.value
                            .split(/\r?\n/)
                            .map((answer) => answer.trim())
                            .filter(Boolean),
                        })
                      }
                      rows={3}
                      className="w-full resize-y border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm leading-relaxed text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">正確答案</span>
                    <select
                      value={readCheck.answerIndex}
                      onChange={(event) =>
                        patchReadCheck(questionIndex, readCheckIndex, { answerIndex: Number(event.target.value) })
                      }
                      className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                    >
                      {readCheck.options.map((option, optionIndex) => (
                        <option key={`${optionIndex}:${option}`} value={optionIndex}>
                          選項 {optionIndex + 1}：{option || "未填寫"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => addReadCheckOption(questionIndex, readCheckIndex)}
                      disabled={readCheck.options.length >= 4}
                      className="border border-sky-500 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-900/30 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      + 新增選項
                    </button>
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    {readCheck.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="grid gap-2 md:grid-cols-[72px_1fr_auto]">
                        <div className={`flex items-center justify-center border px-2 text-xs font-bold ${
                          optionIndex === readCheck.answerIndex
                            ? "border-yellow-400 bg-yellow-950/30 text-yellow-200"
                            : "border-sky-800 bg-black/20 text-sky-200"
                        }`}>
                          選項 {optionIndex + 1}
                        </div>
                        <input
                          value={option}
                          onChange={(event) =>
                            updateReadCheckOption(questionIndex, readCheckIndex, optionIndex, event.target.value)
                          }
                          className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                        />
                        <button
                          type="button"
                          onClick={() => removeReadCheckOption(questionIndex, readCheckIndex, optionIndex)}
                          disabled={readCheck.options.length <= 2}
                          className="border border-red-700 px-3 py-2 text-xs text-red-300 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">答對回饋</span>
                <input
                  value={readCheck.successFeedback || ""}
                  onChange={(event) =>
                    patchReadCheck(questionIndex, readCheckIndex, { successFeedback: event.target.value })
                  }
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">答錯回饋</span>
                <input
                  value={readCheck.retryFeedback || ""}
                  onChange={(event) =>
                    patchReadCheck(questionIndex, readCheckIndex, { retryFeedback: event.target.value })
                  }
                  className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-sky-400"
                />
              </label>
              </div>
              ))}
            </div>

            {isText ? (
              <div className="grid gap-3 border border-cyan-800/60 bg-cyan-950/10 p-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">文字輸入框提示</span>
                  <input
                    value={question.placeholder}
                    onChange={(event) => patchQuestion(questionIndex, { placeholder: event.target.value })}
                    className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-cyan-400"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-3 border border-purple-800/60 bg-purple-950/10 p-3 md:grid-cols-4">
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">上傳按鈕文字</span>
                  <input
                    value={question.uploadLabel}
                    onChange={(event) => patchQuestion(questionIndex, { uploadLabel: event.target.value })}
                    className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-purple-400"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">瀏覽器 accept</span>
                  <input
                    value={question.accept}
                    onChange={(event) => patchQuestion(questionIndex, { accept: event.target.value })}
                    className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-purple-400"
                  />
                </label>
                <OptionalNumberInput
                  label="最少附件數"
                  value={criteria.minAttachments}
                  onChange={(value) => patchCriteria(questionIndex, { minAttachments: value })}
                />
                <OptionalNumberInput
                  label="最多附件數"
                  value={criteria.maxAttachments}
                  onChange={(value) => patchCriteria(questionIndex, { maxAttachments: value })}
                />
                <label className="block md:col-span-2">
                  <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">審核提醒</span>
                  <input
                    value={question.reviewHint}
                    onChange={(event) => patchQuestion(questionIndex, { reviewHint: event.target.value })}
                    className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm text-[var(--terminal-primary)] outline-none focus:border-purple-400"
                  />
                </label>
              </div>
            )}

          </section>
        );
      })}
    </div>
  );
}

function GammaAnswerCreateModal({
  classrooms,
  worksheets,
  userId,
  onClose,
  onSaved,
}: {
  classrooms: Classroom[];
  worksheets: Worksheet[];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<GammaAnswerWorksheetConfig>(() =>
    createGammaAnswerDraftConfig()
  );
  const markdownFileRef = useRef<HTMLInputElement>(null);
  const [worksheetId, setWorksheetId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [classIds, setClassIds] = useState<string[]>(
    classrooms[0] ? [classrooms[0].id] : []
  );
  const [savingMode, setSavingMode] = useState<"draft" | "publish" | null>(null);
  const [importedMarkdown, setImportedMarkdown] = useState("");
  const [error, setError] = useState("");
  const [importSummary, setImportSummary] = useState<{
    fileName: string;
    taskCount: number;
    warnings: string[];
    errors: string[];
  } | null>(null);

  const normalizedId = normalizeWorksheetId(
    worksheetId || buildGammaAnswerWorksheetId(config.semester, config.week)
  );
  const existingWorksheet = worksheets.find(
    (worksheet) => worksheet.id === normalizedId && !worksheet.isDeleted
  );

  const toggleClass = (classId: string) =>
    setClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );

  const handleConfigChange = (nextConfig: GammaAnswerWorksheetConfig) => {
    setConfig(nextConfig);
    if (!idTouched) {
      setWorksheetId(buildGammaAnswerWorksheetId(nextConfig.semester, nextConfig.week));
    }
  };

  const handleMarkdownFile = (file: File) => {
    setError("");
    if (!file.name.toLowerCase().endsWith(".md")) {
      setError("請選擇 .md Markdown 檔。");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const markdown = String(event.target?.result || "");
        const result = createGammaAnswerConfigFromMarkdown(markdown, file.name, config);
        setImportedMarkdown(markdown);
        setConfig(result.config);
        setWorksheetId(result.worksheetId);
        setIdTouched(false);
        setImportSummary({
          fileName: file.name,
          taskCount: result.parseResult.tasks.length,
          warnings: result.parseResult.warnings,
          errors: result.parseResult.errors,
        });
      } catch (readError) {
        setError(readError instanceof Error ? readError.message : String(readError));
      }
    };
    reader.onerror = () => setError("讀取 Markdown 檔案失敗。");
    reader.readAsText(file);
  };

  const handleSave = async (publish: boolean) => {
    setError("");
    if (!importedMarkdown.trim() || config.questions.length === 0) {
      setError("請先匯入一份包含任務的 Markdown 學習單。");
      return;
    }
    if (publish && !/^https:\/\/(?:www\.)?gamma\.app\/(?:docs|public|embed)\//i.test(config.gammaUrl.trim())) {
      setError("發布前請填入有效的 Gamma 網址；草稿可以先留空。");
      return;
    }
    if (classIds.length === 0) {
      setError("至少要選擇一個可見班級。");
      return;
    }

    let finalConfig: GammaAnswerWorksheetConfig;
    try {
      finalConfig = prepareGammaAnswerConfigForSave(config, worksheetId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      return;
    }

    const existing = worksheets.find(
      (worksheet) => worksheet.id === finalConfig.id && !worksheet.isDeleted
    );
    if (
      existing &&
      !confirm(`學習單 ${finalConfig.id} 已存在，是否覆蓋目前設定？`)
    ) {
      return;
    }

    setSavingMode(publish ? "publish" : "draft");
    try {
      const now = new Date().toISOString();
      const generated = gammaAnswerConfigToWorksheet(finalConfig);
      await saveWorksheet({
        ...generated,
        markdownContent: importedMarkdown,
        classId: classIds[0],
        classIds,
        isPublished: publish,
        publishedAt: publish ? existing?.publishedAt || now : null,
        createdAt: existing && existing.createdBy !== "system" ? existing.createdAt : now,
        createdBy: existing && existing.createdBy !== "system" ? existing.createdBy : userId,
        updatedAt: now,
        isDeleted: false,
        sourceFormat: "html",
        gammaUrl: finalConfig.gammaUrl,
        gammaAnswerConfig: finalConfig,
      });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="my-8 w-full max-w-5xl border-2 border-emerald-500 bg-[var(--terminal-bg)] text-[var(--terminal-primary)] shadow-2xl shadow-emerald-900/30">
        <div className="flex items-center justify-between border-b border-emerald-800/70 p-4">
          <div>
            <h2 className="text-lg font-bold">新增答題版學習單</h2>
            <p className="mt-1 text-xs text-[var(--terminal-primary-dim)]">
              設定內容、選擇班級，再儲存草稿或發布。
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xl text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)]"
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <div className="space-y-5 p-4">
          <section
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) handleMarkdownFile(file);
            }}
            className="border border-dashed border-emerald-600/80 bg-emerald-950/10 p-6 text-center"
          >
            <input
              ref={markdownFileRef}
              type="file"
              accept=".md,text/markdown,text/plain"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleMarkdownFile(file);
                event.currentTarget.value = "";
              }}
            />
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:justify-between sm:text-left">
              <div>
                <div className="text-sm font-bold text-emerald-200">拖放一份 Markdown 學習單</div>
                <p className="mt-1 text-xs text-[var(--terminal-primary-dim)]">
                  或按右側按鈕選檔。匯入後才會顯示學習單與題目編輯器。
                </p>
              </div>
              <button
                type="button"
                onClick={() => markdownFileRef.current?.click()}
                className="border border-emerald-500 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-900/20"
              >
                匯入 .md
              </button>
            </div>
            {importSummary && (
              <div className="mt-3 border border-emerald-800/70 bg-black/20 p-3 text-xs text-[var(--terminal-primary-dim)]">
                <div className="font-bold text-emerald-200">
                  已匯入 {importSummary.fileName}，抓到 {importSummary.taskCount} 個任務。
                </div>
                {importSummary.warnings.length > 0 && (
                  <div className="mt-2 text-yellow-300">
                    {importSummary.warnings.map((warning, index) => (
                      <div key={index}>警告：{warning}</div>
                    ))}
                  </div>
                )}
                {importSummary.errors.length > 0 && (
                  <div className="mt-2 text-red-300">
                    {importSummary.errors.map((parseError, index) => (
                      <div key={index}>未抓到任務：{parseError}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {importSummary && (
          <>
          <section className="grid gap-3 border border-[var(--terminal-primary-dim)]/70 bg-black/20 p-3 md:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--terminal-primary-dim)]">
                學習單 ID（例如 S3W01）
              </span>
              <input
                value={worksheetId}
                onChange={(event) => {
                  setIdTouched(true);
                  setWorksheetId(event.target.value);
                }}
                className="w-full border border-[var(--terminal-primary-dim)] bg-[var(--terminal-bg)] px-3 py-2 text-sm font-bold text-[var(--terminal-primary)] outline-none focus:border-emerald-400"
              />
              <p className="mt-1 text-xs text-[var(--terminal-primary-dim)]">
                實際保存 ID：{normalizedId || "尚未設定"}
                {existingWorksheet ? "，目前已有同 ID 學習單，儲存時會詢問是否覆蓋。" : ""}
              </p>
            </label>
            <button
              type="button"
              onClick={() => {
                setWorksheetId(buildGammaAnswerWorksheetId(config.semester, config.week));
                setIdTouched(false);
              }}
              className="self-end border border-emerald-600 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900/20"
            >
              依 S/W 產生 ID
            </button>
          </section>

          <section className="border border-cyan-800/70 bg-cyan-950/10 p-3">
            <div className="mb-2 text-sm font-bold text-cyan-200">可見班級</div>
            {classrooms.length === 0 ? (
              <p className="text-sm text-yellow-300">尚未建立班級，請先建立班級再新增學習單。</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {classrooms.map((classroom) => {
                  const checked = classIds.includes(classroom.id);
                  return (
                    <label
                      key={classroom.id}
                      className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm ${
                        checked
                          ? "border-cyan-400 bg-cyan-500/10 text-cyan-100"
                          : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] hover:border-cyan-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClass(classroom.id)}
                        className="accent-cyan-400"
                      />
                      <span className="truncate">{classroom.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <GammaAnswerVisualEditor
            config={config}
            onChange={handleConfigChange}
          />
          </>
          )}

          {error && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap border border-red-700 bg-red-950/40 p-3 text-xs text-red-200">
              {error}
            </pre>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-800/70 p-4">
          <p className="text-xs text-[var(--terminal-primary-dim)]">
            {importSummary
              ? "草稿可暫時不填 Gamma 網址；發布前必須補上有效網址。"
              : "請先匯入單一 Markdown 檔案。"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={!!savingMode}
              className="border border-[var(--terminal-primary-dim)] px-4 py-2 text-sm hover:bg-[var(--terminal-primary)]/10 disabled:opacity-50"
            >
              取消
            </button>
            {importSummary && (
              <>
                <button
                  onClick={() => handleSave(false)}
                  disabled={!!savingMode || classIds.length === 0}
                  className="border border-yellow-600 px-4 py-2 text-sm font-bold text-yellow-300 hover:bg-yellow-900/20 disabled:opacity-50"
                >
                  {savingMode === "draft" ? "儲存中..." : "儲存草稿"}
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={!!savingMode || classIds.length === 0}
                  className="border border-emerald-400 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {savingMode === "publish" ? "發布中..." : "儲存並發布"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Modal ────────────────────────────────────────

function UploadModal({
  classrooms,
  userId,
  userName,
  onClose,
  onSaved,
}: {
  classrooms: Classroom[];
  userId: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [markdown, setMarkdown] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [editedTasks, setEditedTasks] = useState<ParsedTask[]>([]);
  const [title, setTitle] = useState("");
  const [semester, setSemester] = useState("S1");
  const [week, setWeek] = useState(1);
  const [classIds, setClassIds] = useState<string[]>(classrooms[0] ? [classrooms[0].id] : []);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [gammaUrl, setGammaUrl] = useState("");

  const toggleClass = (cid: string) =>
    setClassIds((prev) => (prev.includes(cid) ? prev.filter((c) => c !== cid) : [...prev, cid]));

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".md")) {
      alert("請上傳 .md（Markdown）格式檔案");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setMarkdown(text);
      const result = parseWorksheetMarkdown(text);
      setParseResult(result);
      setEditedTasks(result.tasks.map((t) => ({ ...t })));
      const detectedTitle = extractWorksheetTitle(text);
      setTitle(detectedTitle);
      // Auto-detect semester/week from title or filename (e.g. "S5 W14")
      const detected = extractSemesterAndWeek(`${detectedTitle} ${file.name}`);
      if (detected.semester) setSemester(detected.semester);
      if (detected.week) setWeek(detected.week);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const updateTaskCoins = (idx: number, coins: number) => {
    setEditedTasks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, coins, coinsMissing: false } : t))
    );
  };

  const hasMissingCoins = editedTasks.some((t) => t.coinsMissing);

  const handleSave = async (publish: boolean) => {
    if (!title.trim() || classIds.length === 0 || editedTasks.length === 0) return;
    if (hasMissingCoins) {
      alert("請先補填所有缺少金幣數的任務");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const id = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const tasks: Task[] = editedTasks.map((t) => ({
      taskId: t.taskId,
      label: t.label,
      description: t.description,
      coins: t.coins,
      isOptional: t.isOptional,
    }));

    const worksheet: Worksheet = {
      id,
      title: title.trim(),
      semester,
      week,
      markdownContent: markdown,
      tasks,
      classId: classIds[0],
      classIds,
      isPublished: publish,
      publishedAt: publish ? now : null,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      styledHtmlUrl: null,
      styledHtmlGeneratedAt: null,
      styledHtmlStatus: "pending",
      sourceFormat: "markdown",
      gammaUrl: gammaUrl.trim() || null,
    };

    await saveWorksheet(worksheet);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-[var(--terminal-bg)] border-2 border-[var(--terminal-primary)] w-full max-w-3xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--terminal-primary-dim)]">
          <h2 className="font-bold text-lg">新增學習單</h2>
          <button onClick={onClose} className="text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)] text-xl">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Step 1: Upload */}
          {!parseResult && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/5"
                  : "border-[var(--terminal-primary-dim)]"
              }`}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <div className="text-4xl mb-3">📄</div>
              <p>拖放 .md 檔案到此處，或點擊選擇檔案</p>
              <p className="text-sm text-[var(--terminal-primary-dim)] mt-2">
                支援格式：### 任務 A｜任務名稱（10 金幣）
              </p>
            </div>
          )}

          {/* Step 2: Preview & Edit */}
          {parseResult && (
            <>
              {parseResult.errors.length > 0 && (
                <div className="border border-red-700 bg-red-900/20 p-3">
                  {parseResult.errors.map((e, i) => (
                    <p key={i} className="text-red-400 text-sm">⛔ {e}</p>
                  ))}
                  <button
                    onClick={() => { setParseResult(null); setMarkdown(""); }}
                    className="mt-2 text-xs text-[var(--terminal-primary-dim)] underline"
                  >
                    重新上傳
                  </button>
                </div>
              )}

              {parseResult.warnings.length > 0 && (
                <div className="border border-yellow-700 bg-yellow-900/20 p-3">
                  {parseResult.warnings.map((w, i) => (
                    <p key={i} className="text-yellow-400 text-sm">⚠️ {w}</p>
                  ))}
                </div>
              )}

              {parseResult.success && (
                <>
                  {/* Title & metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        標題
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 focus:border-[var(--terminal-primary)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        學期
                      </label>
                      <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 outline-none"
                      >
                        {["S1", "S2", "S3", "S4", "S5", "S6"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        週次
                      </label>
                      <NumberField
                        min={1}
                        max={30}
                        value={week}
                        onChange={setWeek}
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        可看見的班級（可多選）
                      </label>
                      {classrooms.length === 0 ? (
                        <p className="text-yellow-400 text-sm">
                          尚無班級，請先到班級管理建立班級
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            {classrooms.map((c) => {
                              const checked = classIds.includes(c.id);
                              return (
                                <label
                                  key={c.id}
                                  className={`flex items-center gap-2 px-3 py-2 border cursor-pointer text-sm ${
                                    checked
                                      ? "border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10 text-[var(--terminal-primary)]"
                                      : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleClass(c.id)}
                                    className="accent-[var(--terminal-primary)]"
                                  />
                                  <span className="truncate">{c.name}</span>
                                  {checked && classIds[0] === c.id && (
                                    <span className="ml-auto text-[10px] px-1 bg-[var(--terminal-primary)]/20 border border-[var(--terminal-primary-dim)]">
                                      主帶
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                            勾選的班級都看得到這份學習單；第一個勾選的為「主帶班級」（進度歸屬）。
                          </p>
                        </>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm text-[var(--terminal-primary-dim)] block mb-1">
                        Gamma 連結（選填）
                      </label>
                      <input
                        type="url"
                        value={gammaUrl}
                        onChange={(e) => setGammaUrl(e.target.value)}
                        placeholder="貼上 Gamma 分享連結，例：https://gamma.app/docs/xxxxx"
                        className="w-full bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] px-3 py-2 outline-none focus:border-purple-500"
                      />
                      <p className="text-xs text-[var(--terminal-primary-dim)] mt-1">
                        在 Gamma 建好漂亮版學習單後，複製分享連結貼到這裡。學生會優先看到 Gamma 版本。
                      </p>
                    </div>
                  </div>

                  {/* Task preview */}
                  <div>
                    <h3 className="font-bold mb-2">
                      解析結果：{editedTasks.length} 個任務
                    </h3>
                    <div className="space-y-2">
                      {editedTasks.map((task, idx) => (
                        <div
                          key={task.taskId}
                          className={`border p-3 ${
                            task.coinsMissing
                              ? "border-yellow-600 bg-yellow-900/10"
                              : "border-[var(--terminal-primary-dim)]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">
                                任務 {task.taskId}
                              </span>
                              {task.isOptional && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-400 border border-blue-700">
                                  選修
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <NumberField
                                min={0}
                                max={9999}
                                value={task.coins}
                                onChange={(v) => updateTaskCoins(idx, v)}
                                className={`w-20 bg-[var(--terminal-bg)] border px-2 py-1 text-right outline-none ${
                                  task.coinsMissing
                                    ? "border-yellow-600 text-yellow-400"
                                    : "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)]"
                                }`}
                              />
                              <span className="text-sm">金幣</span>
                            </div>
                          </div>
                          <p className="text-xs text-[var(--terminal-primary-dim)]">
                            {task.label}
                          </p>
                          {task.description && (
                            <p className="text-xs text-[var(--terminal-primary-dim)] mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-sm text-[var(--terminal-primary-dim)]">
                      總金幣：{editedTasks.reduce((s, t) => s + t.coins, 0)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-[var(--terminal-primary-dim)]">
                    <button
                      onClick={() => { setParseResult(null); setMarkdown(""); }}
                      className="text-sm text-[var(--terminal-primary-dim)] hover:text-[var(--terminal-primary)]"
                    >
                      重新上傳
                    </button>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSave(false)}
                        disabled={saving || classIds.length === 0 || hasMissingCoins}
                        className="px-4 py-2 border border-[var(--terminal-primary-dim)] hover:bg-[var(--terminal-primary)]/10 disabled:opacity-40"
                      >
                        {saving ? "儲存中..." : "儲存草稿"}
                      </button>
                      <button
                        onClick={() => handleSave(true)}
                        disabled={saving || classIds.length === 0 || hasMissingCoins}
                        className="px-4 py-2 bg-[var(--terminal-primary)] text-[var(--terminal-bg)] font-bold hover:opacity-90 disabled:opacity-40"
                      >
                        {saving ? "儲存中..." : "儲存並發布"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
