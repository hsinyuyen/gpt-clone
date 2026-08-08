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

export interface GammaAnswerPromptReviewCriteria {
  passConditions: string[];
  minimumCharacterMatchRatio?: number;
}

export type GammaAnswerReadCheckType = "choice" | "text";
export type GammaAnswerReadCheckMatchMode = "exact" | "includes";

export interface GammaAnswerReadCheck {
  type?: GammaAnswerReadCheckType;
  question: string;
  options: string[];
  answerIndex: number;
  acceptedAnswers?: string[];
  matchMode?: GammaAnswerReadCheckMatchMode;
  successFeedback?: string;
  retryFeedback?: string;
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
  readCheck?: GammaAnswerReadCheck;
  readChecks?: GammaAnswerReadCheck[];
  reviewBrief?: GammaAnswerReviewBrief;
  promptReviewCriteria?: GammaAnswerPromptReviewCriteria;
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
  /** Per-worksheet retained asset limits. Omit a kind to use its server default. */
  assetCacheLimits?: Partial<Record<"image" | "music" | "video", number>>;
  questions: GammaAnswerQuestionConfig[];
}
