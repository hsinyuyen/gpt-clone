// AI 審核：S2-W04《語氣變身術》的「語氣改寫」環節。
//
// 學生選一種語氣（溫柔／認真／搞笑／有禮貌），自己打一句話去問某個角色。
// 這支 API 判斷「這句話是不是真的有那個語氣」——關鍵字比對做不到這件事：
//   「我沒關係你快講」含有「沒關係」但一點都不溫柔；
//   「你先深呼吸，等你準備好再說就好」一個關鍵字都沒有，卻非常溫柔。
// 回傳 { passed: boolean, feedback: string }。
//
// ⚠️ 遊戲端一定要保留本地關鍵字判定當後備：規格 §6 要求離線可用、載入逾時放行，
//    這支掛掉或連不上時不能把學生卡住。
import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { tone, toneUse, target, targetMood, sentence } = req.body as {
    tone?: string;       // 溫柔 / 認真 / 搞笑 / 有禮貌
    toneUse?: string;    // 這種語氣什麼時候用
    target?: string;     // 要問的人（章0 練習時可省略）
    targetMood?: string; // 對方現在的情緒
    sentence?: string;
  };

  if (!sentence || !tone) return res.status(400).json({ error: "tone and sentence required" });

  const who = target
    ? `他要對「${target}」說這句話。${targetMood ? `${target}現在的狀況：${targetMood}` : ""}`
    : "這是練習，還沒有特定對象。";

  const systemMessage = `你是小學三年級的 AI 學習夥伴「阿問」。學生正在練習「語氣控制」——同樣一件事，用不同的語氣說，對方願不願意講差很多。

這一題要練的語氣是：**${tone}**（${toneUse || ""}）。
${who}

學生寫的話：
"""
${sentence}
"""

請判斷這句話是不是真的有「${tone}」的語氣。

判斷原則：
1. 看的是**整句話給人的感覺**，不是有沒有出現特定詞。
   例如「我沒關係啦你快講」雖然有「沒關係」，但是在催人，不算溫柔。
   例如「你先深呼吸，等你準備好再說就好」沒有任何固定詞，但非常溫柔，應該通過。
2. 句子要通順、看得懂、是在對人說話。亂打（夾雜亂碼、隨機英數、殘缺不成句）一律不通過，
   而且【不要】自己幫他猜或補完。
3. 標準放在小三程度：只要語氣方向對、講得通，就通過。不要求文采、不要求標點完美、
   不要求字數多。太嚴格會把小孩卡住。
4. 如果語氣明顯相反（例如要溫柔卻在兇人、要有禮貌卻在命令），一定不通過。

feedback 規則（很重要）：
- 一句話，20 字以內，講給小三聽。
- 不通過時要**具體說出哪裡不對、可以怎麼改**，不要只說「再試一次」。
  好的例子：「這句有點像在催他，慢一點會更好。」
  壞的例子：「不夠溫柔，請再試一次。」
- 通過時給一句具體的肯定，指出他哪裡做對了。

請只回傳純 JSON，不要 markdown、不要多餘文字：
{"passed": true 或 false, "feedback": "一句話"}`;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemMessage }],
      temperature: 0.2,
      max_tokens: 200,
    });
    const raw = completion.data.choices?.[0]?.message?.content?.trim() || "";
    const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(json);
    return res.status(200).json({
      passed: !!parsed.passed,
      feedback: String(parsed.feedback || "").slice(0, 60),
    });
  } catch (e: any) {
    // 解析失敗或 API 出錯 → 明確回錯，讓前端走本地後備，不要假裝通過也不要卡住學生
    console.error("review-tone failed:", e?.message);
    return res.status(500).json({ error: "review failed" });
  }
}
