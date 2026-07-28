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

const GOOGLE_GENERATIVE_LANGUAGE_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

const readPositiveInt = (
  envName: string,
  fallback: number,
  min: number,
  max: number
) => {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const VIDEO_CACHE_LIMIT = readLabToolCacheLimit("LAB_VIDEO_CACHE_LIMIT", 5);
const VIDEO_BACKGROUND_POLL_ATTEMPTS = readPositiveInt(
  "LAB_VIDEO_BACKGROUND_POLL_ATTEMPTS",
  40,
  1,
  120
);
const VIDEO_BACKGROUND_POLL_INTERVAL_MS = readPositiveInt(
  "LAB_VIDEO_BACKGROUND_POLL_INTERVAL_MS",
  15000,
  5000,
  60000
);
const VIDEO_SKIP_API_WHEN_CACHE_READY =
  process.env.LAB_VIDEO_SKIP_API_WHEN_CACHE_READY === "true";
const backgroundVideoJobs = new Map<string, Promise<void>>();
const VEO_PROVIDER = "veo";

const getVeoApiKey = () => process.env.NANO_BANANA_API_KEY;

const getVideoExtension = (mimeType: string) => {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("quicktime")) return "mov";
  return "mp4";
};

const normalizeVeoDuration = (duration?: string | number) => {
  const value = Number(duration || 4);
  if (value <= 4) return 4;
  if (value <= 6) return 6;
  return 8;
};

