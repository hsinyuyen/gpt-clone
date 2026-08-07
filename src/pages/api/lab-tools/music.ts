import { NextApiRequest, NextApiResponse } from "next";
import {
  findCachedLabToolResult,
  findRandomCachedLabToolResult,
  getLabToolCacheCount,
  isLabToolApiCoolingDown,
  isRecoverableLabToolApiError,
  readLabToolCacheLimit,
  saveLabToolResult,
  startLabToolApiCooldown,
} from "@/server/labToolCache";
import { injectLabMusicMetadata } from "@/server/mp3Id3Metadata";
import { reviewLabToolPrompt } from "@/server/labToolPromptReview";
import { createLabToolSignature, readLabToolSignature } from "@/server/labToolSignatures";
import { resolveLabToolWorksheetContext } from "@/server/labToolWorksheetContext";
import { requireAdminUser } from "@/server/adminAccess";
import { LabMusicReviewMetadata } from "@/utils/labMusicMetadata";

const MUSIC_CACHE_LIMIT = readLabToolCacheLimit("LAB_MUSIC_CACHE_LIMIT", 3);
const ELEVENLABS_PROVIDER = "elevenlabs-music";
const DEFAULT_MUSIC_DURATION_MS = 30000;
const MIN_MUSIC_DURATION_MS = 3000;
const MAX_MUSIC_DURATION_MS = 600000;

const inFlightMusicGenerations = new Set<string>();

function buildMusicGenerationKey(params: {
  worksheetId: string;
  taskId?: string;
  prompt: string;
  durationMs: number;
  modelId: string;
}) {
  return JSON.stringify([
    params.worksheetId,
    params.taskId || "",
    params.prompt,
    params.durationMs,
    params.modelId,
  ]);
}

function parseElevenLabsError(errorText: string) {
  try {
    const parsed = JSON.parse(errorText);
    const detail = parsed?.detail || {};
    return {
      message: typeof detail.message === "string" ? detail.message : errorText,
      code: typeof detail.code === "string" ? detail.code : "",
      status: typeof detail.status === "string" ? detail.status : "",
      requestId: typeof detail.request_id === "string" ? detail.request_id : "",
    };
  } catch {
    return {
      message: errorText,
      code: "",
      status: "",
      requestId: "",
    };
  }
}

function isMissingMusicGenerationPermission(error: ReturnType<typeof parseElevenLabsError>) {
  return (
    /missing_permissions/i.test(error.status) ||
    /unauthorized/i.test(error.code) ||
    /music_generation/i.test(error.message)
  );
}

function clampMusicDurationMs(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_MUSIC_DURATION_MS;
  return Math.max(
    MIN_MUSIC_DURATION_MS,
    Math.min(Math.round(value), MAX_MUSIC_DURATION_MS)
  );
}

function parseMusicDurationMsFromPrompt(prompt: string) {
  const normalized = prompt.normalize("NFKC").toLowerCase();
  const secondMatch =
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:\u79d2\u9418|\u79d2)/) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/);
  if (secondMatch) return Number(secondMatch[1]) * 1000;

  const minuteMatch =
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:\u5206\u9418|\u5206)/) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
  if (minuteMatch) return Number(minuteMatch[1]) * 60 * 1000;

  return null;
}

function resolveMusicDurationMs(prompt: string, durationMs: unknown) {
  const promptDurationMs = parseMusicDurationMsFromPrompt(prompt);
  if (promptDurationMs !== null) return clampMusicDurationMs(promptDurationMs);

  const requestedDurationMs = Number(durationMs);
  return clampMusicDurationMs(
    Number.isFinite(requestedDurationMs)
      ? requestedDurationMs
      : DEFAULT_MUSIC_DURATION_MS
  );
}

