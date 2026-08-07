import { isMissingOpenAIKeyError, openAIAuthHeader } from "@/server/openaiClient";
import type { GammaAnswerPromptReviewCriteria } from "@/types/GammaAnswerWorksheet";

export type LabToolPromptReviewMode = "text" | "image" | "music" | "video";

export interface LabToolPromptReviewParams {
  mode: LabToolPromptReviewMode;
  prompt: string;
  worksheetId?: string;
  courseTitle?: string;
  sessionTitle?: string;
  taskId?: string;
  task?: string;
  toolPrompt?: string;
  promptReviewCriteria?: GammaAnswerPromptReviewCriteria;
  legacyReviewHint?: string;
  expectedKind?: string;
}

export interface LabToolPromptReviewResult {
  passed: boolean;
  feedback: string;
  missing?: string[];
  source: "local" | "ai" | "fallback";
}

const MODE_LABELS: Record<LabToolPromptReviewMode, string> = {
  text: "文字工具",
  image: "圖片工具",
  music: "音樂工具",
  video: "影片工具",
};

const EXPECTED_KIND_TO_MODE: Record<string, LabToolPromptReviewMode> = {
  text: "text",
  image: "image",
  audio: "music",
  music: "music",
  video: "video",
};

const GENERIC_PROMPTS = new Set([
  "生成",
  "幫我生成",
  "做一個",
  "產生內容",
  "生成圖片",
  "幫我生成圖片",
  "做圖片",
  "生成音樂",
  "幫我生成音樂",
  "做音樂",
  "生成影片",
  "幫我生成影片",
  "做影片",
  "test",
  "testing",
  "asdf",
  "qwer",
]);

function trimText(value: unknown, max = 800) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const PROMPT_GATE_IGNORED_CHARACTERS = new Set(
  Array.from("請生成製作一張一段一個的了在和與要有是以及並學生作品內容")
);

function meaningfulCharacters(value: string) {
  return Array.from(normalizeText(value)).filter(
    (character) => !PROMPT_GATE_IGNORED_CHARACTERS.has(character)
  );
}

function evaluateLocalCharacterGate(
  prompt: string,
  criteria?: GammaAnswerPromptReviewCriteria
) {
  const conditions = (criteria?.passConditions || [])
    .map((condition) => trimText(condition, 80))
    .filter(Boolean)
    .slice(0, 8);
  const expectedCharacters = new Set(
    conditions.flatMap((condition) => meaningfulCharacters(condition))
  );
  if (expectedCharacters.size === 0) return null;

  const promptCharacters = new Set(meaningfulCharacters(prompt));
  const matchedCharacters = Array.from(expectedCharacters).filter((character) =>
    promptCharacters.has(character)
  );
  const ratio = matchedCharacters.length / expectedCharacters.size;
  const requiredRatio = Math.max(
    0.1,
    Math.min(1, criteria?.minimumCharacterMatchRatio ?? 0.5)
  );
  const missingConditions = conditions.filter((condition) => {
    const characters = Array.from(new Set(meaningfulCharacters(condition)));
    if (characters.length === 0) return false;
    const matched = characters.filter((character) => promptCharacters.has(character)).length;
    return matched / characters.length < 0.5;
  });

  return {
    passed: ratio >= requiredRatio,
    ratio,
    requiredRatio,
    matchedCharacterCount: matchedCharacters.length,
    expectedCharacterCount: expectedCharacters.size,
    missingConditions,
  };
}

function stripJsonFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseReviewerJson(raw: string) {
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Prompt reviewer did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function normalizeExpectedMode(expectedKind?: string) {
  const key = trimText(expectedKind, 40).toLowerCase();
  return key ? EXPECTED_KIND_TO_MODE[key] : undefined;
}

function looksLikeRandomInput(prompt: string) {
  const compact = normalizeText(prompt);
  if (compact.length < 4) return true;
  if (/^(.)\1{4,}$/.test(compact)) return true;
  if (/^(?:\d+|[a-z]{1,3}|測試|隨便|亂打|不知道|無|沒有|asdf\w*|qwer\w*|test\w*)$/.test(compact)) return true;
  const words = prompt.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 3 && new Set(words).size === 1) return true;
  return false;
}

