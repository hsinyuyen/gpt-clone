import {
  LAB_VIDEO_REVIEW_METADATA_MARKER,
  LabVideoReviewMetadata,
} from "@/utils/labVideoMetadata";

const LAB_VIDEO_UUID = Buffer.from([
  0x4c, 0x54, 0x52, 0x4d, 0x45, 0x54, 0x41, 0x31,
  0x8f, 0x5a, 0x47, 0x21, 0x91, 0x0a, 0x6d, 0x33,
]);

function mp4Box(type: string, payload: Buffer) {
  const size = 8 + payload.length;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}

export function injectLabVideoMetadata(
  videoBuffer: Buffer,
  metadata: LabVideoReviewMetadata
) {
  const payload = Buffer.concat([
    LAB_VIDEO_UUID,
    Buffer.from(LAB_VIDEO_REVIEW_METADATA_MARKER, "utf8"),
    Buffer.from([0x00]),
    Buffer.from(JSON.stringify(metadata), "utf8"),
  ]);

  return Buffer.concat([videoBuffer, mp4Box("uuid", payload)]);
}
