import type { NextApiRequest, NextApiResponse } from "next";

const PIXELLAB_API_URL = "https://api.pixellab.ai/v1";

interface PixelLabImage {
  type: string;
  base64: string;
}

interface PixelLabResponse {
  image?: PixelLabImage;
  images?: PixelLabImage[];
  usage?: { type: string; usd: number };
  error?: string;
}

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

  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "PixelLab API key not configured" });
  }

  try {
    // Step 1: 生成基礎角色圖片
    console.log("Step 1: Generating base character...");
    const characterPrompt = `Cute pixel art character: ${prompt}.
Style: 16-bit retro game sprite, chibi proportions, front-facing view, simple idle pose.
Background: transparent or solid white.`;

    const baseImageResponse = await fetch(`${PIXELLAB_API_URL}/generate-image-pixflux`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        description: characterPrompt,
        image_size: { width: 64, height: 64 },
        text_guidance_scale: 8,
        no_background: true,
      }),
    });

    const baseImageData: PixelLabResponse = await baseImageResponse.json();

    if (!baseImageResponse.ok || !baseImageData.image?.base64) {
      console.error("PixelLab base image error:", baseImageData);
      return res.status(500).json({
        error: baseImageData.error || "Failed to generate base character",
      });
    }

    const baseImageB64 = baseImageData.image.base64;
    console.log("Base character generated successfully");

    // Step 2: 使用 animate-with-text 生成動畫幀
    console.log("Step 2: Generating animation frames...");
    const animateResponse = await fetch(`${PIXELLAB_API_URL}/animate-with-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        description: characterPrompt,
        action: "gentle breathing idle animation, slight up and down movement",
        reference_image: { base64: baseImageB64 },
        image_size: { width: 64, height: 64 },
        n_frames: 8,
        guidance_scale: 8,
      }),
    });

    const animateData: PixelLabResponse = await animateResponse.json();

    if (!animateResponse.ok || !animateData.images || animateData.images.length === 0) {
      console.error("PixelLab animation error:", animateData);
      // 如果動畫生成失敗，返回單張基礎圖片
      return res.status(200).json({
        success: true,
        frames: [`data:image/png;base64,${baseImageB64}`],
        frameCount: 1,
        isSpriteSheet: false,
        name,
        prompt: characterPrompt,
        fallback: true,
      });
    }

    // 將所有幀轉換為 data URLs
    const frames = animateData.images.map(
      (img) => `data:image/png;base64,${img.base64}`
    );

    console.log(`Animation generated with ${frames.length} frames`);

    return res.status(200).json({
      success: true,
      frames,
      frameCount: frames.length,
      isSpriteSheet: false,
      name,
      prompt: characterPrompt,
      usage: {
        baseImage: baseImageData.usage?.usd || 0,
        animation: animateData.usage?.usd || 0,
      },
    });
  } catch (error: any) {
    console.error("PixelLab API error:", error);
    return res.status(500).json({
      error: error.message || "圖片生成失敗",
    });
  }
}