async function googleJsonRequest(url: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Veo API error (${response.status})`);
  }
  return data;
}

function resolveOperationUrl(operationName: string) {
  if (operationName.startsWith("http")) return operationName;
  return `${GOOGLE_GENERATIVE_LANGUAGE_BASE}/${operationName.replace(/^\/+/, "")}`;
}

function extractVeoVideo(operation: any) {
  const response = operation?.response || {};
  const generateResponse =
    response.generateVideoResponse || response.generate_video_response || {};
  const candidates = [
    generateResponse.generatedSamples?.[0]?.video,
    generateResponse.generated_samples?.[0]?.video,
    generateResponse.generatedVideos?.[0]?.video,
    generateResponse.generated_videos?.[0]?.video,
    response.generatedVideos?.[0]?.video,
    response.generated_videos?.[0]?.video,
  ].filter(Boolean);

  const video = candidates[0];
  if (!video) return null;

  const base64 =
    video.videoBytes ||
    video.video_bytes ||
    video.bytesBase64Encoded ||
    video.bytes_base64_encoded;
  if (base64) {
    return {
      buffer: Buffer.from(base64, "base64"),
      mimeType: video.mimeType || video.mime_type || "video/mp4",
    };
  }

  const url =
    video.uri ||
    video.url ||
    video.fileUri ||
    video.file_uri ||
    video.gcsUri ||
    video.gcs_uri;
  if (url) {
    return {
      url,
      mimeType: video.mimeType || video.mime_type || "video/mp4",
    };
  }

  return null;
}

async function downloadVeoVideo(url: string, apiKey: string) {
  const response = await fetch(url, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`Failed to download Veo video: ${response.status}`);
  }
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: mimeType.startsWith("video/") ? mimeType : "video/mp4",
  };
}

async function generateVeoVideo(params: {
  apiKey: string;
  prompt: string;
  duration?: string | number;
}) {
  const model = process.env.LAB_VEO_MODEL || "veo-3.1-generate-preview";
  const operation = await googleJsonRequest(
    `${GOOGLE_GENERATIVE_LANGUAGE_BASE}/models/${model}:predictLongRunning`,
    params.apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        instances: [{ prompt: params.prompt }],
        parameters: {
          aspectRatio: "16:9",
          durationSeconds: normalizeVeoDuration(params.duration),
          sampleCount: 1,
        },
      }),
    }
  );

  const operationName = operation.name;
  if (!operationName) {
    throw new Error("Veo did not return an operation name");
  }

  if (operation.done) {
    if (operation.error) {
      throw new Error(operation.error.message || "Veo video generation failed");
    }
    const video = extractVeoVideo(operation);
    if (!video) {
      throw new Error("Veo finished without returning a video");
    }
    return {
      ...video,
      operationName,
    };
  }

  return {
    status: "processing",
    operationName,
  };
}

async function pollVeoVideoOperation(apiKey: string, operationName: string) {
  const latestOperation = await googleJsonRequest(
    resolveOperationUrl(operationName),
    apiKey
  );

  if (latestOperation.error) {
    throw new Error(latestOperation.error.message || "Veo video generation failed");
  }

  if (!latestOperation.done) {
    return {
      status: "processing",
      operationName,
    };
  }

  const video = extractVeoVideo(latestOperation);
  if (!video) {
    throw new Error("Veo finished without returning a video");
  }

  return {
    ...video,
    operationName,
  };
}

async function saveVeoVideoResult(params: {
  apiKey: string;
  worksheetId?: string;
  prompt: string;
  video: {
    buffer?: Buffer;
    url?: string;
    mimeType?: string;
    operationName?: string;
  };
}) {
  let videoBuffer = params.video.buffer;
  let mimeType = params.video.mimeType || "video/mp4";

  if (!videoBuffer && params.video.url) {
    try {
      const downloaded = await downloadVeoVideo(params.video.url, params.apiKey);
      videoBuffer = downloaded.buffer;
      mimeType = downloaded.mimeType.startsWith("video/")
        ? downloaded.mimeType
        : "video/mp4";
    } catch (downloadError) {
      console.warn("lab-tools/video cache download failed:", downloadError);
      return {
        cached: false,
        videoUrl: params.video.url,
        downloadUrl: params.video.url,
        videoId: params.video.operationName,
        provider: "veo",
      };
    }
  }

  if (!videoBuffer) {
    throw new Error("Veo did not return downloadable video data");
  }

  const saved = await saveLabToolResult({
    worksheetId: params.worksheetId,
    kind: "video",
    prompt: params.prompt,
    buffer: videoBuffer,
    mimeType,
    extension: getVideoExtension(mimeType),
    limit: VIDEO_CACHE_LIMIT,
  });

  return {
    cached: false,
    videoUrl: saved.assetUrl,
    downloadUrl: saved.assetUrl,
    fileName: saved.fileName,
    videoId: params.video.operationName,
    provider: "veo",
  };
}

function startBackgroundVeoVideoSave(params: {
  apiKey: string;
  worksheetId?: string;
  prompt: string;
  operationName: string;
}) {
  const worksheetId = params.worksheetId || "S3W01";
  const jobKey = `${worksheetId}:${params.operationName}`;
  if (backgroundVideoJobs.has(jobKey)) return false;

  const job = (async () => {
    for (let attempt = 1; attempt <= VIDEO_BACKGROUND_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, VIDEO_BACKGROUND_POLL_INTERVAL_MS)
      );

      const generated = await pollVeoVideoOperation(
        params.apiKey,
        params.operationName
      );
      if (generated.status === "processing") continue;

      const saved = await saveVeoVideoResult({
        apiKey: params.apiKey,
        worksheetId,
        prompt: params.prompt,
        video: generated as {
          buffer?: Buffer;
          url?: string;
          mimeType?: string;
          operationName?: string;
        },
      });
      console.log(
        "lab-tools/video background saved:",
        (saved as any).fileName || saved.videoUrl
      );
      return;
    }

    console.warn(
      "lab-tools/video background polling timed out:",
      params.operationName
    );
  })()
    .catch((error) => {
      if (isRecoverableLabToolApiError(error)) {
        startLabToolApiCooldown(VEO_PROVIDER);
      }
      console.warn("lab-tools/video background polling failed:", error);
    })
    .finally(() => {
      backgroundVideoJobs.delete(jobKey);
    });

  backgroundVideoJobs.set(jobKey, job);
  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, task, duration, worksheetId, videoId, fallbackOnly } = req.body as {
    prompt?: string;
    task?: string;
    duration?: string | number;
    worksheetId?: string;
    videoId?: string;
    fallbackOnly?: boolean;
  };

  const safePrompt = prompt?.trim();
  if (!safePrompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const safeVideoId = videoId?.trim();

  if (fallbackOnly) {
    const apiKey = getVeoApiKey();
    const backgroundTracking =
      Boolean(safeVideoId && apiKey) &&
      startBackgroundVeoVideoSave({
        apiKey: apiKey as string,
        worksheetId,
        prompt: safePrompt,
        operationName: safeVideoId as string,
      });

    const fallback = await findRandomCachedLabToolResult(
      worksheetId || "S3W01",
      "video",
      VIDEO_CACHE_LIMIT
    );

    if (fallback) {
      return res.status(200).json({
        success: true,
        kind: "video",
        cached: true,
        fallback: true,
        fallbackReason: "timeout",
        videoUrl: fallback.assetUrl,
        downloadUrl: fallback.assetUrl,
        fileName: fallback.fileName,
        cacheCount: fallback.cacheCount,
        cacheLimit: fallback.cacheLimit,
        backgroundTracking,
        backgroundVideoId: safeVideoId,
      });
    }

    return res.status(200).json({
      success: true,
      kind: "video",
      cached: false,
      status: "processing",
      fallback: false,
      fallbackReason: "timeout-no-cache",
      backgroundTracking,
      backgroundVideoId: safeVideoId,
      message: "Video generation is still processing and no cached video is available.",
    });
  }

  if (!safeVideoId) {
    const cached = await findCachedLabToolResult(
      worksheetId || "S3W01",
      "video",
      safePrompt,
      VIDEO_CACHE_LIMIT
    );
    if (cached) {
      return res.status(200).json({
        success: true,
        kind: "video",
        cached: true,
        similarityScore: cached.score,
        videoUrl: cached.assetUrl,
        downloadUrl: cached.assetUrl,
        fileName: cached.fileName,
        cacheCount: cached.cacheCount,
        cacheLimit: cached.cacheLimit,
        cacheMatchCount: cached.matchCount,
      });
    }

    if (VIDEO_SKIP_API_WHEN_CACHE_READY) {
      const fallback = await findRandomCachedLabToolResult(
        worksheetId || "S3W01",
        "video",
        VIDEO_CACHE_LIMIT
      );
      const cacheReady =
        fallback?.cacheLimit && fallback.cacheCount >= fallback.cacheLimit;

      if (fallback && cacheReady) {
        return res.status(200).json({
          success: true,
          kind: "video",
          cached: true,
          fallback: true,
          fallbackReason: "cache-ready",
          videoUrl: fallback.assetUrl,
          downloadUrl: fallback.assetUrl,
          fileName: fallback.fileName,
          cacheCount: fallback.cacheCount,
          cacheLimit: fallback.cacheLimit,
          provider: "local-cache",
        });
      }
    }
  }

  const apiKey = getVeoApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "NANO_BANANA_API_KEY not configured" });
  }

  if (!safeVideoId && isLabToolApiCoolingDown(VEO_PROVIDER)) {
    const fallback = await findRandomCachedLabToolResult(
      worksheetId || "S3W01",
      "video",
      VIDEO_CACHE_LIMIT
    );
    if (fallback) {
      return res.status(200).json({
        success: true,
        kind: "video",
        cached: true,
        fallback: true,
        fallbackReason: "api-cooldown",
        videoUrl: fallback.assetUrl,
        downloadUrl: fallback.assetUrl,
        fileName: fallback.fileName,
        cacheCount: fallback.cacheCount,
        cacheLimit: fallback.cacheLimit,
        provider: "local-cache",
      });
    }
  }

  if (safeVideoId) {
    try {
      const generated = await pollVeoVideoOperation(apiKey, safeVideoId);

      if (generated.status === "processing") {
        return res.status(200).json({
          success: true,
          kind: "video",
          status: "processing",
          videoId: generated.operationName,
          provider: "veo",
          message: "Video generation is still processing.",
        });
      }

      const savedVideo = await saveVeoVideoResult({
        apiKey,
        worksheetId,
        prompt: safePrompt,
        video: generated as {
          buffer?: Buffer;
          url?: string;
          mimeType?: string;
          operationName?: string;
        },
      });

      return res.status(200).json({
        success: true,
        kind: "video",
        ...savedVideo,
      });
    } catch (error: any) {
      console.error("lab-tools/video poll error:", error);
      if (isRecoverableLabToolApiError(error)) {
        startLabToolApiCooldown(VEO_PROVIDER);
        const fallback = await findRandomCachedLabToolResult(
          worksheetId || "S3W01",
          "video",
          VIDEO_CACHE_LIMIT
        );
        if (fallback) {
          return res.status(200).json({
            success: true,
            kind: "video",
            cached: true,
            fallback: true,
            fallbackReason: "api-error",
            videoUrl: fallback.assetUrl,
            downloadUrl: fallback.assetUrl,
            fileName: fallback.fileName,
            cacheCount: fallback.cacheCount,
            cacheLimit: fallback.cacheLimit,
            provider: "local-cache",
          });
        }
      }
      return res
        .status(500)
        .json({ error: error.message || "Veo video polling failed" });
    }
  }

  const videoPrompt = `${
    task || "Lab Video task"
  }. ${safePrompt}. child-friendly classroom game UI animation, smooth motion, no text, no watermark`;

  try {
    const generated = await generateVeoVideo({
      apiKey,
      prompt: videoPrompt,
      duration,
    });

    if (generated.status === "processing") {
      return res.status(200).json({
        success: true,
        kind: "video",
        status: "processing",
        videoId: generated.operationName,
        provider: "veo",
        message: "Video generation is still processing.",
      });
    }

    const savedVideo = await saveVeoVideoResult({
      apiKey,
      worksheetId,
      prompt: safePrompt,
      video: generated as {
        buffer?: Buffer;
        url?: string;
        mimeType?: string;
        operationName?: string;
      },
    });

    return res.status(200).json({
      success: true,
      kind: "video",
      ...savedVideo,
    });
  } catch (error: any) {
    console.error("lab-tools/video error:", error);
    if (isRecoverableLabToolApiError(error)) {
      startLabToolApiCooldown(VEO_PROVIDER);
      const fallback = await findRandomCachedLabToolResult(
        worksheetId || "S3W01",
        "video",
        VIDEO_CACHE_LIMIT
      );
      if (fallback) {
        return res.status(200).json({
          success: true,
          kind: "video",
          cached: true,
          fallback: true,
          fallbackReason: "api-error",
          videoUrl: fallback.assetUrl,
          downloadUrl: fallback.assetUrl,
          fileName: fallback.fileName,
          cacheCount: fallback.cacheCount,
          cacheLimit: fallback.cacheLimit,
          provider: "local-cache",
        });
      }
    }
    return res
      .status(500)
      .json({ error: error.message || "Veo video generation failed" });
  }
}
