import {
  LAB_MUSIC_REVIEW_METADATA_DESCRIPTION,
  LabMusicReviewMetadata,
} from "@/utils/labMusicMetadata";

function encodeSyncSafe(size: number) {
  return Buffer.from([
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ]);
}

function frameHeader(id: string, size: number) {
  const header = Buffer.alloc(10);
  header.write(id, 0, 4, "ascii");
  header.writeUInt32BE(size, 4);
  return header;
}

function textFrame(id: string, text: string) {
  const content = Buffer.concat([
    Buffer.from([0x03]),
    Buffer.from(text, "utf8"),
  ]);
  return Buffer.concat([frameHeader(id, content.length), content]);
}

function txxxFrame(description: string, value: string) {
  const content = Buffer.concat([
    Buffer.from([0x03]),
    Buffer.from(description, "utf8"),
    Buffer.from([0x00]),
    Buffer.from(value, "utf8"),
  ]);
  return Buffer.concat([frameHeader("TXXX", content.length), content]);
}

function commentFrame(description: string, value: string) {
  const content = Buffer.concat([
    Buffer.from([0x03]),
    Buffer.from("chi", "ascii"),
    Buffer.from(description, "utf8"),
    Buffer.from([0x00]),
    Buffer.from(value, "utf8"),
  ]);
  return Buffer.concat([frameHeader("COMM", content.length), content]);
}

function id3v23Tag(frames: Buffer[]) {
  const body = Buffer.concat(frames);
  const header = Buffer.concat([
    Buffer.from("ID3", "ascii"),
    Buffer.from([0x03, 0x00, 0x00]),
    encodeSyncSafe(body.length),
  ]);
  return Buffer.concat([header, body]);
}

export function injectLabMusicMetadata(
  mp3Buffer: Buffer,
  metadata: LabMusicReviewMetadata
) {
  const metadataJson = JSON.stringify(metadata);
  const title = `Lab Music - ${metadata.worksheetId || "worksheet"}`;
  const frames = [
    textFrame("TIT2", title),
    textFrame("TPE1", "Lab Terminal"),
    commentFrame("Lab Terminal prompt", metadata.prompt),
    txxxFrame(LAB_MUSIC_REVIEW_METADATA_DESCRIPTION, metadataJson),
  ];

  return Buffer.concat([id3v23Tag(frames), mp3Buffer]);
}
