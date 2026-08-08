import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { initializeApp, getApps } from "firebase/app";
import {
  deleteObject,
  getBytes,
  getDownloadURL,
  getMetadata,
  getStorage,
  listAll,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { getFirebaseConfig } from "@/config/firebaseConfig";

export type CacheableLabToolKind = "image" | "music" | "video";

interface CacheEntry {
  id: string;
  prompt: string;
  normalizedPrompt: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  size?: number;
  storagePath?: string;
  downloadUrl?: string;
  syncedAt?: string;
  metadata?: Record<string, unknown>;
}

interface SaveCacheParams {
  worksheetId?: string;
  kind: CacheableLabToolKind;
  prompt: string;
  buffer: Buffer;
  mimeType: string;
  extension: string;
  limit: number;
  metadata?: Record<string, unknown>;
}

export interface CachedAssetBuffer {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  prompt?: string;
  createdAt?: string;
  storagePath?: string;
  downloadUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface LabToolAdminAsset {
  worksheetId: string;
  kind: CacheableLabToolKind;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  prompt: string;
  taskId: string;
  task: string;
  signatureStatus: "signed" | "missing";
  indexed: boolean;
  storagePath?: string;
  downloadUrl?: string;
  assetUrl: string;
}

export interface DeleteLabToolAssetsResult {
  requested: number;
  deleted: number;
  failed: Array<{ kind: CacheableLabToolKind; fileName: string; error: string }>;
}

export interface CachedAssetRedirect {
  downloadUrl: string;
  mimeType: string;
  fileName: string;
  prompt?: string;
  createdAt?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

export type ResolvedCachedAsset = CachedAssetBuffer | CachedAssetRedirect;

const CACHE_ROOT =
  process.env.LAB_TOOL_CACHE_ROOT ||
  (process.env.VERCEL
    ? path.join(os.tmpdir(), ".lab-tool-cache")
    : path.join(process.cwd(), ".lab-tool-cache"));
const CLOUD_CACHE_ROOT = "lab-tool-cache";
const SIMILARITY_THRESHOLD = 0.72;
const MAX_CACHE_LIMIT = 100;
const ADMIN_CLOUD_TIMEOUT_MS = 8_000;
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
  value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const normalizeWorksheetId = (worksheetId?: string) =>
  sanitizeSegment((worksheetId || "").toUpperCase().replace(/[-_\s]/g, ""));

export function requireLabToolWorksheetId(worksheetId?: string) {
  const normalized = normalizeWorksheetId(worksheetId);
  if (!normalized) {
    throw new Error("worksheetId is required for Lab Tool media generation.");
  }
  return normalized;
}

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

function firebaseServices() {
  const app =
    getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApps()[0];
  return {
    storage: getStorage(app),
  };
}

function cloudStoragePath(
  worksheetId: string,
  kind: CacheableLabToolKind,
  fileName: string
) {
  return `${CLOUD_CACHE_ROOT}/${normalizeWorksheetId(worksheetId)}/${kind}/${path.basename(fileName)}`;
}

function cloudIndexPath(worksheetId: string, kind: CacheableLabToolKind) {
  return `${CLOUD_CACHE_ROOT}/${normalizeWorksheetId(worksheetId)}/${kind}/index.json`;
}

async function readLocalIndex(
  worksheetId: string,
  kind: CacheableLabToolKind
): Promise<CacheEntry[]> {
  try {
    const raw = await fs.readFile(indexPath(worksheetId, kind), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readCloudIndex(
  worksheetId: string,
  kind: CacheableLabToolKind
): Promise<CacheEntry[]> {
  const { storage } = firebaseServices();
  const ref = storageRef(storage, cloudIndexPath(worksheetId, kind));
  try {
    const buffer = Buffer.from(
      await withTimeout(getBytes(ref), ADMIN_CLOUD_TIMEOUT_MS, "Cloud index read")
    );
    const parsed = JSON.parse(buffer.toString("utf8"));
    return Array.isArray(parsed?.entries) ? (parsed.entries as CacheEntry[]) : [];
  } catch (error) {
    console.warn("[LabToolCache] cloud index read failed:", ref.fullPath, error);
  }
  return [];
}

async function readIndex(
  worksheetId: string,
  kind: CacheableLabToolKind
): Promise<CacheEntry[]> {
  const localEntries = await readLocalIndex(worksheetId, kind);
  if (localEntries.length > 0) return localEntries;
  return readCloudIndex(worksheetId, kind);
}

async function writeLocalIndex(
  worksheetId: string,
  kind: CacheableLabToolKind,
  entries: CacheEntry[]
) {
  await fs.mkdir(kindDir(worksheetId, kind), { recursive: true });
  await fs.writeFile(indexPath(worksheetId, kind), JSON.stringify(entries, null, 2), "utf8");
}

async function writeCloudIndex(
  worksheetId: string,
  kind: CacheableLabToolKind,
  entries: CacheEntry[]
) {
  const payload = {
    worksheetId: normalizeWorksheetId(worksheetId),
    kind,
    entries: entries.map((entry) =>
      Object.fromEntries(
        Object.entries(entry).filter(([, value]) => value !== undefined)
      )
    ),
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  const { storage } = firebaseServices();
  const ref = storageRef(storage, cloudIndexPath(worksheetId, kind));
  await uploadBytes(ref, Buffer.from(JSON.stringify(payload), "utf8"), {
    contentType: "application/json",
  });
  return ref.fullPath;
}

async function readMergedIndex(
  worksheetId: string,
  kind: CacheableLabToolKind
) {
  const [localEntries, cloudEntries] = await Promise.all([
    readLocalIndex(worksheetId, kind),
    readCloudIndex(worksheetId, kind).catch(() => []),
  ]);
  const merged = new Map<string, CacheEntry>();
  [...cloudEntries, ...localEntries].forEach((entry) => {
    if (entry?.fileName) merged.set(path.basename(entry.fileName), entry);
  });
  return Array.from(merged.values());
}

async function deletePhysicalAsset(
  worksheetId: string,
  kind: CacheableLabToolKind,
  fileName: string,
  storagePath?: string,
  cloudTimeoutMs?: number,
  skipCloud = false
) {
  const safeFile = path.basename(fileName);
  if (!safeFile || safeFile === "index.json") throw new Error("Invalid asset file name.");
  try {
    await fs.unlink(path.join(kindDir(worksheetId, kind), safeFile));
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (skipCloud) return { cloudError: "" };
  try {
    const { storage } = firebaseServices();
    const deletion = deleteObject(
      storageRef(storage, storagePath || cloudStoragePath(worksheetId, kind, safeFile))
    );
    await (cloudTimeoutMs
      ? withTimeout(deletion, cloudTimeoutMs, "Cloud asset delete")
      : deletion);
  } catch (error: any) {
    if (error?.code !== "storage/object-not-found") {
      return {
        cloudError: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return { cloudError: "" };
}

async function uploadCloudAsset(params: {
  worksheetId: string;
  kind: CacheableLabToolKind;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}) {
  const { storage } = firebaseServices();
  const storagePath = cloudStoragePath(params.worksheetId, params.kind, params.fileName);
  const ref = storageRef(storage, storagePath);
  await uploadBytes(ref, params.buffer, { contentType: params.mimeType });
  const downloadUrl = await getDownloadURL(ref);
  return { storagePath, downloadUrl };
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

function hasLabToolSignature(entry: CacheEntry) {
  const metadata = entry.metadata || {};
  const review = metadata.labImageReview || metadata.labMusicReview || metadata.labVideoReview;
  return Boolean(
    review &&
      typeof review === "object" &&
      !Array.isArray(review) &&
      (review as Record<string, unknown>).signature
  );
}

export async function getLabToolCacheCount(
  worksheetId: string,
  kind: CacheableLabToolKind
) {
  const entries = await readIndex(worksheetId, kind);
  return entries.filter(hasLabToolSignature).length;
}

export async function findCachedLabToolResult(
  worksheetId: string,
  kind: CacheableLabToolKind,
  prompt: string,
  limit?: number,
  taskId?: string
) {
  const normalizedPrompt = normalizePrompt(prompt);
  const entries = await readIndex(worksheetId, kind);
  const requiredCount =
    typeof limit === "number" ? Math.max(1, Math.floor(limit)) : undefined;
  const signedEntries = entries.filter(hasLabToolSignature);
  const usableEntries = requiredCount ? signedEntries.slice(0, requiredCount) : signedEntries;

  const matches: { entry: CacheEntry; score: number }[] = [];
  for (const entry of usableEntries) {
    const metadata = entry.metadata || {};
    const review = metadata.labImageReview || metadata.labMusicReview || metadata.labVideoReview;
    const cachedTaskId =
      review && typeof review === "object" && !Array.isArray(review)
        ? String((review as Record<string, unknown>).taskId || "")
        : "";
    if (taskId && cachedTaskId !== taskId) continue;
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
    metadata: picked.entry.metadata,
  };
}

export async function findRandomCachedLabToolResult(
  worksheetId: string,
  kind: CacheableLabToolKind,
  limit?: number,
  taskId?: string
) {
  const entries = await readIndex(worksheetId, kind);
  const requiredCount =
    typeof limit === "number" ? Math.max(1, Math.floor(limit)) : undefined;
  const signedEntries = entries.filter(hasLabToolSignature);
  const usableEntries = (requiredCount ? signedEntries.slice(0, requiredCount) : signedEntries).filter((entry) => {
    if (!taskId) return true;
    const metadata = entry.metadata || {};
    const review = metadata.labImageReview || metadata.labMusicReview || metadata.labVideoReview;
    const cachedTaskId =
      review && typeof review === "object" && !Array.isArray(review)
        ? String((review as Record<string, unknown>).taskId || "")
        : "";
    return cachedTaskId === taskId;
  });

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
    metadata: picked.metadata,
  };
}

export function isRecoverableLabToolApiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /quota|rate[- ]?limit|billing|prepay|prepayment|credits? are depleted|depleted|insufficient|too many|too many calls|too many requests|429|resource[_ -]?exhausted|exceeded/i.test(message);
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
  const worksheetId = requireLabToolWorksheetId(params.worksheetId);
  const safeExtension = params.extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const hash = crypto
    .createHash("sha1")
    .update(`${params.kind}:${params.prompt}:${Date.now()}`)
    .digest("hex")
    .slice(0, 12);
  const fileName = `${Date.now()}-${hash}.${safeExtension}`;
  const dir = kindDir(worksheetId, params.kind);
  const fullPath = path.join(dir, fileName);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, params.buffer);
  } catch (error) {
    console.warn("[LabToolCache] local asset write failed:", fullPath, error);
  }

  const entries = await readIndex(worksheetId, params.kind);
  let cloud: { storagePath: string; downloadUrl: string } | null = null;
  let cloudIndexWritten = false;
  try {
    cloud = await uploadCloudAsset({
      worksheetId,
      kind: params.kind,
      fileName,
      buffer: params.buffer,
      mimeType: params.mimeType,
    });
  } catch (error) {
    console.warn("[LabToolCache] cloud asset upload failed:", error);
  }

  const requireCloudCache =
    process.env.LAB_TOOL_REQUIRE_CLOUD_CACHE === "true" || process.env.VERCEL === "1";
  const allEntries: CacheEntry[] = [
    {
      id: hash,
      prompt: params.prompt,
      normalizedPrompt: normalizePrompt(params.prompt),
      fileName,
      mimeType: params.mimeType,
      createdAt: new Date().toISOString(),
      size: params.buffer.length,
      storagePath: cloud?.storagePath,
      downloadUrl: cloud?.downloadUrl,
      syncedAt: cloud ? new Date().toISOString() : undefined,
      metadata: params.metadata,
    },
    ...entries,
  ];
  const nextEntries = allEntries.slice(0, params.limit);
  const retainedFiles = new Set(nextEntries.map((entry) => entry.fileName));
  const evictedEntries = allEntries
    .slice(params.limit)
    .filter((entry) => !retainedFiles.has(entry.fileName));

  try {
    await writeLocalIndex(worksheetId, params.kind, nextEntries);
  } catch (error) {
    console.warn("[LabToolCache] local index write failed:", error);
  }

  try {
    await writeCloudIndex(worksheetId, params.kind, nextEntries);
    cloudIndexWritten = true;
  } catch (error) {
    console.warn("[LabToolCache] cloud index write failed:", error);
  }

  if (requireCloudCache && (!cloud || !cloudIndexWritten)) {
    throw new Error("生成內容無法完整儲存到雲端，請稍後再試。");
  }

  await Promise.all(
    evictedEntries.map((entry) =>
      deletePhysicalAsset(worksheetId, params.kind, entry.fileName)
        .then((outcome) => {
          if (outcome.cloudError) {
            console.warn(
              "[LabToolCache] evicted cloud asset delete failed:",
              entry.fileName,
              outcome.cloudError
            );
          }
        })
        .catch((error) => {
          console.warn("[LabToolCache] evicted asset delete failed:", entry.fileName, error);
        })
    )
  );

  return {
    cached: false,
    assetUrl: cachedAssetUrl(worksheetId, params.kind, fileName),
    fileName,
    mimeType: params.mimeType,
    storagePath: cloud?.storagePath,
    downloadUrl: cloud?.downloadUrl,
    persisted: Boolean(cloud && cloudIndexWritten),
  };
}

export async function readCachedAsset(
  worksheetId: string,
  kind: CacheableLabToolKind,
  fileName: string
): Promise<CachedAssetBuffer | null> {
  const resolved = await resolveCachedAsset(worksheetId, kind, fileName);
  if (!resolved || "buffer" in resolved) return resolved;

  try {
    const response = await fetch(resolved.downloadUrl);
    if (response.ok) {
      const contentType =
        response.headers.get("content-type") ||
        resolved.mimeType ||
        "application/octet-stream";
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType: contentType.split(";")[0],
        fileName: resolved.fileName,
        prompt: resolved.prompt,
        createdAt: resolved.createdAt,
        storagePath: resolved.storagePath,
        downloadUrl: resolved.downloadUrl,
        metadata: resolved.metadata,
      };
    }
    console.warn("[LabToolCache] cloud asset download failed:", response.status);
  } catch (error) {
    console.warn("[LabToolCache] cloud asset fetch failed:", error);
  }

  return null;
}

export async function resolveCachedAsset(
  worksheetId: string,
  kind: CacheableLabToolKind,
  fileName: string
): Promise<ResolvedCachedAsset | null> {
  const safeFile = path.basename(fileName);
  const entries = await readIndex(worksheetId, kind);
  const entry = entries.find((item) => item.fileName === safeFile);

  const fullPath = path.join(kindDir(worksheetId, kind), safeFile);
  try {
    const buffer = await fs.readFile(fullPath);
    const extension = path.extname(safeFile).replace(".", "").toLowerCase();
    return {
      buffer,
      mimeType: entry?.mimeType || MIME_BY_EXTENSION[extension] || "application/octet-stream",
      fileName: entry?.fileName || safeFile,
      prompt: entry?.prompt,
      createdAt: entry?.createdAt,
      storagePath: entry?.storagePath,
      downloadUrl: entry?.downloadUrl,
      metadata: entry?.metadata,
    };
  } catch {
    // Fall through to cloud storage. This is the normal path after deployment,
    // where the server filesystem may not contain the generated cache files.
  }

  if (entry?.downloadUrl) {
    return {
      downloadUrl: entry.downloadUrl,
      mimeType: entry.mimeType || "application/octet-stream",
      fileName: entry.fileName || safeFile,
      prompt: entry.prompt,
      createdAt: entry.createdAt,
      storagePath: entry.storagePath,
      metadata: entry.metadata,
    };
  }

  try {
    const { storage } = firebaseServices();
    const ref = storageRef(storage, cloudStoragePath(worksheetId, kind, safeFile));
    const [downloadUrl, metadata] = await Promise.all([getDownloadURL(ref), getMetadata(ref)]);
    return {
      downloadUrl,
      mimeType: metadata.contentType || MIME_BY_EXTENSION[path.extname(safeFile).slice(1)] || "application/octet-stream",
      fileName: safeFile,
      createdAt: metadata.timeCreated,
      storagePath: ref.fullPath,
    };
  } catch {
    // The asset does not exist in local or cloud storage.
  }

  return null;
}

function reviewMetadata(entry?: CacheEntry) {
  const metadata = entry?.metadata || {};
  const review = metadata.labImageReview || metadata.labMusicReview || metadata.labVideoReview;
  return review && typeof review === "object" && !Array.isArray(review)
    ? (review as Record<string, unknown>)
    : {};
}

export async function listLabToolAssets(worksheetIdInput: string) {
  const worksheetId = requireLabToolWorksheetId(worksheetIdInput);
  const kinds: CacheableLabToolKind[] = ["image", "music", "video"];
  const grouped = await Promise.all(
    kinds.map(async (kind) => {
      const entriesPromise = readMergedIndex(worksheetId, kind);
      const discovered = new Map<
        string,
        { size?: number; createdAt?: string; mimeType?: string; storagePath?: string; downloadUrl?: string }
      >();

      try {
        const files = await fs.readdir(kindDir(worksheetId, kind), { withFileTypes: true });
        await Promise.all(
          files
            .filter((file) => file.isFile() && file.name !== "index.json")
            .map(async (file) => {
              const stat = await fs.stat(path.join(kindDir(worksheetId, kind), file.name));
              discovered.set(file.name, {
                size: stat.size,
                createdAt: stat.birthtime.toISOString(),
                mimeType: MIME_BY_EXTENSION[path.extname(file.name).slice(1).toLowerCase()],
              });
            })
        );
      } catch {
        // Local cache may not exist on serverless instances.
      }

      try {
        const { storage } = firebaseServices();
        await withTimeout(
          (async () => {
            const result = await listAll(
              storageRef(storage, `${CLOUD_CACHE_ROOT}/${worksheetId}/${kind}`)
            );
            await Promise.all(
              result.items
                .filter((item) => item.name !== "index.json")
                .map(async (item) => {
                  const [metadata, downloadUrl] = await Promise.all([
                    getMetadata(item),
                    getDownloadURL(item),
                  ]);
                  const previous = discovered.get(item.name) || {};
                  discovered.set(item.name, {
                    ...previous,
                    size: Number(metadata.size) || previous.size,
                    createdAt: metadata.timeCreated || previous.createdAt,
                    mimeType: metadata.contentType || previous.mimeType,
                    storagePath: item.fullPath,
                    downloadUrl,
                  });
                })
            );
          })(),
          ADMIN_CLOUD_TIMEOUT_MS,
          "Cloud asset listing"
        );
      } catch (error) {
        console.warn("[LabToolCache] cloud asset listing failed:", worksheetId, kind, error);
      }

      const entries = await entriesPromise;
      const entriesByFile = new Map(
        entries.map((entry) => [path.basename(entry.fileName), entry])
      );
      entries.forEach((entry) => {
        const previous = discovered.get(entry.fileName) || {};
        discovered.set(entry.fileName, {
          ...previous,
          size: entry.size ?? previous.size,
          createdAt: entry.createdAt || previous.createdAt,
          mimeType: entry.mimeType || previous.mimeType,
          storagePath: entry.storagePath || previous.storagePath,
          downloadUrl: entry.downloadUrl || previous.downloadUrl,
        });
      });

      return Array.from(discovered.entries()).map(([fileName, actual]): LabToolAdminAsset => {
        const entry = entriesByFile.get(fileName);
        const review = reviewMetadata(entry);
        return {
          worksheetId,
          kind,
          fileName,
          mimeType: actual.mimeType || entry?.mimeType || "application/octet-stream",
          size: actual.size || entry?.size || 0,
          createdAt: actual.createdAt || entry?.createdAt || "",
          prompt: String(review.prompt || entry?.prompt || ""),
          taskId: String(review.taskId || ""),
          task: String(review.task || ""),
          signatureStatus: review.signature ? "signed" : "missing",
          indexed: Boolean(entry),
          storagePath: actual.storagePath || entry?.storagePath,
          downloadUrl: actual.downloadUrl || entry?.downloadUrl,
          assetUrl: cachedAssetUrl(worksheetId, kind, fileName),
        };
      });
    })
  );

  return grouped.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function deleteLabToolAssets(params: {
  worksheetId: string;
  scope: "asset" | "kind" | "worksheet";
  kind?: CacheableLabToolKind;
  fileName?: string;
}): Promise<DeleteLabToolAssetsResult> {
  const worksheetId = requireLabToolWorksheetId(params.worksheetId);
  const allKinds: CacheableLabToolKind[] = ["image", "music", "video"];
  const kinds = params.scope === "worksheet" ? allKinds : params.kind ? [params.kind] : [];
  if (kinds.length === 0) throw new Error("kind is required for this delete scope.");

  const requestedFileName = path.basename(params.fileName || "");
  if (params.scope === "asset" && !requestedFileName) {
    throw new Error("A valid asset file name is required.");
  }

  // A single-item deletion already has a verified kind and file name from the
  // management view. Do not require a fresh cloud listing before deletion:
  // Storage listing can fail independently even when the target file is valid.
  const listed = params.scope === "asset" ? [] : await listLabToolAssets(worksheetId);
  const targets = params.scope === "asset"
    ? [{ kind: kinds[0], fileName: requestedFileName, storagePath: undefined }]
    : listed
        .filter((asset) => kinds.includes(asset.kind))
        .map((asset) => ({ kind: asset.kind, fileName: asset.fileName, storagePath: asset.storagePath }));
  if (targets.some((target) => !target.fileName || target.fileName === "index.json")) {
    throw new Error("A valid asset file name is required.");
  }

  const result: DeleteLabToolAssetsResult = { requested: targets.length, deleted: 0, failed: [] };
  const deletedByKind = new Map<CacheableLabToolKind, Set<string>>();
  const cloudUnavailableKinds = new Set<CacheableLabToolKind>();
  for (const target of targets) {
    try {
      const outcome = await deletePhysicalAsset(
        worksheetId,
        target.kind,
        target.fileName,
        target.storagePath,
        ADMIN_CLOUD_TIMEOUT_MS,
        cloudUnavailableKinds.has(target.kind)
      );
      result.deleted += 1;
      const deleted = deletedByKind.get(target.kind) || new Set<string>();
      deleted.add(target.fileName);
      deletedByKind.set(target.kind, deleted);
      if (outcome.cloudError) {
        cloudUnavailableKinds.add(target.kind);
        result.failed.push({
          kind: target.kind,
          fileName: target.fileName,
          error: outcome.cloudError,
        });
      }
    } catch (error) {
      result.failed.push({
        ...target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const kind of kinds) {
    const deleted = deletedByKind.get(kind) || new Set<string>();
    const cloudUnavailable = cloudUnavailableKinds.has(kind);
    const entries = cloudUnavailable
      ? await readLocalIndex(worksheetId, kind)
      : await readMergedIndex(worksheetId, kind);
    const nextEntries = params.scope !== "asset" && result.failed.length === 0
      ? []
      : entries.filter((entry) => !deleted.has(entry.fileName));
    try {
      await writeLocalIndex(worksheetId, kind, nextEntries);
      if (!cloudUnavailable) {
        await withTimeout(
          writeCloudIndex(worksheetId, kind, nextEntries),
          ADMIN_CLOUD_TIMEOUT_MS,
          "Cloud index write"
        );
      }
    } catch (error) {
      result.failed.push({
        kind,
        fileName: "index.json",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
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
