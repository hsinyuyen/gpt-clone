import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

// AI 繪本 L2《故事八格機》文字生成端點。
// 三種模式：
//   roll    → 幫某一格骰一個點子（回 { text }）
//   rewrite → 把某一格的句子寫順／換個版本（回 { text }）
//   compose → 把 8 格骨架組成完整繪本（回 { title, titles[], pages[{text}] }）
// 一律繁體中文、給小學生看、不使用任何 emoji；主角固定用學生給的名字。

type Character = {
  name?: string;
  species?: string;
  color?: string;
  like?: string;
  skill?: string;
};
type Slot = { key: string; label: string; hint: string; text?: string };

const BASE_SYSTEM = `你是一位替國小學生做繪本的故事老師。
規則：
- 一律使用繁體中文。
- 語言簡單、溫暖、正面，適合國小學生閱讀。
- 絕對不要使用任何 emoji 或表情符號。
- 主角是學生自己設計的角色，一定要沿用學生給的主角名字，不可以換成別的角色。
- 不要說教、不要加註解，只照要求的格式輸出。`;

function charLine(c: Character): string {
  const bits = [
    c.name ? `名字：${c.name}` : "",
    c.species ? `是一隻/位：${c.species}` : "",
    c.color ? `顏色：${c.color}` : "",
    c.like ? `喜歡：${c.like}` : "",
    c.skill ? `擅長：${c.skill}` : "",
  ].filter(Boolean);
  return bits.length ? bits.join("；") : "（還沒有主角資料，就用「小主角」代稱）";
}

function stripFences(s: string): string {
  return s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const mode: string = req.body?.mode;
  const character: Character = req.body?.character || {};
  const grade: string = req.body?.grade === "low" ? "low" : "high";
  const gradeNote =
    grade === "low"
      ? "讀者是小二、小三，句子要非常短、用詞最簡單。"
      : "讀者是小四到小六，句子可以稍微完整，但仍然口語好懂。";

  try {
    // ---- 骰一格：給某一格一個點子 ----
    if (mode === "roll") {
      const slot: Slot = req.body?.slot || {};
      const filled: Slot[] = Array.isArray(req.body?.filled) ? req.body.filled : [];
      const avoid: string[] = Array.isArray(req.body?.avoid) ? req.body.avoid : [];
      const ctx = filled
        .filter((s) => s.text)
        .map((s) => `- ${s.label}：${s.text}`)
        .join("\n");
      const userPrompt = `主角：${charLine(character)}
${gradeNote}

我正在用「故事八格機」編一個故事，現在要幫這一格想一個點子：
【${slot.label}】意思是：${slot.hint}

${ctx ? `目前已經填好的其他格（要接得起來、不要矛盾）：\n${ctx}\n` : ""}${
        avoid.length
          ? `不要和這些重複、要明顯不一樣：${avoid.join(" / ")}\n`
          : ""
      }
請只給「一句」點子（${grade === "low" ? "越短越好" : "一到兩個短句"}），是這一格該發生的內容本身，不要解釋、不要加引號。`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 1.0,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      const text = (c.data.choices[0].message?.content || "").trim().replace(/^["「]|["」]$/g, "");
      if (!text) return res.status(500).json({ error: "no-text" });
      return res.status(200).json({ text });
    }

    // ---- 寫順一格：把學生的句子潤成更順的版本 ----
    if (mode === "rewrite") {
      const slot: Slot = req.body?.slot || {};
      const userPrompt = `主角：${charLine(character)}
${gradeNote}

這是「${slot.label}」這一格，學生寫的內容是：
「${slot.text || ""}」

請把它改寫得更通順、更好讀，但保留學生原本的意思和點子，只給「一句」改好的版本，不要解釋、不要加引號。`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 0.7,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      const text = (c.data.choices[0].message?.content || "").trim().replace(/^["「]|["」]$/g, "");
      if (!text) return res.status(500).json({ error: "no-text" });
      return res.status(200).json({ text });
    }

    // ---- 組成整本：8 格 → 完整繪本頁 ----
    if (mode === "compose") {
      const slots: Slot[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
      if (slots.length < 8) return res.status(400).json({ error: "need-8-slots" });
      const skeleton = slots.map((s) => `${s.label}：${s.text || ""}`).join("\n");
      const pageCount = grade === "low" ? "8" : "10 到 12";
      const perPage = grade === "low" ? "每頁 1 到 2 句短句" : "每頁 2 到 3 句";
      const userPrompt = `主角：${charLine(character)}
${gradeNote}

這是學生用「故事八格機」填出來的故事骨架：
${skeleton}

請把它擴寫成一本完整的繪本故事，分成 ${pageCount} 頁，${perPage}。要求：
- 從頭到尾用同一個主角（用上面的名字），前後要連貫、不要矛盾。
- 一定要保留「試了三次才成功」的節奏：三次嘗試各自不一樣、一次比一次接近成功。
- 保留學生每一格的點子與精神，只是把它寫順、鋪成一頁一頁。
- 文字裡絕對不要出現 emoji。
- 另外想 3 個適合這個故事的書名。

只用這個 JSON 格式回覆（不要加 markdown code block）：
{
  "titles": ["書名一", "書名二", "書名三"],
  "pages": [
    { "text": "這一頁的故事文字" }
  ]
}`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 0.85,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      const content = (c.data.choices[0].message?.content || "").trim();
      if (!content) return res.status(500).json({ error: "no-text" });
      let parsed: any;
      try {
        parsed = JSON.parse(stripFences(content));
      } catch {
        return res.status(500).json({ error: "parse-failed" });
      }
      const pages = Array.isArray(parsed?.pages)
        ? parsed.pages
            .map((p: any) => ({ text: String(p?.text || "").trim() }))
            .filter((p: any) => p.text)
        : [];
      const titles = Array.isArray(parsed?.titles)
        ? parsed.titles.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 3)
        : [];
      if (!pages.length) return res.status(500).json({ error: "no-pages" });
      return res.status(200).json({ titles, title: titles[0] || "", pages });
    }

    return res.status(400).json({ error: "unknown-mode" });
  } catch (error: any) {
    console.error("picturebook-story error:", error?.message || error);
    return res.status(500).json({ error: "ai-failed" });
  }
}
