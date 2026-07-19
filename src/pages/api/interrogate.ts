// S2-W01《阿問偵探社》訊問端點。
// 三要素(角色+背景+問題)的「有沒有齊」由前端三格輸入本地判定；
// 這支只做：判亂打/離題，並用偵探搭檔「阿問」的口吻，把「本層預寫線索(clueSeed)」
// 個人化地回答孩子那句話。回傳 { ok, reply }。低成本、可離線降級（前端負責）。
import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { caseTitle, suspicion, clueSeed, question } = req.body as {
    caseTitle?: string;
    suspicion?: string;  // 本層疑點
    clueSeed?: string;   // 本層要揭露的真相（預寫，保敘事連貫）
    question?: string;   // 孩子組好的完整問句（含角色+背景+問題）
  };

  if (!question || !clueSeed) return res.status(400).json({ error: "question & clueSeed required" });

  // 嚴格把關（角色/問題是否亂選）由前端本地規則負責（可靠、離線也擋）；
  // 這支只做「一句個人化反應」當阿問口吻的潤飾（best-effort，不當通關裁判）。
  const systemMessage = `你是兒童偵探遊戲的搭檔 AI「阿問」，個性俏皮、愛比讚，對象是國小三年級（8–9 歲），繁體中文、口語、短句。

案件：「${caseTitle || "校園謎案"}」。這一關的疑點：${suspicion || "（無）"}。
小偵探組好的問句：
"""
${question}
"""

請判斷 ok（要寬鬆）：有錯字、注音、口語、講得很簡單 → ok=true；只有整句亂碼或完全離題才 ok=false。
reply：ok=true 給一句阿問口吻的鼓勵反應（≤20 字，例「好敏銳！這個方向對了！」，不要講出答案）；ok=false 給一句溫和引導（≤25 字）。

只回傳純 JSON（不要 markdown）：{ "ok": true 或 false, "reply": "≤25 字" }`;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini", // 便宜、對此類 JSON 判定/改寫指令遵循度高（gpt-5.4 判斷不穩）
      messages: [{ role: "system", content: systemMessage }],
      temperature: 0.5,
    });
    const raw = completion.data.choices?.[0]?.message?.content?.trim() || "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    let parsed: { ok?: boolean; reply?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { ok: true, reply: "" };
    }
    return res.status(200).json({
      ok: parsed.ok !== false,
      reply: (parsed.reply || "").trim(),
    });
  } catch (err: any) {
    console.error("[interrogate] error:", err?.message || err);
    // 失敗不擋課：回 ok=true 讓前端用本地 clueSeed 降級顯示
    return res.status(200).json({ ok: true, reply: "", offline: true });
  }
}
