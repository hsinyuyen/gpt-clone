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
- 內容必須適合印成繪本給小朋友看：不可以出現廁所笑話（大便、尿尿、放屁、鼻屎、嘔吐等）、
  暴力血腥、罵人或髒話、恐怖嚇人或死亡。
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

// 每一格的嚴格規則：要寫什麼、絕對不可以寫成什麼、給一個示範。
// （沒有這層約束時，模型很容易把「背景」寫成「事件」、把「嘗試」寫成直接成功。）
const SLOT_RULES: Record<string, { must: string; never: string; eg: string }> = {
  bg: {
    must: "只描述主角『住在哪裡、平常都在做什麼』的日常。",
    never: "絕對不可以出現任何突發事件、麻煩、困難或解決辦法。",
    eg: "小炭住在火山腳下的黑石洞，每天幫村子裡的人生火。",
  },
  event: {
    must: "只描述『突然發生的那一件事』本身。",
    never: "不要寫主角的心情、不要寫造成什麼麻煩、更不要寫怎麼解決。",
    eg: "有一天早上，火山裡的火忽然全部熄滅了。",
  },
  trouble: {
    must: "只描述因為那件事而造成的『麻煩、困難』，並說明為什麼難。",
    never: "不要提出任何解決辦法，也不要解決它。",
    eg: "天氣越來越冷，村民都快凍僵了，可是只剩小炭能生火。",
  },
  try1: {
    must: "寫主角想到的『第一個辦法』，而且要寫出它失敗了。這個辦法要天真、直覺、最容易想到。",
    never: "絕對不可以成功，也不可以只差一點點就成功。",
    eg: "小炭用力鼓起肚子朝柴堆噴火，卻只噴出一點小火花就不見了。",
  },
  try2: {
    must: "寫『第二個、跟第一次明顯不同』的辦法，而且也失敗了（最好是中途出岔子）。",
    never: "不可以成功，也不可以和第一次的辦法類似。",
    eg: "小炭翻出爺爺留下的舊打火石，敲了又敲，還是怎麼也點不著。",
  },
  try3: {
    must: "寫『第三個辦法』，要比前兩次更接近成功，但仍然差一點點。",
    never: "不可以真的成功，也不可以重複前兩次的辦法。",
    eg: "小炭深深吸一口氣再噴一次，火光終於靠近柴堆，差一點就點燃了。",
  },
  spark: {
    must:
      "寫『這次終於成功的關鍵轉折』——靈光一閃、朋友幫忙、或用上主角最擅長的本事。" +
      "這個辦法一定要「真的能解決前面寫的那個困境」，而且符合常識、小朋友讀了會覺得說得通。",
    never:
      "不要重複前面失敗的辦法，也不要寫成結局。" +
      "更不可以寫出違反常識的解法（例如火災還在燒卻用噴火來解決、東西濕了卻用水去弄乾）。" +
      "如果主角的本事對這個困境幫不上忙，就不要硬套，改用朋友幫忙、或他觀察到的關鍵線索。",
    eg: "小炭忽然想起自己最擅長的是穩穩的小火，於是對準乾樹葉輕輕一噴，終於把爐火重新點著了。",
  },
  ending: {
    must: "寫問題解決之後的收尾：結果怎麼樣、大家怎麼樣，把故事收起來。",
    never: "不要再出現新的麻煩或新的事件。",
    eg: "火重新燒了起來，村子暖呼呼的，大家一起謝謝小炭。",
  },
};

// 低年級要注音，但字典無法涵蓋 AI 生成的字（實測只蓋到 57%），
// 所以請模型連同它用到的字一起回傳注音，前端再合併進字典。
const ZY_ASK = `
另外，因為讀者是低年級、畫面要標注音，請附上你這次用到的「每一個中文字」的注音：
- 用教育部標準注音，聲調符號放在最後（一聲不標；輕聲用 ˙ 放最前，例如 "˙ㄌㄜ"）。
- 多音字要依照它在這句話裡的實際讀音。
- 放在 JSON 的 "zy" 欄位，格式 {"字":"ㄗˋ"}；只放中文字，標點和數字不用。`;

