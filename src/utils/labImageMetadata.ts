export const LAB_IMAGE_REVIEW_METADATA_MARKER = "LAB_TERMINAL_IMAGE_REVIEW_JSON";

export interface LabImageReviewMetadata {
  source: "lab-terminal";
  tool: "Lab Image";
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
  generatedAt: string;
  provider?: string;
  model?: string;
  signature?: string;
  contentHash?: string;
  signatureVersion?: number;
}

const MAX_IMAGE_METADATA_READ_BYTES = 128 * 1024;

function isLabImageReviewMetadata(value: unknown): value is LabImageReviewMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.source === "lab-terminal" &&
    record.tool === "Lab Image" &&
    typeof record.prompt === "string" &&
    record.prompt.trim().length > 0
  );
}

export function readLabImageMetadataFromBytes(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const markerIndex = text.lastIndexOf(LAB_IMAGE_REVIEW_METADATA_MARKER);
  if (markerIndex < 0) return null;
  const jsonStart = text.indexOf("{", markerIndex + LAB_IMAGE_REVIEW_METADATA_MARKER.length);
  if (jsonStart < 0) return null;

  try {
    const parsed = JSON.parse(text.slice(jsonStart));
    return isLabImageReviewMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readLabImageMetadataFromBlob(blob: Blob) {
  const bytes = new Uint8Array(
    await blob
      .slice(Math.max(0, blob.size - MAX_IMAGE_METADATA_READ_BYTES), blob.size)
      .arrayBuffer()
  );
  return readLabImageMetadataFromBytes(bytes);
}
