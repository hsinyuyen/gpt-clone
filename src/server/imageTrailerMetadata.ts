import {
  LAB_IMAGE_REVIEW_METADATA_MARKER,
  LabImageReviewMetadata,
} from "@/utils/labImageMetadata";

export function injectLabImageMetadata(
  imageBuffer: Buffer,
  metadata: LabImageReviewMetadata
) {
  const trailer = Buffer.concat([
    Buffer.from(LAB_IMAGE_REVIEW_METADATA_MARKER, "utf8"),
    Buffer.from([0x00]),
    Buffer.from(JSON.stringify(metadata), "utf8"),
  ]);
  return Buffer.concat([imageBuffer, trailer]);
}