function looksLikeGenericPrompt(prompt: string) {
  const compact = normalizeText(prompt);
  if (GENERIC_PROMPTS.has(prompt.trim().toLowerCase())) return true;
  return GENERIC_PROMPTS.has(compact);
}

function hasUnfilledTemplateFields(prompt: string) {
  // Two or more underscores indicate a lesson template field that is still blank.
  return /[_＿]{2,}/u.test(prompt);
}

function reviewLog(
  event: string,
  params: LabToolPromptReviewParams,
  details: Record<string, unknown> = {}
) {
  console.info(`[lab-tool-prompt-review] ${event}`, {
    mode: params.mode,
    worksheetId: params.worksheetId,
    taskId: params.taskId,
    promptLength: params.prompt.trim().length,
    promptPreview: trimText(params.prompt, 120),
    ...details,
  });
}

function logReviewResult(
  params: LabToolPromptReviewParams,
  result: LabToolPromptReviewResult
) {
  reviewLog("review-result", params, {
    passed: result.passed,
    source: result.source,
    feedback: result.feedback,
    missing: result.missing || [],
  });
}

function localPromptReview(
  params: LabToolPromptReviewParams,
  prompt: string
): LabToolPromptReviewResult | null {
  if (!prompt) {
    return {
      passed: false,
      source: "local",
      feedback: "請先寫下你想讓工具生成的內容，不能空白送出喔。",
      missing: ["提示詞內容"],
    };
  }

  if (!params.worksheetId) {
    return {
      passed: false,
      source: "local",
      feedback: "目前沒有讀到課程任務，先回到學習單再開啟生成工具。",
      missing: ["課程任務"],
    };
  }

  if (!params.task && !params.toolPrompt) {
    return {
      passed: false,
      source: "local",
      feedback: "目前沒有讀到這題的任務內容，請回到學習單重新進入工具。",
      missing: ["題目任務"],
    };
  }

  const expectedMode = normalizeExpectedMode(params.expectedKind);
  if (expectedMode && expectedMode !== params.mode) {
    return {
      passed: false,
      source: "local",
      feedback: `這題應該使用${MODE_LABELS[expectedMode]}，請切回正確工具再生成。`,
      missing: [MODE_LABELS[expectedMode]],
    };
  }

  if (hasUnfilledTemplateFields(prompt)) {
    return unfinishedTemplateResult();
  }

  if (looksLikeRandomInput(prompt)) {
    return {
      passed: false,
      source: "local",
      feedback: "提示詞太短或像亂打，請寫出你想生成的主角、內容或用途。",
      missing: ["主角", "內容或用途"],
    };
  }

  if (looksLikeGenericPrompt(prompt)) {
    return {
      passed: false,
      source: "local",
      feedback: "提示詞太空泛，請補上這題要生成的具體內容。",
      missing: ["這題的主題", "具體成果"],
    };
  }

  const characterGate = evaluateLocalCharacterGate(
    prompt,
    params.promptReviewCriteria
  );
  if (characterGate && !characterGate.passed) {
    return {
      passed: false,
      source: "local",
      feedback: "這題好像不是要你做這件事情，再看看題目需要什麼內容。",
      missing: characterGate.missingConditions.slice(0, 5),
    };
  }

  return null;
}

function unfinishedTemplateResult(): LabToolPromptReviewResult {
  return {
    passed: false,
    source: "local",
    feedback: "提示詞裡還有沒有填完的底線欄位，請把每一格改成具體內容後再生成。",
    missing: ["主角或物件", "外觀或場景細節", "畫面風格與不能出現的內容"],
  };
}

