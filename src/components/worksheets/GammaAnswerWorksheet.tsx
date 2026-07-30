import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  GammaAnswerExpectedKind,
  GammaAnswerQuestionConfig,
  GammaAnswerWorksheetConfig,
} from "@/config/gammaAnswerWorksheets";
import { useAuth } from "@/contexts/AuthContext";
import {
  approveTask,
  getStudentWorksheetProgress,
  markLessonCompleted,
} from "@/lib/firestore";
import { StudentWorksheetProgress, Worksheet } from "@/types/Worksheet";
import { lessonKeys } from "@/types/LessonCompletion";
import { validateGammaTextAnswer } from "@/utils/gammaAnswerValidation";
import {
  LabMusicReviewMetadata,
  readLabMusicMetadataFromBlob,
} from "@/utils/labMusicMetadata";
import {
  LabVideoReviewMetadata,
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

interface ReviewAttachmentPayload {
  name: string;
  type: string;
  size: number;
  kind: GammaAttachment["kind"];
  dataUrl?: string;
  musicMetadata?: LabMusicReviewMetadata | null;
  videoMetadata?: LabVideoReviewMetadata | null;
}

interface GammaAnswerState {
  text: string;
  attachments: GammaAttachment[];
  review?: {
    passed: boolean;
    feedback: string;
    reviewedAt: string;
  };
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
const MAX_INLINE_IMAGE_REVIEW_BYTES = 4 * 1024 * 1024;

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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
  worksheet,
  progress,
  onProgressChange,
}: GammaAnswerWorksheetProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, GammaAnswerState>>(() =>
    buildInitialAnswers(config)
  );
  const [feedback, setFeedback] = useState("請看左側 GAMMA 題目，需要生成內容時可回主頁使用 Lab Terminal。");
  const [uploadMessage, setUploadMessage] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [celebration, setCelebration] = useState<"question" | "all" | null>(null);
  const loadedDraftRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeQuestion = config.questions[activeIndex];
  const activeAnswer = answers[activeQuestion.id] || EMPTY_ANSWER;
  const completedCount = config.questions.filter(
    (question) => progress?.tasks?.[question.taskId]?.completed
  ).length;
  const firstIncompleteIndex = config.questions.findIndex(
    (question) => !progress?.tasks?.[question.taskId]?.completed
  );
  const unlockedIndex =
    firstIncompleteIndex >= 0 ? firstIncompleteIndex : config.questions.length - 1;
  const totalCoins = worksheet.tasks.reduce((sum, task) => sum + task.coins, 0);
  const allComplete = config.questions.length > 0 && completedCount >= config.questions.length;
  const activeQuestionCompleted = !!progress?.tasks?.[activeQuestion.taskId]?.completed;
  const activeAnswerPassed = activeQuestionCompleted || !!activeAnswer.review?.passed;
  const activeReviewCriteria = useMemo(
    () => getReviewCriteria(activeQuestion),
    [activeQuestion]
  );
  const activeUsesAiReview = activeReviewCriteria.aiReviewMode !== "local-only";
  const reviewIdleLabel = activeUsesAiReview ? "AI 審核並加金幣" : "檢查並加金幣";
  const reviewBusyLabel = activeUsesAiReview ? "AI 審核中..." : "檢查中...";

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
          grantedAt: new Date().toISOString(),
          source: config.source,
          questionId: taskQuestion.id,
          taskId: taskQuestion.taskId,
          task: taskQuestion.reviewBrief?.task || taskQuestion.title || taskQuestion.label,
          toolId: taskQuestion.toolId,
          expectedKind: taskQuestion.expectedKind,
          toolPrompt: taskQuestion.toolPrompt,
        })
      );
    } catch {
      // Browser storage may be unavailable in restricted modes.
    }
  }, [activeQuestion, config.id, config.mediaAccessKey, config.source]);

  const revokeLabMediaAccess = useCallback(() => {
    try {
      window.localStorage.removeItem(config.mediaAccessKey);
    } catch {
      // Browser storage may be unavailable in restricted modes.
    }
  }, [config.mediaAccessKey]);

  useEffect(() => {
    if (allComplete) {
      revokeLabMediaAccess();
      return;
    }
    grantLabMediaAccess(activeQuestion);
  }, [activeQuestion, allComplete, grantLabMediaAccess, revokeLabMediaAccess]);

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
            (question) => !progress?.tasks?.[question.taskId]?.completed
          );
          const maxOpen = firstOpen >= 0 ? firstOpen : config.questions.length - 1;
          setActiveIndex(Math.min(nextIndex, maxOpen));
        }
      }
    } catch {
      // Ignore broken local drafts.
    }
    loadedDraftRef.current = true;
  }, [config, progress?.tasks, user]);

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
    setUploadMessage(
      `已成功上傳 ${incoming.length} 個檔案，可以按${activeUsesAiReview ? " AI 審核" : "檢查"}。`
    );
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

  const validateAnswerBeforeAiReview = () => {
    const problems: string[] = [];
    if (activeQuestion.expectedKind === "text") {
      return validateGammaTextAnswer(activeAnswer.text, activeQuestion, {
        maxReviewChars: MAX_TEXT_REVIEW_CHARS,
      });
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

  const buildReviewAttachments = async () => {
    if (activeQuestion.expectedKind === "text") return [];
    const expected = expectedAttachmentKind(activeQuestion.expectedKind);
    const draftKey = user ? localDraftKey(config, user.id) : "";
    return Promise.all(
      activeAnswer.attachments
        .filter((file) => file.kind === expected)
        .slice(0, 3)
        .map(async (file) => {
          let dataUrl = "";
          let musicMetadata: LabMusicReviewMetadata | null = null;
          let videoMetadata: LabVideoReviewMetadata | null = null;
          const needsBlob =
            (activeQuestion.expectedKind === "image" &&
              file.size <= MAX_INLINE_IMAGE_REVIEW_BYTES) ||
            activeQuestion.expectedKind === "audio" ||
            activeQuestion.expectedKind === "video";
          const blob = needsBlob ? await getAttachmentBlob(file, draftKey) : null;

          if (activeQuestion.expectedKind === "image" && file.size <= MAX_INLINE_IMAGE_REVIEW_BYTES) {
            if (blob) dataUrl = await blobToDataUrl(blob);
          }

          if (activeQuestion.expectedKind === "audio" && blob) {
            musicMetadata = await readLabMusicMetadataFromBlob(blob).catch(() => null);
          }

          if (activeQuestion.expectedKind === "video" && blob) {
            videoMetadata = await readLabVideoMetadataFromBlob(blob).catch(() => null);
          }

          const payload: ReviewAttachmentPayload = {
            name: file.name,
            type: file.type,
            size: file.size,
            kind: file.kind,
            ...(dataUrl ? { dataUrl } : {}),
          };
          if (activeQuestion.expectedKind === "audio") {
            payload.musicMetadata = musicMetadata;
          }
          if (activeQuestion.expectedKind === "video") {
            payload.videoMetadata = videoMetadata;
          }
          return payload;
        })
    );
  };

  const completeActiveQuestion = async () => {
    if (!user) return;

    await approveTask({
      studentId: user.id,
      studentName: user.displayName || user.username || "",
      worksheetId: config.id,
      taskId: activeQuestion.taskId,
      teacherId: activeUsesAiReview ? "ai-review" : "local-review",
      teacherName: activeUsesAiReview ? "AI 審核" : "系統檢查",
    });

    const latest = await getStudentWorksheetProgress(user.id, config.id);
    onProgressChange(latest);

    const nextCompletedCount = config.questions.filter((question) => {
      if (question.taskId === activeQuestion.taskId) return true;
      return latest?.tasks?.[question.taskId]?.completed;
    }).length;

    const review = {
      passed: true,
      feedback: `審核通過，已加入 ${activeQuestion.coins} 金幣。`,
      reviewedAt: new Date().toISOString(),
    };
    setAnswer(activeQuestion.id, { review });
    setFeedback(review.feedback);
    setCelebration(nextCompletedCount >= config.questions.length ? "all" : "question");

    if (nextCompletedCount >= config.questions.length) {
      revokeLabMediaAccess();
      await markLessonCompleted(user.id, lessonKeys.worksheet(config.id), {
        type: "score",
        score: worksheet.tasks.reduce((sum, task) => sum + task.coins, 0),
        label: config.title,
      });
    } else {
      const nextIndex = Math.min(activeIndex + 1, config.questions.length - 1);
      setTimeout(() => setActiveIndex(nextIndex), 950);
    }

    setTimeout(() => setCelebration(null), 2400);
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
      if (!activeUsesAiReview) {
        setFeedback("檔案檢查通過，正在加入金幣...");
        await completeActiveQuestion();
        return;
      }

      setFeedback("AI 正在審核這一題...");
      const attachments = await buildReviewAttachments();
      const aiResponse = await fetch("/api/gamma-answer-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksheetId: config.id,
          question: {
            id: activeQuestion.id,
            title: activeQuestion.title,
            module: activeQuestion.expectedKind,
            prompt: activeQuestion.prompt,
            toolPrompt: activeQuestion.toolPrompt,
            reviewBrief: activeQuestion.reviewBrief,
            reviewCriteria: activeQuestion.reviewCriteria,
            textMinimumLength: activeQuestion.textMinimumLength,
            textMaximumLength: activeQuestion.textMaximumLength,
            textRequiresThreePoints: activeQuestion.textRequiresThreePoints,
            textKeywords: activeQuestion.textKeywords,
            textMinimumKeywordMatches: activeQuestion.textMinimumKeywordMatches,
          },
          answer: {
            text: activeAnswer.text.trim(),
            attachments,
          },
        }),
      });
      const aiResult = await aiResponse.json();
      if (!aiResponse.ok) {
        throw new Error(aiResult?.error || "AI 審核失敗");
      }
      if (!aiResult.passed) {
        const review = {
          passed: false,
          feedback: aiResult.feedback || "AI 覺得這題還需要修改。",
          reviewedAt: new Date().toISOString(),
        };
        setAnswer(activeQuestion.id, { review });
        setFeedback(review.feedback);
        return;
      }

      await completeActiveQuestion();
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
                      disabled={allComplete}
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
                    const done = !!progress?.tasks?.[question.taskId]?.completed;
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
                        title={locked ? "請先完成前面的題目" : `第 ${index + 1} 題`}
                        className={`tab-btn${index === activeIndex ? " active" : ""}${done ? " done" : ""}${locked ? " locked" : ""}`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <section className="question-card">
                <div className="question-meta">
                  <span>{activeQuestion.code}</span>
                  <span className="coins">{activeQuestion.coins} 金幣</span>
                </div>
                <h2>{activeQuestion.title}</h2>
                <p>{activeQuestion.prompt}</p>
                <div className="page-hint">請看左側 GAMMA 題目。</div>
              </section>

              {activeQuestion.expectedKind === "text" ? (
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
                            : "確認作品後送 AI 審核"
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

              <div className="field-row">
                <button
                  type="button"
                  className={`tool-btn review-action${activeQuestionCompleted ? " is-complete" : ""}`}
                  onClick={reviewAnswer}
                  disabled={reviewing || activeQuestionCompleted}
                >
                  {activeQuestionCompleted
                    ? "本題已完成"
                    : reviewing
                    ? reviewBusyLabel
                    : reviewIdleLabel}
                </button>
              </div>

              <div className="answer-status">
                <div className="answer-feedback">{feedback}</div>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
