import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  GammaAnswerExpectedKind,
  GammaAnswerQuestionConfig,
  GammaAnswerReadCheck,
  GammaAnswerWorksheetConfig,
  isGammaAnswerQuestionCompleted,
} from "@/config/gammaAnswerWorksheets";
import { useAuth } from "@/contexts/AuthContext";
import { useConversation } from "@/contexts/ConversationContext";
import {
  approveTask,
  getStudentWorksheetProgress,
  markLessonCompleted,
} from "@/lib/firestore";
import { StudentWorksheetProgress, Worksheet } from "@/types/Worksheet";
import { lessonKeys } from "@/types/LessonCompletion";
import { validateBasicGammaTextAnswer } from "@/utils/gammaAnswerValidation";
import { clearLabToolSessionCache } from "@/utils/labToolSessionCache";
import WorksheetNotebook from "@/components/worksheets/WorksheetNotebook";
import {
  LabImageReviewMetadata,
  LAB_IMAGE_REVIEW_METADATA_MARKER,
  readLabImageMetadataFromBlob,
} from "@/utils/labImageMetadata";
import {
  LabMusicReviewMetadata,
  readLabMusicMetadataFromBlob,
} from "@/utils/labMusicMetadata";
import {
  LabVideoReviewMetadata,
  LAB_VIDEO_REVIEW_METADATA_MARKER,
  readLabVideoMetadataFromBlob,
} from "@/utils/labVideoMetadata";

interface GammaAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "audio" | "video" | "file";
  source: "upload" | "restored";
  objectUrl?: string;
  downloadUrl?: string;
}

interface GammaAnswerState {
  text: string;
  attachments: GammaAttachment[];
  review?: {
    passed: boolean;
    feedback: string;
    reviewedAt: string;
    signatureDetails?: string[];
  };
  readCheck?: {
    passed: boolean;
    selectedIndex?: number;
    answeredAt?: string;
  };
  readChecks?: Record<
    number,
    {
      passed: boolean;
      selectedIndex?: number;
      textAnswer?: string;
      answeredAt?: string;
      wrongAttempts?: number;
      lockedUntil?: string;
    }
  >;
}

interface GammaAnswerWorksheetProps {
  config: GammaAnswerWorksheetConfig;
  worksheet: Worksheet;
  progress: StudentWorksheetProgress | null;
  onProgressChange: (progress: StudentWorksheetProgress | null) => void;
}

const EMPTY_ANSWER: GammaAnswerState = {
  text: "",
  attachments: [],
};

const LAB_TOOL_LINKS: Array<{
  id: GammaAnswerQuestionConfig["toolId"];
  label: string;
  shortLabel: string;
}> = [
  { id: "terminal", label: "Lab Terminal", shortLabel: "Terminal" },
  { id: "image", label: "Lab Image", shortLabel: "Image" },
  { id: "music", label: "Lab Music", shortLabel: "Music" },
  { id: "video", label: "Lab Video", shortLabel: "Video" },
];

