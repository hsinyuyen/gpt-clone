import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export type CacheableLabToolKind = "image" | "music" | "video";

interface CacheEntry {
  id: string;
  prompt: string;
  normalizedPrompt: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

interface SaveCacheParams {
  worksheetId?: string;
  kind: CacheableLabToolKind;
  prompt: string;
  buffer: Buffer;
  mimeType: string;
  extension: string;
  limit: number;
}

const CACHE_ROOT = path.join(process.cwd(), ".lab-tool-cache");
const SIMILARITY_THRESHOLD = 0.72;
const MAX_CACHE_LIMIT = 100;
const apiCooldownUntil = new Map<string, number>();
const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const sanitizeSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "S3W01";

export const normalizeWorksheetId = (worksheetId?: string) =>
  sanitizeSegment((worksheetId || "S3W01").toUpperCase().replace(/[-_\s]/g, ""));

export function readLabToolCacheLimit(envName: string, fallback: number) {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(1, Math.min(MAX_CACHE_LIMIT, Math.floor(parsed)));
}

const normalizePrompt = (prompt: string) =>
  prompt
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();

const bigrams = (value: string) => {
  if (value.length <= 1) return value ? [value] : [];
  const parts: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    parts.push(value.slice(index, index + 2));
  }
  return parts;
};

const promptSimilarity = (left: string, right: string) => {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }

  const leftParts = bigrams(left);
  const rightParts = bigrams(right);
  if (leftParts.length === 0 || rightParts.length === 0) return 0;

  const rightCounts = new Map<string, number>();
  rightParts.forEach((part) => {
    rightCounts.set(part, (rightCounts.get(part) || 0) + 1);
  });

  let overlap = 0;
  leftParts.forEach((part) => {
    const count = rightCounts.get(part) || 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(part, count - 1);
    }
  });

  return (2 * overlap) / (leftParts.length + rightParts.length);
};

const kindDir = (worksheetId: string, kind: CacheableLabToolKind) =>
  path.join(CACHE_ROOT, normalizeWorksheetId(worksheetId), kind);

const indexPath = (worksheetId: string, kind: CacheableLabToolKind) =>
  path.join(kindDir(worksheetId, kind), "index.json");

