import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";
import * as dotenv from "dotenv";

dotenv.config();

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

  const { genre, genreLabel, fillInSentence, freeWriting } = req.body;

  if (!fillInSentence || !freeWriting) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const systemPrompt = `你是一位專門為國小1-3年級小朋友寫故事的作家。
規則:
- 使用繁體中文
- 語言簡單易懂，適合6-9歲小朋友
- 故事溫馨正面，有教育意義
- 每頁2-3句話即可，不要太長
- 保留學生寫的原文精神，在此基礎上擴展
- 不要使用表情符號
- 回覆格式必須是 JSON`;

    const userPrompt = `故事主題: ${genreLabel}
學生寫的故事開頭: ${fillInSentence}
學生寫的故事發展: ${freeWriting}

請根據以上內容，創作一個完整的3頁故事。保留學生的原文精神並擴展。

請用以下 JSON 格式回覆 (不要加 markdown code block):
{
  "title": "故事標題",
  "pages": [
    { "text": "第一頁的故事內容(2-3句)", "imagePrompt": "english image prompt for this page scene" },
    { "text": "第二頁的故事內容(2-3句)", "imagePrompt": "english image prompt for this page scene" },
    { "text": "第三頁的故事內容(2-3句)", "imagePrompt": "english image prompt for this page scene" }
  ]
}

imagePrompt 要用英文描述這一頁的畫面，風格是兒童繪本插畫。`;

    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.data.choices[0].message?.content?.trim();
    if (!content) {
      return res.status(500).json({ error: "No response from AI" });
    }

    // Parse JSON - handle potential markdown code blocks
    let parsed;
    try {
      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: "Failed to parse story response" });
    }

    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("generate-story error:", error.message || error);
    return res.status(500).json({ error: "故事生成失敗，請重試" });
  }
}
