import { NextApiRequest, NextApiResponse } from "next";

// AI 老師：檢查高年級小朋友「自己打字」設計的繪本主角（物種／顏色／描述），擋掉「亂寫」。
// 原則：只擋亂按鍵盤、重複字、火星文、離題；有想像力的答案（雲朵羊、銀河色）一律放行。
// 擋在「去畫主角」之前，但遇到沒 key／API 錯誤一律 fail-open（pass:true），不讓孩子卡死。
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

const OK = { pass: true, praise: "設計得很有想像力，開始畫吧！", problems: [] as any[], _fallback: true };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json(OK); // 沒設 key 也別擋孩子

  const species = String((req.body && req.body.species) || "").slice(0, 40).trim();
  const color = String((req.body && req.body.color) || "").slice(0, 40).trim();
  const desc = String((req.body && req.body.desc) || "").slice(0, 100).trim();

  const prompt = `你是一位親切、很保護孩子想像力的國小老師，正在檢查一位「高年級」小朋友自己打字設計的繪本主角。他填了三個欄位：
物種：「${species || "（空白）"}」
顏色：「${color || "（空白）"}」
一句話描述：「${desc || "（空白）"}」

你的任務只有一個：擋掉「亂寫」，但一定要保護有創意的答案。
「亂寫」的定義（只有這些才算）：亂按鍵盤（例如 asdfgh、qweqwe）、重複同一個字（例如「啊啊啊啊」「aaaa」）、純數字或純符號、看不懂的火星文、或內容跟「設計一隻角色」完全無關或在敷衍（例如描述欄寫「我不知道」「隨便」「不想寫」「哈哈哈」「老師好無聊」）。

以下情況都要「通過」，絕對不可以當成亂寫：
- 有想像力或自己創的生物：雲朵羊、會噴火的小恐龍、機器貓、影子怪。
- 奇特但合理的顏色：銀河色、漸層藍紫、亮橘配金、透明的。
- 簡單但切題的描述：只要真的在講這隻角色的樣子、個性或牠在做什麼，就算短也要通過。

逐欄判斷：
- 物種：是不是一種生物或角色（想像的也可以）？
- 顏色：是不是一個顏色（混色／漸層／幻想色都算）？
- 描述：是不是真的在描述「這隻角色」（外型／個性／動作／心情）？

只要三欄都不是亂寫，就 pass:true。只要有任何一欄是亂寫或空白，就 pass:false。
回覆務必「非常簡短」（避免輸出過長被截斷）：praise 最多 20 字；problems 只列「最需要改的那一欄」1 個就好，reason 最多 20 字、fix 最多 20 字。
務必只回傳精簡的 JSON，不要多餘文字、不要 markdown：
{"pass":true 或 false,"praise":"一句話","problems":[{"field":"物種或顏色或描述","reason":"為什麼","fix":"怎麼改"}]}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  };
  // 呼叫一次 Gemini 並解析；失敗回 null。gemini-flash-latest 偶爾會回空/壞 JSON → 讓外層重試。
  async function attempt(): Promise<any | null> {
    try {
      const r = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        console.error("review-design gemini error:", await r.text());
        return null;
      }
      const d = await r.json();
      const txt: string =
        d.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") || "";
      let parsed: any = null;
      try {
        parsed = JSON.parse(txt);
      } catch {
        const mm = txt.match(/\{[\s\S]*\}/);
        if (mm) {
          try {
            parsed = JSON.parse(mm[0]);
          } catch {
            /* ignore */
          }
        }
      }
      if (!parsed || typeof parsed.pass !== "boolean") {
        console.error("review-design parse fail; raw:", txt.slice(0, 160));
        return null;
      }
      return parsed;
    } catch (e: any) {
      console.error("review-design attempt error:", e?.message || e);
      return null;
    }
  }

  // 重試一次，降低偶發解析失敗造成的 fail-open（亂寫溜過去）
  let parsed = await attempt();
  if (!parsed) parsed = await attempt();
  if (!parsed) return res.status(200).json(OK); // 兩次都失敗才 fail-open

  try {
    const problems = Array.isArray(parsed.problems)
      ? parsed.problems.slice(0, 3).map((p: any) => ({
          field: String(p.field || "").slice(0, 10),
          reason: String(p.reason || "").slice(0, 80),
          fix: String(p.fix || "").slice(0, 80),
        }))
      : [];

    return res.status(200).json({
      pass: !!parsed.pass,
      praise: String(parsed.praise || "").slice(0, 120),
      problems,
    });
  } catch (e: any) {
    console.error("review-design error:", e?.message || e);
    return res.status(200).json(OK); // fail-open
  }
}
