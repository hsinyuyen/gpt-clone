import { NextApiRequest, NextApiResponse } from "next";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  // `image` (optional): a base64 / data-URL sketch to guide generation (image-to-image, e.g. L1 手繪主角).
  // `aspectRatio` (optional): defaults to 16:9 for illustrations, callers can pass e.g. "1:1"/"3:4" for characters.
  const { prompt, image, aspectRatio } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    const parts: any[] = [];

    if (image) {
      // Include the hand-drawn sketch as a reference image (sketch-to-character)
      const m = /^data:(image\/[\w+]+);base64,(.+)$/.exec(image);
      const mimeType = m ? m[1] : "image/png";
      const data = m ? m[2] : image;
      parts.push({ inlineData: { mimeType, data } });
      parts.push({
        text: `這是一位小朋友「手繪」的角色草圖。請「參考這張手繪草圖」的整體造型、姿勢、顏色與配件位置，畫出一隻乾淨、漂亮、可愛的兒童繪本主角：${prompt}。
要求：保留草圖裡最重要的特徵（物種、顏色、配件、大致造型），但把它變得精緻、比例協調、線條乾淨。
風格：溫暖友善的兒童繪本插畫，適合 6–9 歲，飽和色、柔和光影。
構圖：單一角色、正面或 3/4 視角、全身或半身、乾淨的純色背景。
不要有任何文字、字母或數字。`,
      });
    } else {
      parts.push({
        text: `Generate a beautiful children's book illustration: ${prompt}.
Style: cute, colorful, warm, friendly, suitable for young children aged 6-9.
No text or words in the image. High quality digital art.`,
      });
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: aspectRatio || "16:9",
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", errorText);
      return res.status(500).json({ error: "Image generation failed" });
    }

    const data = await response.json();

    // Extract base64 image from response
    const respParts = data.candidates?.[0]?.content?.parts || [];
    for (const part of respParts) {
      if (part.inlineData) {
        const base64 = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || "image/png";
        return res.status(200).json({
          imageUrl: `data:${mimeType};base64,${base64}`,
        });
      }
    }

    return res.status(500).json({ error: "No image in response" });
  } catch (error: any) {
    console.error("generate-image-gemini error:", error.message || error);
    return res.status(500).json({ error: "圖片生成失敗" });
  }
}
