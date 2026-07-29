import { NextApiRequest, NextApiResponse } from "next";
import {
  CacheableLabToolKind,
  resolveCachedAsset,
} from "@/server/labToolCache";

const CACHEABLE_KINDS: CacheableLabToolKind[] = ["image", "music", "video"];

const getSingleQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const config = {
  api: {
    responseLimit: false,
  },
};

function withDownloadDisposition(url: string, fileName: string, shouldDownload: boolean) {
  if (!shouldDownload) return url;
  try {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${fileName}"`
    );
    return nextUrl.toString();
  } catch {
    return url;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const worksheetId = getSingleQueryValue(req.query.worksheetId) || "S3W01";
  const kind = getSingleQueryValue(req.query.kind) as CacheableLabToolKind | undefined;
  const fileName = getSingleQueryValue(req.query.file);
  const shouldDownload = getSingleQueryValue(req.query.download) === "1";

  if (!kind || !CACHEABLE_KINDS.includes(kind) || !fileName) {
    return res.status(400).json({ error: "Invalid cached asset request" });
  }

  try {
    const asset = await resolveCachedAsset(worksheetId, kind, fileName);
    if (!asset) {
      return res.status(404).json({ error: "Cached asset not found" });
    }

    if ("downloadUrl" in asset) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.redirect(
        302,
        withDownloadDisposition(asset.downloadUrl, asset.fileName, shouldDownload)
      );
    }

    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Disposition", `${shouldDownload ? "attachment" : "inline"}; filename="${asset.fileName}"`);
    res.setHeader("Content-Length", String(asset.buffer.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(asset.buffer);
  } catch (error) {
    console.error("lab-tools/asset error:", error);
    return res.status(500).json({ error: "Failed to read cached asset" });
  }
}