function zyOf(obj: any): Record<string, string> {
  const z = obj?.zy;
  if (!z || typeof z !== "object") return {};
  const out: Record<string, string> = {};
  for (const k of Object.keys(z)) {
    if (k.length === 1 && typeof z[k] === "string" && z[k].trim()) out[k] = String(z[k]).trim();
  }
  return out;
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
      const rule = SLOT_RULES[slot.key];
      const userPrompt = `主角：${charLine(character)}
${gradeNote}

我正在用「故事八格機」編一個故事。八個格子依序是：
背景 → 事件 → 困境 → 解決嘗試1 → 解決嘗試2 → 解決嘗試3 → 成功的契機 → 收尾
現在只要幫【${slot.label}】這一格想一個點子。這一格的意思是：${slot.hint}
${
  rule
    ? `\n這一格的規定（一定要遵守）：\n- ${rule.must}\n- ${rule.never}\n- 寫成這樣的感覺：${rule.eg}\n`
    : ""
}
${ctx ? `目前已經填好的其他格（要接得起來、不要矛盾）：\n${ctx}\n` : ""}${
        avoid.length
          ? `不要和這些重複、要明顯不一樣：${avoid.join(" / ")}\n`
          : ""
      }
合理性（很重要）：你的點子必須跟上面已經填好的格子接得起來，在故事裡說得通、符合常識。
不可以出現小朋友一看就覺得奇怪的解法（例如火還在燒卻用噴火去解決、東西濕了卻用水去弄乾、
主角的本事明明幫不上忙卻硬要用上）。想不到合理的用法時，就改用朋友幫忙或別的辦法。

再確認一次：你要寫的是【${slot.label}】這一格的內容，不可以寫成別格該寫的東西。
請只給「一句」（${grade === "low" ? "越短越好" : "一到兩個短句"}），直接寫故事內容本身，不要解釋、不要加引號、不要換行。${
        grade === "low"
          ? `\n${ZY_ASK}\n只用這個 JSON 回覆（不要加 markdown code block）：{ "text": "那一句", "zy": {"字":"ㄗˋ"} }`
          : ""
      }`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 0.9,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      const raw = (c.data.choices[0].message?.content || "").trim();
      if (grade === "low") {
        try {
          const p = JSON.parse(stripFences(raw));
          const t = String(p?.text || "").trim().replace(/^["「]|["」]$/g, "");
          if (t) return res.status(200).json({ text: t, zy: zyOf(p) });
        } catch {
          /* 模型沒照 JSON 回：退回純文字，注音由字典盡量補 */
        }
      }
      const text = raw.replace(/^["「]|["」]$/g, "").trim();
      if (!text) return res.status(500).json({ error: "no-text" });
      return res.status(200).json({ text, zy: {} });
    }

    // ---- 寫順一格：把學生的句子潤成更順的版本 ----
    // ---- 低年級：一次給 3 個點子做成卡片，用點的就好，完全不用打字 ----
    if (mode === "options") {
      const slot: Slot = req.body?.slot || {};
      const rule = SLOT_RULES[slot.key];
      const filledO: Slot[] = Array.isArray(req.body?.filled) ? req.body.filled : [];
      const avoidO: string[] = Array.isArray(req.body?.avoid) ? req.body.avoid : [];
      const ctxO = filledO.filter((s) => s.text).map((s) => `- ${s.label}：${s.text}`).join("\n");
      const userPrompt = `主角：${charLine(character)}
讀者是小二、小三，句子要非常短、用詞最簡單。

我在用「故事八格機」編故事，現在要幫【${slot.label}】這一格想點子。這一格的意思是：${slot.hint}
${rule ? `\n這一格的規定：\n- ${rule.must}\n- ${rule.never}\n- 寫成這樣的感覺：${rule.eg}\n` : ""}
${ctxO ? `\n其他格已經寫好的內容（要接得起來、不可以重複或矛盾）：\n${ctxO}\n` : ""}${
        avoidO.length ? `\n不要跟這些一樣：${avoidO.join(" / ")}\n` : ""
      }
請給 3 個「明顯不一樣」的點子讓小朋友挑，每個都要：
- 只有一句、很短（大約 10 到 20 個字），但要完整（看得出誰、做了什麼、結果怎麼樣）。
- 在故事裡說得通、符合常識，適合印成繪本。
- 三個點子的做法要差很多，不可以只是換句話說。
${ZY_ASK}

只用這個 JSON 回覆（不要加 markdown code block）：
{ "options": ["點子一","點子二","點子三"], "zy": {"字":"ㄗˋ"} }`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 1.0,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      let options: string[] = [];
      let zy: Record<string, string> = {};
      try {
        const p = JSON.parse(stripFences((c.data.choices[0].message?.content || "").trim()));
        options = Array.isArray(p?.options)
          ? p.options.map((t: any) => String(t).trim().replace(/^["「]|["」]$/g, "")).filter(Boolean).slice(0, 3)
          : [];
        zy = zyOf(p);
      } catch {
        options = [];
      }
      if (!options.length) return res.status(500).json({ error: "no-options" });
      return res.status(200).json({ options, zy });
    }

    // ---- 幫我寫順：改寫出來的句子，本身就要能通過 review 的三項標準 ----
    if (mode === "rewrite") {
      const slot: Slot = req.body?.slot || {};
      const rule = SLOT_RULES[slot.key];
      const filledW: Slot[] = Array.isArray(req.body?.filled) ? req.body.filled : [];
      const ctxW = filledW
        .filter((s) => s.text)
        .map((s) => `- ${s.label}：${s.text}`)
        .join("\n");
      const userPrompt = `主角：${charLine(character)}
${gradeNote}

這是「${slot.label}」這一格，意思是：${slot.hint || ""}
${rule ? `這一格的規定：\n- ${rule.must}\n- ${rule.never}\n- 寫成這樣的感覺：${rule.eg}\n` : ""}
${ctxW ? `\n這個故事其他格已經寫好的內容（改寫時不可以跟這些重複或矛盾）：\n${ctxW}\n` : ""}
學生自己寫的內容是：
「${slot.text || ""}」

請幫他改寫成一句更通順、更好讀的版本。

【最重要】改寫出來的句子，必須是「可以直接通過老師檢查」的句子。
所以當「保留學生的點子」和下面第 2～5 點衝突時，一律以第 2～5 點為準，該換就換。
尤其是：**如果他寫的辦法和其他「解決嘗試」是同一招（例如兩次都用水），你一定要換成一個明顯不同的辦法**
（例如改成用沙子蓋、拿毯子悶住、搧風、堆土、找人幫忙…），
但要盡量保留他句子裡的其他味道（著急的語氣、場景、他在意的東西）。

改寫出來的句子必須同時做到：
1. 盡量保留學生原本的點子與想法（除非上面說的衝突情況）。
2. 確實是「${slot.label}」這一格該寫的內容；如果他原本寫成別格的東西，請在不丟掉他點子的前提下，調整成這一格該有的樣子。
3. 適合印成繪本給小朋友看：如果他的內容有廁所笑話（大便、尿尿、放屁等）、暴力、罵人、恐怖等不適合的部分，
   請把那個部分換成可愛、乾淨又有趣的版本（例如換成風、雲、味道、聲音、掉東西之類的小意外），其餘情節保留。
4. 這段文字會原封不動印在繪本的一頁上，所以要「完整」：看得出誰、做了什麼、結果怎麼樣。
   如果他只寫了幾個字的片語或半句話（例如「想要救火用水」），請補成完整通順的句子。
   若這一格是「解決嘗試」，一定要同時寫出他實際做了什麼、以及結果沒有成功。
5. 不可以跟上面其他格的內容重複或矛盾；特別是三個「解決嘗試」必須是明顯不同的辦法。

但如果他寫的根本看不出任何想法（例如亂打的字、空白、完全無意義），
就不要幫他編故事，請回傳 needIdea。

只用這個 JSON 回覆（不要加 markdown code block）：
{ "needIdea": false, "text": "改好的那一句", "note": "很短一句話告訴他你幫他改了什麼（例如：幫你換成跟第一次不一樣的辦法／幫你把結果補完整）；沒特別改就留空字串" }
或
{ "needIdea": true, "text": "", "note": "" }`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 0.7,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      const content = (c.data.choices[0].message?.content || "").trim();
      let parsed: any = null;
      try {
        parsed = JSON.parse(stripFences(content));
      } catch {
        // 舊行為的後援：模型直接吐一句話時也接受
        const t = content.replace(/^["「]|["」]$/g, "").trim();
        return t ? res.status(200).json({ text: t, needIdea: false }) : res.status(500).json({ error: "no-text" });
      }
      if (parsed?.needIdea) return res.status(200).json({ needIdea: true, text: "", note: "" });
      const text = String(parsed?.text || "").trim().replace(/^["「]|["」]$/g, "");
      if (!text) return res.status(500).json({ error: "no-text" });
      return res.status(200).json({ text, needIdea: false, note: String(parsed?.note || "").trim() });
    }

    // ---- 審核：學生自己打的內容，AI 老師看一下是不是這一格該寫的 ----
    // 只審「自己打字」的格；骰出來的不用審。一律寬鬆，出錯就放行（fail-open），不擋小孩。
    if (mode === "review") {
      const slot: Slot = req.body?.slot || {};
      const rule = SLOT_RULES[slot.key];
      const text = String(slot.text || "").trim();
      if (!text) return res.status(200).json({ pass: false, praise: "", hint: "這一格還是空的，寫一點點也好！" });
      const filledR: Slot[] = Array.isArray(req.body?.filled) ? req.body.filled : [];
      const ctxR = filledR
        .filter((s) => s.text)
        .map((s) => `- ${s.label}：${s.text}`)
        .join("\n");
      const isTry = /^try/.test(slot.key || "");
      const userPrompt = `主角：${charLine(character)}
${gradeNote}

學生正在用「故事八格機」編故事，現在這一格是【${slot.label}】，意思是：${slot.hint}
${rule ? `這一格的規定：\n- ${rule.must}\n- ${rule.never}\n` : ""}
${ctxR ? `\n這個故事其他格目前已經寫好的內容（拿來檢查有沒有重複或矛盾）：\n${ctxR}\n` : ""}
學生自己寫的內容是：
「${text}」

請你當一位很溫柔的故事老師，看四件事：
1. 這句話是不是「這一格」該寫的東西？（不是的話要說清楚它比較像哪一格）
2. 這句話「寫完整」了嗎？這段文字最後會**原封不動印在繪本的一頁上**，所以必須是完整、通順的句子：
   - 要看得出「誰、做了什麼、結果怎麼樣」（依這一格需要的部分）。
   - 只有幾個字的片語、半句話、或只寫出一個念頭卻沒寫出實際發生什麼，都算不完整，不通過。
   - 例如「想要救火用水」就太短、不完整（沒寫出他實際怎麼做、結果如何），要不通過。
   - ${grade === "low" ? "低年級：一個完整的短句就夠了，不用長，但要完整。" : "高年級：一到兩個完整的短句。"}
${
  isTry
    ? "   - 這一格是「解決嘗試」，必須同時寫出「他實際做了什麼」和「結果沒有成功」，缺任何一個都不通過。\n"
    : ""
}3. 這句話適不適合放進一本要給小朋友看、而且會印出來帶回家的繪本？
4. 這句話跟其他格「重複」或「矛盾」嗎？
   - 【這條只管三個「解決嘗試」之間】三個嘗試彼此要是不同的辦法。判斷「是不是同一招」時，看的是**做法本身**，
     而不是用到的東西：兩次都是「把水潑向火」才算同一招；
     「潑水」和「用濕毛巾悶住」「用沙子蓋」「搧風」「找人幫忙」則算不同的辦法，要讓它過。
     不要只因為兩個辦法都碰到同一種東西（例如都跟水有關）就判成重複。
   - 只有在做法幾乎一模一樣、只是換句話說的時候（例如「再潑一次水」），才不通過。
   - 「成功的契機」不受這條限制：它本來就可以是把前面失敗的辦法改良、或因為朋友幫忙、
     或多了關鍵的東西而終於成功（例如前面一個人端水失敗，這次大家一起幫忙運水就成功了）。
     只要看得出「這次為什麼不一樣」，就要讓它過，不可以因為它和某個嘗試有點像就判不通過。
   - 也不可以跟其他格已經寫好的內容互相矛盾。
5. 這句話在故事裡「說得通」嗎？（合理性）
   - 要跟前面寫好的困境接得起來：解決的辦法要真的能對付那個困境。
   - 不可以違反常識、讓小朋友一看就覺得奇怪，例如：火還在燒卻用噴火去解決、
     東西濕了卻用水去弄乾、掉到很遠的地方卻伸手就拿到。
   - 如果是「成功的契機」，那個關鍵一定要真的能讓困境解決，不能只是說「他成功了」。

第 1 點請「寬鬆」判斷：只要大致對得上、看得出小朋友的想法，就讓它過；
錯字、用詞稚氣、天馬行空的想像都不算問題。
第 2、3、4、5 點則要「嚴格」。
（注意：童話式的想像力不算違反常識——會說話的動物、會飛的城堡都可以；
　要擋的是「用來解決問題的方法本身自相矛盾」那種不合理。）

第 3 點則要「嚴格」，只要出現下面任何一種，一律不通過（pass 設成 false）：
- 廁所笑話或噁心的東西：大便、便便、屎、尿尿、放屁、鼻屎、嘔吐、口水…
- 暴力、血腥、殺、打傷別人或自己
- 罵人、髒話、取笑或貶低別人（長相、身材、家人…）
- 恐怖嚇人、死掉
- 明顯是在搗蛋亂寫、跟故事完全無關的內容
（提醒：像打噴嚏、跌倒、肚子餓、踩到香蕉皮這種可愛的小意外是可以的，不要誤擋。）

第 3 點不通過時，hint 要溫柔但明確地請他換一個更適合的點子，
而且「不要在 hint 裡重複那個不適合的詞」。

只用這個 JSON 回覆（不要加 markdown code block）：
{
  "pass": true 或 false,
  "praise": "通過時給一句很短的具體稱讚（沒通過就留空字串）",
  "hint": "沒通過時，用一句溫柔、具體的話告訴他這一格該寫什麼、可以怎麼改（通過就留空字串）。不要幫他把句子寫好，只給方向。"
}`;
      try {
        const c = await openai.createChatCompletion({
          model: "gpt-5.4",
          temperature: 0.4,
          messages: [
            { role: "system", content: BASE_SYSTEM },
            { role: "user", content: userPrompt },
          ],
        });
        const content = (c.data.choices[0].message?.content || "").trim();
        const parsed = JSON.parse(stripFences(content));
        return res.status(200).json({
          pass: parsed?.pass !== false,
          praise: String(parsed?.praise || "").trim(),
          hint: String(parsed?.hint || "").trim(),
        });
      } catch {
        return res.status(200).json({ pass: true, praise: "", hint: "" }); // fail-open：不擋小孩
      }
    }

    // ---- 只產書名：compose 偶爾會漏掉 titles，這時單獨補一次，確保一定有建議可選 ----
    if (mode === "titles") {
      const slots: Slot[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
      const summary =
        String(req.body?.summary || "").trim() ||
        slots.map((s) => `${s.label}：${s.text || ""}`).join("\n");
      const userPrompt = `主角：${charLine(character)}

這是學生的繪本故事：
${summary}

請幫這本繪本想 3 個書名。要求：
- 適合國小學生，簡短好記（大約 4 到 10 個字）。
- 要跟這個故事有關（可以用主角名字、困境、或那個關鍵轉折）。
- 三個要有不同感覺（例如一個溫馨、一個有畫面、一個俏皮）。
- 不要使用 emoji。

只用這個 JSON 回覆（不要加 markdown code block）：
{ "titles": ["書名一","書名二","書名三"] }`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 0.9,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      let titles: string[] = [];
      try {
        const parsed = JSON.parse(stripFences((c.data.choices[0].message?.content || "").trim()));
        titles = Array.isArray(parsed?.titles)
          ? parsed.titles.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 3)
          : [];
      } catch {
        titles = [];
      }
      if (!titles.length) {
        const nm = character?.name || "我";
        titles = [`${nm}的故事`, `${nm}的大冒險`, `${nm}和那一天`]; // 最後保底，永遠有得選
      }
      return res.status(200).json({ titles });
    }

    // ---- 出題：讀完自己的故事後，用拖拉填空確認他真的知道自己寫了什麼 ----
    if (mode === "quiz") {
      const slots: Slot[] = Array.isArray(req.body?.slots) ? req.body.slots : [];
      if (!slots.length) return res.status(400).json({ error: "need-slots" });
      const skeleton = slots.map((s) => `${s.label}：${s.text || ""}`).join("\n");
      const userPrompt = `主角：${charLine(character)}
${gradeNote}

這是學生剛做好的繪本故事：
${skeleton}

請根據「這個學生自己的故事」，出一題拖拉填空，確認他真的知道自己的故事在講什麼。
把故事濃縮成一小段話，中間挖 4 個空格，讓他把正確的詞拖回去。

規則：
- 4 個空格要分別對應：主角是誰、遇到什麼困境、其中一次失敗的辦法、最後怎麼成功的。
- 每個答案都要「很短」（2 到 8 個字），而且必須是這個故事裡真的出現過的東西。
- 另外再給 3 個「干擾詞」：看起來像、但這個故事裡並沒有發生的東西（不可以是正確答案的同義詞）。
- 整段話要通順、好讀，像在幫他複述自己的故事。
- 絕對不要使用 emoji。

只用這個 JSON 回覆（不要加 markdown code block），parts 依序組成那段話，
字串是原文、物件 {"blank":"答案"} 是空格：
{
  "parts": ["在這個故事裡，", {"blank":"主角名字"}, "遇到了", {"blank":"困境"}, "。牠先試著", {"blank":"某次失敗的辦法"}, "，可是沒有成功。最後靠著", {"blank":"成功的關鍵"}, "，問題終於解決了。"],
  "bank": ["答案1","答案2","答案3","答案4","干擾1","干擾2","干擾3"]
}`;
      const c = await openai.createChatCompletion({
        model: "gpt-5.4",
        temperature: 0.5,
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userPrompt },
        ],
      });
      const content = (c.data.choices[0].message?.content || "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(stripFences(content));
      } catch {
        return res.status(500).json({ error: "parse-failed" });
      }
      const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];
      const answers = parts.filter((p: any) => p && typeof p === "object" && p.blank).map((p: any) => String(p.blank));
      if (!answers.length) return res.status(500).json({ error: "no-blanks" });
      // 確保每個正解都在字卡庫裡（模型偶爾會漏）
      const bank = Array.isArray(parsed?.bank) ? parsed.bank.map((b: any) => String(b).trim()).filter(Boolean) : [];
      answers.forEach((a: string) => { if (!bank.includes(a)) bank.push(a); });
      return res.status(200).json({ parts, bank });
    }

    // ---- 審核書名：學生自己取的書名會印在封面，也要看過 ----
    if (mode === "reviewTitle") {
      const title = String(req.body?.title || "").trim();
      const summary = String(req.body?.summary || "").trim();
      if (!title) return res.status(200).json({ pass: false, praise: "", hint: "還沒取書名喔，想一個吧！" });
      const userPrompt = `主角：${charLine(character)}
${summary ? `這本繪本的故事大概是：${summary}\n` : ""}
學生為這本繪本取的書名是：「${title}」

這個書名會印在繪本的封面上、帶回家給家人看。請看三件事：
1. 適不適合當一本給小朋友看的繪本書名？
   以下一律不通過：廁所笑話（大便、便便、屎、尿尿、放屁等）、暴力、罵人或髒話、恐怖或死亡、
   以及明顯在搗蛋亂取的名字。
2. 像不像一個書名？（亂打的字、單一個無意義的字、或完全空泛都不算）
3. 跟這個故事有沒有一點關係？（這點請寬鬆，只要沾得上邊就好；有趣、可愛、有想像力都很棒。）

只用這個 JSON 回覆（不要加 markdown code block）：
{
  "pass": true 或 false,
  "praise": "通過時給一句很短的稱讚（沒通過就留空字串）",
  "hint": "沒通過時，用一句溫柔的話告訴他為什麼、可以往哪個方向想（例如從主角、困境或那個關鍵轉折去取）。不要幫他取好書名，也不要重複那個不適合的詞。"
}`;
      try {
        const c = await openai.createChatCompletion({
          model: "gpt-5.4",
          temperature: 0.4,
          messages: [
            { role: "system", content: BASE_SYSTEM },
            { role: "user", content: userPrompt },
          ],
        });
        const parsed = JSON.parse(stripFences((c.data.choices[0].message?.content || "").trim()));
        return res.status(200).json({
          pass: parsed?.pass !== false,
          praise: String(parsed?.praise || "").trim(),
          hint: String(parsed?.hint || "").trim(),
        });
      } catch {
        return res.status(200).json({ pass: true, praise: "", hint: "" }); // fail-open
      }
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
- 如果學生的骨架裡有不適合印成繪本的內容（廁所笑話、暴力、罵人、恐怖等），
  請在保留他原本情節走向的前提下，自然地改寫成適合小朋友的版本，不要照抄。
- 另外想 3 個適合這個故事的書名。

${grade === "low" ? ZY_ASK + "\n" : ""}
只用這個 JSON 格式回覆（不要加 markdown code block）：
{
  "titles": ["書名一", "書名二", "書名三"],
  "pages": [
    { "text": "這一頁的故事文字" }
  ]${grade === "low" ? ',\n  "zy": {"字":"ㄗˋ"}' : ""}
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
      return res.status(200).json({ titles, title: titles[0] || "", pages, zy: zyOf(parsed) });
    }

    return res.status(400).json({ error: "unknown-mode" });
  } catch (error: any) {
    console.error("picturebook-story error:", error?.message || error);
    return res.status(500).json({ error: "ai-failed" });
  }
}
