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
import { reviewLabToolPrompt } from "@/server/labToolPromptReview";
import { injectLabImageMetadata } from "@/server/imageTrailerMetadata";
import { createLabToolSignature, readLabToolSignature } from "@/server/labToolSignatures";
import { resolveLabToolWorksheetContext } from "@/server/labToolWorksheetContext";
import { requireAdminUser } from "@/server/adminAccess";
import type { LabImageReviewMetadata } from "@/utils/labImageMetadata";

const IMAGE_CACHE_LIMIT = readLabToolCacheLimit("LAB_IMAGE_CACHE_LIMIT", 10);
const GOOGLE_GENERATIVE_LANGUAGE_BASE =
  "https://generativelanguage.googleapis.com/v1beta";
const NANO_BANANA_PROVIDER = "nano-banana";

const getNanoBananaApiKey = () => process.env.NANO_BANANA_API_KEY;

const getImageExtension = (mimeType: string) => {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
};

const readResponseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

async function generateNanoBananaImageBuffer(prompt: string, apiKey: string) {
  const model =
    process.env.LAB_NANO_BANANA_IMAGE_MODEL || "gemini-2.5-flash-image";
  const response = await fetch(
    `${GOOGLE_GENERATIVE_LANGUAGE_BASE}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      }),
    }
  );

  const data = await readResponseJson(response);
  if (!response.ok) {
    console.error("lab-tools/image Nano Banana error:", data);
    throw new Error(
      data.error?.message || `Nano Banana image error (${response.status})`
    );
  }

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(
    (part: any) => part.inlineData?.data || part.inline_data?.data
  );
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;
  if (!inlineData?.data) {
    throw new Error("Nano Banana did not return image data");
  }

  return {
    buffer: Buffer.from(inlineData.data, "base64"),
    mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
  };
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
  console.info("[lab-tools/image] request-received", {
    worksheetId,
    taskId,
    promptLength: safePrompt.length,
    promptPreview: safePrompt.slice(0, 120),
  });

  let context: Awaited<ReturnType<typeof resolveLabToolWorksheetContext>>;
  try {
    context = await resolveLabToolWorksheetContext({ worksheetId, taskId, mode: "image" });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "學習單設定無法使用" });
  }
  const safeWorksheetId = context.worksheetId;
  const cacheLimit = context.assetCacheLimit || IMAGE_CACHE_LIMIT;
  console.info("[lab-tools/image] worksheet-context-resolved", {
    worksheetId: safeWorksheetId,
    taskId: context.taskId,
    expectedKind: context.expectedKind,
  });

  const promptReview = await reviewLabToolPrompt({
    mode: "image",
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
  console.info("[lab-tools/image] prompt-review-complete", {
    passed: promptReview.passed,
    source: promptReview.source,
    missing: promptReview.missing,
  });
  if (!promptReview.passed) {
    console.info("[lab-tools/image] generation-blocked", { reason: "prompt-review" });
    return res.status(422).json({
      error: promptReview.feedback,
      promptReview,
    });
  }

  const cached = await findCachedLabToolResult(
    safeWorksheetId,
    "image",
    safePrompt,
    cacheLimit,
    context.taskId
  );
  if (cached && !isAdminForceGeneration) {
    return res.status(200).json({
      success: true,
      kind: "image",
      cached: true,
      similarityScore: cached.score,
      imageUrl: cached.assetUrl,
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

  // The image pool is a hard API budget. When full, reuse a signed result
  // instead of spending another Nano Banana generation request.
  const cacheCount = await getLabToolCacheCount(safeWorksheetId, "image");
  if (cacheCount >= cacheLimit && !isAdminForceGeneration) {
    const fallback = await findRandomCachedLabToolResult(
      safeWorksheetId,
      "image",
      cacheLimit,
      context.taskId
    );
    if (fallback) {
      return res.status(200).json({
        success: true,
        kind: "image",
        cached: true,
        fallback: true,
        fallbackReason: "cache-limit",
        imageUrl: fallback.assetUrl,
        downloadUrl: fallback.assetUrl,
        fileName: fallback.fileName,
        cacheCount,
        cacheLimit,
        provider: "local-cache",
        signature: readLabToolSignature(fallback.metadata),
        reviewMetadata: fallback.metadata,
        promptReview,
      });
    }

    return res.status(429).json({
      error:
        "這題的圖片儲存額度已滿，目前沒有可安全回用的圖片。請由老師清除這題的已存圖片後再試。",
      cacheCount,
      cacheLimit,
      promptReview,
    });
  }

  if (isLabToolApiCoolingDown(NANO_BANANA_PROVIDER)) {
    if (isAdminForceGeneration) {
      return res.status(503).json({
        error: "圖片生成服務暫時冷卻中，無法建立新的管理素材。",
        provider: NANO_BANANA_PROVIDER,
        promptReview,
      });
    }
    const fallback = await findRandomCachedLabToolResult(
      safeWorksheetId,
      "image",
      cacheLimit,
      context.taskId
    );
    if (fallback) {
      return res.status(200).json({
        success: true,
        kind: "image",
        cached: true,
        fallback: true,
        fallbackReason: "api-cooldown",
        imageUrl: fallback.assetUrl,
        downloadUrl: fallback.assetUrl,
        fileName: fallback.fileName,
        cacheCount: fallback.cacheCount,
        cacheLimit: fallback.cacheLimit,
        provider: "local-cache",
        signature: readLabToolSignature(fallback.metadata),
        reviewMetadata: fallback.metadata,
        promptReview,
      });
    }
    return res.status(503).json({
      error:
        "Image generation is temporarily paused after a provider error. Please try again later.",
      provider: NANO_BANANA_PROVIDER,
      promptReview,
    });
  }

  const apiKey = getNanoBananaApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "NANO_BANANA_API_KEY not configured" });
  }

  const imagePrompt = `Create one standalone child-friendly illustration for an elementary AI lesson.
Task: ${context.task}
Student prompt: ${safePrompt}
Style: bold modern flat vector sticker, vibrant colors, thick black outline, clean background.
This is artwork only, not an app screen or game interface.
Do not include any UI, buttons, toolbars, panels, controls, icons, download arrows, save symbols, text, letters, logos, watermarks, borders, or frames.`;

  try {
    console.info("[lab-tools/image] generation-api-request", {
      provider: NANO_BANANA_PROVIDER,
      worksheetId: safeWorksheetId,
      taskId: context.taskId,
    });
    const generated = await generateNanoBananaImageBuffer(imagePrompt, apiKey);
    console.info("[lab-tools/image] generation-api-complete", {
      provider: NANO_BANANA_PROVIDER,
      mimeType: generated.mimeType,
    });
    const mimeType = generated.mimeType.startsWith("image/")
      ? generated.mimeType
      : "image/png";
    const signatureData = createLabToolSignature({
      worksheetId: safeWorksheetId,
      kind: "image",
      taskId: context.taskId,
      prompt: safePrompt,
      buffer: generated.buffer,
    });
    const reviewMetadata: LabImageReviewMetadata = {
      source: "lab-terminal",
      tool: "Lab Image",
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
      generatedAt: new Date().toISOString(),
      provider: NANO_BANANA_PROVIDER,
      model: process.env.LAB_NANO_BANANA_IMAGE_MODEL || "gemini-2.5-flash-image",
      ...signatureData,
    };
    const signedImageBuffer = injectLabImageMetadata(
      generated.buffer,
      reviewMetadata
    );

    const saved = await saveLabToolResult({
      worksheetId: safeWorksheetId,
      kind: "image",
      prompt: safePrompt,
      buffer: signedImageBuffer,
      mimeType,
      extension: getImageExtension(mimeType),
      limit: cacheLimit,
      metadata: {
        labImageReview: reviewMetadata,
      },
    });

    return res.status(200).json({
      success: true,
      kind: "image",
      cached: false,
      imageUrl: saved.assetUrl,
      downloadUrl: saved.assetUrl,
      fileName: saved.fileName,
      storagePath: saved.storagePath,
      cloudDownloadUrl: saved.downloadUrl,
      provider: "nano-banana",
      signature: reviewMetadata.signature,
      reviewMetadata: { labImageReview: reviewMetadata },
      promptReview,
    });
  } catch (error: any) {
    console.error("lab-tools/image error:", error);
    if (isRecoverableLabToolApiError(error)) {
      startLabToolApiCooldown(NANO_BANANA_PROVIDER);
      if (isAdminForceGeneration) {
        return res.status(503).json({
          error: "圖片生成服務暫時無法使用，未建立新的管理素材。",
          provider: NANO_BANANA_PROVIDER,
          promptReview,
        });
      }
      const fallback = await findRandomCachedLabToolResult(
        safeWorksheetId,
        "image",
        cacheLimit,
        context.taskId
      );
      if (fallback) {
        return res.status(200).json({
          success: true,
          kind: "image",
          cached: true,
          fallback: true,
          fallbackReason: "api-error",
          imageUrl: fallback.assetUrl,
          downloadUrl: fallback.assetUrl,
          fileName: fallback.fileName,
          cacheCount: fallback.cacheCount,
          cacheLimit: fallback.cacheLimit,
          provider: "local-cache",
          signature: readLabToolSignature(fallback.metadata),
          reviewMetadata: fallback.metadata,
          promptReview,
        });
      }
    }
    return res
      .status(500)
      .json({ error: error.message || "Nano Banana image generation failed" });
  }
}
