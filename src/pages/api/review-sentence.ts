// AI reviewer for the S5-W15 game-dev simulator "造句" step.
// Judges whether a student's sentence genuinely uses the target term in the
// context of "the game they are building" — not just contains the keyword.
// Returns { passed: boolean, feedback: string }.
import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { stage, stageGoal, gameContext, term, sentence } = req.body as {
    stage?: string;
    stageGoal?: string;
    gameContext?: string;
    term?: string; // 選用，只當 AI 內部參考，不要求學生說出
    sentence?: string;
  };

  if (!sentence) {
    return res.status(400).json({ error: "sentence required" });
  }

  const ctx = gameContext || "一款用左右鍵閃避掉落隕石的網頁小遊戲";
  const goal = stageGoal || stage || "這一個開發步驟要做的事";

  const systemMessage = `你是學生正在開發遊戲時的 AI 程式夥伴。國小 3-6 年級的學生會用一句「白話的話」告訴你，這一步他想讓遊戲做到什麼，請你扮演「收到指令的 AI」判斷這句話清不清楚、方向對不對。

我們正在做：${ctx}。
這一步要做的事是：${goal}。${term ? `（這個概念在工程上叫做「${term}」，但學生不需要、也不必說出這個詞。）` : ""}

學生說的話：
"""
${sentence}
"""

請判斷是否合格。合格標準（三條都符合就 passed=true）：
1. 看得懂、是一句講得通的話或請求（不是亂打、不是只丟幾個沒關係的字）。命令／請求語氣（「幫我…」「我要…」「讓它…」）完全正確，應該通過。
2. 是在描述／要求『${goal}』這一類的事（方向對）。
3. 跟這款遊戲（${ctx}）有關。

非常重要：學生【不需要、也不必】講出任何專業術語（例如不必說出「需求」「功能」「變數」「規格書」「版本控制」「資料庫」等）。只要他用白話把想要的東西講清楚、而且方向對，就 passed=true。不要因為他沒講術語、或語氣是命令句，就判不通過。

但要嚴格把關「亂打」：如果句子裡有看不懂的亂碼、隨機夾雜的英文字母或數字（例如「檢1c8 c」「a3b」「asdf」）、或沒寫完、殘缺、語意不通的字詞，請判 passed=false，並請學生「重新用通順的中文講清楚」。【絕對不要】自己幫他猜測、自動修正、或腦補成合理的句子——只要有一段看不懂或像亂打的，就不通過。

請務必只回傳純 JSON（不要 markdown、不要多餘文字），格式：
{
  "passed": true 或 false,
  "feedback": "1 句繁體中文回饋。通過就用 AI 夥伴的口吻說『好的，我來幫你做…』${term ? "，並可順帶一句『（這在工程上叫做：" + term + "）』" : ""}；不通過就具體說哪裡要講清楚（例如：要說清楚你想讓遊戲做到什麼）。不要叫學生去講術語。"
}

只有在亂打、或空泛到看不出他想要什麼、或方向明顯跑題時，才判 false。對小朋友友善一點。`;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-5.4",
      messages: [{ role: "system", content: systemMessage }],
      temperature: 0.3,
    });
    const raw = completion.data.choices?.[0]?.message?.content?.trim() || "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    let parsed: { passed?: boolean; feedback?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { passed: false, feedback: raw || "批改失敗" };
    }
    return res.status(200).json({
      passed: !!parsed.passed,
      feedback: parsed.feedback || "（沒有回饋）",
    });
  } catch (err: any) {
    console.error("[review-sentence] error:", err.message || err);
    return res.status(500).json({ error: err.message || "Review failed" });
  }
}
