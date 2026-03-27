import { NextApiRequest, NextApiResponse } from "next";
import https from "https";

// Seedance API (via seedanceapi.org)
const SEEDANCE_API_BASE = "https://seedanceapi.org/v1";

function httpsRequest(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string }
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method,
      headers: options.headers,
    };
    const req = https.request(reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode || 0, data: body });
        }
      });
    });
    req.on("error", (e) => reject(e));
    req.setTimeout(30000, () => req.destroy(new Error("Request timeout")));
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function generateOneVideo(
  apiKey: string,
  imageUrl: string | null,
  prompt: string
): Promise<{ videoUrl: string | null; taskId: string }> {
  const body: Record<string, any> = {
    prompt,
    aspect_ratio: "16:9",
    resolution: "480p",
    duration: "4",
    generate_audio: false,
  };

  if (imageUrl) {
    body.image_urls = [imageUrl];
  }

  const submitResult = await httpsRequest(`${SEEDANCE_API_BASE}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (submitResult.status !== 200 || submitResult.data?.code !== 200) {
    throw new Error(`Submit failed: ${JSON.stringify(submitResult.data)}`);
  }

  const taskId = submitResult.data?.data?.task_id;
  if (!taskId) throw new Error("No task_id returned");

  // Poll for completion (max ~3 minutes)
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    try {
      const statusResult = await httpsRequest(
        `${SEEDANCE_API_BASE}/status?task_id=${taskId}`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }
      );

      const status = statusResult.data?.data?.status;
      console.log(`  Video ${taskId} poll ${i + 1}: ${status}`);

      if (status === "SUCCESS" && statusResult.data?.data?.response?.[0]) {
        return { videoUrl: statusResult.data.data.response[0], taskId };
      }
      if (status === "FAILED") {
        throw new Error("Video generation failed");
      }
    } catch (e: any) {
      if (e.message === "Video generation failed") throw e;
      // transient error, continue
    }
  }

  return { videoUrl: null, taskId };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.SEEDANCE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "SEEDANCE_API_KEY not configured" });
  }

  const { imageUrl, storyPages } = req.body as {
    imageUrl: string | null;
    storyPages: { text: string; imagePrompt: string }[];
  };

  if (!storyPages || storyPages.length === 0) {
    return res.status(400).json({ error: "Missing storyPages" });
  }

  try {
    const videoUrls: string[] = [];

    // Generate 3 video segments sequentially
    // Segment 1: from the original image
    // Segment 2 & 3: text-to-video using story prompts (continues the narrative)
    for (let i = 0; i < Math.min(storyPages.length, 3); i++) {
      const page = storyPages[i];
      const isFirst = i === 0;

      const prompt = `${page.imagePrompt}, children book illustration style, smooth cinematic animation, gentle camera movement`;

      console.log(`Generating video segment ${i + 1}/3: ${prompt.substring(0, 80)}...`);

      const result = await generateOneVideo(
        apiKey,
        isFirst ? imageUrl : null, // Only first segment uses the image
        prompt
      );

      if (result.videoUrl) {
        videoUrls.push(result.videoUrl);
        console.log(`Segment ${i + 1} completed: ${result.videoUrl.substring(0, 60)}...`);
      } else {
        console.log(`Segment ${i + 1} timed out`);
      }
    }

    if (videoUrls.length === 0) {
      return res.status(500).json({ error: "No video segments generated" });
    }

    return res.status(200).json({
      videoUrls,
      segmentCount: videoUrls.length,
    });
  } catch (error: any) {
    console.error("generate-video-chain error:", error.message);
    return res.status(500).json({ error: "影片生成失敗: " + (error.message || "unknown") });
  }
}
