import { NextApiRequest, NextApiResponse } from "next";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const DESIGN_SYSTEM = `
/* Color Tokens */
:root {
  --color-hero-bg: #DBEAFE;
  --color-navy: #1E3A5F;
  --color-navy-card: #1B3A5C;
  --color-blue-accent: #3B82F6;
  --color-task-card-bg: #EFF6FF;
  --color-gray-code: #F3F4F6;
  --color-green-success: #DCFCE7;
  --color-green-text: #15803D;
  --color-amber-warning: #FEF9C3;
  --color-amber-border: #CA8A04;
  --color-coin-yellow: #EAB308;
  --color-white: #FFFFFF;
  --color-text-primary: #111827;
  --color-text-secondary: #6B7280;
}

/* Base */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif; color: var(--color-text-primary); line-height: 1.6; }

/* Layouts */
.page { min-height: 100vh; padding: 2rem; }
.hero-split { display: flex; min-height: 60vh; }
.hero-split .left { width: 30%; background: var(--color-hero-bg); display: flex; align-items: center; justify-content: center; padding: 2rem; }
.hero-split .right { width: 70%; background: white; padding: 3rem; display: flex; flex-direction: column; justify-content: center; }
.full-content { background: white; padding: 2rem 3rem; }
.two-column { display: flex; gap: 2rem; padding: 2rem 3rem; background: white; }
.two-column .main { flex: 6; }
.two-column .side { flex: 4; }
.three-card { display: flex; gap: 1.5rem; padding: 2rem 3rem; background: white; }
.three-card > div { flex: 1; }

/* Components */
.coin-badge { display: inline-flex; align-items: center; gap: 0.25rem; background: #FEF3C7; color: #92400E; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 700; font-size: 0.875rem; }
.task-id-pill { display: inline-block; background: var(--color-blue-accent); color: white; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }

.task-card { background: var(--color-task-card-bg); border-radius: 12px; padding: 1.5rem; border: 1px solid #BFDBFE; }
.task-card-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.task-card-header .task-emoji { font-size: 1.5rem; }
.task-card-header strong { color: var(--color-navy); font-size: 1.1rem; }

.step-list { list-style: none; counter-reset: step; padding-left: 0; }
.step-list li { counter-increment: step; margin-bottom: 1rem; padding-left: 2.5rem; position: relative; }
.step-list li::before { content: counter(step); position: absolute; left: 0; top: 0; width: 2rem; height: 2rem; background: var(--color-blue-accent); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.875rem; }

.completion-box { border-left: 4px solid var(--color-green-text); background: var(--color-green-success); padding: 1rem 1.5rem; border-radius: 0 8px 8px 0; margin: 1rem 0; }
.completion-box h3 { color: var(--color-green-text); margin-bottom: 0.5rem; }

.info-card { border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
.info-card.dark { background: var(--color-navy-card); color: white; }
.info-card.light { background: var(--color-task-card-bg); }
.info-card.warning { background: var(--color-amber-warning); border-left: 4px solid var(--color-amber-border); }
.info-card.success { background: var(--color-green-success); border-left: 4px solid var(--color-green-text); }

.copilot-tips { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px; padding: 1rem 1.5rem; margin: 1rem 0; }
.copilot-tips h4 { color: var(--color-blue-accent); margin-bottom: 0.5rem; }
.tip-item { background: white; border: 1px solid #E0F2FE; border-radius: 6px; padding: 0.5rem 1rem; margin-top: 0.5rem; font-style: italic; color: var(--color-text-secondary); }

.test-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
.test-table th, .test-table td { border: 1px solid #E5E7EB; padding: 0.75rem 1rem; text-align: left; }
.test-table th { background: var(--color-task-card-bg); font-weight: 600; }

.coin-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
.coin-table th, .coin-table td { border: 1px solid #E5E7EB; padding: 0.75rem 1rem; }
.coin-table th { background: #FEF3C7; }

h1 { font-size: 2rem; color: var(--color-navy); font-weight: 800; margin-bottom: 1rem; }
h2 { font-size: 1.5rem; color: var(--color-navy); font-weight: 700; margin-bottom: 0.75rem; margin-top: 1.5rem; }
h3 { font-size: 1.25rem; color: var(--color-navy); font-weight: 600; margin-bottom: 0.5rem; margin-top: 1rem; }
p { margin-bottom: 0.75rem; }
code { background: var(--color-gray-code); padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.875rem; }
pre code { display: block; padding: 1rem; overflow-x: auto; }
ul, ol { padding-left: 1.5rem; margin-bottom: 0.75rem; }
li { margin-bottom: 0.25rem; }
`;

const PAGE_LAYOUT_RULES = `
Page structure flow for each worksheet:
1. Page 1 (HeroSplit): Cover page with week title, subtitle, tags (week/coins/task count). Left 30% light blue bg with illustration emoji, right 70% white with title.
2. Page 2 (ThreeCard): Today's adventure goals — A/B/C task overview cards.
3. For each task: A task cover section (HeroSplit style) + task steps section (FullContent with step-list + completion-box).
4. Final page (TwoColumn): Coin summary table + reflection questions.

Each task section MUST include data-task-id attribute: <section data-task-id="A">, <section data-task-id="B">, etc.
Use page breaks: <div style="page-break-after: always;"></div> between major sections.
`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { markdownContent, title } = req.body;
  if (!markdownContent) {
    return res.status(400).json({ error: "Missing markdownContent" });
  }

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `你是一個 HTML 學習單生成器。你會收到一份 Markdown 格式的學習單內容，
你的任務是輸出一份完整的 single-file HTML，風格完全符合以下 Design System。
只輸出 HTML，不要任何解釋、不要 markdown code fence。

目標對象：國小 3-6 年級學生，風格要活潑、清晰、易讀。
使用大量 emoji 讓頁面生動有趣。

<design_system>
${DESIGN_SYSTEM}
</design_system>

<page_layout_rules>
${PAGE_LAYOUT_RULES}
</page_layout_rules>

重要規則：
1. 輸出完整 HTML（含 <!DOCTYPE html>、<head> 含 Google Fonts CDN for Noto Sans TC、內嵌 <style>）
2. 每個任務區塊必須有 data-task-id 屬性（例：<section data-task-id="A">）
3. 使用 Design System 的 CSS class（coin-badge, task-card, step-list, completion-box, info-card 等）
4. 在 <style> 標籤中包含完整的 Design System CSS
5. 如果 Markdown 中有 code block，正確渲染為 <pre><code>
6. 封面頁用大字標題 + 副標題 + 任務/金幣數量標籤`,
        },
        {
          role: "user",
          content: `以下是這週的學習單「${title || ""}」的 Markdown 內容：\n\n${markdownContent}`,
        },
      ],
      max_tokens: 8000,
      temperature: 0.3,
    });

    const html = response.data.choices[0]?.message?.content || "";

    res.status(200).json({ html });
  } catch (error: any) {
    console.error("Generate worksheet HTML error:", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to generate HTML",
      details: error?.response?.data?.error?.message || error.message,
    });
  }
}
