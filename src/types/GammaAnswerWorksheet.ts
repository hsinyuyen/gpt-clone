export type GammaAnswerExpectedKind = "text" | "image" | "audio" | "video";
export type GammaAnswerToolId = "terminal" | "image" | "music" | "video";
export type GammaAnswerAiReviewMode = "local-only" | "after-local-rules" | "always";

export interface GammaAnswerReviewCriteria {
  minLength?: number;
  maxLength?: number;
  requiresThreePoints?: boolean;
  keywords?: string[];
  minimumKeywordMatches?: number;
  minAttachments?: number;
  maxAttachments?: number;
  allowedMimeTypes?: string[];
  aiReviewMode?: GammaAnswerAiReviewMode;
}

export interface GammaAnswerReviewBrief {
  task: string;
  expectedOutput: string;
  mustInclude: string[];
  rejectIf: string[];
}

export interface GammaAnswerQuestionConfig {
  id: string;
  taskId: string;
  code: string;
  label: string;
  title: string;
  prompt: string;
  toolPrompt: string;
  placeholder: string;
  toolId: GammaAnswerToolId;
  expectedKind: GammaAnswerExpectedKind;
  coins: number;
  accept: string;
  uploadLabel: string;
  reviewHint: string;
  reviewBrief?: GammaAnswerReviewBrief;
  reviewCriteria?: GammaAnswerReviewCriteria;
  textMinimumLength?: number;
  textMaximumLength?: number;
  textRequiresThreePoints?: boolean;
  textKeywords?: string[];
  textMinimumKeywordMatches?: number;
}

export interface GammaAnswerWorksheetConfig {
  schemaVersion?: number;
  id: string;
  courseId: string;
  title: string;
  shortTitle: string;
  semester: string;
  week: number;
  gammaUrl: string;
  gammaFallbackUrl: string;
  source: string;
  storageVersion: string;
  draftField: "gammaAnswerDraft";
  mediaAccessKey: string;
  questions: GammaAnswerQuestionConfig[];
}
