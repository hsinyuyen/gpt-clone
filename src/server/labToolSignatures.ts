import crypto from "crypto";
import { CacheableLabToolKind } from "@/server/labToolCache";

export interface LabToolSignatureParams {
  worksheetId: string;
  kind: CacheableLabToolKind;
  taskId?: string;
  prompt: string;
  buffer: Buffer;
}

export interface LabToolSignatureData {
  signature: string;
  contentHash: string;
  signatureVersion: 1;
}

export interface LabToolSignatureVerificationParams {
  worksheetId: string;
  kind: CacheableLabToolKind;
  taskId?: string;
  prompt: string;
  contentHash: string;
  signature: string;
}

function signaturePayload(params: Omit<LabToolSignatureParams, "buffer"> & { contentHash: string }) {
  return JSON.stringify({
    version: 1,
    worksheetId: params.worksheetId,
    kind: params.kind,
    taskId: params.taskId || "",
    prompt: params.prompt,
    contentHash: params.contentHash,
  });
}

function signatureSecret() {
  return (
    process.env.LAB_TOOL_SIGNATURE_SECRET ||
    process.env.LAB_IMAGE_SIGNATURE_SECRET ||
    process.env.OPENAI_API_KEY ||
    "lab-terminal-signature"
  );
}

function createSignatureFromPayload(
  params: Omit<LabToolSignatureParams, "buffer"> & { contentHash: string }
) {
  return crypto
    .createHmac("sha256", signatureSecret())
    .update(signaturePayload(params))
    .digest("hex");
}

export function createLabToolSignature(params: LabToolSignatureParams): LabToolSignatureData {
  const contentHash = crypto.createHash("sha256").update(params.buffer).digest("hex");
  const signature = createSignatureFromPayload({
    worksheetId: params.worksheetId,
    kind: params.kind,
    taskId: params.taskId,
    prompt: params.prompt,
    contentHash,
  });

  return { signature, contentHash, signatureVersion: 1 };
}

export function verifyLabToolSignature(params: LabToolSignatureVerificationParams) {
  if (!params.signature || !params.contentHash || !params.prompt || !params.worksheetId) {
    return false;
  }

  const expected = createSignatureFromPayload({
    worksheetId: params.worksheetId,
    kind: params.kind,
    taskId: params.taskId,
    prompt: params.prompt,
    contentHash: params.contentHash,
  });
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(params.signature, "hex");
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function readLabToolSignature(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const record = metadata as Record<string, unknown>;
  const review =
    record.labImageReview ||
    record.labMusicReview ||
    record.labVideoReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) return "";
  const signature = (review as Record<string, unknown>).signature;
  return typeof signature === "string" ? signature : "";
}
