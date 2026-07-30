import { NextApiRequest, NextApiResponse } from "next";
import {
  findCachedLabToolResult,
  findRandomCachedLabToolResult,
  isLabToolApiCoolingDown,
  isRecoverableLabToolApiError,
  readLabToolCacheLimit,
  requireLabToolWorksheetId,
  saveLabToolResult,
  startLabToolApiCooldown,
} from "@/server/labToolCache";
import { injectLabMusicMetadata } from "@/server/mp3Id3Metadata";
import { LabMusicReviewMetadata } from "@/utils/labMusicMetadata";

const MUSIC_CACHE_LIMIT = readLabToolCacheLimit("LAB_MUSIC_CACHE_LIMIT", 3);
const ELEVENLABS_PROVIDER = "elevenlabs-music";
const DEFAULT_MUSIC_DURATION_MS = 30000;
const MIN_MUSIC_DURATION_MS = 3000;
const MAX_MUSIC_DURATION_MS = 600000;

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

  const { prompt, task, taskId, durationMs, worksheetId } = req.body as {
    prompt?: string;
    task?: string;
    taskId?: string;
    durationMs?: number;
    worksheetId?: string;
  };

  const safePrompt = prompt?.trim();
  if (!safePrompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  let safeWorksheetId: string;
  try {
    safeWorksheetId = requireLabToolWorksheetId(worksheetId);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "worksheetId is required" });
  }

  const safeDuration = resolveMusicDurationMs(safePrompt, durationMs);
  const cached = await findCachedLabToolResult(
    safeWorksheetId,
    "music",
    safePrompt,
    undefined
  );
  if (cached && cachedMusicDurationMatches(cached.metadata, safeDuration)) {
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
      reviewMetadata: cached.metadata,
    });
  }

  const randomFallback = async (fallbackReason: string) => {
    const fallback = await findRandomCachedLabToolResult(
      safeWorksheetId,
      "music",
      MUSIC_CACHE_LIMIT
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
      reviewMetadata: fallback.metadata,
    };
  };

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    const fallback = await randomFallback("api-key-missing");
    if (fallback) {
      return res.status(200).json(fallback);
    }
    return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
  }

  if (isLabToolApiCoolingDown(ELEVENLABS_PROVIDER)) {
    const fallback = await randomFallback("api-cooldown");
    if (fallback) {
      return res.status(200).json(fallback);
    }
  }

  const modelId = process.env.ELEVENLABS_MUSIC_MODEL || "music_v1";
  const durationSeconds = Math.round(safeDuration / 1000);

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          prompt: `${task || "Lab Music task"}. ${safePrompt}. Length must be about ${durationSeconds} seconds. Instrumental, cheerful, suitable for elementary classroom game UI.`,
          music_length_ms: safeDuration,
          model_id: modelId,
          force_instrumental: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("lab-tools/music ElevenLabs error:", errorText);
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
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const reviewMetadata: LabMusicReviewMetadata = {
      source: "lab-terminal",
      tool: "Lab Music",
      worksheetId: safeWorksheetId,
      taskId,
      task: task || "Lab Music task",
      prompt: safePrompt,
      durationMs: safeDuration,
      generatedAt: new Date().toISOString(),
      provider: ELEVENLABS_PROVIDER,
      model: modelId,
    };
    const taggedAudioBuffer = injectLabMusicMetadata(audioBuffer, reviewMetadata);
    const saved = await saveLabToolResult({
      worksheetId: safeWorksheetId,
      kind: "music",
      prompt: safePrompt,
      buffer: taggedAudioBuffer,
      mimeType: "audio/mpeg",
      extension: "mp3",
      limit: MUSIC_CACHE_LIMIT,
      metadata: { labMusicReview: reviewMetadata },
    });

    return res.status(200).json({
      success: true,
      kind: "music",
      cached: false,
      audioUrl: saved.assetUrl,
      downloadUrl: saved.assetUrl,
      fileName: saved.fileName,
      reviewMetadata,
    });
  } catch (error: any) {
    console.error("lab-tools/music error:", error);
    if (isRecoverableLabToolApiError(error)) {
      startLabToolApiCooldown(ELEVENLABS_PROVIDER);
      const fallback = await randomFallback("api-error");
      if (fallback) {
        return res.status(200).json(fallback);
      }
    }
    return res.status(500).json({ error: error.message || "音樂生成失敗" });
  }
}