function toGammaEmbedUrl(url: string) {
  if (!url) return "";
  if (url.includes("/embed/")) return url;
  const match = url.match(/gamma\.app\/(?:docs|public)\/([^/?#]+)/);
  if (match) return `https://gamma.app/embed/${match[1]}`;
  return url.replace("/docs/", "/embed/");
}

function expectedAttachmentKind(kind: GammaAnswerExpectedKind) {
  if (kind === "image" || kind === "audio" || kind === "video") return kind;
  return "file";
}

function classifyFile(file: File): GammaAttachment["kind"] {
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  if (type.startsWith("video/") || /\.(mp4|webm|mov)$/.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|wav|m4a)$/.test(name)) return "audio";
  return "file";
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function toolHomeMode(toolId: GammaAnswerQuestionConfig["toolId"]) {
  return toolId === "terminal" ? "text" : toolId;
}

function formatWeekLabel(semester: string, week: number) {
  return `${semester || "課程"} W${String(week || 0).padStart(2, "0")}`;
}

function labToolSessionTitle(config: GammaAnswerWorksheetConfig) {
  const prefix = formatWeekLabel(config.semester, config.week);
  const titleWithoutPrefix = config.title.replace(/^S\d+\s*W\d+\s*[｜|-]\s*/i, "").trim();
  return `${prefix}｜${titleWithoutPrefix || config.title}`;
}

function sanitizeLabToolIdSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function labToolConversationPrefix(userId: string, worksheetId: string) {
  return `conv_labtool_${sanitizeLabToolIdSegment(userId)}_labtool_${sanitizeLabToolIdSegment(worksheetId)}`;
}

function localDraftKey(config: GammaAnswerWorksheetConfig, userId: string) {
  return `gamma-answer-worksheet:${config.storageVersion}:${config.id}:${userId}`;
}

function getReviewCriteria(question: GammaAnswerQuestionConfig) {
  const criteria = question.reviewCriteria || {};
  return {
    minLength: criteria.minLength ?? question.textMinimumLength,
    maxLength: criteria.maxLength ?? question.textMaximumLength,
    requiresThreePoints: criteria.requiresThreePoints ?? question.textRequiresThreePoints,
    keywords: criteria.keywords ?? question.textKeywords ?? [],
    minimumKeywordMatches:
      criteria.minimumKeywordMatches ?? question.textMinimumKeywordMatches ?? 0,
    minAttachments: criteria.minAttachments ?? 1,
    maxAttachments: criteria.maxAttachments,
    allowedMimeTypes: criteria.allowedMimeTypes ?? [],
    aiReviewMode: criteria.aiReviewMode ?? "local-only",
  };
}

const ATTACHMENT_DB_NAME = "gamma-answer-worksheet-files";
const ATTACHMENT_STORE_NAME = "files";
const MAX_TEXT_REVIEW_CHARS = 1500;
const MAX_REVIEW_FILE_BYTES = 100 * 1024 * 1024;
const LAB_VIDEO_UUID_PREFIX_BYTES = 24;

type LabToolSignatureKind = "image" | "music" | "video";
type LabToolReviewMetadata =
  | LabImageReviewMetadata
  | LabMusicReviewMetadata
  | LabVideoReviewMetadata;

interface LabToolSignatureVerification {
  problem: string;
  signatureDetail?: string;
}

function openAttachmentDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(ATTACHMENT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE_NAME)) {
        db.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function attachmentStorageKey(draftKey: string, fileId: string) {
  return `${draftKey}:${fileId}`;
}

async function saveAttachmentBlob(
  draftKey: string,
  attachment: GammaAttachment,
  file: File
) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  const db = await openAttachmentDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
    tx.objectStore(ATTACHMENT_STORE_NAME).put({
      key: attachmentStorageKey(draftKey, attachment.id),
      draftKey,
      fileId: attachment.id,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
      blob: file,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadAttachmentBlob(draftKey: string, fileId: string) {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  const db = await openAttachmentDb();
  const stored = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, "readonly");
    const request = tx.objectStore(ATTACHMENT_STORE_NAME).get(attachmentStorageKey(draftKey, fileId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return stored?.blob instanceof Blob ? stored.blob : null;
}

async function getAttachmentBlob(file: GammaAttachment, draftKey: string) {
  if (file.objectUrl) {
    return fetch(file.objectUrl).then((response) => response.blob());
  }
  if (draftKey) {
    return loadAttachmentBlob(draftKey, file.id);
  }
  return null;
}

async function deleteAttachmentBlob(draftKey: string, fileId: string) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  const db = await openAttachmentDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ATTACHMENT_STORE_NAME, "readwrite");
    tx.objectStore(ATTACHMENT_STORE_NAME).delete(attachmentStorageKey(draftKey, fileId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

function signatureKindForExpectedKind(
  kind: GammaAnswerExpectedKind
): LabToolSignatureKind | null {
  if (kind === "image") return "image";
  if (kind === "audio") return "music";
  if (kind === "video") return "video";
  return null;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(bytes: Uint8Array) {
  if (!window.crypto?.subtle) {
    throw new Error("這個瀏覽器無法計算檔案簽章。");
  }
  return bytesToHex(await window.crypto.subtle.digest("SHA-256", bytes));
}

function id3SyncSafeToInt(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function stripOneLeadingId3Tag(bytes: Uint8Array) {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return null;
  }
  const tagSize = id3SyncSafeToInt(bytes, 6);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  const tagEnd = 10 + tagSize + (hasFooter ? 10 : 0);
  if (tagEnd <= 10 || tagEnd >= bytes.length) return null;
  return bytes.subarray(tagEnd);
}

function lastIndexOfSubarray(bytes: Uint8Array, pattern: Uint8Array) {
  if (pattern.length === 0 || pattern.length > bytes.length) return -1;
  for (let index = bytes.length - pattern.length; index >= 0; index -= 1) {
    let matches = true;
    for (let patternIndex = 0; patternIndex < pattern.length; patternIndex += 1) {
      if (bytes[index + patternIndex] !== pattern[patternIndex]) {
        matches = false;
        break;
      }
    }
    if (matches) return index;
  }
  return -1;
}

function stripOneTrailingLabVideoMetadataBox(bytes: Uint8Array) {
  const marker = new TextEncoder().encode(LAB_VIDEO_REVIEW_METADATA_MARKER);
  const markerIndex = lastIndexOfSubarray(bytes, marker);
  const boxStart = markerIndex - LAB_VIDEO_UUID_PREFIX_BYTES;
  if (boxStart <= 0 || boxStart + 8 >= bytes.length) return null;
  const boxType = String.fromCharCode(
    bytes[boxStart + 4],
    bytes[boxStart + 5],
    bytes[boxStart + 6],
    bytes[boxStart + 7]
  );
  if (boxType !== "uuid") return null;
  return bytes.subarray(0, boxStart);
}

function stripOneTrailingLabImageMetadata(bytes: Uint8Array) {
  const marker = new TextEncoder().encode(LAB_IMAGE_REVIEW_METADATA_MARKER);
  const markerIndex = lastIndexOfSubarray(bytes, marker);
  if (markerIndex <= 0) return null;
  return bytes.subarray(0, markerIndex);
}

async function signedContentHash(
  kind: LabToolSignatureKind,
  blob: Blob,
  expectedHash = ""
) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const candidates: Uint8Array[] = [];

  if (kind === "image") {
    const stripped = stripOneTrailingLabImageMetadata(bytes);
    if (stripped) candidates.push(stripped);
  } else if (kind === "music") {
    let current: Uint8Array | null = bytes;
    for (let attempts = 0; attempts < 4; attempts += 1) {
      const stripped = stripOneLeadingId3Tag(current);
      if (!stripped) break;
      candidates.push(stripped);
      current = stripped;
    }
  } else if (kind === "video") {
    let current: Uint8Array | null = bytes;
    for (let attempts = 0; attempts < 4; attempts += 1) {
      const stripped = stripOneTrailingLabVideoMetadataBox(current);
      if (!stripped) break;
      candidates.push(stripped);
      current = stripped;
    }
  }

  candidates.push(bytes);

  let firstHash = "";
  for (const candidate of candidates) {
    const hash = await sha256Hex(candidate);
    if (!firstHash) firstHash = hash;
    if (!expectedHash || hash === expectedHash) return hash;
  }

  return firstHash;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledReadCheckOptions(
  questionId: string,
  readCheck?: GammaAnswerReadCheck,
  shuffleRound = 0
) {
  const options = readCheck?.options || [];
  const shuffled = options
    .map((label, index) => ({
      label,
      originalIndex: index,
      sortKey: stableHash(`${questionId}:${index}:${label}`),
    }))
    .sort((left, right) => left.sortKey - right.sortKey);
  if (shuffled.length < 2 || shuffleRound <= 0) return shuffled;
  const offset = shuffleRound % shuffled.length;
  return [...shuffled.slice(offset), ...shuffled.slice(0, offset)];
}

function normalizeReadCheckText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s,，。！？!?、；;:："'「」『』（）()\[\]{}]/g, "");
}

function matchesTextReadCheck(answer: string, readCheck: GammaAnswerReadCheck) {
  const normalizedAnswer = normalizeReadCheckText(answer);
  if (!normalizedAnswer) return false;
  const acceptedAnswers = (readCheck.acceptedAnswers || [])
    .map(normalizeReadCheckText)
    .filter(Boolean);
  return readCheck.matchMode === "includes"
    ? acceptedAnswers.some((accepted) => normalizedAnswer.includes(accepted))
    : acceptedAnswers.includes(normalizedAnswer);
}

function sanitizeAnswers(answers: Record<string, GammaAnswerState>) {
  return Object.fromEntries(
    Object.entries(answers).map(([id, answer]) => {
      const sanitized: {
        text: string;
        attachments: Array<{
          id: string;
          name: string;
          type: string;
          size: number;
          kind: string;
          source: string;
          downloadUrl?: string;
        }>;
        review?: GammaAnswerState["review"];
        readCheck?: GammaAnswerState["readCheck"];
        readChecks?: GammaAnswerState["readChecks"];
      } = {
        text: answer.text,
        attachments: answer.attachments.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          kind: file.kind,
          source: file.source,
          downloadUrl: file.downloadUrl || "",
        })),
      };
      if (answer.review) sanitized.review = answer.review;
      if (answer.readCheck) sanitized.readCheck = answer.readCheck;
      if (answer.readChecks) sanitized.readChecks = answer.readChecks;
      return [id, sanitized];
    })
  );
}

function buildInitialAnswers(config: GammaAnswerWorksheetConfig) {
  return Object.fromEntries(
    config.questions.map((question) => [
      question.id,
      { text: "", attachments: [] },
    ])
  ) as Record<string, GammaAnswerState>;
}

export default function GammaAnswerWorksheet({
  config,
  progress,
  onProgressChange,
}: GammaAnswerWorksheetProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { conversations, deleteConversation } = useConversation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, GammaAnswerState>>(() =>
    buildInitialAnswers(config)
  );
  const [feedback, setFeedback] = useState("請看左側 GAMMA 題目，需要生成內容時可回主頁使用 Lab Terminal。");
  const [uploadMessage, setUploadMessage] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [readCheckClock, setReadCheckClock] = useState(() => Date.now());
  const [celebration, setCelebration] = useState<"question" | "all" | null>(null);
  const loadedDraftRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeQuestion = config.questions[activeIndex];
  const activeAnswer = answers[activeQuestion.id] || EMPTY_ANSWER;
  const isQuestionCompleted = useCallback(
    (question: GammaAnswerQuestionConfig) =>
      isGammaAnswerQuestionCompleted(progress?.tasks, config, question),
    [config, progress?.tasks]
  );
  const completedCount = config.questions.filter(
    isQuestionCompleted
  ).length;
  const firstIncompleteIndex = config.questions.findIndex(
    (question) => !isQuestionCompleted(question)
  );
  const unlockedIndex =
    firstIncompleteIndex >= 0 ? firstIncompleteIndex : config.questions.length - 1;
  const totalCoins = config.questions.reduce((sum, question) => sum + question.coins, 0);
  const allComplete = config.questions.length > 0 && completedCount >= config.questions.length;
  const activeQuestionCompleted = isQuestionCompleted(activeQuestion);
  const activeAnswerPassed = activeQuestionCompleted || !!activeAnswer.review?.passed;
  const activeReadChecks = activeQuestion.readChecks?.length
    ? activeQuestion.readChecks
    : activeQuestion.readCheck
    ? [activeQuestion.readCheck]
    : [];
  const activeReadCheckIndex = activeReadChecks.findIndex(
    (_, index) => !activeAnswer.readChecks?.[index]?.passed && !(index === 0 && activeAnswer.readCheck?.passed)
  );
  const activeReadCheck = activeReadChecks[activeReadCheckIndex];
  const activeReadCheckState = activeAnswer.readChecks?.[activeReadCheckIndex];
  const activeReadCheckText = activeReadCheckState?.textAnswer || "";
  const readCheckLockedUntil = activeReadCheckState?.lockedUntil
    ? Date.parse(activeReadCheckState.lockedUntil)
    : 0;
  const readCheckLockSeconds = Math.max(
    0,
    Math.ceil((readCheckLockedUntil - readCheckClock) / 1000)
  );
  const readCheckLocked = readCheckLockSeconds > 0;
  const awaitingReadCheck =
    !activeQuestionCompleted &&
    activeReadCheckIndex >= 0 &&
    !!activeAnswer.review?.passed;
  const readCheckOptions = useMemo(
    () =>
      shuffledReadCheckOptions(
        `${activeQuestion.id}:${activeReadCheckIndex}`,
        activeReadCheck,
        activeReadCheckState?.wrongAttempts || 0
      ),
    [
      activeQuestion.id,
      activeReadCheck,
      activeReadCheckIndex,
      activeReadCheckState?.wrongAttempts,
    ]
  );
  const reviewIdleLabel = "檢查並加金幣";
  const reviewBusyLabel = "檢查中...";

  const gammaUrl = useMemo(() => {
    const primary = toGammaEmbedUrl(config.gammaUrl);
    if (/gamma\.app\/embed\/[^/?#]+/.test(primary)) return primary;
    return toGammaEmbedUrl(config.gammaFallbackUrl || config.gammaUrl);
  }, [config.gammaFallbackUrl, config.gammaUrl]);

  const setAnswer = useCallback(
    (questionId: string, patch: Partial<GammaAnswerState>) => {
      setAnswers((current) => ({
        ...current,
        [questionId]: {
          ...(current[questionId] || EMPTY_ANSWER),
          ...patch,
        },
      }));
    },
    []
  );

  const canOpenQuestion = useCallback(
    (index: number) => allComplete || index <= unlockedIndex,
    [allComplete, unlockedIndex]
  );

  useEffect(() => {
    if (!awaitingReadCheck || readCheckLockedUntil <= Date.now()) return;
    setReadCheckClock(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setReadCheckClock(now);
      if (now >= readCheckLockedUntil) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [awaitingReadCheck, activeQuestion.id, activeReadCheckIndex, readCheckLockedUntil]);

  useEffect(() => {
    if (!canOpenQuestion(activeIndex)) {
      setActiveIndex(Math.max(0, unlockedIndex));
      setFeedback("請按照題目順序完成，先通過前面的題目才能繼續。");
    }
  }, [activeIndex, canOpenQuestion, unlockedIndex]);

  const grantLabMediaAccess = useCallback((question?: GammaAnswerQuestionConfig) => {
    const taskQuestion = question || activeQuestion;
    try {
      window.localStorage.setItem(
        config.mediaAccessKey,
        JSON.stringify({
          worksheetId: config.id,
          status: "open",
          taskId: taskQuestion.taskId,
        })
      );
    } catch {
      // Browser storage may be unavailable in restricted modes.
    }
  }, [activeQuestion, config]);

  const revokeLabMediaAccess = useCallback(() => {
    try {
      window.localStorage.removeItem(config.mediaAccessKey);
    } catch {
      // Browser storage may be unavailable in restricted modes.
    }
  }, [config.mediaAccessKey]);

  const removeLabToolSessions = useCallback(() => {
    if (!user?.id) return;
    const prefix = labToolConversationPrefix(user.id, config.id);
    conversations
      .filter((conversation) =>
        conversation.id === prefix || conversation.id.startsWith(`${prefix}_`)
      )
      .forEach((conversation) => deleteConversation(conversation.id));
    clearLabToolSessionCache(user.id, config.id);
  }, [config.id, conversations, deleteConversation, user?.id]);

  useEffect(() => {
    if (allComplete) {
      revokeLabMediaAccess();
      removeLabToolSessions();
      return;
    }
    grantLabMediaAccess(activeQuestion);
  }, [
    activeQuestion,
    allComplete,
    grantLabMediaAccess,
    removeLabToolSessions,
    revokeLabMediaAccess,
  ]);

  useEffect(() => {
    if (!user || loadedDraftRef.current) return;
    const initial = buildInitialAnswers(config);

    try {
      const draftKey = localDraftKey(config, user.id);
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          activeQuestionId?: string;
          answers?: Record<string, GammaAnswerState>;
        };
        const restored = { ...initial, ...(parsed.answers || {}) };
        setAnswers(restored);
        Object.entries(restored).forEach(([questionId, answer]) => {
          answer.attachments.forEach((file) => {
            if (file.objectUrl || file.downloadUrl) return;
            loadAttachmentBlob(draftKey, file.id)
              .then((blob) => {
                if (!blob) return;
                setAnswers((current) => ({
                  ...current,
                  [questionId]: {
                    ...(current[questionId] || EMPTY_ANSWER),
                    attachments: (current[questionId]?.attachments || []).map((item) =>
                      item.id === file.id
                        ? { ...item, objectUrl: URL.createObjectURL(blob), source: "restored" }
                        : item
                    ),
                  },
                }));
              })
              .catch(() => undefined);
          });
        });
        const nextIndex = config.questions.findIndex(
          (question) => question.id === parsed.activeQuestionId
        );
        if (nextIndex >= 0) {
          const firstOpen = config.questions.findIndex(
            (question) => !isQuestionCompleted(question)
          );
          const maxOpen = firstOpen >= 0 ? firstOpen : config.questions.length - 1;
          setActiveIndex(Math.min(nextIndex, maxOpen));
        }
      }
    } catch {
      // Ignore broken local drafts.
    }
    loadedDraftRef.current = true;
  }, [config, isQuestionCompleted, progress?.tasks, user]);

  const saveDraft = useCallback(
    (nextAnswers: Record<string, GammaAnswerState>, nextActiveIndex: number) => {
      if (!user) return;
      const now = new Date().toISOString();
      const draft = {
        version: config.storageVersion,
        activeQuestionId: config.questions[nextActiveIndex]?.id || config.questions[0]?.id || "",
        answers: sanitizeAnswers(nextAnswers),
        savedAt: now,
      };

      try {
        window.localStorage.setItem(
          localDraftKey(config, user.id),
          JSON.stringify(draft)
        );
      } catch {
        // Local draft is a convenience cache only.
      }
    },
    [config, user]
  );

  useEffect(() => {
    if (!loadedDraftRef.current || !user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(answers, activeIndex);
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeIndex, answers, saveDraft, user]);

  const openLabTool = (toolId: GammaAnswerQuestionConfig["toolId"]) => {
    if (awaitingReadCheck) {
      setFeedback("作品已通過，先完成這題的小測，答對後會自動前往下一題。");
      return;
    }
    if (allComplete) {
      revokeLabMediaAccess();
      setFeedback("這張學習單已經完成，圖片、影片、音樂生成權限已關閉。");
      return;
    }
    grantLabMediaAccess(activeQuestion);
    window.location.href = `/?labTool=${encodeURIComponent(toolHomeMode(toolId))}`;
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || activeQuestion.expectedKind === "text") return;
    const expected = expectedAttachmentKind(activeQuestion.expectedKind);
    const criteria = getReviewCriteria(activeQuestion);
    const allowedMimeTypes = criteria.allowedMimeTypes;
    const maxAttachments = criteria.maxAttachments;
    if (maxAttachments && activeAnswer.attachments.length >= maxAttachments) {
      setUploadMessage(`這一題最多上傳 ${maxAttachments} 個檔案。`);
      return;
    }
    const accepted = Array.from(files)
      .map((file) => {
        const kind = classifyFile(file);
        return {
          file,
          attachment: {
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            kind,
            source: "upload" as const,
            objectUrl: kind === "image" || kind === "audio" || kind === "video"
              ? URL.createObjectURL(file)
              : undefined,
          },
        };
      })
      .filter(({ attachment, file }) => {
        if (attachment.kind !== expected) return false;
        if (allowedMimeTypes.length > 0 && file.type && !allowedMimeTypes.includes(file.type)) {
          return false;
        }
        return true;
      });
    const remainingSlots = maxAttachments
      ? Math.max(0, maxAttachments - activeAnswer.attachments.length)
      : accepted.length;
    const incoming = accepted.slice(0, remainingSlots).map(({ attachment }) => attachment);

    if (incoming.length === 0) {
      setUploadMessage(`請上傳${activeQuestion.uploadLabel.replace("上傳", "") || "符合題目要求的檔案"}。`);
      return;
    }

    if (user) {
      const draftKey = localDraftKey(config, user.id);
      const incomingIds = new Set(incoming.map((attachment) => attachment.id));
      accepted.filter(({ attachment }) => incomingIds.has(attachment.id)).forEach(({ attachment, file }) => {
        saveAttachmentBlob(draftKey, attachment, file).catch(() => undefined);
      });
    }

    setAnswer(activeQuestion.id, {
      attachments: [...activeAnswer.attachments, ...incoming],
      review: undefined,
    });
    setUploadMessage(`已成功上傳 ${incoming.length} 個檔案，可以按檢查。`);
  };

  const removeAttachment = (fileId: string) => {
    const next = activeAnswer.attachments.filter((file) => {
      if (file.id === fileId && file.objectUrl) URL.revokeObjectURL(file.objectUrl);
      if (file.id === fileId && user) {
        deleteAttachmentBlob(localDraftKey(config, user.id), file.id).catch(() => undefined);
      }
      return file.id !== fileId;
    });
    setAnswer(activeQuestion.id, { attachments: next, review: undefined });
    setUploadMessage("");
  };

  const answerReadCheck = async (originalIndex?: number, textAnswer?: string) => {
    if (!activeReadCheck || reviewing || activeQuestionCompleted || readCheckLocked) return;
    const isTextReadCheck = activeReadCheck.type === "text";
    const submittedText = textAnswer ?? activeReadCheckText;
    if (isTextReadCheck && !submittedText.trim()) {
      setFeedback("請先輸入你的答案。 ");
      return;
    }
    const correct = isTextReadCheck
      ? matchesTextReadCheck(submittedText, activeReadCheck)
      : originalIndex === activeReadCheck.answerIndex;
    if (!correct) {
      const wrongAttempts = (activeReadCheckState?.wrongAttempts || 0) + 1;
      const lockSeconds = Math.min(30, wrongAttempts * 5);
      const lockedUntil = new Date(Date.now() + lockSeconds * 1000).toISOString();
      setAnswer(activeQuestion.id, {
        readChecks: {
          ...(activeAnswer.readChecks || {}),
          [activeReadCheckIndex]: {
            passed: false,
            selectedIndex: originalIndex,
            textAnswer: isTextReadCheck ? submittedText : undefined,
            answeredAt: new Date().toISOString(),
            wrongAttempts,
            lockedUntil,
          },
        },
      });
      setReadCheckClock(Date.now());
      setFeedback(
        `${activeReadCheck.retryFeedback || "再看一次題目，找出正確答案。"} 請等待 ${lockSeconds} 秒後再回答。`
      );
      return;
    }

    setReviewing(true);
    try {
      setAnswer(activeQuestion.id, {
        readChecks: {
          ...(activeAnswer.readChecks || {}),
          [activeReadCheckIndex]: {
            passed: true,
            selectedIndex: originalIndex,
            textAnswer: isTextReadCheck ? submittedText : undefined,
            answeredAt: new Date().toISOString(),
            wrongAttempts: activeReadCheckState?.wrongAttempts || 0,
          },
        },
      });
      if (activeReadCheckIndex < activeReadChecks.length - 1) {
        setFeedback("小測通過，請完成下一題小測。");
        return;
      }
      await completeActiveQuestion(
        activeAnswer.review?.signatureDetails || [],
        activeAnswer.review?.feedback
      );
      setFeedback(activeReadCheck.successFeedback || "小測通過，前往下一題。");
    } finally {
      setReviewing(false);
    }
  };

  const validateAnswerBeforeAiReview = () => {
    const problems: string[] = [];
    if (awaitingReadCheck) {
      problems.push("請先完成這題的小測，答對後會自動前往下一題。");
      return problems;
    }
    if (activeQuestion.expectedKind === "text") {
      return validateBasicGammaTextAnswer(activeAnswer.text, MAX_TEXT_REVIEW_CHARS);
    }

    const criteria = getReviewCriteria(activeQuestion);
    const expected = expectedAttachmentKind(activeQuestion.expectedKind);
    const expectedFiles = activeAnswer.attachments.filter((file) => file.kind === expected);
    if (expectedFiles.length < 1) {
      problems.push(`請先上傳${activeQuestion.uploadLabel.replace("上傳", "") || "指定檔案"}。`);
      return problems;
    }
    if (criteria.maxAttachments && expectedFiles.length > criteria.maxAttachments) {
      problems.push(`這一題最多保留 ${criteria.maxAttachments} 個檔案。`);
    }

    expectedFiles.forEach((file) => {
      if (file.size <= 0) problems.push(`${file.name} 是空檔案，請重新上傳。`);
      if (file.size > MAX_REVIEW_FILE_BYTES) {
        problems.push(`${file.name} 檔案太大，請換成 100 MB 以內的檔案。`);
      }
      if (
        criteria.allowedMimeTypes.length > 0 &&
        file.type &&
        !criteria.allowedMimeTypes.includes(file.type)
      ) {
        problems.push(`${file.name} 的檔案格式不符合這一題。`);
      }
      if (!file.objectUrl && !file.downloadUrl) {
        problems.push(`${file.name} 預覽尚未載入，請重新選擇檔案。`);
      }
    });

    return problems;
  };

  const readAttachmentReviewMetadata = async (
    kind: LabToolSignatureKind,
    blob: Blob
  ): Promise<LabToolReviewMetadata | null> => {
    if (kind === "image") {
      return readLabImageMetadataFromBlob(blob).catch(() => null);
    }
    if (kind === "music") {
      return readLabMusicMetadataFromBlob(blob).catch(() => null);
    }
    if (kind === "video") {
      return readLabVideoMetadataFromBlob(blob).catch(() => null);
    }
    return null;
  };

  const verifyLabToolAttachment = async (
    file: GammaAttachment,
    kind: LabToolSignatureKind
  ): Promise<LabToolSignatureVerification> => {
    const draftKey = user ? localDraftKey(config, user.id) : "";
    const blob = await getAttachmentBlob(file, draftKey);
    if (!blob) {
      return { problem: `${file.name} 無法讀取檔案內容，請重新上傳 Lab 作品。` };
    }

    const metadata = await readAttachmentReviewMetadata(kind, blob);
    const expectedHash =
      metadata && typeof metadata.contentHash === "string" ? metadata.contentHash : "";
    const contentHash = await signedContentHash(kind, blob, expectedHash);

    if (expectedHash && contentHash !== expectedHash) {
      return { problem: `${file.name} 的檔案內容和 Lab Terminal 簽章不一致。` };
    }

    const response = await fetch("/api/lab-tools/signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        worksheetId: config.id,
        taskId: activeQuestion.taskId,
        kind,
        fileName: file.name,
        contentHash,
        metadata,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { problem: result?.error || `${file.name} 的 Lab Terminal 簽章驗證失敗。` };
    }
    if (!result?.valid) {
      return { problem: result?.reason || `${file.name} 不是這一題的 Lab Terminal 作品。` };
    }
    const signature = typeof result?.metadata?.signature === "string" ? result.metadata.signature : "";
    const signatureVersion = Number(result?.metadata?.signatureVersion) || 1;
    return {
      problem: "",
      signatureDetail: signature
        ? `${file.name} · 簽章 v${signatureVersion} · ${signature.slice(0, 16)}...`
        : `${file.name} · Lab Terminal 簽章已驗證`,
    };
  };

  const validateLabToolSignatures = async () => {
    if (activeQuestion.expectedKind === "text") {
      return { problems: [], signatureDetails: [] };
    }
    const kind = signatureKindForExpectedKind(activeQuestion.expectedKind);
    if (!kind) return { problems: [], signatureDetails: [] };

    const expected = expectedAttachmentKind(activeQuestion.expectedKind);
    const expectedFiles = activeAnswer.attachments.filter((file) => file.kind === expected);
    const problems: string[] = [];
    const signatureDetails: string[] = [];

    for (const file of expectedFiles) {
      const verification = await verifyLabToolAttachment(file, kind);
      if (verification.problem) problems.push(verification.problem);
      if (verification.signatureDetail) signatureDetails.push(verification.signatureDetail);
    }

    return { problems, signatureDetails };
  };

  const completeActiveQuestion = async (
    signatureDetails = activeAnswer.review?.signatureDetails || [],
    reviewFeedback?: string
  ) => {
    if (!user) return;

    await approveTask({
      studentId: user.id,
      studentName: user.displayName || user.username || "",
      worksheetId: config.id,
      taskId: activeQuestion.taskId,
      teacherId: "local-review",
      teacherName: "系統檢查",
    });

    const latest = await getStudentWorksheetProgress(user.id, config.id);
    onProgressChange(latest);

    const nextCompletedCount = config.questions.filter((question) => {
      if (question.taskId === activeQuestion.taskId) return true;
      return isGammaAnswerQuestionCompleted(latest?.tasks, config, question);
    }).length;

    const review = {
      passed: true,
      feedback: reviewFeedback || `審核通過，已加入 ${activeQuestion.coins} 金幣。`,
      reviewedAt: new Date().toISOString(),
      signatureDetails,
    };
    setAnswer(activeQuestion.id, { review });
    setFeedback(review.feedback);
    setCelebration(nextCompletedCount >= config.questions.length ? "all" : "question");

    if (nextCompletedCount >= config.questions.length) {
      revokeLabMediaAccess();
      removeLabToolSessions();
      await markLessonCompleted(user.id, lessonKeys.worksheet(config.id), {
        type: "score",
        score: config.questions.reduce((sum, question) => sum + question.coins, 0),
        label: config.title,
      });
    } else {
      const nextIndex = Math.min(activeIndex + 1, config.questions.length - 1);
      setTimeout(() => setActiveIndex(nextIndex), 950);
    }

    setTimeout(() => setCelebration(null), 2400);
  };

  const continueAfterAnswerPassed = async (passFeedback?: string, signatureDetails: string[] = []) => {
    if (activeReadChecks.length > 0 && activeReadCheckIndex >= 0) {
      const review = {
        passed: true,
        feedback: passFeedback || "答案已通過，請完成這題的讀題小測。",
        reviewedAt: new Date().toISOString(),
        signatureDetails,
      };
      setAnswer(activeQuestion.id, { review });
      setFeedback("這題答案已通過。請回答讀題小測，答對後會自動前往下一題。");
      return;
    }

    await completeActiveQuestion(signatureDetails, passFeedback);
  };

  const reviewAnswer = async () => {
    if (!user || reviewing) return;
    if (activeQuestionCompleted) return;

    setReviewing(true);
    setFeedback("正在檢查答案...");
    const missing = validateAnswerBeforeAiReview();

    if (missing.length > 0) {
      const review = {
        passed: false,
        feedback: missing.join(" "),
        reviewedAt: new Date().toISOString(),
      };
      setAnswer(activeQuestion.id, { review });
      setFeedback(review.feedback);
      setReviewing(false);
      return;
    }

    try {
      if (activeQuestion.expectedKind === "text") {
        setFeedback("AI 正在檢查你的答案...");
        const response = await fetch("/api/gamma-answer-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worksheetId: config.id,
            taskId: activeQuestion.taskId,
            question: { taskId: activeQuestion.taskId },
            answer: { text: activeAnswer.text.trim() },
          }),
        });
        const result = await response.json().catch(() => ({}));
        console.info("[gamma-answer-review] client-result", {
          worksheetId: config.id,
          taskId: activeQuestion.taskId,
          passed: result?.passed,
          feedback: result?.feedback,
          responseStatus: response.status,
        });
        if (!response.ok) {
          throw new Error(result?.error || "AI 審查暫時無法使用，請稍後再試。");
        }
        if (!result?.passed) {
          const review = {
            passed: false,
            feedback: result?.feedback || "答案還需要補充，請依建議修改後再送出。",
            reviewedAt: new Date().toISOString(),
          };
          setAnswer(activeQuestion.id, { review });
          setFeedback(review.feedback);
          return;
        }

        await continueAfterAnswerPassed(result?.feedback);
        return;
      }

      const { problems: signatureProblems, signatureDetails } = await validateLabToolSignatures();
      if (signatureProblems.length > 0) {
        const review = {
          passed: false,
          feedback: signatureProblems.join(" "),
          reviewedAt: new Date().toISOString(),
        };
        setAnswer(activeQuestion.id, { review });
        setFeedback(review.feedback);
        return;
      }

      setFeedback("檢查通過，正在加入金幣...");
      await continueAfterAnswerPassed(undefined, signatureDetails);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already approved/i.test(message)) {
        const latest = await getStudentWorksheetProgress(user.id, config.id);
        onProgressChange(latest);
        setFeedback("這題已經完成，金幣不會重複發放。");
      } else {
        setFeedback(`加分失敗：${message}`);
      }
    } finally {
      setReviewing(false);
    }
  };

  const renderAttachmentPreview = (file: GammaAttachment) => {
    if (!file.objectUrl && !file.downloadUrl) {
      return (
        <div className="attachment-empty">
          預覽載入中，若沒有出現請重新選擇檔案。
        </div>
      );
    }
    const src = file.objectUrl || file.downloadUrl || "";
    if (file.kind === "image") {
      return <img src={src} alt={file.name} className="attachment-preview-media image" />;
    }
    if (file.kind === "audio") {
      return <audio src={src} controls className="attachment-preview-media audio" />;
    }
    if (file.kind === "video") {
      return <video src={src} controls className="attachment-preview-media video" />;
    }
    return null;
  };

  return (
    <div className="gamma-answer-page">
      {celebration && (
        <div className="question-confetti">
          {Array.from({ length: celebration === "all" ? 96 : 42 }).map((_, index) => (
            <span
              key={index}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                ["--piece-color" as string]: [
                  "var(--terminal-primary)",
                  "var(--terminal-accent)",
                  "var(--terminal-highlight)",
                  "var(--terminal-primary-dim)",
                  "var(--terminal-primary-glow)",
                ][index % 5],
                ["--fall-time" as string]: `${1.2 + Math.random() * 0.8}s`,
                ["--fall-drift" as string]: `${Math.random() * 72 - 36}px`,
                ["--fall-rotate" as string]: `${360 + Math.random() * 420}deg`,
                animationDelay: `${Math.random() * 0.35}s`,
              }}
            />
          ))}
        </div>
      )}

      <style jsx global>{`
        .gamma-answer-page {
          --bg: var(--terminal-bg, #07110f);
          --panel: color-mix(in srgb, var(--terminal-bg, #07110f) 88%, var(--terminal-primary, #62d3b5) 12%);
          --panel-2: color-mix(in srgb, var(--terminal-bg, #07110f) 78%, var(--terminal-primary, #62d3b5) 22%);
          --line: var(--terminal-primary-dim, #2f665b);
          --line-soft: var(--terminal-border, color-mix(in srgb, var(--terminal-primary, #62d3b5) 28%, transparent));
          --text: var(--terminal-highlight, #e4fff7);
          --muted: var(--terminal-primary-dim, #90c8ba);
          --accent: var(--terminal-primary, #62d3b5);
          --accent-soft-04: color-mix(in srgb, var(--accent) 4%, transparent);
          --accent-soft-07: color-mix(in srgb, var(--accent) 7%, transparent);
          --accent-soft-08: color-mix(in srgb, var(--accent) 8%, transparent);
          --accent-soft-09: color-mix(in srgb, var(--accent) 9%, transparent);
          --accent-soft-10: color-mix(in srgb, var(--accent) 10%, transparent);
          --accent-soft-11: color-mix(in srgb, var(--accent) 11%, transparent);
          --accent-soft-12: color-mix(in srgb, var(--accent) 12%, transparent);
          --accent-soft-14: color-mix(in srgb, var(--accent) 14%, transparent);
          --accent-soft-16: color-mix(in srgb, var(--accent) 16%, transparent);
          --accent-soft-18: color-mix(in srgb, var(--accent) 18%, transparent);
          --accent-soft-20: color-mix(in srgb, var(--accent) 20%, transparent);
          --accent-soft-22: color-mix(in srgb, var(--accent) 22%, transparent);
          --accent-soft-24: color-mix(in srgb, var(--accent) 24%, transparent);
          --accent-soft-28: color-mix(in srgb, var(--accent) 28%, transparent);
          --accent-soft-30: color-mix(in srgb, var(--accent) 30%, transparent);
          --accent-soft-38: color-mix(in srgb, var(--accent) 38%, transparent);
          --accent-contrast: var(--terminal-bg, #031310);
          --secondary-accent: var(--terminal-accent, var(--terminal-highlight, #ffd35c));
          --secondary-soft-08: color-mix(in srgb, var(--secondary-accent) 8%, transparent);
          --secondary-soft-10: color-mix(in srgb, var(--secondary-accent) 10%, transparent);
          --secondary-soft-12: color-mix(in srgb, var(--secondary-accent) 12%, transparent);
          --secondary-soft-16: color-mix(in srgb, var(--secondary-accent) 16%, transparent);
          --secondary-soft-18: color-mix(in srgb, var(--secondary-accent) 18%, transparent);
          --secondary-soft-20: color-mix(in srgb, var(--secondary-accent) 20%, transparent);
          --secondary-soft-24: color-mix(in srgb, var(--secondary-accent) 24%, transparent);
          --secondary-soft-28: color-mix(in srgb, var(--secondary-accent) 28%, transparent);
          --secondary-soft-38: color-mix(in srgb, var(--secondary-accent) 38%, transparent);
          --coin-bg: color-mix(in srgb, var(--terminal-highlight, #f8fafc) 12%, transparent);
          --coin-border: color-mix(in srgb, var(--terminal-highlight, #f8fafc) 56%, transparent);
          --coin-text: var(--terminal-highlight, #f8fafc);
          --paper: #f7fbff;
          height: 100vh;
          min-height: 0;
          overflow: hidden;
          background: var(--bg);
          color: var(--text);
          font-family: "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif;
          font-size: 16px;
          letter-spacing: 0;
        }

        .gamma-answer-page *,
        .gamma-answer-page *::before,
        .gamma-answer-page *::after {
          box-sizing: border-box;
        }

        .gamma-answer-page button,
        .gamma-answer-page textarea,
        .gamma-answer-page input {
          font: inherit;
        }

        .gamma-answer-page button {
          border-radius: 0;
        }

        .gamma-answer-page .shell {
          width: min(1500px, calc(100% - 20px));
          height: 100vh;
          min-height: 0;
          margin: 0 auto;
          padding: 6px 0;
          display: flex;
          flex-direction: column;
        }

        .gamma-answer-page .topbar {
          flex: 0 0 auto;
          min-height: 28px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) clamp(500px, 29vw, 560px);
          gap: 8px;
          align-items: center;
          padding: 4px 8px;
          border: 1px solid var(--line-soft);
          background: color-mix(in srgb, var(--panel) 94%, transparent);
        }

        .gamma-answer-page .brand {
          min-width: 0;
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: nowrap;
        }

        .gamma-answer-page .brand h1 {
          margin: 0;
          color: var(--text);
          font-size: 16px;
          font-weight: 700;
          line-height: 1.1;
          white-space: nowrap;
        }

        .gamma-answer-page .brand span {
          min-width: 0;
          color: var(--muted);
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gamma-answer-page .topbar-actions {
          justify-self: end;
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .gamma-answer-page .home-link,
        .gamma-answer-page .prototype-label {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 3px 9px;
          border: 1px solid var(--accent);
          background: var(--accent-soft-18);
          color: var(--text);
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
        }

        .gamma-answer-page .home-link:hover {
          background: var(--accent);
          color: var(--bg);
        }

        .gamma-answer-page .prototype-label {
          border-color: var(--line-soft);
          background: var(--accent-soft-08);
          color: var(--accent);
          font-size: 10px;
          font-weight: 700;
        }

        .gamma-answer-page .workspace {
          flex: 1;
          min-height: 0;
          margin-top: 6px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) clamp(500px, 29vw, 560px);
          gap: 8px;
        }

        .gamma-answer-page .gamma-pane,
        .gamma-answer-page .lab-pane {
          min-width: 0;
          min-height: 0;
          height: 100%;
          border: 1px solid var(--line-soft);
          background: var(--panel);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .gamma-answer-page .pane-head {
          flex: 0 0 auto;
          min-height: 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 5px 9px;
          border-bottom: 1px solid var(--line-soft);
        }

        .gamma-answer-page .pane-head strong {
          color: var(--accent);
          font-size: 14px;
          font-weight: 700;
        }

        .gamma-answer-page .pane-head span {
          color: var(--muted);
          font-size: 12px;
          text-align: right;
        }

        .gamma-answer-page .gamma-frame-wrap {
          position: relative;
          flex: 1;
          min-height: 0;
          background: var(--paper);
        }

        .gamma-answer-page .gamma-frame {
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
          background: var(--paper);
        }

        .gamma-answer-page .lab-body {
          flex: 1;
          min-height: 0;
          padding: clamp(6px, 1vh, 8px);
          display: grid;
          grid-template-rows: auto auto auto minmax(96px, 1fr) auto auto auto auto;
          gap: clamp(5px, 0.8vh, 7px);
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-gutter: stable;
        }

        .gamma-answer-page .lab-body > * {
          min-width: 0;
          max-width: 100%;
        }

        .gamma-answer-page .tool-switcher,
        .gamma-answer-page .question-tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 5px;
        }

        .gamma-answer-page .tool-mode-btn {
          min-height: 34px;
          border: 1px solid var(--line);
          background: var(--accent-soft-07);
          color: var(--muted);
          padding: 4px 5px;
          cursor: pointer;
          font-size: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gamma-answer-page .tool-mode-btn:hover,
        .gamma-answer-page .tool-mode-btn.active {
          border-color: var(--accent);
          background: var(--accent-soft-18);
          color: var(--text);
        }

        .gamma-answer-page .tool-mode-btn:disabled {
          cursor: not-allowed;
          opacity: 0.45;
          border-color: var(--line-soft);
          background: color-mix(in srgb, var(--panel) 86%, transparent);
          color: var(--muted);
        }

        .gamma-answer-page .tool-mode-btn:disabled:hover {
          border-color: var(--line-soft);
          background: color-mix(in srgb, var(--panel) 86%, transparent);
          color: var(--muted);
        }

        .gamma-answer-page .locator {
          border: 1px solid var(--line-soft);
          background: var(--accent-soft-07);
          padding: 7px;
        }

        .gamma-answer-page .locator-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 5px;
          color: var(--text);
          font-size: 14px;
          font-weight: 700;
        }

        .gamma-answer-page .locator-title span {
          color: var(--accent);
          font-size: 13px;
          white-space: nowrap;
        }

        .gamma-answer-page .tab-btn {
          min-height: 34px;
          border: 1px solid var(--line);
          background: color-mix(in srgb, var(--bg) 58%, transparent);
          color: var(--muted);
          cursor: pointer;
          font-size: 15px;
          padding: 3px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .gamma-answer-page .tab-btn:hover {
          border-color: var(--accent);
          color: var(--text);
        }

        .gamma-answer-page .tab-btn.active {
          border-color: var(--accent);
          background: var(--accent);
          color: var(--accent-contrast);
          font-weight: 700;
        }

        .gamma-answer-page .tab-btn.done {
          border-color: color-mix(in srgb, var(--secondary-accent) 88%, transparent);
          color: var(--secondary-accent);
          background: var(--secondary-soft-10);
          box-shadow: 0 0 14px var(--secondary-soft-18);
        }

        .gamma-answer-page .tab-btn.active.done {
          color: var(--accent-contrast);
          background: linear-gradient(90deg, var(--secondary-accent), var(--accent));
          box-shadow: 0 0 18px var(--secondary-soft-28);
        }

        .gamma-answer-page .tab-btn.done::after {
          content: "★";
          display: inline-block;
          color: var(--secondary-accent);
          font-size: 12px;
          line-height: 1;
          text-shadow: 0 0 8px color-mix(in srgb, var(--secondary-accent) 78%, transparent);
        }

        .gamma-answer-page .tab-btn.locked {
          cursor: not-allowed;
          opacity: 0.42;
          border-color: var(--line-soft);
          background: color-mix(in srgb, var(--bg) 70%, transparent);
          color: var(--muted);
        }

        .gamma-answer-page .tab-btn.locked::after {
          content: "鎖";
          font-size: 10px;
          line-height: 1;
        }

        .gamma-answer-page .question-card {
          border: 1px solid var(--line-soft);
          background: var(--panel-2);
          padding: 7px 8px;
        }

        .gamma-answer-page .question-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 4px;
        }

        .gamma-answer-page .question-meta span {
          color: var(--muted);
          font-size: 10px;
        }

        .gamma-answer-page .coins {
          color: var(--coin-text);
          background: var(--coin-bg);
          border: 1px solid var(--coin-border);
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
          text-shadow: none;
          letter-spacing: 0;
        }

        .gamma-answer-page .question-card h2 {
          margin: 0 0 4px;
          color: var(--accent);
          font-size: 18px;
          font-weight: 900;
          line-height: 1.25;
          text-shadow:
            0 0 10px color-mix(in srgb, var(--accent) 58%, transparent),
            0 0 22px var(--accent-soft-22);
        }

        .gamma-answer-page .question-card p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.42;
        }

        .gamma-answer-page .page-hint {
          margin-top: 5px;
          color: var(--accent);
          font-size: 13px;
          line-height: 1.35;
          font-weight: 700;
        }

        .gamma-answer-page .answer-input {
          min-height: clamp(96px, 24vh, 270px);
          height: 100%;
          max-width: 100%;
          width: 100%;
          resize: none;
          overflow-x: hidden;
          overflow-y: auto;
          border: 1px solid var(--line);
          background: color-mix(in srgb, var(--bg) 72%, transparent);
          color: var(--text);
          padding: 10px;
          outline: none;
          line-height: 1.55;
          font-size: 17px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .gamma-answer-page .answer-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-soft-16);
        }

        .gamma-answer-page .read-check-card {
          min-height: clamp(180px, 30vh, 320px);
          border: 2px solid color-mix(in srgb, var(--secondary-accent) 78%, transparent);
          background:
            linear-gradient(135deg, var(--secondary-soft-16), transparent 44%),
            color-mix(in srgb, var(--panel) 82%, transparent);
          padding: 14px;
          display: grid;
          align-content: center;
          gap: 12px;
          box-shadow:
            0 0 0 3px var(--secondary-soft-12),
            0 0 28px var(--secondary-soft-20);
        }

        .gamma-answer-page .read-check-label {
          color: var(--terminal-accent, #9ee9ff);
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0;
        }

        .gamma-answer-page .read-check-card h3 {
          margin: 0;
          color: var(--text);
          font-size: clamp(18px, 2.1vw, 28px);
          line-height: 1.28;
          text-shadow: 0 0 18px var(--accent-soft-22);
        }

        .gamma-answer-page .read-check-options {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .gamma-answer-page .read-check-text-answer {
          display: grid;
          gap: 8px;
        }

        .gamma-answer-page .read-check-text-answer textarea {
          min-height: 88px;
          width: 100%;
          resize: vertical;
          border: 1px solid color-mix(in srgb, var(--accent) 72%, transparent);
          background: color-mix(in srgb, var(--bg) 82%, transparent);
          color: var(--text);
          padding: 10px;
          font: inherit;
          line-height: 1.45;
          outline: none;
        }

        .gamma-answer-page .read-check-text-answer textarea:focus {
          border-color: var(--terminal-highlight, #ffe684);
          box-shadow: 0 0 0 2px var(--accent-soft-16);
        }

        .gamma-answer-page .read-check-text-answer button {
          justify-self: end;
          min-height: 38px;
          border: 1px solid var(--terminal-highlight, #ffe684);
          background: var(--accent-soft-12);
          color: var(--terminal-highlight, #ffe684);
          padding: 7px 14px;
          font-size: 14px;
          font-weight: 900;
        }

        .gamma-answer-page .read-check-text-answer button:disabled {
          cursor: not-allowed;
          opacity: 0.58;
        }

        .gamma-answer-page .read-check-lock {
          border: 1px solid color-mix(in srgb, var(--danger, #ff5c7c) 70%, transparent);
          background: color-mix(in srgb, var(--danger, #ff5c7c) 12%, transparent);
          color: var(--text);
          padding: 9px 10px;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.35;
        }

        .gamma-answer-page .read-check-option {
          min-height: 52px;
          border: 1px solid color-mix(in srgb, var(--accent) 66%, transparent);
          background: var(--accent-soft-09);
          color: var(--text);
          padding: 8px 10px;
          cursor: pointer;
          text-align: left;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.28;
          overflow-wrap: anywhere;
        }

        .gamma-answer-page .read-check-option:hover {
          border-color: var(--terminal-highlight, #ffe684);
          background: var(--accent-soft-16);
          box-shadow: 0 0 20px var(--accent-soft-22);
        }

        .gamma-answer-page .read-check-option.selected {
          border-color: var(--danger, #ff5c7c);
          background: color-mix(in srgb, var(--danger, #ff5c7c) 20%, transparent);
        }

        .gamma-answer-page .read-check-option:disabled {
          cursor: not-allowed;
          opacity: 0.68;
        }

        .gamma-answer-page .attachment-panel {
          min-height: 0;
          border: 1px solid var(--line-soft);
          background: color-mix(in srgb, var(--bg) 76%, transparent);
          padding: 7px;
          display: grid;
          gap: 6px;
        }

        .gamma-answer-page .attachment-panel.upload-success {
          border-color: color-mix(in srgb, var(--accent) 92%, transparent);
          background: var(--accent-soft-11);
          box-shadow:
            0 0 0 3px var(--accent-soft-12),
            0 0 22px var(--accent-soft-22);
        }

        .gamma-answer-page .attachment-panel.upload-success .attachment-head {
          min-height: 0;
        }

        .gamma-answer-page .attachment-panel.upload-success .upload-note {
          display: none;
        }

        .gamma-answer-page .attachment-head {
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          gap: 8px;
        }

        .gamma-answer-page .attachment-title {
          display: flex;
          align-items: baseline;
          gap: 6px;
          min-width: 0;
        }

        .gamma-answer-page .attachment-title strong {
          color: var(--text);
          font-size: 15px;
          white-space: nowrap;
        }

        .gamma-answer-page .attachment-title span,
        .gamma-answer-page .upload-note {
          color: var(--muted);
          font-size: 13px;
          line-height: 1.35;
        }

        .gamma-answer-page .file-upload-btn,
        .gamma-answer-page .attachment-remove {
          border: 1px solid var(--line);
          background: var(--accent-soft-08);
          color: var(--text);
          cursor: pointer;
          font-size: 14px;
        }

        .gamma-answer-page .file-upload-btn {
          min-height: 54px;
          min-width: min(230px, 52%);
          padding: 8px 12px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 8px;
          white-space: normal;
          text-align: left;
          border-color: color-mix(in srgb, var(--secondary-accent) 72%, transparent);
          background:
            linear-gradient(135deg, var(--secondary-soft-20), var(--accent-soft-14)),
            color-mix(in srgb, var(--bg) 82%, transparent);
          box-shadow: 0 0 18px var(--secondary-soft-12);
        }

        .gamma-answer-page .file-upload-btn:hover,
        .gamma-answer-page .attachment-remove:hover {
          border-color: var(--accent);
          background: var(--accent-soft-16);
        }

        .gamma-answer-page .upload-plus {
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          border: 1px solid color-mix(in srgb, var(--secondary-accent) 82%, transparent);
          background: var(--secondary-soft-16);
          color: var(--secondary-accent);
          font-size: 22px;
          font-weight: 900;
          line-height: 1;
          box-shadow: 0 0 16px var(--secondary-soft-24);
        }

        .gamma-answer-page .upload-copy {
          min-width: 0;
          display: grid;
          gap: 1px;
        }

        .gamma-answer-page .upload-copy strong,
        .gamma-answer-page .upload-copy small {
          overflow-wrap: anywhere;
        }

        .gamma-answer-page .upload-copy strong {
          color: var(--terminal-highlight, #fff8d7);
          font-size: 15px;
          line-height: 1.2;
        }

        .gamma-answer-page .upload-copy small {
          color: var(--terminal-accent, #9ee9ff);
          font-size: 12px;
          line-height: 1.25;
        }

        .gamma-answer-page .attachment-list {
          display: grid;
          gap: 5px;
          max-height: clamp(52px, 14vh, 138px);
          overflow: auto;
          padding-right: 2px;
        }

        .gamma-answer-page .attachment-panel.upload-success .attachment-list {
          max-height: clamp(168px, 36vh, 360px);
          padding-right: 0;
        }

        .gamma-answer-page .attachment-empty {
          border: 1px dashed var(--line);
          color: var(--muted);
          padding: 7px;
          font-size: 13px;
          text-align: center;
          background: var(--accent-soft-04);
        }

        .gamma-answer-page .attachment-item {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 7px;
          align-items: start;
          border: 1px solid var(--accent-soft-22);
          background: color-mix(in srgb, var(--panel) 74%, transparent);
          padding: 6px;
        }

        .gamma-answer-page .attachment-panel.upload-success .attachment-item {
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          padding: 8px;
        }

        .gamma-answer-page .attachment-panel.upload-success .type-chip {
          display: none;
        }

        .gamma-answer-page .type-chip {
          min-width: 36px;
          border: 1px solid var(--line);
          color: var(--accent);
          background: var(--accent-soft-08);
          padding: 2px 4px;
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
        }

        .gamma-answer-page .attachment-main {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .gamma-answer-page .attachment-name {
          color: var(--text);
          font-size: 14px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gamma-answer-page .attachment-meta {
          color: var(--muted);
          font-size: 12px;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .gamma-answer-page .attachment-preview-media {
          max-width: 100%;
          max-height: 78px;
          border: 1px solid var(--accent-soft-22);
          background: var(--bg);
        }

        .gamma-answer-page .attachment-panel.upload-success .attachment-preview-media {
          max-height: clamp(132px, 28vh, 300px);
        }

        .gamma-answer-page .attachment-preview-media.image,
        .gamma-answer-page .attachment-preview-media.video {
          width: 100%;
          object-fit: contain;
        }

        .gamma-answer-page .attachment-preview-media.audio {
          width: 100%;
          height: 30px;
        }

        .gamma-answer-page .attachment-panel.upload-success .attachment-preview-media.audio {
          height: 44px;
          max-height: none;
        }

        .gamma-answer-page .attachment-remove {
          width: 40px;
          min-height: 24px;
          padding: 0 4px;
          line-height: 1;
        }

        .gamma-answer-page .field-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 6px;
        }

        .gamma-answer-page .tool-btn {
          min-height: 30px;
          border: 1px solid var(--line);
          background: var(--accent-soft-09);
          color: var(--text);
          padding: 6px 8px;
          cursor: pointer;
          text-align: center;
          font-size: 14px;
        }

        .gamma-answer-page .review-action {
          min-height: 56px;
          border: 2px solid color-mix(in srgb, var(--secondary-accent) 95%, transparent);
          background:
            linear-gradient(90deg, var(--secondary-accent), var(--accent) 52%, var(--terminal-highlight, #4dc9ff)),
            var(--secondary-accent);
          color: var(--accent-contrast);
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0;
          box-shadow:
            0 0 0 3px var(--secondary-soft-12),
            0 0 24px var(--secondary-soft-38),
            0 0 32px var(--accent-soft-22);
        }

        .gamma-answer-page .review-action:hover {
          border-color: var(--terminal-highlight, #fff8d7);
          background:
            linear-gradient(90deg, var(--terminal-highlight, #ffe684), var(--accent) 52%, var(--terminal-accent, #70d8ff)),
            var(--terminal-highlight, #ffe684);
          box-shadow:
            0 0 0 4px var(--secondary-soft-16),
            0 0 30px color-mix(in srgb, var(--secondary-accent) 48%, transparent),
            0 0 42px color-mix(in srgb, var(--accent) 32%, transparent);
        }

        .gamma-answer-page .review-action.is-complete,
        .gamma-answer-page .review-action.is-complete:hover,
        .gamma-answer-page .review-action:disabled {
          border-color: color-mix(in srgb, var(--secondary-accent) 36%, transparent);
          background: var(--secondary-soft-08);
          color: var(--secondary-accent);
          cursor: default;
          box-shadow: none;
          text-shadow: 0 0 10px color-mix(in srgb, var(--secondary-accent) 52%, transparent);
        }

        .gamma-answer-page .answer-status {
          border: 2px solid color-mix(in srgb, var(--terminal-highlight, #ffe684) 86%, transparent);
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--terminal-highlight, #ffe684) 18%, transparent), transparent 46%),
            color-mix(in srgb, var(--bg) 72%, transparent);
          padding: 10px;
          color: var(--text);
          font-size: 14px;
          line-height: 1.4;
          box-shadow:
            0 0 0 3px color-mix(in srgb, var(--terminal-highlight, #ffe684) 12%, transparent),
            0 0 22px color-mix(in srgb, var(--terminal-highlight, #ffe684) 22%, transparent);
        }

        .gamma-answer-page .answer-feedback {
          min-height: 96px;
          max-height: 160px;
          overflow: auto;
          color: var(--terminal-highlight, #ffe684);
          font-size: 17px;
          font-weight: 900;
          line-height: 1.45;
          overflow-wrap: anywhere;
          word-break: break-word;
          text-shadow:
            0 0 10px color-mix(in srgb, var(--terminal-highlight, #ffe684) 48%, transparent),
            0 0 18px var(--accent-soft-22);
        }

        .gamma-answer-page .answer-complete-label {
          min-height: 96px;
          color: var(--text);
          font: inherit;
          font-weight: 400;
          line-height: 1.45;
        }

        .gamma-answer-page .signature-details {
          margin-top: 6px;
          color: color-mix(in srgb, var(--terminal-highlight, #e4fff7) 52%, transparent);
          font-size: 11px;
          line-height: 1.45;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .gamma-answer-page .question-confetti {
          position: fixed;
          inset: 0;
          z-index: 1001;
          overflow: hidden;
          pointer-events: none;
        }

        .gamma-answer-page .confetti-piece {
          position: absolute;
          top: -24px;
          width: 8px;
          height: 20px;
          background: var(--piece-color, var(--accent));
          box-shadow: 0 0 16px var(--piece-color, var(--accent));
          transform: translateY(-20px) rotate(0deg);
          animation: gammaAnswerCyberFall var(--fall-time, 1.8s) linear forwards;
        }

        @keyframes gammaAnswerCyberFall {
          0% {
            opacity: 0;
            transform: translate3d(0, -24px, 0) rotate(0deg);
          }
          12% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--fall-drift, 36px), 112vh, 0) rotate(var(--fall-rotate, 420deg));
          }
        }

        @media (max-height: 760px) and (min-width: 981px) {
          .gamma-answer-page .shell {
            padding: 4px 0;
          }

          .gamma-answer-page .topbar,
          .gamma-answer-page .pane-head {
            min-height: 24px;
            padding: 3px 7px;
          }

          .gamma-answer-page .lab-body {
            padding: 6px;
            gap: 4px;
          }

          .gamma-answer-page .question-card,
          .gamma-answer-page .attachment-panel,
          .gamma-answer-page .answer-status {
            padding: 5px 6px;
          }

          .gamma-answer-page .page-hint,
          .gamma-answer-page .upload-note {
            font-size: 12px;
            line-height: 1.25;
          }

          .gamma-answer-page .answer-feedback {
            min-height: 76px;
            max-height: 116px;
            font-size: 14px;
            line-height: 1.35;
          }

          .gamma-answer-page .answer-input {
            min-height: 88px;
            padding: 7px;
            font-size: 15px;
          }

          .gamma-answer-page .read-check-card {
            min-height: 144px;
            padding: 10px;
            gap: 8px;
          }

          .gamma-answer-page .read-check-card h3 {
            font-size: 16px;
          }

          .gamma-answer-page .read-check-option {
            min-height: 42px;
            font-size: 13px;
          }

          .gamma-answer-page .attachment-list {
            max-height: 72px;
          }

          .gamma-answer-page .tool-btn,
          .gamma-answer-page .tool-mode-btn,
          .gamma-answer-page .tab-btn {
            min-height: 26px;
            padding: 3px 5px;
          }

          .gamma-answer-page .review-action {
            min-height: 44px;
            font-size: 15px;
          }

          .gamma-answer-page .file-upload-btn {
            min-height: 42px;
            padding: 6px 9px;
          }

          .gamma-answer-page .upload-plus {
            width: 26px;
            height: 26px;
            font-size: 18px;
          }

          .gamma-answer-page .upload-copy small {
            font-size: 12px;
          }

          .gamma-answer-page .answer-status {
            gap: 5px;
          }
        }

        @media (max-height: 660px) and (min-width: 981px) {
          .gamma-answer-page .brand h1,
          .gamma-answer-page .question-card h2 {
            font-size: 15px;
          }

          .gamma-answer-page .brand span,
          .gamma-answer-page .pane-head strong,
          .gamma-answer-page .locator-title,
          .gamma-answer-page .answer-input {
            font-size: 13px;
          }

          .gamma-answer-page .tool-btn {
            font-size: 12px;
          }

          .gamma-answer-page .review-action {
            min-height: 38px;
            font-size: 13px;
          }

          .gamma-answer-page .question-card p,
          .gamma-answer-page .page-hint,
          .gamma-answer-page .attachment-title span,
          .gamma-answer-page .upload-note,
          .gamma-answer-page .attachment-meta {
            font-size: 12px;
          }

          .gamma-answer-page .answer-feedback {
            min-height: 62px;
            max-height: 96px;
            font-size: 13px;
          }

          .gamma-answer-page .lab-body {
            grid-template-rows: auto auto auto minmax(72px, 1fr) auto auto auto auto;
            gap: 3px;
          }

          .gamma-answer-page .answer-input {
            min-height: 72px;
            line-height: 1.35;
          }

          .gamma-answer-page .read-check-card {
            min-height: 120px;
            padding: 8px;
            gap: 6px;
          }

          .gamma-answer-page .read-check-options {
            grid-template-columns: 1fr;
          }

          .gamma-answer-page .attachment-list {
            max-height: 52px;
          }

          .gamma-answer-page .file-upload-btn {
            min-height: 34px;
            grid-template-columns: minmax(0, 1fr);
          }

          .gamma-answer-page .upload-plus,
          .gamma-answer-page .upload-copy small {
            display: none;
          }
        }

        @media (max-width: 1100px) {
          .gamma-answer-page .topbar,
          .gamma-answer-page .workspace {
            grid-template-columns: minmax(0, 1fr) clamp(420px, 36vw, 500px);
          }
        }

        @media (max-width: 980px) {
          .gamma-answer-page {
            height: auto;
            min-height: 100vh;
            overflow: auto;
          }

          .gamma-answer-page .shell {
            height: auto;
            min-height: 100vh;
          }

          .gamma-answer-page .topbar,
          .gamma-answer-page .workspace {
            grid-template-columns: 1fr;
          }

          .gamma-answer-page .topbar-actions {
            justify-self: start;
          }

          .gamma-answer-page .gamma-frame-wrap {
            height: 58vh;
            min-height: 420px;
            flex: none;
          }

          .gamma-answer-page .lab-pane {
            min-height: 650px;
          }

          .gamma-answer-page .lab-body {
            overflow-y: visible;
            overflow-x: hidden;
          }
        }

        @media (max-width: 560px) {
          .gamma-answer-page .shell {
            width: min(100% - 16px, 1500px);
            padding-top: 8px;
          }

          .gamma-answer-page .topbar,
          .gamma-answer-page .pane-head,
          .gamma-answer-page .question-meta {
            align-items: flex-start;
            flex-direction: column;
          }

          .gamma-answer-page .brand span,
          .gamma-answer-page .topbar-actions {
            white-space: normal;
          }

          .gamma-answer-page .pane-head span {
            text-align: left;
          }

          .gamma-answer-page .attachment-head {
            flex-direction: column;
          }

          .gamma-answer-page .file-upload-btn {
            width: 100%;
          }

          .gamma-answer-page .tool-switcher {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      <main className="shell">
        <header className="topbar">
          <div className="brand">
            <h1>{config.title}</h1>
            <span>先看任務，再用對工具｜四題生成結果回填</span>
          </div>
          <div className="topbar-actions">
            <WorksheetNotebook userId={user?.id} worksheetId={config.id} />
            <button type="button" className="home-link" onClick={() => router.push("/")}>
              HOME
            </button>
            <div className="prototype-label">
              {completedCount}/{config.questions.length} 已填 · {progress?.totalCoinsAwarded || 0}/{totalCoins} 金幣
            </div>
          </div>
        </header>

        <section className="workspace" aria-label="GAMMA 與 Lab Terminal 雙欄工作區">
          <div className="gamma-pane">
            <div className="pane-head">
              <strong>GAMMA</strong>
              <span>GAMMA 題目區：請從左側查看任務內容</span>
            </div>
            <div className="gamma-frame-wrap">
              <iframe
                className="gamma-frame"
                src={gammaUrl}
                title={config.title}
                allow="fullscreen"
              />
            </div>
          </div>

          <aside className="lab-pane" aria-label="Lab Terminal 回答面板">
            <div className="pane-head">
              <strong>Lab Terminal</strong>
              <span>{activeQuestion.code}</span>
            </div>

            <div className="lab-body">
              <div className="tool-switcher" aria-label="Lab 工具切換">
                {LAB_TOOL_LINKS.map((tool) => {
                  const active = tool.id === activeQuestion.toolId;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => openLabTool(tool.id)}
                      disabled={allComplete || awaitingReadCheck}
                      title={allComplete ? "學習單已完成，生成權限已關閉" : `回主頁並切換到 ${tool.label}`}
                      className={`tool-mode-btn${active ? " active" : ""}`}
                    >
                      {tool.shortLabel}
                    </button>
                  );
                })}
              </div>

              <div className="locator">
                <div className="locator-title">
                  <div>目前任務</div>
                  <span>{completedCount}/{config.questions.length} 已填</span>
                </div>
                <div className="question-tabs">
                  {config.questions.map((question, index) => {
                    const done = isQuestionCompleted(question);
                    const locked = !canOpenQuestion(index);
                    return (
                      <button
                        key={question.id}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          if (locked) {
                            setFeedback("請按照順序完成，先通過前面的題目。");
                            return;
                          }
                          setActiveIndex(index);
                        }}
                        title={locked ? "請先完成前面的題目" : `題目 ${String.fromCharCode(65 + index)}`}
                        className={`tab-btn${index === activeIndex ? " active" : ""}${done ? " done" : ""}${locked ? " locked" : ""}`}
                      >
                        {String.fromCharCode(65 + index)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!awaitingReadCheck ? (
                <section className="question-card">
                <div className="question-meta">
                  <span>{activeQuestion.code}</span>
                  <span className="coins">{activeQuestion.coins} 金幣</span>
                </div>
                <h2>{activeQuestion.title}</h2>
                <p>{activeQuestion.prompt}</p>
                <div className="page-hint">請看左側 GAMMA 題目。</div>
                </section>
              ) : null}

              {awaitingReadCheck && activeReadCheck ? (
                <div className="read-check-card">
                  <div className="read-check-label">
                    讀題小測 {activeReadCheckIndex + 1}/{activeReadChecks.length}
                  </div>
                  <h3>{activeReadCheck.question}</h3>
                  {readCheckLocked ? (
                    <div className="read-check-lock" role="status" aria-live="polite">
                      回答錯誤，請等待 {readCheckLockSeconds} 秒。
                      {activeReadCheck.type === "text" ? " 時間到後再修改答案。" : " 選項已重新排列。"}
                    </div>
                  ) : null}
                  {activeReadCheck.type === "text" ? (
                    <div className="read-check-text-answer">
                      <textarea
                        value={activeReadCheckText}
                        onChange={(event) =>
                          setAnswer(activeQuestion.id, {
                            readChecks: {
                              ...(activeAnswer.readChecks || {}),
                              [activeReadCheckIndex]: {
                                ...(activeReadCheckState || { passed: false }),
                                passed: false,
                                textAnswer: event.target.value,
                              },
                            },
                          })
                        }
                        placeholder="輸入你的答案"
                        disabled={reviewing || readCheckLocked}
                      />
                      <button
                        type="button"
                        onClick={() => answerReadCheck(undefined, activeReadCheckText)}
                        disabled={reviewing || readCheckLocked || !activeReadCheckText.trim()}
                      >
                        送出答案
                      </button>
                    </div>
                  ) : (
                    <div className="read-check-options">
                      {readCheckOptions.map((option) => {
                        const selected =
                          activeAnswer.readChecks?.[activeReadCheckIndex]?.selectedIndex ===
                          option.originalIndex;
                        return (
                          <button
                            key={`${option.originalIndex}:${option.label}`}
                            type="button"
                            className={`read-check-option${selected ? " selected" : ""}`}
                            onClick={() => answerReadCheck(option.originalIndex)}
                            disabled={reviewing || readCheckLocked}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : activeQuestion.expectedKind === "text" ? (
                <textarea
                  className="answer-input"
                  wrap="soft"
                  value={activeAnswer.text}
                  onChange={(event) =>
                    setAnswer(activeQuestion.id, {
                      text: event.target.value,
                      review: undefined,
                    })
                  }
                  placeholder={activeQuestion.placeholder}
                />
              ) : (
                <div
                  className={`attachment-panel${activeAnswer.attachments.length > 0 ? " upload-success" : ""}`}
                  onDragOver={(event) => {
                    if (activeAnswer.attachments.length === 0) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (activeAnswer.attachments.length > 0) return;
                    handleFiles(event.dataTransfer.files);
                  }}
                >
                  <div className="attachment-head">
                    <div className="attachment-title">
                      <strong>{activeAnswer.attachments.length > 0 ? "作品預覽" : "附件"}</strong>
                      <span>
                        {activeAnswer.attachments.length > 0
                          ? activeQuestionCompleted
                            ? "已通過審核"
                            : "確認作品後送系統檢查"
                          : `${activeAnswer.attachments.length} 個檔案`}
                      </span>
                    </div>
                    {!activeAnswerPassed && activeAnswer.attachments.length === 0 && (
                      <label className="file-upload-btn">
                        <span className="upload-plus" aria-hidden="true">+</span>
                        <span className="upload-copy">
                          <strong>{activeQuestion.uploadLabel || "加入作品檔案"}</strong>
                          <small>找不到？先看下載或桌面，也可以直接拖進來。</small>
                        </span>
                        <input
                          type="file"
                          accept={activeQuestion.accept}
                          multiple
                          hidden
                          onChange={(event) => {
                            handleFiles(event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {activeAnswer.attachments.length === 0 && (
                    <div className="upload-note">
                      {uploadMessage || activeQuestion.reviewHint || "把你生成好的作品放進來。"}
                    </div>
                  )}
                  <div className="attachment-list">
                    {activeAnswer.attachments.length === 0 ? (
                      <div className="attachment-empty">尚未上傳檔案</div>
                    ) : (
                      activeAnswer.attachments.map((file) => (
                        <div key={file.id} className="attachment-item">
                          <div className="type-chip">{file.kind.toUpperCase()}</div>
                          <div className="attachment-main">
                            <div className="attachment-name">{file.name}</div>
                            <div className="attachment-meta">{formatBytes(file.size)}</div>
                            {renderAttachmentPreview(file)}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(file.id)}
                            className="attachment-remove"
                            hidden={activeAnswerPassed}
                          >
                            移除
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {!awaitingReadCheck ? (
                <>
                  <div className="field-row">
                    <button
                      type="button"
                      className={`tool-btn review-action${activeQuestionCompleted ? " is-complete" : ""}`}
                      onClick={reviewAnswer}
                      disabled={reviewing || activeQuestionCompleted}
                    >
                  {activeQuestionCompleted
                    ? "本題已完成"
                    : awaitingReadCheck
                    ? "完成讀題小測後進下一題"
                    : reviewing
                    ? reviewBusyLabel
                    : reviewIdleLabel}
                    </button>
                  </div>

                  <div className="answer-status">
                    <div className={activeQuestionCompleted ? "answer-complete-label" : "answer-feedback"}>
                      {activeQuestionCompleted
                        ? activeAnswer.review?.feedback || feedback
                        : feedback}
                    </div>
                    {activeQuestionCompleted && activeAnswer.review?.signatureDetails?.length ? (
                      <div className="signature-details">
                        {activeAnswer.review.signatureDetails.map((detail) => (
                          <div key={detail}>簽章資訊：{detail}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