async function readIndex(worksheetId: string, kind: CacheableLabToolKind): Promise<CacheEntry[]> {
  try {
    const raw = await fs.readFile(indexPath(worksheetId, kind), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(
  worksheetId: string,
  kind: CacheableLabToolKind,
  entries: CacheEntry[]
) {
  await fs.mkdir(kindDir(worksheetId, kind), { recursive: true });
  await fs.writeFile(indexPath(worksheetId, kind), JSON.stringify(entries, null, 2), "utf8");
}

export function cachedAssetUrl(
  worksheetId: string,
  kind: CacheableLabToolKind,
  fileName: string
) {
  const params = new URLSearchParams({
    worksheetId: normalizeWorksheetId(worksheetId),
    kind,
    file: fileName,
  });
  return `/api/lab-tools/asset?${params.toString()}`;
}

export async function findCachedLabToolResult(
  worksheetId: string,
  kind: CacheableLabToolKind,
  prompt: string,
  limit?: number
) {
  const normalizedPrompt = normalizePrompt(prompt);
  const entries = await readIndex(worksheetId, kind);
  const requiredCount =
    typeof limit === "number" ? Math.max(1, Math.floor(limit)) : undefined;
  const usableEntries = requiredCount ? entries.slice(0, requiredCount) : entries;

  if (requiredCount && usableEntries.length < requiredCount) {
    return null;
  }

  const matches: { entry: CacheEntry; score: number }[] = [];
  for (const entry of usableEntries) {
    const entryPrompt = normalizePrompt(entry.normalizedPrompt || entry.prompt);
    const score = promptSimilarity(normalizedPrompt, entryPrompt);
    if (score >= SIMILARITY_THRESHOLD) {
      matches.push({ entry, score });
    }
  }

  if (matches.length === 0) return null;

  const picked = requiredCount
    ? matches[Math.floor(Math.random() * matches.length)]
    : matches.reduce((best, item) => (item.score > best.score ? item : best));

  return {
    cached: true,
    score: picked.score,
    prompt: picked.entry.prompt,
    mimeType: picked.entry.mimeType,
    assetUrl: cachedAssetUrl(worksheetId, kind, picked.entry.fileName),
    fileName: picked.entry.fileName,
    createdAt: picked.entry.createdAt,
    cacheCount: usableEntries.length,
    cacheLimit: requiredCount,
    matchCount: matches.length,
  };
}

export async function findRandomCachedLabToolResult(
  worksheetId: string,
  kind: CacheableLabToolKind,
  limit?: number
) {
  const entries = await readIndex(worksheetId, kind);
  const requiredCount =
    typeof limit === "number" ? Math.max(1, Math.floor(limit)) : undefined;
  const usableEntries = requiredCount ? entries.slice(0, requiredCount) : entries;

  if (usableEntries.length === 0) return null;

  const picked = usableEntries[Math.floor(Math.random() * usableEntries.length)];
  return {
    cached: true,
    prompt: picked.prompt,
    mimeType: picked.mimeType,
    assetUrl: cachedAssetUrl(worksheetId, kind, picked.fileName),
    fileName: picked.fileName,
    createdAt: picked.createdAt,
    cacheCount: usableEntries.length,
    cacheLimit: requiredCount,
  };
}

export function isRecoverableLabToolApiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /quota|rate[- ]?limit|billing|prepay|prepayment|credits? are depleted|depleted|insufficient|too many|too many calls|too many requests|429|401|unauthorized|missing_permissions|permission|resource[_ -]?exhausted|exceeded/i.test(message);
}

export function startLabToolApiCooldown(
  provider: string,
  durationMs = 5 * 60 * 1000
) {
  apiCooldownUntil.set(provider, Date.now() + durationMs);
}

export function isLabToolApiCoolingDown(provider: string) {
  const until = apiCooldownUntil.get(provider) || 0;
  if (until <= Date.now()) {
    apiCooldownUntil.delete(provider);
    return false;
  }
  return true;
}

export async function saveLabToolResult(params: SaveCacheParams) {
  const worksheetId = normalizeWorksheetId(params.worksheetId);
  const safeExtension = params.extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const hash = crypto
    .createHash("sha1")
    .update(`${params.kind}:${params.prompt}:${Date.now()}`)
    .digest("hex")
    .slice(0, 12);
  const fileName = `${Date.now()}-${hash}.${safeExtension}`;
  const dir = kindDir(worksheetId, params.kind);
  const fullPath = path.join(dir, fileName);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fullPath, params.buffer);

  const entries = await readIndex(worksheetId, params.kind);
  const nextEntries: CacheEntry[] = [
    {
      id: hash,
      prompt: params.prompt,
      normalizedPrompt: normalizePrompt(params.prompt),
      fileName,
      mimeType: params.mimeType,
      createdAt: new Date().toISOString(),
    },
    ...entries,
  ].slice(0, params.limit);

  await writeIndex(worksheetId, params.kind, nextEntries);

  return {
    cached: false,
    assetUrl: cachedAssetUrl(worksheetId, params.kind, fileName),
    fileName,
    mimeType: params.mimeType,
  };
}

export async function readCachedAsset(
  worksheetId: string,
  kind: CacheableLabToolKind,
  fileName: string
) {
  const safeFile = path.basename(fileName);
  const entries = await readIndex(worksheetId, kind);
  const entry = entries.find((item) => item.fileName === safeFile);

  const fullPath = path.join(kindDir(worksheetId, kind), safeFile);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(fullPath);
  } catch {
    return null;
  }

  const extension = path.extname(safeFile).replace(".", "").toLowerCase();
  return {
    buffer,
    mimeType: entry?.mimeType || MIME_BY_EXTENSION[extension] || "application/octet-stream",
    fileName: entry?.fileName || safeFile,
  };
}

export async function downloadToBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download generated asset: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType.split(";")[0],
  };
}
