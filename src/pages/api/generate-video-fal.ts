// fal.ai video generation — split into two quick actions so Vercel function
// timeout never bites:
//   POST { action: "submit", ... }  → submit job, returns status/response URLs
//   POST { action: "poll", ... }    → check status (and fetch result if done)
// The browser does the long polling; each server call is < 5 seconds.
import { NextApiRequest, NextApiResponse } from "next";
import https from "https";

const FAL_QUEUE_BASE = "https://queue.fal.run";
const DEFAULT_MODEL_ID = "fal-ai/kling-video/v3/pro/image-to-video";

interface HttpsResponse {
  status: number;
  data: any;
}

function httpsRequest(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string }
): Promise<HttpsResponse> {
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

  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "FAL_API_KEY not configured" });
  }

  const { action } = req.body;

  // === Action: submit ===================================================
  if (action === "submit") {
    const {
      modelId = DEFAULT_MODEL_ID,
      imageUrl,
      prompt,
      duration = "3",
      generateAudio = true,
      negativePrompt,
    } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }
    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    try {
      const body = {
        start_image_url: imageUrl,
        prompt,
        duration: String(duration),
        generate_audio: generateAudio,
        negative_prompt:
          negativePrompt ||
          "blur, distort, low quality, watermark, text, deformed, extra limbs, ugly",
        cfg_scale: 0.5,
      };

      const submitResult = await httpsRequest(`${FAL_QUEUE_BASE}/${modelId}`, {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (submitResult.status >= 400) {
        return res.status(500).json({
          error: `fal submit failed (${submitResult.status})`,
          details: submitResult.data,
        });
      }

      const { request_id, status_url, response_url } = submitResult.data || {};
      if (!request_id) {
        return res.status(500).json({
          error: "fal returned no request_id",
          details: submitResult.data,
        });
      }

      return res.status(200).json({
        requestId: request_id,
        statusUrl: status_url,
        responseUrl: response_url,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || String(err) });
    }
  }

  // === Action: poll ====================================================
  if (action === "poll") {
    const { statusUrl, responseUrl } = req.body;
    if (!statusUrl || !responseUrl) {
      return res.status(400).json({ error: "statusUrl and responseUrl required" });
    }

    try {
      const statusRes = await httpsRequest(statusUrl, {
        method: "GET",
        headers: { Authorization: `Key ${apiKey}` },
      });

      const status = statusRes.data?.status;

      if (status === "COMPLETED") {
        const resultRes = await httpsRequest(responseUrl, {
          method: "GET",
          headers: { Authorization: `Key ${apiKey}` },
        });
        const videoUrl = resultRes.data?.video?.url;
        if (!videoUrl) {
          return res.status(500).json({
            error: "fal completed but no video.url",
            details: resultRes.data,
          });
        }
        return res.status(200).json({
          status: "COMPLETED",
          videoUrl,
          raw: resultRes.data,
        });
      }

      if (status === "FAILED" || status === "ERROR") {
        return res.status(200).json({
          status: "FAILED",
          error: "fal generation failed",
          details: statusRes.data,
        });
      }

      // IN_QUEUE / IN_PROGRESS — return position info if available
      return res.status(200).json({
        status: status || "IN_PROGRESS",
        queuePosition: statusRes.data?.queue_position,
        logs: statusRes.data?.logs,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || String(err) });
    }
  }

  return res.status(400).json({ error: "Unknown action. Use 'submit' or 'poll'." });
}