function cachedMusicDurationMatches(metadata: unknown, durationMs: number) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const labMusicReview = (metadata as Record<string, unknown>).labMusicReview;
  if (
    !labMusicReview ||
    typeof labMusicReview !== "object" ||
    Array.isArray(labMusicReview)
  ) {
    return false;
  }

  const cachedDurationMs = Number(
    (labMusicReview as Partial<LabMusicReviewMetadata>).durationMs
  );
  return Number.isFinite(cachedDurationMs) && Math.abs(cachedDurationMs - durationMs) <= 1000;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    prompt,
    sessionId,
    sessionTitle,
    courseId,
    courseTitle,
    semester,
    week,
    task,
    taskId,
    toolPrompt,
    expectedKind,
    durationMs,
    worksheetId,
    forceGenerate,
    adminUserId,
    adminUsername,
  } = req.body as {
    prompt?: string;
    sessionId?: string;
    sessionTitle?: string;
    courseId?: string;
    courseTitle?: string;
    semester?: string;
    week?: number;
    task?: string;
    taskId?: string;
    toolPrompt?: string;
    expectedKind?: string;
    durationMs?: number;
    worksheetId?: string;
    forceGenerate?: boolean;
    adminUserId?: string;
    adminUsername?: string;
  };

  const safePrompt = prompt?.trim() || "";
  let isAdminForceGeneration = false;
  if (forceGenerate) {
    try {
      await requireAdminUser(adminUserId, adminUsername);
      isAdminForceGeneration = true;
    } catch (error) {
      return res.status(403).json({
        error: error instanceof Error ? error.message : "Admin permission is required.",
      });
    }
  }
  console.info("[lab-tools/music] request-received", {
    worksheetId,
    taskId,
    promptLength: safePrompt.length,
    promptPreview: safePrompt.slice(0, 120),
  });

  let context: Awaited<ReturnType<typeof resolveLabToolWorksheetContext>>;
  try {
    context = await resolveLabToolWorksheetContext({ worksheetId, taskId, mode: "music" });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "學習單設定無法使用" });
  }
  const safeWorksheetId = context.worksheetId;
  const cacheLimit = context.assetCacheLimit || MUSIC_CACHE_LIMIT;
  console.info("[lab-tools/music] worksheet-context-resolved", {
    worksheetId: safeWorksheetId,
    taskId: context.taskId,
    expectedKind: context.expectedKind,
  });

  const promptReview = await reviewLabToolPrompt({
    mode: "music",
    prompt: safePrompt,
    worksheetId: safeWorksheetId,
    courseTitle: context.courseTitle,
    sessionTitle: context.sessionTitle,
    taskId: context.taskId,
    task: context.task,
    toolPrompt: context.toolPrompt,
    promptReviewCriteria: context.promptReviewCriteria,
    legacyReviewHint: context.legacyReviewHint,
    expectedKind: context.expectedKind,
  });
  console.info("[lab-tools/music] prompt-review-complete", {
    passed: promptReview.passed,
    source: promptReview.source,
    missing: promptReview.missing,
  });
  if (!promptReview.passed) {
    console.info("[lab-tools/music] generation-blocked", { reason: "prompt-review" });
    return res.status(422).json({
      error: promptReview.feedback,
      promptReview,
    });
  }

  const safeDuration = resolveMusicDurationMs(safePrompt, durationMs);
  const cached = await findCachedLabToolResult(
    safeWorksheetId,
    "music",
    safePrompt,
    cacheLimit,
    context.taskId
  );
  if (!isAdminForceGeneration && cached && cachedMusicDurationMatches(cached.metadata, safeDuration)) {
    return res.status(200).json({
      success: true,
      kind: "music",
      cached: true,
      similarityScore: cached.score,
      audioUrl: cached.assetUrl,
      downloadUrl: cached.assetUrl,
      fileName: cached.fileName,
      cacheCount: cached.cacheCount,
      cacheLimit: cached.cacheLimit,
      cacheMatchCount: cached.matchCount,
      signature: readLabToolSignature(cached.metadata),
      reviewMetadata: cached.metadata,
      promptReview,
    });
  }

  const randomFallback = async (fallbackReason: string) => {
    const fallback = await findRandomCachedLabToolResult(
      safeWorksheetId,
      "music",
      cacheLimit,
      context.taskId
    );
    if (!fallback) return null;
    if (!cachedMusicDurationMatches(fallback.metadata, safeDuration)) return null;

    return {
      success: true,
      kind: "music",
      cached: true,
      fallback: true,
      fallbackReason,
      audioUrl: fallback.assetUrl,
      downloadUrl: fallback.assetUrl,
      fileName: fallback.fileName,
      cacheCount: fallback.cacheCount,
      cacheLimit: fallback.cacheLimit,
      provider: "local-cache",
      signature: readLabToolSignature(fallback.metadata),
      reviewMetadata: fallback.metadata,
      promptReview,
    };
  };

  const cacheCount = await getLabToolCacheCount(safeWorksheetId, "music");
  if (cacheCount >= cacheLimit && !isAdminForceGeneration) {
    const fallback = await randomFallback("cache-limit");
    if (fallback) return res.status(200).json(fallback);
    return res.status(429).json({
      error: "這題的音樂儲存額度已滿，目前沒有符合本題時長的可回用音樂。請由老師清除已存音樂後再試。",
      cacheCount,
      cacheLimit,
      promptReview,
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    if (!isAdminForceGeneration) {
      const fallback = await randomFallback("api-key-missing");
      if (fallback) {
        return res.status(200).json(fallback);
      }
    }
    return res.status(500).json({
      error: "ELEVENLABS_API_KEY not configured",
      promptReview,
    });
  }

  if (isLabToolApiCoolingDown(ELEVENLABS_PROVIDER)) {
    if (isAdminForceGeneration) {
      return res.status(503).json({
        error: "音樂生成服務暫時冷卻中，無法建立新的管理素材。",
        provider: ELEVENLABS_PROVIDER,
        promptReview,
      });
    }
    const fallback = await randomFallback("api-cooldown");
    if (fallback) {
      return res.status(200).json(fallback);
    }
    return res.status(503).json({
      error:
        "ElevenLabs music generation is temporarily paused after a provider error. Fix the API key permission or try again later.",
      provider: ELEVENLABS_PROVIDER,
      promptReview,
    });
  }

  const modelId = process.env.ELEVENLABS_MUSIC_MODEL || "music_v1";
  const durationSeconds = Math.round(safeDuration / 1000);
  const generationKey = buildMusicGenerationKey({
    worksheetId: safeWorksheetId,
    taskId: context.taskId,
    prompt: safePrompt,
    durationMs: safeDuration,
    modelId,
  });

  if (inFlightMusicGenerations.has(generationKey)) {
    return res.status(409).json({
      error:
        "The same Lab Music request is already generating. Please wait for the first request to finish.",
      status: "duplicate-in-flight",
      provider: ELEVENLABS_PROVIDER,
      promptReview,
    });
  }

  inFlightMusicGenerations.add(generationKey);

  try {
    console.info("[lab-tools/music] generation-api-request", {
      provider: ELEVENLABS_PROVIDER,
      worksheetId: safeWorksheetId,
      taskId: context.taskId,
      durationMs: safeDuration,
    });
    const response = await fetch(
      "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          prompt: `${context.task}. ${safePrompt}. Length must be about ${durationSeconds} seconds. Instrumental, cheerful, suitable for elementary classroom game UI.`,
          music_length_ms: safeDuration,
          model_id: modelId,
          force_instrumental: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("lab-tools/music ElevenLabs error:", errorText);
      const elevenLabsError = parseElevenLabsError(errorText);
      if (isMissingMusicGenerationPermission(elevenLabsError)) {
        startLabToolApiCooldown(ELEVENLABS_PROVIDER, 30 * 60 * 1000);
        return res.status(403).json({
          error:
            "ElevenLabs API key is connected, but it is missing the music_generation permission.",
          details: elevenLabsError.message || errorText,
          provider: ELEVENLABS_PROVIDER,
          requestId: elevenLabsError.requestId,
          promptReview,
        });
      }
      const apiError = new Error(`${response.status} ${errorText || response.statusText}`);
      if (isRecoverableLabToolApiError(apiError)) {
        startLabToolApiCooldown(ELEVENLABS_PROVIDER);
        const fallback = await randomFallback("api-error");
        if (fallback) {
          return res.status(200).json(fallback);
        }
      }
      return res.status(response.status).json({
        error: "音樂生成失敗",
        details: errorText,
        promptReview,
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.info("[lab-tools/music] generation-api-complete", {
      provider: ELEVENLABS_PROVIDER,
      bytes: audioBuffer.length,
    });
    const signatureData = createLabToolSignature({
      worksheetId: safeWorksheetId,
      kind: "music",
      taskId: context.taskId,
      prompt: safePrompt,
      buffer: audioBuffer,
    });
    const reviewMetadata: LabMusicReviewMetadata = {
      source: "lab-terminal",
      tool: "Lab Music",
      worksheetId: safeWorksheetId,
      sessionId: context.sessionId,
      sessionTitle: context.sessionTitle,
      courseId: context.courseId,
      courseTitle: context.courseTitle,
      semester: context.semester,
      week: context.week,
      taskId: context.taskId,
      task: context.task,
      prompt: safePrompt,
      durationMs: safeDuration,
      generatedAt: new Date().toISOString(),
      provider: ELEVENLABS_PROVIDER,
      model: modelId,
      ...signatureData,
    };
    const taggedAudioBuffer = injectLabMusicMetadata(audioBuffer, reviewMetadata);
    const saved = await saveLabToolResult({
      worksheetId: safeWorksheetId,
      kind: "music",
      prompt: safePrompt,
      buffer: taggedAudioBuffer,
      mimeType: "audio/mpeg",
      extension: "mp3",
      limit: cacheLimit,
      metadata: { labMusicReview: reviewMetadata },
    });

    return res.status(200).json({
      success: true,
      kind: "music",
      cached: false,
      audioUrl: saved.assetUrl,
      downloadUrl: saved.assetUrl,
      fileName: saved.fileName,
      storagePath: saved.storagePath,
      cloudDownloadUrl: saved.downloadUrl,
      signature: reviewMetadata.signature,
      reviewMetadata,
      promptReview,
    });
  } catch (error: any) {
    console.error("lab-tools/music error:", error);
    if (isRecoverableLabToolApiError(error)) {
      startLabToolApiCooldown(ELEVENLABS_PROVIDER);
      if (isAdminForceGeneration) {
        return res.status(503).json({
          error: "音樂生成服務暫時無法使用，未建立新的管理素材。",
          provider: ELEVENLABS_PROVIDER,
          promptReview,
        });
      }
      const fallback = await randomFallback("api-error");
      if (fallback) {
        return res.status(200).json(fallback);
      }
    }
    return res.status(500).json({
      error: error.message || "音樂生成失敗",
      promptReview,
    });
  } finally {
    inFlightMusicGenerations.delete(generationKey);
  }
}
