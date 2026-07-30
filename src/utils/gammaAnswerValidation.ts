type ReviewBriefLike = {
  task?: string;
  expectedOutput?: string;
  mustInclude?: string[];
  rejectIf?: string[];
};

type TextReviewCriteriaLike = {
  minLength?: number;
  maxLength?: number;
  requiresThreePoints?: boolean;
  keywords?: string[];
  minimumKeywordMatches?: number;
};

export type GammaTextValidationQuestion = {
  title?: string;
  label?: string;
  prompt?: string;
  toolPrompt?: string;
  placeholder?: string;
  reviewBrief?: ReviewBriefLike;
  reviewCriteria?: TextReviewCriteriaLike;
  textMinimumLength?: number;
  textMaximumLength?: number;
  textRequiresThreePoints?: boolean;
  textKeywords?: string[];
  textMinimumKeywordMatches?: number;
};

type GammaTextValidationOptions = {
  maxReviewChars?: number;
};

const DIRECT_COPY_MIN_CHARS = 12;
const ENGLISH_ONLY_MIN_LATIN_CHARS = 16;
const ENGLISH_DOMINATED_MIN_LATIN_CHARS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanOrUndefined(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : undefined;
}

function textLength(text: string) {
  return Array.from(text).length;
}

function compactForCopyCheck(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]/g, "");
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0;
}

function languageStats(text: string) {
  const cjk = countMatches(text, /[\u3400-\u9fff]/g);
  const latin = countMatches(text, /[a-z]/gi);
  const digits = countMatches(text, /[0-9]/g);
  const meaningful = cjk + latin + digits;
  return {
    cjk,
    latin,
    latinRatio: meaningful > 0 ? latin / meaningful : 0,
  };
}

function isEnglishDominatedAnswer(text: string) {
  const stats = languageStats(text);
  return (
    (stats.latin >= ENGLISH_ONLY_MIN_LATIN_CHARS && stats.cjk < 8) ||
    (stats.latin >= ENGLISH_DOMINATED_MIN_LATIN_CHARS &&
      stats.latinRatio >= 0.72 &&
      stats.cjk < 12)
  );
}

function collectCopySources(question: GammaTextValidationQuestion) {
  const brief = isRecord(question.reviewBrief) ? question.reviewBrief : {};
  return [
    question.title,
    question.label,
    question.prompt,
    question.toolPrompt,
    question.placeholder,
    brief.task,
    brief.expectedOutput,
    ...(stringArray(brief.mustInclude) || []),
    ...(stringArray(brief.rejectIf) || []),
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isCopiedFromQuestion(text: string, question: GammaTextValidationQuestion) {
  const answer = compactForCopyCheck(text);
  if (answer.length < DIRECT_COPY_MIN_CHARS) return false;

  return collectCopySources(question).some((sourceText) => {
    const source = compactForCopyCheck(sourceText);
    if (source.length < DIRECT_COPY_MIN_CHARS) return false;
    if (source.includes(answer)) return true;
    return (
      answer.includes(source) &&
      source.length >= DIRECT_COPY_MIN_CHARS &&
      source.length / Math.max(answer.length, 1) >= 0.65
    );
  });
}

function countKeywordMatches(text: string, keywords: string[]) {
  const normalized = text.normalize("NFKC").toLowerCase();
  return keywords.filter((keyword) => {
    const target = keyword.normalize("NFKC").toLowerCase().trim();
    return target.length > 0 && normalized.includes(target);
  }).length;
}

function countAnswerPoints(text: string) {
  const numberedMarkers =
    text.match(/(^|\n|\s)(\d+[\.\、\)]|[一二三四五六七八九十][\.\、\)]|[-*•])/g)?.length || 0;
  const linePoints = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4).length;
  const sentencePoints = text
    .split(/[。！？!?；;]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 4).length;
  return Math.max(numberedMarkers, linePoints, sentencePoints);
}

function getTextCriteria(question: GammaTextValidationQuestion) {
  const criteria = isRecord(question.reviewCriteria) ? question.reviewCriteria : {};
  return {
    minLength: numberOrUndefined(criteria.minLength) ?? numberOrUndefined(question.textMinimumLength),
    maxLength: numberOrUndefined(criteria.maxLength) ?? numberOrUndefined(question.textMaximumLength),
    requiresThreePoints:
      booleanOrUndefined(criteria.requiresThreePoints) ??
      booleanOrUndefined(question.textRequiresThreePoints),
    keywords: stringArray(criteria.keywords) ?? stringArray(question.textKeywords) ?? [],
    minimumKeywordMatches:
      numberOrUndefined(criteria.minimumKeywordMatches) ??
      numberOrUndefined(question.textMinimumKeywordMatches) ??
      0,
  };
}

export function validateGammaTextAnswer(
  rawText: string,
  question: GammaTextValidationQuestion,
  options: GammaTextValidationOptions = {}
) {
  const problems: string[] = [];
  const text = rawText.trim();
  const criteria = getTextCriteria(question);
  const length = textLength(text);

  if (!text) {
    problems.push("請先填寫答案，再按 AI 審核。");
    return problems;
  }

  if (options.maxReviewChars && length > options.maxReviewChars) {
    problems.push(`答案太長了，請整理在 ${options.maxReviewChars} 字以內再送審。`);
  }

  if (criteria.minLength && length < criteria.minLength) {
    problems.push(`答案太短了，請至少寫 ${criteria.minLength} 個字。`);
  }

  if (criteria.maxLength && length > criteria.maxLength) {
    problems.push(`這一題請整理在 ${criteria.maxLength} 個字以內。`);
  }

  if (isEnglishDominatedAnswer(text)) {
    problems.push("不能直接貼英文題目，請用自己的中文整理答案。");
  }

  if (isCopiedFromQuestion(text, question)) {
    problems.push("不能只複製題目內容，請改成自己的答案。");
  }

  if (criteria.requiresThreePoints && countAnswerPoints(text) < 3) {
    problems.push("這一題需要整理成至少 3 點。");
  }

  if (criteria.keywords.length > 0 && criteria.minimumKeywordMatches > 0) {
    const matches = countKeywordMatches(text, criteria.keywords);
    if (matches < criteria.minimumKeywordMatches) {
      problems.push("答案還缺少這題需要的重點，請回到題目找關鍵字再整理。");
    }
  }

  return problems;
}
