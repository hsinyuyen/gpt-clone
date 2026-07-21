import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  const { prompt, task } = req.body as { prompt?: string; task?: string };

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const imagePrompt = `Create a child-friendly game UI illustration for an elementary AI lesson.
Task: ${task || "Lab Image task"}
Student prompt: ${prompt}
Style: bold modern flat vector sticker, vibrant colors, thick black outline, clean background.
No text, no letters, no watermark.`;

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.LAB_IMAGE_MODEL || "dall-e-3",
        prompt: imagePrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        style: "vivid",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("lab-tools/image OpenAI error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "圖片生成失敗",
      });
    }

    const b64 = data.data?.[0]?.b64_json;
    if (b64) {
      return res.status(200).json({
        success: true,
        kind: "image",
        imageUrl: `data:image/png;base64,${b64}`,
      });
    }

    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: "No image returned" });
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return res.status(500).json({ error: "Failed to download image" });
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    return res.status(200).json({
      success: true,
      kind: "image",
      imageUrl: `data:image/png;base64,${base64Image}`,
    });
  } catch (error: any) {
    console.error("lab-tools/image error:", error);
    return res.status(500).json({ error: error.message || "圖片生成失敗" });
  }
}
