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

  const { prompt, task, worksheetId } = req.body as {
    prompt?: string;
    task?: string;
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

  const cached = await findCachedLabToolResult(
    safeWorksheetId,
    "image",
    safePrompt,
    IMAGE_CACHE_LIMIT
  );
  if (cached) {
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
    });
  }

  if (isLabToolApiCoolingDown(NANO_BANANA_PROVIDER)) {
    const fallback = await findRandomCachedLabToolResult(
      safeWorksheetId,
      "image",
      IMAGE_CACHE_LIMIT
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
      });
    }
  }

  const apiKey = getNanoBananaApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "NANO_BANANA_API_KEY not configured" });
  }

  const imagePrompt = `Create a child-friendly game UI illustration for an elementary AI lesson.
Task: ${task || "Lab Image task"}
Student prompt: ${safePrompt}
Style: bold modern flat vector sticker, vibrant colors, thick black outline, clean background.
No text, no letters, no watermark.`;

  try {
    const generated = await generateNanoBananaImageBuffer(imagePrompt, apiKey);
    const mimeType = generated.mimeType.startsWith("image/")
      ? generated.mimeType
      : "image/png";

    const saved = await saveLabToolResult({
      worksheetId: safeWorksheetId,
      kind: "image",
      prompt: safePrompt,
      buffer: generated.buffer,
      mimeType,
      extension: getImageExtension(mimeType),
      limit: IMAGE_CACHE_LIMIT,
    });

    return res.status(200).json({
      success: true,
      kind: "image",
      cached: false,
      imageUrl: saved.assetUrl,
      downloadUrl: saved.assetUrl,
      fileName: saved.fileName,
      provider: "nano-banana",
    });
  } catch (error: any) {
    console.error("lab-tools/image error:", error);
    if (isRecoverableLabToolApiError(error)) {
      startLabToolApiCooldown(NANO_BANANA_PROVIDER);
      const fallback = await findRandomCachedLabToolResult(
        safeWorksheetId,
        "image",
        IMAGE_CACHE_LIMIT
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
        });
      }
    }
    return res
      .status(500)
      .json({ error: error.message || "Nano Banana image generation failed" });
  }
}
