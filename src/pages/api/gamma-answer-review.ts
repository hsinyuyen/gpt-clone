import { NextApiRequest, NextApiResponse } from "next";
import { resolveGammaAnswerWorksheetConfig } from "@/config/gammaAnswerWorksheets";
import { getWorksheet } from "@/lib/firestore";
import { isMissingOpenAIKeyError, openAIAuthHeader } from "@/server/openaiClient";
import { validateBasicGammaTextAnswer } from "@/utils/gammaAnswerValidation";
import { LabMusicReviewMetadata } from "@/utils/labMusicMetadata";
import { LabVideoReviewMetadata } from "@/utils/labVideoMetadata";

type ReviewBrief = {
  task?: string;
  expectedOutput?: string;
  mustInclude?: string[];
  rejectIf?: string[];
};

type ReviewAttachment = {
  name?: string;
  type?: string;
  size?: number;
  kind?: string;
  dataUrl?: string;
  musicMetadata?: LabMusicReviewMetadata | null;
  videoMetadata?: LabVideoReviewMetadata | null;
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

function trimText(value: unknown, max = 1200) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function trimList(value: unknown, maxItems = 5, maxChars = 80) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => trimText(item, maxChars))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function stripJsonFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseReviewerJson(raw: string) {
  const cleaned = stripJsonFence(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function attachmentSummary(attachments: ReviewAttachment[]) {
  return attachments
    .map((file, index) => ({
      index: index + 1,
      name: trimText(file.name, 100),
      type: trimText(file.type, 80),
      size: typeof file.size === "number" ? file.size : 0,
      kind: trimText(file.kind, 20),
    }))
    .slice(0, 3);
}

function normalizeWorksheetId(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[-_\s]/g, "")
    : "";
}

function getMusicMetadata(attachments: ReviewAttachment[]) {
  return attachments.find((file) => file.kind === "audio" && file.musicMetadata)?.musicMetadata || null;
}

function getVideoMetadata(attachments: ReviewAttachment[]) {
  return attachments.find((file) => file.kind === "video" && file.videoMetadata)?.videoMetadata || null;
}

function reviewLog(event: string, details: Record<string, unknown>) {
  console.info(`[gamma-answer-review] ${event}`, details);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = req.body || {};
  let question = body.question || {};
  const answer = body.answer || {};
  const worksheetId = normalizeWorksheetId(body.worksheetId);
  const taskId = trimText(body.taskId || question.taskId, 120);
  if (!worksheetId || !taskId) {
    return res.status(400).json({ error: "worksheetId and taskId are required" });
  }

  try {
    const worksheet = await getWorksheet(worksheetId);
    const worksheetConfig = resolveGammaAnswerWorksheetConfig(worksheet);
    const configuredQuestion = worksheetConfig?.questions.find((item) => item.taskId === taskId);
    if (!worksheet || !worksheet.isPublished || !configuredQuestion) {
      return res.status(400).json({ error: "Worksheet review configuration is unavailable" });
    }
    question = configuredQuestion;
  } catch (error) {
    console.error("[gamma-answer-review] worksheet configuration error:", error);
    return res.status(400).json({ error: "Worksheet review configuration is unavailable" });
  }

  const moduleKind = trimText(question.module || question.expectedKind, 20) || "text";
  const attachments = Array.isArray(answer.attachments)
    ? (answer.attachments as ReviewAttachment[])
    : [];
  const musicMetadata = moduleKind === "audio" ? getMusicMetadata(attachments) : null;
  const videoMetadata = moduleKind === "video" ? getVideoMetadata(attachments) : null;
  const imageAttachment =
    moduleKind === "image"
      ? attachments.find((file) => typeof file.dataUrl === "string" && file.dataUrl.startsWith("data:image/"))
      : undefined;
  const brief = (question.reviewBrief || {}) as ReviewBrief;

  const compactPayload = {
    title: trimText(question.title, 90),
    module: moduleKind,
    questionContent: trimText(question.prompt || question.studentPrompt, 500),
    legacyReviewBrief: {
      task: trimText(brief.task, 320),
      expectedOutput: trimText(brief.expectedOutput, 240),
      mustInclude: trimList(brief.mustInclude),
      rejectIf: trimList(brief.rejectIf),
    },
    gradingPolicy:
      moduleKind === "image"
        ? "圖片題採寬鬆審核：只要答案高機率貼合題目方向，且不是明顯亂交，就通過。"
        : moduleKind === "audio"
        ? "音樂題以 MP3 metadata 裡的 prompt 作為唯一內容審核依據；只要高機率貼合題目需求就通過。"
        : moduleKind === "video"
        ? "影片題以影片 metadata 裡的 prompt 作為唯一內容審核依據；只要高機率貼合題目需求就通過。"
        : "只要答案高機率貼合題目需求就通過，但空白、亂打、直接複製題目仍不通過。",
    studentAnswer:
      moduleKind === "text"
        ? trimText(answer.text, 1200)
        : moduleKind === "audio"
        ? trimText(musicMetadata?.prompt, 1200)
        : moduleKind === "video"
        ? trimText(videoMetadata?.prompt, 1200)
        : trimText(answer.text, 240),
    musicMetadata: musicMetadata
      ? {
          worksheetId: trimText(musicMetadata.worksheetId, 60),
          taskId: trimText(musicMetadata.taskId, 100),
          task: trimText(musicMetadata.task, 220),
          prompt: trimText(musicMetadata.prompt, 600),
          durationMs: musicMetadata.durationMs,
          generatedAt: trimText(musicMetadata.generatedAt, 80),
          provider: trimText(musicMetadata.provider, 60),
        }
      : null,
    videoMetadata: videoMetadata
      ? {
          worksheetId: trimText(videoMetadata.worksheetId, 60),
          taskId: trimText(videoMetadata.taskId, 100),
          task: trimText(videoMetadata.task, 220),
          prompt: trimText(videoMetadata.prompt, 600),
          durationSeconds: videoMetadata.durationSeconds,
          generatedAt: trimText(videoMetadata.generatedAt, 80),
          provider: trimText(videoMetadata.provider, 60),
        }
      : null,
    attachments: attachmentSummary(attachments),
  };
  reviewLog("review-start", {
    worksheetId,
    taskId,
    moduleKind,
    answerLength: compactPayload.studentAnswer.length,
    answerPreview: trimText(compactPayload.studentAnswer, 180),
  });

  if (moduleKind === "audio") {
    if (!musicMetadata?.prompt) {
      return res.status(200).json({
        passed: false,
        feedback: "請上傳用 Lab Music 下載的 MP3。",
      });
    }
    if (
      worksheetId &&
      musicMetadata.worksheetId &&
      normalizeWorksheetId(musicMetadata.worksheetId) !== worksheetId
    ) {
      return res.status(200).json({
        passed: false,
        feedback: "這個音樂檔不是本張學習單生成的。",
      });
    }
  }

  if (moduleKind === "video") {
    if (!videoMetadata?.prompt) {
      return res.status(200).json({
        passed: false,
        feedback: "請上傳用 Lab Video 下載的影片。",
      });
    }
    if (
      worksheetId &&
      videoMetadata.worksheetId &&
      normalizeWorksheetId(videoMetadata.worksheetId) !== worksheetId
    ) {
      return res.status(200).json({
        passed: false,
        feedback: "這個影片不是本張學習單生成的。",
      });
    }
  }

  if (moduleKind === "text") {
    const textProblems = validateBasicGammaTextAnswer(trimText(answer.text, 1200));
    if (textProblems.length > 0) {
      reviewLog("review-blocked-locally", {
        worksheetId,
        taskId,
        moduleKind,
        problems: textProblems,
      });
      return res.status(200).json({
        passed: false,
        feedback: trimText(textProblems.join(" "), 60),
      });
    }
  }

  const instruction = `你是國小 3-6 年級課堂的學習單 AI 審核助手。請只判斷這一題是否可以過關。

審核原則：
1. 以題目標題 title 與題目內容 questionContent 為主要依據。
2. legacyReviewBrief 只供舊學習單補充參考，不得取代真正題目內容。
3. 對小朋友友善，但不要放過空白、亂打、完全無關、只複製題目的答案。
4. 先估計題目需求要素；只要學生答案高機率貼合題目方向，或約達 60% 要素，就判 passed=true。舊 mustInclude 是補充參考，不是每一項都必須完全命中。
5. 文字題必須是學生已完成的最終答案，不能是要求 AI 執行工作的提示詞，也不能只是貼上等待整理的原始素材。
6. 文字題若出現「請把下面內容整理」、「請只輸出」、「內容：」等操作指令或素材區塊，但沒有交出題目要求的最終條列答案，必須判 passed=false。
7. 題目要求多點提醒時，答案必須是清楚可辨識的獨立條列或編號項目；不能把「要 AI 幫忙整理」的指令和來源內容當作答案。
8. 回饋最多 45 個繁體中文字。

只回傳純 JSON：
{"passed":true或false,"feedback":"給學生看的繁體中文短回饋"}`;

  const userText = `請審核以下單題作答：\n${JSON.stringify(compactPayload, null, 2)}`;
  const content: any = imageAttachment?.dataUrl
    ? [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: imageAttachment.dataUrl, detail: "low" } },
      ]
    : userText;

  try {
    reviewLog("ai-review-request", {
      worksheetId,
      taskId,
      moduleKind,
      model: process.env.GAMMA_ANSWER_REVIEW_MODEL || "gpt-4o-mini",
    });
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: openAIAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GAMMA_ANSWER_REVIEW_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: 180,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "AI review failed",
      });
    }

    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const parsed = parseReviewerJson(raw);
    const result = {
      passed: !!parsed.passed,
      feedback: trimText(parsed.feedback || "審核完成。", 60),
    };
    reviewLog("ai-review-result", {
      worksheetId,
      taskId,
      moduleKind,
      ...result,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("[gamma-answer-review] error:", error.message || error);
    if (isMissingOpenAIKeyError(error)) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || "AI review failed" });
  }
}
