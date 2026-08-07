import {
  findGammaAnswerQuestion,
  resolveGammaAnswerWorksheetConfig,
} from "@/config/gammaAnswerWorksheets";
import { getWorksheet } from "@/lib/firestore";
import { requireLabToolWorksheetId } from "@/server/labToolCache";
import type { GammaAnswerPromptReviewCriteria } from "@/types/GammaAnswerWorksheet";

export type LabToolWorksheetMode = "text" | "image" | "music" | "video";

const TOOL_MODE_BY_ID = {
  terminal: "text",
  image: "image",
  music: "music",
  video: "video",
} as const;

function sessionTitle(semester: string, week: number, title: string) {
  const prefix = `${semester} W${String(week).padStart(2, "0")}`;
  const titleWithoutPrefix = title.replace(/^S\d+\s*W\d+\s*[｜|-]\s*/i, "").trim();
  return `${prefix}｜${titleWithoutPrefix || title}`;
}

export interface LabToolWorksheetContext {
  worksheetId: string;
  sessionId: string;
  sessionTitle: string;
  courseId: string;
  courseTitle: string;
  shortTitle: string;
  semester: string;
  week: number;
  questionId: string;
  taskId: string;
  task: string;
  toolId: string;
  toolPrompt: string;
  promptReviewCriteria?: GammaAnswerPromptReviewCriteria;
  legacyReviewHint?: string;
  expectedKind: string;
  assetCacheLimit?: number;
}

/** Resolves generation context from the saved worksheet, never from request copy. */
export async function resolveLabToolWorksheetContext(params: {
  worksheetId?: string;
  taskId?: string;
  mode: LabToolWorksheetMode;
}): Promise<LabToolWorksheetContext> {
  const worksheetId = requireLabToolWorksheetId(params.worksheetId);
  const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
  if (!taskId) throw new Error("請從學習單開啟對應題目的 Lab Terminal。");

  const worksheet = await getWorksheet(worksheetId);
  const config = resolveGammaAnswerWorksheetConfig(worksheet);
  if (!worksheet || !worksheet.isPublished || !config) {
    throw new Error("找不到可使用的學習單設定。");
  }

  const question = findGammaAnswerQuestion(config, taskId);
  if (!question) throw new Error("這個題目不屬於目前的學習單。");

  if (TOOL_MODE_BY_ID[question.toolId] !== params.mode) {
    throw new Error("請使用學習單指定的生成工具。");
  }

  const resolvedWorksheetId = requireLabToolWorksheetId(config.id || worksheet.id);
  return {
    worksheetId: resolvedWorksheetId,
    sessionId: `labtool_${resolvedWorksheetId}_${config.storageVersion}`
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 120),
    sessionTitle: sessionTitle(config.semester, config.week, config.title),
    courseId: config.courseId,
    courseTitle: config.title,
    shortTitle: config.shortTitle,
    semester: config.semester,
    week: config.week,
    questionId: question.id,
    taskId: question.taskId,
    task: question.title || question.label,
    toolId: question.toolId,
    toolPrompt: question.prompt,
    promptReviewCriteria: question.promptReviewCriteria,
    legacyReviewHint: question.reviewBrief
      ? [
          question.reviewBrief.task,
          question.reviewBrief.expectedOutput,
          ...(question.reviewBrief.mustInclude || []),
        ]
          .filter(Boolean)
          .join("；")
      : undefined,
    expectedKind: question.expectedKind,
    assetCacheLimit:
      params.mode === "text" ? undefined : config.assetCacheLimits?.[params.mode],
  };
}
