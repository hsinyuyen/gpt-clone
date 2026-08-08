import { NextApiRequest, NextApiResponse } from "next";
import {
  CacheableLabToolKind,
  cachedAssetUrl,
  normalizeWorksheetId,
  requireLabToolWorksheetId,
  resolveCachedAsset,
} from "@/server/labToolCache";
import { readLabToolSignature, verifyLabToolSignature } from "@/server/labToolSignatures";

const getSingleQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.method === "POST") {
    return verifySignature(req, res);
  }

  const fileName = getSingleQueryValue(req.query.file);
  const kind = (getSingleQueryValue(req.query.kind) || "image") as CacheableLabToolKind;
  let worksheetId = "";

  try {
    worksheetId = requireLabToolWorksheetId(getSingleQueryValue(req.query.worksheetId));
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "worksheetId is required" });
  }

  if (!fileName || !["image", "music", "video"].includes(kind)) {
    return res.status(400).json({ error: "Invalid signature request" });
  }

  const asset = await resolveCachedAsset(worksheetId, kind, fileName);
  if (!asset) {
    return res.status(404).json({ error: "Cached asset not found" });
  }

  const signature = readLabToolSignature(asset.metadata);
  return res.status(200).json({
    worksheetId,
    kind,
    fileName: asset.fileName,
    assetUrl: cachedAssetUrl(worksheetId, kind, asset.fileName),
    storagePath: asset.storagePath || null,
    downloadUrl: asset.downloadUrl || null,
    signature,
    hasSignature: Boolean(signature),
    metadata: asset.metadata || null,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function metadataKey(kind: CacheableLabToolKind) {
  if (kind === "image") return "labImageReview";
  if (kind === "music") return "labMusicReview";
  return "labVideoReview";
}

function extractMetadata(value: unknown, kind: CacheableLabToolKind) {
  if (!isRecord(value)) return null;
  const nested = value[metadataKey(kind)];
  if (isRecord(nested)) return nested;
  return value;
}

function verifyMetadata(params: {
  worksheetId: string;
  kind: CacheableLabToolKind;
  taskId?: string;
  contentHash?: string;
  metadata: Record<string, unknown> | null;
}) {
  const metadata = params.metadata;
  if (!metadata) {
    return { valid: false, reason: "這個檔案沒有 Lab Terminal 簽章資料。" };
  }

  const metadataWorksheetId = normalizeWorksheetId(asString(metadata.worksheetId) || params.worksheetId);
  if (metadataWorksheetId !== params.worksheetId) {
    return { valid: false, reason: "這個檔案不是本張學習單生成的。" };
  }

  const metadataTaskId = asString(metadata.taskId);
  if (params.taskId && metadataTaskId !== params.taskId) {
    return { valid: false, reason: "這個檔案不是本題生成的作品。" };
  }

  const prompt = asString(metadata.prompt);
  const contentHash = asString(metadata.contentHash);
  const signature = asString(metadata.signature);
  if (!prompt || !contentHash || !signature) {
    return { valid: false, reason: "這個檔案缺少可驗證的 Lab Terminal 簽章。" };
  }

  if (params.contentHash && params.contentHash !== contentHash) {
    return { valid: false, reason: "這個檔案內容和 Lab Terminal 簽章不一致。" };
  }

  const valid = verifyLabToolSignature({
    worksheetId: metadataWorksheetId,
    kind: params.kind,
    taskId: metadataTaskId,
    prompt,
    contentHash,
    signature,
  });

  return valid
    ? { valid: true, reason: "Lab Terminal 簽章驗證通過。" }
    : { valid: false, reason: "Lab Terminal 簽章驗證失敗。" };
}

async function verifySignature(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body || {};
  const kind = asString(body.kind) as CacheableLabToolKind;
  if (!["image", "music", "video"].includes(kind)) {
    return res.status(400).json({ error: "Invalid signature request" });
  }

  let worksheetId = "";
  try {
    worksheetId = requireLabToolWorksheetId(asString(body.worksheetId));
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "worksheetId is required" });
  }

  const taskId = asString(body.taskId);
  const contentHash = asString(body.contentHash);
  let metadata = extractMetadata(body.metadata, kind);

  if (kind === "image" && !metadata) {
    const fileName = asString(body.fileName);
    if (!fileName || !contentHash) {
      return res.status(200).json({
        valid: false,
        reason: "圖片缺少可驗證的 Lab Terminal 簽章資料。",
      });
    }

    const asset = await resolveCachedAsset(worksheetId, kind, fileName);
    metadata = extractMetadata(asset?.metadata, kind);
    if (!asset || !metadata) {
      return res.status(200).json({
        valid: false,
        reason: "找不到這張圖片的 Lab Terminal 生成紀錄。",
      });
    }
  }

  if (!contentHash) {
    return res.status(200).json({
      valid: false,
      reason: "檔案缺少內容 hash，無法驗證 Lab Terminal 簽章。",
    });
  }

  const result = verifyMetadata({
    worksheetId,
    kind,
    taskId,
    contentHash,
    metadata,
  });

  return res.status(200).json({
    ...result,
    worksheetId,
    kind,
    fileName: asString(body.fileName) || null,
    hasSignature: Boolean(metadata && asString(metadata.signature)),
    metadata: metadata || null,
  });
}
