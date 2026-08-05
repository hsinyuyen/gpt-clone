import { NextApiRequest, NextApiResponse } from "next";
import {
  CacheableLabToolKind,
  readCachedAsset,
  requireLabToolWorksheetId,
} from "@/server/labToolCache";
import { injectLabMusicMetadata } from "@/server/mp3Id3Metadata";
import { injectLabVideoMetadata } from "@/server/mp4UuidMetadata";
import { LabMusicReviewMetadata } from "@/utils/labMusicMetadata";
import { LabVideoReviewMetadata } from "@/utils/labVideoMetadata";

const CACHEABLE_KINDS: CacheableLabToolKind[] = ["image", "music", "video"];

const getSingleQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const config = {
  api: {
    responseLimit: false,
  },
};

function sanitizeCachedTask(value: unknown, fallback: string) {
  const task = typeof value === "string" ? value.trim() : "";
  if (!task) return fallback;
  if (/S3W01|MVP|內容生成測試/.test(task)) return fallback;
  return task;
}

function getCachedLabMusicMetadata(
  asset: Awaited<ReturnType<typeof readCachedAsset>>,
  worksheetId: string
): LabMusicReviewMetadata {
  const cached = asset?.metadata?.labMusicReview;
  if (cached && typeof cached === "object" && !Array.isArray(cached)) {
    const record = cached as Partial<LabMusicReviewMetadata>;
    if (record.source === "lab-terminal" && record.tool === "Lab Music" && record.prompt) {
      return {
        source: "lab-terminal",
        tool: "Lab Music",
        worksheetId,
        taskId: record.taskId,
        task: sanitizeCachedTask(record.task, "Lab Music cached task"),
        prompt: record.prompt,
        durationMs: record.durationMs,
        generatedAt: record.generatedAt || asset?.createdAt || new Date().toISOString(),
        provider: record.provider || "local-cache",
        model: record.model,
        signature: record.signature,
        contentHash: record.contentHash,
        signatureVersion: record.signatureVersion,
      };
    }
  }

  return {
    source: "lab-terminal",
    tool: "Lab Music",
    worksheetId,
    task: "Lab Music cached task",
    prompt: asset?.prompt || "Lab Music cached prompt",
    generatedAt: asset?.createdAt || new Date().toISOString(),
    provider: "local-cache",
  };
}

function getCachedLabVideoMetadata(
  asset: Awaited<ReturnType<typeof readCachedAsset>>,
  worksheetId: string
): LabVideoReviewMetadata {
  const cached = asset?.metadata?.labVideoReview;
  if (cached && typeof cached === "object" && !Array.isArray(cached)) {
    const record = cached as Partial<LabVideoReviewMetadata>;
    if (record.source === "lab-terminal" && record.tool === "Lab Video" && record.prompt) {
      return {
        source: "lab-terminal",
        tool: "Lab Video",
        worksheetId,
        taskId: record.taskId,
        task: sanitizeCachedTask(record.task, "Lab Video cached task"),
        prompt: record.prompt,
        durationSeconds: record.durationSeconds,
        generatedAt: record.generatedAt || asset?.createdAt || new Date().toISOString(),
        provider: record.provider || "local-cache",
        model: record.model,
        signature: record.signature,
        contentHash: record.contentHash,
        signatureVersion: record.signatureVersion,
      };
    }
  }

  return {
    source: "lab-terminal",
    tool: "Lab Video",
    worksheetId,
    task: "Lab Video cached task",
    prompt: asset?.prompt || "Lab Video cached prompt",
    generatedAt: asset?.createdAt || new Date().toISOString(),
    provider: "local-cache",
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawWorksheetId = getSingleQueryValue(req.query.worksheetId);
  const kind = getSingleQueryValue(req.query.kind) as CacheableLabToolKind | undefined;
  const fileName = getSingleQueryValue(req.query.file);
  const shouldDownload = getSingleQueryValue(req.query.download) === "1";

  if (!kind || !CACHEABLE_KINDS.includes(kind) || !fileName) {
    return res.status(400).json({ error: "Invalid cached asset request" });
  }

  let worksheetId: string;
  try {
    worksheetId = requireLabToolWorksheetId(rawWorksheetId);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "worksheetId is required" });
  }

  try {
    if (kind === "music") {
      const musicAsset = await readCachedAsset(worksheetId, kind, fileName);
      if (!musicAsset) {
        return res.status(404).json({ error: "Cached asset not found" });
      }

      const buffer = injectLabMusicMetadata(
        musicAsset.buffer,
        getCachedLabMusicMetadata(musicAsset, worksheetId)
      );

      res.setHeader("Content-Type", musicAsset.mimeType);
      res.setHeader("Content-Disposition", `${shouldDownload ? "attachment" : "inline"}; filename="${musicAsset.fileName}"`);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(buffer);
    }

    if (kind === "video") {
      const videoAsset = await readCachedAsset(worksheetId, kind, fileName);
      if (!videoAsset) {
        return res.status(404).json({ error: "Cached asset not found" });
      }

      const buffer = /mp4|quicktime/i.test(videoAsset.mimeType)
        ? injectLabVideoMetadata(
            videoAsset.buffer,
            getCachedLabVideoMetadata(videoAsset, worksheetId)
          )
        : videoAsset.buffer;

      res.setHeader("Content-Type", videoAsset.mimeType);
      res.setHeader("Content-Disposition", `${shouldDownload ? "attachment" : "inline"}; filename="${videoAsset.fileName}"`);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(buffer);
    }

    const imageAsset = await readCachedAsset(worksheetId, kind, fileName);
    if (!imageAsset) {
      return res.status(404).json({ error: "Cached asset not found" });
    }

    // Stream cloud-backed images through this same-origin endpoint so the
    // browser receives a real attachment response instead of a Firebase redirect.
    res.setHeader("Content-Type", imageAsset.mimeType);
    res.setHeader(
      "Content-Disposition",
      `${shouldDownload ? "attachment" : "inline"}; filename="${imageAsset.fileName}"`
    );
    res.setHeader("Content-Length", String(imageAsset.buffer.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(imageAsset.buffer);
  } catch (error) {
    console.error("lab-tools/asset error:", error);
    return res.status(500).json({ error: "Failed to read cached asset" });
  }
}
