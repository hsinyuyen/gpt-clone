import { NextApiRequest, NextApiResponse } from "next";
import https from "https";

const SEEDANCE_API_BASE = "https://seedanceapi.org/v1";

function httpsRequest(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string }
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method,
        headers: options.headers,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk: Buffer) => (body += chunk.toString()));
        response.on("end", () => {
          try {
            resolve({ status: response.statusCode || 0, data: JSON.parse(body) });
          } catch {
            resolve({ status: response.statusCode || 0, data: body });
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("Request timeout")));
    if (options.body) req.write(options.body);
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

  const { prompt, task, duration } = req.body as {
    prompt?: string;
    task?: string;
    duration?: string | number;
  };

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const submitResult = await httpsRequest(`${SEEDANCE_API_BASE}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: `${task || "Lab Video task"}. ${prompt}. child-friendly classroom game UI animation, smooth motion, no text, no watermark`,
        aspect_ratio: "16:9",
        resolution: "480p",
        duration: String(duration || 5),
        generate_audio: false,
      }),
    });

    if (submitResult.status !== 200 || submitResult.data?.code !== 200) {
      return res.status(500).json({
        error: "影片生成送出失敗",
        details: submitResult.data,
      });
    }

    const taskId = submitResult.data?.data?.task_id;
    if (!taskId) {
      return res.status(500).json({ error: "No task_id returned" });
    }

    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const statusResult = await httpsRequest(
        `${SEEDANCE_API_BASE}/status?task_id=${taskId}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      const status = statusResult.data?.data?.status;

      if (status === "SUCCESS" && statusResult.data?.data?.response?.[0]) {
        return res.status(200).json({
          success: true,
          kind: "video",
          videoUrl: statusResult.data.data.response[0],
          videoId: taskId,
        });
      }

      if (status === "FAILED") {
        return res.status(500).json({
          error: "影片生成失敗",
          details: statusResult.data?.data,
        });
      }
    }

    return res.status(200).json({
      success: true,
      kind: "video",
      status: "processing",
      videoId: taskId,
      message: "影片已送出生成，仍在處理中。",
    });
  } catch (error: any) {
    console.error("lab-tools/video error:", error);
    return res.status(500).json({ error: error.message || "影片生成失敗" });
  }
}
