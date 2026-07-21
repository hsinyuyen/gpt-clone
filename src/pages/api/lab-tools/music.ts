import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
  }

  const { prompt, task, durationMs } = req.body as {
    prompt?: string;
    task?: string;
    durationMs?: number;
  };

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const safeDuration = Math.max(3000, Math.min(Number(durationMs || 30000), 600000));

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          prompt: `${task || "Lab Music task"}. ${prompt}. Instrumental, cheerful, suitable for elementary classroom game UI.`,
          music_length_ms: safeDuration,
          model_id: process.env.ELEVENLABS_MUSIC_MODEL || "music_v1",
          force_instrumental: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("lab-tools/music ElevenLabs error:", errorText);
      return res.status(response.status).json({
        error: "音樂生成失敗",
        details: errorText,
      });
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    return res.status(200).json({
      success: true,
      kind: "music",
      audioUrl: `data:audio/mpeg;base64,${audioBase64}`,
    });
  } catch (error: any) {
    console.error("lab-tools/music error:", error);
    return res.status(500).json({ error: error.message || "音樂生成失敗" });
  }
}
