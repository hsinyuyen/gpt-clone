export type LabToolPromptGuardMode = "text" | "image" | "music" | "video";

export interface LabToolPromptGuardResult {
  passed: boolean;
  feedback: string;
}

interface PromptPenalty {
  strikes: number;
  lastInvalidAt: number;
  lockedUntil: number;
}

const PENALTY_PREFIX = "lab-tool:prompt-penalty:v1";
const RESET_AFTER_MS = 10 * 60 * 1000;

const EXPECTED_MODE: Record<string, LabToolPromptGuardMode> = {
  text: "text",
  image: "image",
  audio: "music",
  music: "music",
  video: "video",
  terminal: "text",
};

const MODE_LABEL: Record<LabToolPromptGuardMode, string> = {
  text: "Lab Terminal",
  image: "Lab Image",
  music: "Lab Music",
  video: "Lab Video",
};

const GENERIC = new Set([
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

const compactText = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function validateLabToolPromptLocally(params: {
  prompt: string;
  mode: LabToolPromptGuardMode;
  expectedKind?: string;
  toolId?: string;
}): LabToolPromptGuardResult {
  const prompt = params.prompt.trim();
  const compact = compactText(prompt);
  const requiredMode = EXPECTED_MODE[(params.expectedKind || params.toolId || "").toLowerCase()];

  if (requiredMode && requiredMode !== params.mode) {
    return { passed: false, feedback: `這題要使用 ${MODE_LABEL[requiredMode]}，請切回指定工具。` };
  }
  if (!prompt || compact.length < 4) {
    return { passed: false, feedback: "提示詞太短，請寫出主題、內容或用途。" };
  }
  if (/[_＿]{2,}/u.test(prompt)) {
    return { passed: false, feedback: "提示詞還有沒填完的底線，請先補成具體內容。" };
  }
  if (GENERIC.has(prompt.toLowerCase()) || GENERIC.has(compact)) {
    return { passed: false, feedback: "提示詞太空泛，請補上這題的具體主題與成果。" };
  }
  if (/^(.)\1{4,}$/u.test(compact) || /^(?:asdf|qwer|test)\w*$/i.test(compact)) {
    return { passed: false, feedback: "這段內容像測試或亂打，請改成和題目有關的提示詞。" };
  }
  const words = prompt.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 3 && new Set(words).size === 1) {
    return { passed: false, feedback: "請不要重複同一個詞，改寫成完整、具體的提示詞。" };
  }

  return { passed: true, feedback: "本地檢查通過。" };
}

export function labToolPromptPenaltyKey(
  worksheetId: string,
  taskId: string,
  mode: LabToolPromptGuardMode
) {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  return `${PENALTY_PREFIX}:${safe(worksheetId)}:${safe(taskId)}:${mode}`;
}

function readPenalty(key: string, now = Date.now()): PromptPenalty | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as PromptPenalty | null;
    if (!parsed || now - parsed.lastInvalidAt >= RESET_AFTER_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getLabToolPromptLockSeconds(key: string, now = Date.now()) {
  const penalty = readPenalty(key, now);
  return penalty ? Math.max(0, Math.ceil((penalty.lockedUntil - now) / 1000)) : 0;
}

export function registerInvalidLabToolPrompt(key: string, now = Date.now()) {
  const previous = readPenalty(key, now);
  const strikes = (previous?.strikes || 0) + 1;
  const lockSeconds = strikes >= 2 ? Math.min(60, (strikes - 1) * 5) : 0;
  const penalty: PromptPenalty = {
    strikes,
    lastInvalidAt: now,
    lockedUntil: lockSeconds > 0 ? now + lockSeconds * 1000 : 0,
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(penalty));
  } catch {
    // Restricted browser storage still keeps the current request blocked.
  }
  return { strikes, lockSeconds };
}

export function clearLabToolPromptPenalty(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
}