function normalizeMissing(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function buildReviewPayload(params: LabToolPromptReviewParams, prompt: string) {
  const localCharacterGate = evaluateLocalCharacterGate(
    prompt,
    params.promptReviewCriteria
  );
  return {
    tool: MODE_LABELS[params.mode],
    mode: params.mode,
    worksheetId: trimText(params.worksheetId, 80),
    courseTitle: trimText(params.courseTitle, 160),
    sessionTitle: trimText(params.sessionTitle, 160),
    taskId: trimText(params.taskId, 120),
    task: trimText(params.task, 500),
    referencePrompt: trimText(params.toolPrompt, 500),
    legacyReviewHint: trimText(params.legacyReviewHint, 500),
    promptReviewCriteria: params.promptReviewCriteria,
    localCharacterGate,
    expectedKind: trimText(params.expectedKind, 40),
    studentPrompt: prompt,
  };
}

export async function reviewLabToolPrompt(
  params: LabToolPromptReviewParams
): Promise<LabToolPromptReviewResult> {
  const prompt = trimText(params.prompt, 400);
  reviewLog("review-start", params);
  const localResult = localPromptReview(params, prompt);
  if (localResult) {
    reviewLog("review-blocked-locally", params, {
      source: localResult.source,
      feedback: localResult.feedback,
      missing: localResult.missing,
    });
    logReviewResult(params, localResult);
    return localResult;
  }

  if (params.mode === "text") {
    const result: LabToolPromptReviewResult = {
      passed: true,
      source: "local",
      feedback: "本地檢查通過。",
      missing: [],
    };
    logReviewResult(params, result);
    return result;
  }

  const instruction = [
    "你是 Lab Terminal 的提示詞初審器。",
    "你只審查圖片、音樂、影片提示詞，並在真正呼叫高成本生成 API 之前決定是否放行。",
    "題目標題 task 與題目內容 referencePrompt 是主要依據；legacyReviewHint 只可作舊資料補充。",
    "無論最後會新生成或命中既有素材庫，審查標準完全相同；不可因為已有快取素材而放寬。",
    "學生提示詞必須明確對應 task 與 referencePrompt 的核心主題、要做的事情和指定媒體類型，才可通過。",
    "請接受國小學生的短句、錯字與口語，但短句仍必須說出題目核心主題或動作；只有泛泛的媒體指令、只描述風格、或只說部分題意都不可通過。",
    "請擋下：亂打、只寫「生成圖片／做音樂／做影片」這類空泛內容、與題目不相符、用錯工具、缺少題目最重要主題或任務動作。",
    "不通過時，feedback 用親切的繁體中文直接指出與目前題目不相符的地方，並給一個可照著改寫的方向，最多 45 個中文字。missing 請列出 1 到 3 個缺少的題目要點。",
    "只輸出 JSON，不要加解釋。",
    '{"passed":true,"feedback":"可以生成。","missing":[]}',
  ].join("\n");

  try {
    reviewLog("ai-request-start", params, {
      model: process.env.LAB_TOOL_PROMPT_REVIEW_MODEL || "gpt-4o-mini",
    });
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: openAIAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.LAB_TOOL_PROMPT_REVIEW_MODEL || "gpt-4o-mini",
        temperature: 0,
        max_tokens: 120,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: JSON.stringify(buildReviewPayload(params, prompt), null, 2) },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || "Prompt review failed");
    }

    const parsed = parseReviewerJson(data?.choices?.[0]?.message?.content?.trim() || "");
    const passed = parsed.passed === true;
    const missing = normalizeMissing(parsed.missing);
    const feedback = trimText(
      parsed.feedback || (passed ? "可以生成。" : "提示詞還不夠貼合題目，請補上任務重點。"),
      80
    );

    const result: LabToolPromptReviewResult = {
      passed,
      source: "ai",
      feedback,
      missing,
    };
    reviewLog("ai-request-complete", params, {
      source: result.source,
      passed: result.passed,
      feedback: result.feedback,
      missing: result.missing,
    });
    logReviewResult(params, result);
    return result;
  } catch (error) {
    if (isMissingOpenAIKeyError(error)) {
      const result: LabToolPromptReviewResult = {
        passed: false,
        source: "fallback",
        feedback: "目前無法完成提示詞初審，請老師檢查 OPENAI_API_KEY。",
        missing: ["提示詞初審服務"],
      };
      logReviewResult(params, result);
      return result;
    }

    console.warn("[lab-tool-prompt-review] review failed:", error);
    const result: LabToolPromptReviewResult = {
      passed: false,
      source: "fallback",
      feedback: "提示詞初審暫時失敗，請稍後再試或請老師檢查設定。",
      missing: ["提示詞初審服務"],
    };
    logReviewResult(params, result);
    return result;
  }
}
