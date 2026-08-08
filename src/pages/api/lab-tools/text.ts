import { getOpenAIClient, isMissingOpenAIKeyError } from "@/server/openaiClient";
import { reviewLabToolPrompt } from "@/server/labToolPromptReview";
import { resolveLabToolWorksheetContext } from "@/server/labToolWorksheetContext";
import { NextApiRequest, NextApiResponse } from "next";
import { ChatCompletionRequestMessage } from "openai";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    prompt,
    sessionId,
    sessionTitle,
    courseId,
    courseTitle,
    semester,
    week,
    task,
    taskId,
    worksheetId,
    toolPrompt,
    expectedKind,
  } = req.body as {
    prompt?: string;
    sessionId?: string;
    sessionTitle?: string;
    courseId?: string;
    courseTitle?: string;
    semester?: string;
    week?: number;
    task?: string;
    taskId?: string;
    worksheetId?: string;
    toolPrompt?: string;
    expectedKind?: string;
  };

  const safePrompt = prompt?.trim() || "";

  let context: Awaited<ReturnType<typeof resolveLabToolWorksheetContext>>;
  try {
    context = await resolveLabToolWorksheetContext({ worksheetId, taskId, mode: "text" });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "學習單設定無法使用" });
  }
  const safeWorksheetId = context.worksheetId;

  try {
    const promptReview = await reviewLabToolPrompt({
      mode: "text",
      prompt: safePrompt,
      worksheetId: safeWorksheetId,
      courseTitle: context.courseTitle,
      sessionTitle: context.sessionTitle,
      taskId: context.taskId,
      task: context.task,
      toolPrompt: context.toolPrompt,
      promptReviewCriteria: context.promptReviewCriteria,
      legacyReviewHint: context.legacyReviewHint,
      expectedKind: context.expectedKind,
    });
    if (!promptReview.passed) {
      return res.status(422).json({
        error: promptReview.feedback,
        promptReview,
      });
    }

    const openai = getOpenAIClient();
    const messages: ChatCompletionRequestMessage[] = [
      {
        role: "system",
        content:
          "你是 Lab Terminal 的文字工具。請用繁體中文，幫國小學生把任務整理成清楚、短句、可直接使用的內容。回答不要超過 80 字。",
      },
      {
        role: "user",
        content: `課程：${context.sessionTitle}\n任務：${context.task}\n學生 prompt：${safePrompt}`,
      },
    ];

    const completion = await openai.createChatCompletion({
      model: process.env.LAB_TEXT_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      messages,
    });

    const text = completion.data.choices[0]?.message?.content?.trim();

    if (!text) {
      return res.status(500).json({ error: "No text generated" });
    }

    return res.status(200).json({
      success: true,
      kind: "text",
      text,
      worksheetId: safeWorksheetId,
      sessionId: context.sessionId,
      sessionTitle: context.sessionTitle,
      courseId: context.courseId,
      courseTitle: context.courseTitle,
      semester: context.semester,
      week: context.week,
      promptReview,
    });
  } catch (error: any) {
    console.error("lab-tools/text error:", error.response?.data || error);
    if (isMissingOpenAIKeyError(error)) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(500).json({
      error: error.response?.data?.error?.message || "文字生成失敗",
    });
  }
}
