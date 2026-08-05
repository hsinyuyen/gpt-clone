export const LAB_MUSIC_REVIEW_METADATA_DESCRIPTION = "LAB_TERMINAL_REVIEW_JSON";

export interface LabMusicReviewMetadata {
  source: "lab-terminal";
  tool: "Lab Music";
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
  durationMs?: number;
  generatedAt: string;
  provider?: string;
  model?: string;
  signature?: string;
  contentHash?: string;
  signatureVersion?: number;
}

const ID3_HEADER_SIZE = 10;
const MAX_ID3_READ_BYTES = 256 * 1024;

function bytesToAscii(bytes: Uint8Array, start: number, length: number) {
  return Array.from(bytes.slice(start, start + length))
    .map((value) => String.fromCharCode(value))
    .join("");
}

function syncSafeToInt(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function frameSize(bytes: Uint8Array, offset: number, majorVersion: number) {
  if (majorVersion >= 4) return syncSafeToInt(bytes, offset);
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function decodeUtf16(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    let output = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      const code = bytes[index] | (bytes[index + 1] << 8);
      if (code === 0) continue;
      output += String.fromCharCode(code);
    }
    return output;
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      const code = (bytes[index] << 8) | bytes[index + 1];
      if (code === 0) continue;
      output += String.fromCharCode(code);
    }
    return output;
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function decodeTextFrame(frameData: Uint8Array) {
  if (frameData.length === 0) return "";
  const encoding = frameData[0];
  const payload = frameData.slice(1);

  if (encoding === 0x00) {
    return new TextDecoder("iso-8859-1").decode(payload).replace(/\u0000+$/g, "");
  }
  if (encoding === 0x01 || encoding === 0x02) {
    return decodeUtf16(payload).replace(/\u0000+$/g, "");
  }
  return new TextDecoder("utf-8").decode(payload).replace(/\u0000+$/g, "");
}

function parseTxxxFrame(frameData: Uint8Array) {
  const decoded = decodeTextFrame(frameData);
  const separatorIndex = decoded.indexOf("\u0000");
  if (separatorIndex < 0) {
    return { description: "", value: decoded.trim() };
  }

  return {
    description: decoded.slice(0, separatorIndex).trim(),
    value: decoded.slice(separatorIndex + 1).trim(),
  };
}

function isLabMusicReviewMetadata(value: unknown): value is LabMusicReviewMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.source === "lab-terminal" &&
    record.tool === "Lab Music" &&
    typeof record.prompt === "string" &&
    record.prompt.trim().length > 0
  );
}

export function readLabMusicMetadataFromMp3Bytes(bytes: Uint8Array) {
  if (bytes.length < ID3_HEADER_SIZE || bytesToAscii(bytes, 0, 3) !== "ID3") {
    return null;
  }

  const majorVersion = bytes[3];
  const tagSize = syncSafeToInt(bytes, 6);
  const tagEnd = Math.min(bytes.length, ID3_HEADER_SIZE + tagSize);
  let offset = ID3_HEADER_SIZE;

  while (offset + 10 <= tagEnd) {
    const frameId = bytesToAscii(bytes, offset, 4);
    if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

    const size = frameSize(bytes, offset + 4, majorVersion);
    if (size <= 0 || offset + 10 + size > tagEnd) break;

    const frameData = bytes.slice(offset + 10, offset + 10 + size);
    if (frameId === "TXXX") {
      const frame = parseTxxxFrame(frameData);
      if (frame.description === LAB_MUSIC_REVIEW_METADATA_DESCRIPTION) {
        try {
          const parsed = JSON.parse(frame.value);
          return isLabMusicReviewMetadata(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }

    offset += 10 + size;
  }

  return null;
}

export async function readLabMusicMetadataFromBlob(blob: Blob) {
  const chunk = blob.slice(0, MAX_ID3_READ_BYTES);
  const bytes = new Uint8Array(await chunk.arrayBuffer());
  return readLabMusicMetadataFromMp3Bytes(bytes);
}
