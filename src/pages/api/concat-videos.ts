import { NextApiRequest, NextApiResponse } from "next";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";

const execFileAsync = promisify(execFile);
const ffmpegPath = require("ffmpeg-static") as string;

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(dest);
            downloadFile(redirectUrl, dest).then(resolve).catch(reject);
            return;
          }
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { videoUrls } = req.body as { videoUrls: string[] };

  if (!videoUrls || videoUrls.length === 0) {
    return res.status(400).json({ error: "Missing videoUrls" });
  }

  if (videoUrls.length === 1) {
    return res.status(200).json({ videoUrl: videoUrls[0] });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vidconcat-"));

  try {
    // Download all videos
    const downloadedPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const ext = ".mp4";
      const filePath = path.join(tmpDir, `segment_${i}${ext}`);
      console.log(`Downloading segment ${i + 1}/${videoUrls.length}...`);
      await downloadFile(videoUrls[i], filePath);
      downloadedPaths.push(filePath);
      console.log(`Downloaded: ${filePath} (${fs.statSync(filePath).size} bytes)`);
    }

    // Create concat file list for ffmpeg
    const listPath = path.join(tmpDir, "filelist.txt");
    const listContent = downloadedPaths
      .map((p) => `file '${p.replace(/\\/g, "/")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listContent);

    // Output path
    const outputPath = path.join(tmpDir, "output.mp4");

    // Run ffmpeg concat
    console.log("Running ffmpeg concat...");
    await execFileAsync(ffmpegPath, [
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      "-movflags", "+faststart",
      outputPath,
    ], { timeout: 60000 });

    const outputSize = fs.statSync(outputPath).size;
    console.log(`Concat complete: ${outputSize} bytes`);

    // Read and return as base64 data URL
    const videoBuffer = fs.readFileSync(outputPath);
    const base64 = videoBuffer.toString("base64");
    const dataUrl = `data:video/mp4;base64,${base64}`;

    // Cleanup
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    return res.status(200).json({
      videoUrl: dataUrl,
      size: outputSize,
    });
  } catch (error: any) {
    console.error("concat-videos error:", error.message);

    // Cleanup
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    return res.status(500).json({ error: "影片合併失敗: " + error.message });
  }
}

// Increase body size limit for base64 video response
export const config = {
  api: {
    responseLimit: false,
  },
};
