import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, voice = "nova" } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing text parameter" });
    }

    // Limit text length to prevent abuse
    const trimmedText = text.slice(0, 500);

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "tts-1",
        voice,
        input: trimmedText,
        response_format: "mp3",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    // Convert to base64 for easy client-side usage
    const base64Audio = Buffer.from(response.data).toString("base64");

    return res.status(200).json({
      success: true,
      audio: base64Audio,
    });
  } catch (error: any) {
    console.error("TTS error:", error.response?.data || error.message);

    const errorMessage =
      error.response?.data?.error?.message ||
      error.message ||
      "語音生成失敗";

    return res.status(500).json({ error: errorMessage });
  }
}
