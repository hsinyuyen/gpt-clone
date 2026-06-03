// Auto-evaluator for the Prompt Engineering course. Sends the player's prompt
// to the chat model along with the lesson criteria, and asks for a JSON
// verdict { passed: boolean, feedback: string }.
import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { lessonTitle, technique, criteria, userPrompt, badExample, goodExample } = req.body;

  if (!userPrompt || !criteria) {
    return res.status(400).json({ error: "userPrompt and criteria required" });
  }

  // Anti-cheat: detect if student just copy-pasted the example
  const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const userN = normalize(userPrompt);
  const goodN = goodExample ? normalize(goodExample) : '';
  const badN = badExample ? normalize(badExample) : '';

  // Substring similarity check — if 80%+ of either example overlaps with the
  // user's prompt, treat it as plagiarism.
  function overlapRatio(a: string, b: string): number {
    if (!a || !b) return 0;
    // Sliding-window check: find the longest common substring of >= 8 chars
    const minLen = 8;
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    let maxMatch = 0;
    for (let len = shorter.length; len >= minLen; len -= 4) {
      for (let i = 0; i + len <= shorter.length; i += 4) {
        const slice = shorter.slice(i, i + len);
        if (longer.includes(slice)) {
          maxMatch = len;
          break;
        }
      }
      if (maxMatch >= len) break;
    }
    return maxMatch / shorter.length;
  }

  const goodOverlap = overlapRatio(userN, goodN);
  const badOverlap = overlapRatio(userN, badN);
  const COPY_THRESHOLD = 0.7;

  if (goodOverlap >= COPY_THRESHOLD || badOverlap >= COPY_THRESHOLD) {
    return res.status(200).json({
      passed: false,
      feedback: '⚠ 不要直接複製範例喔！請用自己的話寫一個 prompt，套用本課學到的技巧來解決上面的挑戰。',
    });
  }

  const systemMessage = `你是一個友善的 Prompt Engineering 評審老師，正在評估國小 3-6 年級學生寫的 prompt。
這節課的主題：「${lessonTitle}」
技巧重點：「${technique}」
通過標準：${criteria}
${goodExample ? `\n本課的「好範例」是：\n"""\n${goodExample}\n"""\n` : ''}
學生的 prompt：
"""
${userPrompt}
"""

請評估這個 prompt 是否符合通過標準。請務必回傳純 JSON（不要額外包裝），格式：
{
  "passed": true 或 false,
  "feedback": "1-2 句鼓勵 + 具體建議的繁體中文回饋"
}

評估原則：
1. 學生的 prompt 必須符合通過標準的精神
2. 學生不能只是抄寫好範例 —— 如果他們的 prompt 跟好範例幾乎一樣，請判 false 並提醒「請用自己的話寫」
3. 對小朋友友善鼓勵，但若忽略題目要求或抄襲，請給 false`;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-5.4",
      messages: [{ role: "system", content: systemMessage }],
      temperature: 0.3,
    });
    const raw = completion.data.choices?.[0]?.message?.content?.trim() || "";
    // Strip ```json fences if present
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    let parsed: { passed?: boolean; feedback?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: try to find a JSON-like substring
      const m = cleaned.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { passed: false, feedback: raw || "評分失敗" };
    }
    return res.status(200).json({
      passed: !!parsed.passed,
      feedback: parsed.feedback || "（沒有回饋）",
    });
  } catch (err: any) {
    console.error("[evaluate-prompt] error:", err.message || err);
    return res.status(500).json({ error: err.message || "Evaluation failed" });
  }
}
