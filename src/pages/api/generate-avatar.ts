import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, name } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // 生成 sprite sheet（4列2行 = 8格的網格）
    const spriteSheetPrompt = `Create a sprite sheet grid showing 8 animation frames of a pixel art character: ${prompt}.

CRITICAL LAYOUT REQUIREMENTS:
- The image must be divided into a 4x2 grid (4 columns, 2 rows)
- Each of the 8 cells contains ONE frame of the character
- All 8 frames must show the SAME character with subtle animation differences
- Frame order: Top row left-to-right (frames 1-4), then bottom row left-to-right (frames 5-8)

ANIMATION: Simple idle/breathing loop
- Frames 1-4: Character slightly rising/inhaling
- Frames 5-8: Character slightly falling/exhaling back to start position

STYLE:
- Retro 16-bit pixel art style
- Blocky, clearly visible pixels
- Limited color palette
- Pure white background in each cell
- Character centered in each cell
- Same character design across all 8 frames
- Cute chibi style, suitable for children
- Front-facing view

Each frame should be identical except for subtle breathing/movement animation.`;

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: spriteSheetPrompt,
        n: 1,
        size: "1024x1024", // 正方形，4x2 網格
        quality: "hd",
        style: "vivid",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);

      if (data.error?.code === "content_policy_violation") {
        return res.status(400).json({
          error: "內容不符合安全規範，請嘗試其他描述",
        });
      }

      if (data.error?.code === "rate_limit_exceeded") {
        return res.status(429).json({
          error: "請求太頻繁，請稍後再試",
        });
      }

      return res.status(500).json({
        error: data.error?.message || "圖片生成失敗",
      });
    }

    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error("No image generated");
    }

    // 下載圖片並轉換為 base64 以避免 CORS 問題
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to download image");
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64Image}`;

    return res.status(200).json({
      success: true,
      imageUrl: dataUrl,
      spriteSheet: true,
      frameCount: 8,
      gridCols: 4,
      gridRows: 2,
      prompt: spriteSheetPrompt,
      name,
    });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return res.status(500).json({
      error: error.message || "圖片生成失敗",
    });
  }
}
