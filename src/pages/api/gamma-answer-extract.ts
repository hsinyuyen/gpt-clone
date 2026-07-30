import { NextApiRequest, NextApiResponse } from "next";
import { isMissingOpenAIKeyError, openAIAuthHeader } from "@/server/openaiClient";

function trimText(value: unknown, max = 9000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? `${text.slice(0, max)}\n...` : text;
}

function stripAuthoringConfig(markdown: string) {
  return markdown.replace(
    /<!--\s*LAB_TERMINAL_WORKSHEET_CONFIG_START\s*-->[\s\S]*?<!--\s*LAB_TERMINAL_WORKSHEET_CONFIG_END\s*-->/gi,
    ""
  );
}

function stripJsonFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseJson(raw: string) {
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function compactQuestion(question: any, index: number) {
  const rawAiReviewMode = question?.reviewCriteria?.aiReviewMode || question?.aiReviewMode;
  return {
    id: typeof question?.id === "string" ? question.id : `q${index + 1}`,
    title: typeof question?.title === "string" ? question.title : `第 ${index + 1} 題`,
    module: question?.expectedKind || question?.module || "text",
    coins: typeof question?.coins === "number" ? question.coins : 60,
    needsAiReview:
      typeof question?.needsAiReview === "boolean"
        ? question.needsAiReview
        : typeof rawAiReviewMode === "string" && rawAiReviewMode !== "local-only",
    prompt: typeof question?.prompt === "string" ? question.prompt : "",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { markdown, fileName, config } = req.body || {};
  const questions = Array.isArray(config?.questions)
    ? config.questions.map(compactQuestion)
    : [];
  if (!markdown && questions.length === 0) {
    return res.status(400).json({ error: "markdown or config.questions required" });
  }

  const markdownExcerpt = trimText(stripAuthoringConfig(String(markdown || "")), 8500);
  const metadata = {
    id: config?.id,
    title: config?.title,
    semester: config?.semester,
    week: config?.week,
    gammaUrl: config?.gammaUrl,
    fileName,
    questions,
  };

  const prompt = `你是 Lab Terminal 後台的學習單設定助理。請根據 Markdown 內容與既有題目，萃取每題最小 AI 審核依據。

目標：只補齊 reviewBrief，不要產生冗長文字，不要塞整份 GAMMA。

輸出純 JSON，格式：
{
  "schemaVersion": 2,
  "worksheetType": "gamma-answer",
  "questions": [
    {
      "id": "沿用輸入題目 id",
      "title": "沿用或微調題目標題",
      "module": "text|image|audio|video",
      "coins": 60,
      "needsAiReview": false,
      "prompt": "給學生看的短題目，最多 80 字",
      "reviewBrief": {
        "task": "這題實際要學生做什麼，1 句，最多 70 字",
        "expectedOutput": "預期學生交出什麼，1 句，最多 70 字",
        "mustInclude": ["3 到 5 條，短句"],
        "rejectIf": ["3 到 5 條，短句"]
      }
    }
  ]
}

規則：
- 題目數量與順序必須和輸入 questions 一致。
- 不要輸出 reviewCriteria、toolPrompt、aiReviewMode。
- 文字題如果 needsAiReview 為 false，可以少量輸出 reviewPreset、strictness、requiredConcepts、minimumKeywordMatches、minLength、maxLength 作為資料驗證。
- 如果 Markdown 資訊不足，根據題目標題和 prompt 產生保守、可審核的 brief。
- 對國小 3-6 年級學生，判斷條件要清楚但不要過度嚴苛。

既有題目：
needsAiReview rule: default to false. Set true only when the teacher clearly needs AI semantic review for content quality, style, music mood, image content, or video content.
${JSON.stringify(metadata, null, 2)}

Markdown 內容摘錄：
"""
${markdownExcerpt}
"""`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: openAIAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GAMMA_ANSWER_EXTRACT_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "AI extraction failed",
      });
    }

    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const parsed = parseJson(raw);
    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error("[gamma-answer-extract] error:", error.message || error);
    if (isMissingOpenAIKeyError(error)) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || "AI extraction failed" });
  }
}
