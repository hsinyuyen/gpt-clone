import { NextApiRequest, NextApiResponse } from "next";
import https from "https";

// Seedance API (via seedanceapi.org)
// Docs: https://cdanceapi.org/zh/docs
const SEEDANCE_API_BASE = "https://seedanceapi.org/v1";

// Use Node.js https module instead of fetch for reliability
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
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timeout"));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
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

  const { imageData, motionPrompt } = req.body;

  try {
    // Build request body
    const body: Record<string, any> = {
      prompt: motionPrompt || "gentle camera pan, smooth cinematic animation, children book illustration coming to life",
      aspect_ratio: "16:9",
      resolution: "480p",
      duration: "4",
      generate_audio: false,
    };

    if (imageData && !imageData.startsWith("data:")) {
      body.image_urls = [imageData];
      console.log("Seedance: Using image-to-video mode with URL");
    } else if (imageData) {
      console.log("Seedance: Received base64, falling back to text-to-video");
    }

    // Step 1: Submit generation request
    console.log("Seedance: Submitting generation request...");
    const submitResult = await httpsRequest(`${SEEDANCE_API_BASE}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    console.log("Seedance submit response:", JSON.stringify(submitResult.data));

    if (submitResult.status !== 200 || submitResult.data?.code !== 200) {
      return res.status(500).json({
        error: `Video generation failed (${submitResult.status})`,
        details: submitResult.data,
      });
    }

    const taskId = submitResult.data?.data?.task_id;
    if (!taskId) {
      return res.status(500).json({ error: "No task_id returned from Seedance" });
    }

    // Step 2: Poll for completion (max ~3 minutes)
    const maxPolls = 36;
    const pollInterval = 5000;

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      try {
        const statusResult = await httpsRequest(
          `${SEEDANCE_API_BASE}/status?task_id=${taskId}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );

        const status = statusResult.data?.data?.status;
        console.log(`Seedance poll ${i + 1}: status=${status}`);

        if (status === "SUCCESS" && statusResult.data?.data?.response?.[0]) {
          return res.status(200).json({
            videoUrl: statusResult.data.data.response[0],
            videoId: taskId,
          });
        }

        if (status === "FAILED") {
          console.error("Video generation failed:", statusResult.data);
          return res.status(500).json({
            error: "Video generation failed",
            details: statusResult.data?.data,
          });
        }
      } catch (pollErr: any) {
        console.error(`Poll ${i + 1} error:`, pollErr.message);
        // Continue polling on transient errors
      }
    }

    // Timeout
    return res.status(200).json({
      videoUrl: null,
      videoId: taskId,
      status: "processing",
    });
  } catch (error: any) {
    console.error("generate-video-seedance error:", error.message || error);
    return res.status(500).json({ error: "影片生成失敗: " + (error.message || "unknown") });
  }
}
