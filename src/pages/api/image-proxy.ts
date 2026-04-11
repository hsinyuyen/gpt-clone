import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  // Only allow Pollinations URLs
  if (!url.startsWith("https://image.pollinations.ai/") && !url.startsWith("https://gen.pollinations.ai/")) {
    return res.status(403).json({ error: "Only Pollinations URLs allowed" });
  }

  try {
    const apiKey = process.env.POLLINATIONS_API_KEY;

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      headers,
    });

    const contentType = response.headers["content-type"] || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 24h
    res.status(200).send(Buffer.from(response.data));
  } catch (error: any) {
    const status = error.response?.status || 500;
    console.error("Image proxy error:", status, error.message);
    res.status(status).json({ error: `Failed to fetch image: ${error.message}` });
  }
}
