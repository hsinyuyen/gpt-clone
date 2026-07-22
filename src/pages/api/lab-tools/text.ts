import { NextApiRequest, NextApiResponse } from "next";
import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

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

  try {
    const messages: ChatCompletionRequestMessage[] = [
      {
        role: "system",
        content:
          "你是 Lab Terminal 的文字工具。請用繁體中文，幫國小學生把任務整理成清楚、短句、可直接使用的內容。回答不要超過 80 字。",
      },
      {
        role: "user",
        content: `任務：${task || "文字整理"}\n學生 prompt：${prompt}`,
      },
    ];

    const completion = await openai.createChatCompletion({
      model: process.env.LAB_TEXT_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      messages,
    });

    const text = completion.data.choices[0].message?.content?.trim();

    if (!text) {
      return res.status(500).json({ error: "No text generated" });
    }

    return res.status(200).json({
      success: true,
      kind: "text",
      text,
    });
  } catch (error: any) {
    console.error("lab-tools/text error:", error.response?.data || error);
    return res.status(500).json({
      error: error.response?.data?.error?.message || "文字生成失敗",
    });
  }
}
