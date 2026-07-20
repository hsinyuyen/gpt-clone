import { NextApiRequest, NextApiResponse } from "next";

// AI 美術老師：用 Gemini vision 檢查小朋友手繪的繪本主角草圖，回傳結構化評語與建議。
// 這關擋在「送去算圖」之前，但遇到 API 錯誤一律 fail-open（回 pass:true），不讓孩子卡死。
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

const OK = { pass: true, praise: "畫得不錯，送出囉！", suggestions: [] as string[], _fallback: true };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json(OK); // 沒設 key 也別擋孩子

  const { image, elements, grade } = req.body || {};
  if (!image) return res.status(400).json({ error: "Missing image" });

  const el = elements || {};
  const wantAcc = el.accessory && el.accessory !== "沒有配件";

  const m = /^data:(image\/[\w+]+);base64,(.+)$/.exec(image);
  const mimeType = m ? m[1] : "image/png";
  const data = m ? m[2] : image;

  const stage: string = (req.body && req.body.stage) || "final";

  // 分階段（多階段審核）：每一步只檢查那一步的目標，寬鬆鼓勵
  const feat = el.feature || "";
  const stageReq: Record<string, string> = {
    body: `這一步要畫出角色的「身體大形狀」。重點檢查：畫面上有沒有一個明顯的身體形狀或輪廓？如果幾乎空白、或只有零星幾條線看不出形狀，pass 設 false。`,
    face: feat
      ? `這一步要畫「臉」和特徵「${feat}」。最重要的檢查是特徵「${feat}」：畫面上有沒有「明顯畫出${feat}」？就算已經畫了臉、眼睛、嘴巴，只要「看不出${feat}」這個特徵，也一定要把 pass 設為 false，並在 suggestions 具體提示「別忘了幫牠加上${feat}」。`
      : `這一步要畫出「臉」（例如眼睛、嘴巴）。看不出有臉就 pass 設 false。`,
    accessory: `這一步要把配件「${el.accessory}」畫到角色身上。重點檢查：畫面上有沒有「明顯畫出${el.accessory}」這個配件？沒有畫出這個配件就把 pass 設為 false，並提示補上「${el.accessory}」。`,
    color: `這一步要幫角色「上色」。重點檢查：有沒有明顯塗上顏色的面積（不是只有黑色線稿）？如果只有線稿、沒有塗色，pass 設 false。`,
  };

  let prompt: string;
  if (stage !== "final" && stageReq[stage]) {
    prompt = `你是一位親切、鼓勵小朋友，但「該檢查的一定會認真檢查」的美術老師，正在一步一步指導小朋友手繪繪本主角。
這隻主角是：物種=${el.species || "？"}、顏色=${el.color || "？"}、特徵=${feat || "無"}、配件=${wantAcc ? el.accessory : "無"}。
現在是分階段畫圖的其中一步。${stageReq[stage]}
判斷規則：只針對「這一步的重點目標」判斷——這一步的目標有做到才 pass:true，沒做到就 pass:false。不要因為「其他步驟、別的元素還沒畫」而扣分（那些後面才會畫）；但這一步自己的目標一定要確實檢查、不能放水。
語氣要溫暖、像替小朋友加油；pass:true 給一句真心稱讚，pass:false 給 1-2 句「針對這一步」的具體小提示。${grade === "low" ? "這是低年級小朋友，標準可以稍微放寬，但這一步的重點還是要有做到。" : ""}
只回傳 JSON，不要多餘文字：{"pass": true 或 false, "praise": "一句話", "suggestions": ["提示"]}`;
  } else {
    prompt = `你是一位親切但「嚴格」的美術老師，正在檢查一位小朋友「手繪」的繪本主角草圖（不是電腦畫的）。
這隻主角應該包含這些元素：物種=${el.species || "？"}、顏色=${el.color || "？"}、特徵=${el.feature || "（無指定）"}、配件=${wantAcc ? el.accessory : "（不需要）"}。

請「嚴格」判斷這張手繪圖，並特別注意：
1) 是不是隨便亂畫的？（例如只有幾條線、一團亂塗、幾乎空白、完全看不出是一個角色）
2) 有沒有「好好上色」？（不是只有黑色線條，有塗上顏色的面積）
3) 有沒有畫出上面指定的元素？（看得出物種的大致形狀、有塗到指定顏色、有畫出特徵、有畫需要的配件）

評分標準要嚴格：隨便亂畫、幾乎空白、完全沒上色、或缺很多指定元素 → pass 設 false。
就算 pass 是 false，praise 也要先真心肯定一個做得好的地方，語氣溫暖鼓勵，不要罵人。
suggestions 用小朋友聽得懂的具體話（例如「幫牠塗上藍色」「別忘了畫帽子」），最多 3 條。
${grade === "low" ? "這是低年級小朋友，標準稍微放寬，但隨便亂畫、完全空白還是要擋下來。" : "這是高年級小朋友，可以要求多一點細節和完整度。"}

只回傳 JSON，不要多餘文字：
{"pass": true 或 false,
 "effort": "認真" 或 "普通" 或 "隨便",
 "colored": true 或 false,
 "elements": {"species": true/false, "color": true/false, "feature": true/false, "accessory": true/false},
 "praise": "一句溫暖的肯定",
 "suggestions": ["建議1", "建議2"]}`;
  }

  try {
    const body = {
      contents: [{ parts: [{ inlineData: { mimeType, data } }, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    };
    const r = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("review-drawing gemini error:", t);
      return res.status(200).json(OK); // fail-open
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
    if (!parsed || typeof parsed.pass !== "boolean") return res.status(200).json(OK); // fail-open

    // normalise
    return res.status(200).json({
      pass: !!parsed.pass,
      effort: parsed.effort || "",
      colored: !!parsed.colored,
      elements: parsed.elements || {},
      praise: String(parsed.praise || "有畫出來了，很棒！").slice(0, 120),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3).map((s: any) => String(s).slice(0, 80))
        : [],
    });
  } catch (e: any) {
    console.error("review-drawing error:", e?.message || e);
    return res.status(200).json(OK); // fail-open
  }
}
