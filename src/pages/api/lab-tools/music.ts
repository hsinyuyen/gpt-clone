import { NextApiRequest, NextApiResponse } from "next";
import {
  findCachedLabToolResult,
  findRandomCachedLabToolResult,
  isLabToolApiCoolingDown,
  isRecoverableLabToolApiError,
  readLabToolCacheLimit,
  saveLabToolResult,
  startLabToolApiCooldown,
} from "@/server/labToolCache";

const MUSIC_CACHE_LIMIT = readLabToolCacheLimit("LAB_MUSIC_CACHE_LIMIT", 3);
const ELEVENLABS_PROVIDER = "elevenlabs-music";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, task, durationMs, worksheetId } = req.body as {
    prompt?: string;
    task?: string;
    durationMs?: number;
    worksheetId?: string;
  };

  const safePrompt = prompt?.trim();
  if (!safePrompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const cached = await findCachedLabToolResult(
    worksheetId || "S3W01",
    "music",
    safePrompt,
    MUSIC_CACHE_LIMIT
  );
  if (cached) {
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
    });
  }

  const randomFallback = async (fallbackReason: string) => {
    const fallback = await findRandomCachedLabToolResult(
      worksheetId || "S3W01",
      "music",
      MUSIC_CACHE_LIMIT
    );
    if (!fallback) return null;

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

  const safeDuration = Math.max(3000, Math.min(Number(durationMs || 30000), 600000));

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
          prompt: `${task || "Lab Music task"}. ${safePrompt}. Instrumental, cheerful, suitable for elementary classroom game UI.`,
          music_length_ms: safeDuration,
          model_id: process.env.ELEVENLABS_MUSIC_MODEL || "music_v1",
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
    const saved = await saveLabToolResult({
      worksheetId,
      kind: "music",
      prompt: safePrompt,
      buffer: audioBuffer,
      mimeType: "audio/mpeg",
      extension: "mp3",
      limit: MUSIC_CACHE_LIMIT,
    });

    return res.status(200).json({
      success: true,
      kind: "music",
      cached: false,
      audioUrl: saved.assetUrl,
      downloadUrl: saved.assetUrl,
      fileName: saved.fileName,
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
