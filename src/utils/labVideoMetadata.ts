export const LAB_VIDEO_REVIEW_METADATA_MARKER = "LAB_TERMINAL_REVIEW_JSON";

export interface LabVideoReviewMetadata {
  source: "lab-terminal";
  tool: "Lab Video";
  worksheetId?: string;
  sessionId?: string;
  sessionTitle?: string;
  courseId?: string;
  courseTitle?: string;
  semester?: string;
  week?: number;
  taskId?: string;
  task?: string;
  prompt: string;
  durationSeconds?: number;
  generatedAt: string;
  provider?: string;
  model?: string;
  signature?: string;
  contentHash?: string;
  signatureVersion?: number;
}

const MAX_VIDEO_METADATA_READ_BYTES = 256 * 1024;

function extractJsonObject(value: string, startIndex: number) {
  const firstBrace = value.indexOf("{", startIndex);
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(firstBrace, index + 1);
    }
  }

  return null;
}

function isLabVideoReviewMetadata(value: unknown): value is LabVideoReviewMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.source === "lab-terminal" &&
    record.tool === "Lab Video" &&
    typeof record.prompt === "string" &&
    record.prompt.trim().length > 0
  );
}

function parseLabVideoMetadataText(text: string) {
  const markerIndex = text.lastIndexOf(LAB_VIDEO_REVIEW_METADATA_MARKER);
  if (markerIndex < 0) return null;

  const json = extractJsonObject(text, markerIndex);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    return isLabVideoReviewMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readLabVideoMetadataFromBytes(bytes: Uint8Array) {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const firstChunk = bytes.slice(0, Math.min(bytes.length, MAX_VIDEO_METADATA_READ_BYTES));
  const firstResult = parseLabVideoMetadataText(decoder.decode(firstChunk));
  if (firstResult) return firstResult;

  if (bytes.length <= MAX_VIDEO_METADATA_READ_BYTES) return null;

  const lastChunk = bytes.slice(Math.max(0, bytes.length - MAX_VIDEO_METADATA_READ_BYTES));
  return parseLabVideoMetadataText(decoder.decode(lastChunk));
}

export async function readLabVideoMetadataFromBlob(blob: Blob) {
  const firstChunk = new Uint8Array(
    await blob.slice(0, MAX_VIDEO_METADATA_READ_BYTES).arrayBuffer()
  );
  const firstResult = readLabVideoMetadataFromBytes(firstChunk);
  if (firstResult || blob.size <= MAX_VIDEO_METADATA_READ_BYTES) return firstResult;

  const lastChunk = new Uint8Array(
    await blob
      .slice(Math.max(0, blob.size - MAX_VIDEO_METADATA_READ_BYTES), blob.size)
      .arrayBuffer()
  );
  return readLabVideoMetadataFromBytes(lastChunk);
}
