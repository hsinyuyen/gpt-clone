import type { NextApiRequest, NextApiResponse } from "next";
import axios from "axios";
import FormData from "form-data";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { audio, mimeType } = req.body;

    if (!audio) {
      return res.status(400).json({ error: "No audio data provided" });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, "base64");

    // Determine file extension from mime type
    let extension = "webm";
    let contentType = mimeType || "audio/webm";
    if (mimeType?.includes("mp4")) {
      extension = "mp4";
    } else if (mimeType?.includes("ogg")) {
      extension = "ogg";
    } else if (mimeType?.includes("wav")) {
      extension = "wav";
    }

    // Create FormData using form-data package
    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename: `audio.${extension}`,
      contentType: contentType,
    });
    formData.append("model", "whisper-1");
    formData.append("language", "zh");
    // Use prompt to guide Whisper to output Traditional Chinese
    formData.append("prompt", "繁體中文轉錄。使用台灣繁體中文。");

    // Use axios to send the request (better compatibility with form-data)
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return res.status(200).json({
      success: true,
      text: response.data.text,
    });
  } catch (error: any) {
    console.error("Transcription error:", error.response?.data || error.message);

    const errorMessage = error.response?.data?.error?.message ||
                        error.message ||
                        "語音轉文字失敗";

    return res.status(500).json({
      error: errorMessage,
    });
  }
}
