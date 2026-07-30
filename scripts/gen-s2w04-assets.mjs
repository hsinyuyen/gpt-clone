/* 生成 S2-W04《語氣變身術》需要的美術素材。
 *
 *   node scripts/gen-s2w04-assets.mjs          # 只補還沒有的
 *   node scripts/gen-s2w04-assets.mjs --force  # 全部重畫
 *
 * 跑之前 dev server 要開著（會走 /api/generate-image-gemini，讀 .env.local 的 GEMINI_API_KEY）。
 * 生成後接著跑 scripts/shrink-s2w04-assets.mjs 去背＋壓縮。
 *
 * ── 風格必須對齊 S2-W03（阿問偵探社系列），不是 P1U 的章魚 ──
 * 實測 s2w03-keeper.png / s2w03-baker.png：
 *   1024x1024、4 channels、透明約 73–75%（真的去背）
 *   柔和厚塗童書插畫、全身站姿、3/4 視角、土色系、腳下有柔和落地陰影
 * 場景 s2w03-hall.jpg：1344x768、無 alpha、約 223KB
 * ⚠️ Gemini 不輸出 alpha，所以角色一律畫在綠幕上，由 shrink 腳本取樣去背。
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API = "http://localhost:3000/api/generate-image-gemini";
const OUT = join(process.cwd(), "public", "games", "assets");
const FORCE = process.argv.includes("--force");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const CHAR = (desc) =>
  `A single full-body character for a children's detective storybook: ${desc}.
Art style: soft painterly digital children's book illustration, gentle airbrushed shading, muted earthy palette with warm skin tones, friendly rounded shapes, natural human proportions (NOT chibi, NOT big-head), clear readable silhouette, a soft blurred contact shadow under the feet.
Composition: standing, full body head to toe, three-quarter view facing slightly toward the viewer, centred, nothing else in frame.
Background: a completely flat solid pure green chroma-key background, RGB(0,255,0), absolutely uniform — no scenery, no props, no other people, no text.
Taiwanese elementary-school setting. Warm and appealing, never scary.
ABSOLUTELY NO writing anywhere in the image — no text, no letters, no numbers, no logos, and no words on armbands, badges, name tags or clothing. Leave such surfaces blank.`;

const SCENE = (desc) =>
  `${desc}.
Art style: soft painterly digital children's storybook illustration, warm inviting light, muted earthy palette, gentle depth and atmosphere, cosy hand-painted feel. NOT flat vector art, NOT photorealistic.
Wide establishing shot of the location, no people in the foreground, no text, no letters, no numbers.
Taiwanese elementary school, school fair (園遊會) setting.`;

const JOBS = [
  /* ── 角色（7 張；小妹妹在幕二重複使用同一張）── */
  { f: "s2w04-sister.png", ar: "1:1", p: CHAR(
    "a shy first-grade girl about 7 years old, short bobbed black hair, school uniform, hugging her own arms and hunched over, frightened teary expression, looking down") },
  { f: "s2w04-qiang.png", ar: "1:1", p: CHAR(
    "a stubborn sixth-grade boy about 12 years old, short spiky black hair, school PE tracksuit, arms folded tightly across his chest, chin up, defensive scowl") },
  { f: "s2w04-mei.png", ar: "1:1", p: CHAR(
    "a lively fourth-grade girl about 10 years old, twin ponytails, apron over her uniform because she runs the food stall, hands on hips, cheeks puffed with frustration, stamping one foot") },
  { f: "s2w04-teacher.png", ar: "1:1", p: CHAR(
    "a busy young female elementary teacher in her thirties, hair in a practical bun, cardigan and long skirt, carrying a stack of paper boxes in both arms, glancing back over her shoulder, harried but kind") },
  { f: "s2w04-hua.png", ar: "1:1", p: CHAR(
    "a gentle fifth-grade boy about 11 years old wearing a distinctly BRIGHT RED jacket over his uniform, a duty-student armband on his sleeve, head lowered, wringing his hands nervously, looks like he is afraid of being scolded") },
  { f: "s2w04-blamed.png", ar: "1:1", p: CHAR(
    "an angry fifth-grade boy about 11 years old, short hair, school uniform, both fists clenched at his sides, leaning forward, indignant shouting expression as if protesting he did not do it") },
  { f: "s2w04-janitor.png", ar: "1:1", p: CHAR(
    "a kind elderly male school janitor about 65 years old, grey hair, simple work shirt and trousers, a cloth cap, holding a long broom, gentle wrinkled smile") },

  /* ── 場景（9 張）── */
  { f: "s2w04-fair.jpg", ar: "16:9", p: SCENE(
    "The evening before a school fair, the schoolyard full of half-built booths: tables knocked over, paper decorations scattered on the ground, one booth clearly messed up, an empty hook where a sign should hang, dusk light") },
  { f: "s2w04-corner.jpg", ar: "16:9", p: SCENE(
    "A quiet dim corner of a school corridor beside a stack of folded chairs, a small hiding spot where a frightened child might crouch, late afternoon light from a high window") },
  { f: "s2w04-corridor.jpg", ar: "16:9", p: SCENE(
    "A long empty elementary school corridor with classroom doors and student artwork on the walls, afternoon sun striping the floor") },
  { f: "s2w04-stall.jpg", ar: "16:9", p: SCENE(
    "A school fair food stall with a wooden counter, paper cups and snacks, colourful bunting, but the display items are knocked about and messy") },
  { f: "s2w04-class.jpg", ar: "16:9", p: SCENE(
    "A busy elementary classroom being prepared for the school fair: desks pushed together, cardboard boxes of supplies stacked up, decorations half-hung") },
  { f: "s2w04-board.jpg", ar: "16:9", p: SCENE(
    "A detective clue board made from a classroom cork noticeboard: empty pinned note cards, red string between pins, a magnifying glass and pencil resting on the ledge") },
  { f: "s2w04-rain.jpg", ar: "16:9", p: SCENE(
    "Heavy night rain over a school courtyard, puddles reflecting the corridor lights, a sheltered walkway where someone could hide something from the rain") },
  { f: "s2w04-yard.jpg", ar: "16:9", p: SCENE(
    "An elementary school back yard the morning after rain: wet ground, a broom and dustpan leaning against the wall, leaves washed into a corner, soft clear light") },
  { f: "s2w04-end.jpg", ar: "16:9", p: SCENE(
    "A cheerful school fair in full swing at last: the wooden sign hung back up above a tidy booth, bunting, balloons, sunny warm celebration atmosphere") },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let made = 0, skipped = 0; const failed = [];

for (const [i, job] of JOBS.entries()) {
  const out = join(OUT, job.f);
  if (!FORCE && existsSync(out)) { console.log(`[${i + 1}/${JOBS.length}] 已存在，跳過  ${job.f}`); skipped++; continue; }
  process.stdout.write(`[${i + 1}/${JOBS.length}] 生成中 ${job.f} … `);
  try {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: job.p, aspectRatio: job.ar }) });
    if (!r.ok) { console.log(`失敗 HTTP ${r.status}`); failed.push(job.f); await sleep(1500); continue; }
    const j = await r.json();
    const m = /^data:(image\/[\w+]+);base64,(.+)$/.exec(j.imageUrl || "");
    if (!m) { console.log("失敗（回應沒有圖）"); failed.push(job.f); continue; }
    const buf = Buffer.from(m[2], "base64");
    writeFileSync(out, buf);
    console.log(`OK ${Math.round(buf.length / 1024)}KB`);
    made++;
  } catch (e) { console.log("失敗 " + e.message); failed.push(job.f); }
  await sleep(1200);
}
console.log(`\n完成：新生成 ${made}、跳過 ${skipped}、失敗 ${failed.length}`);
if (failed.length) console.log("失敗清單：" + failed.join(", ") + "（重跑會只補這些）");
console.log("接著跑：node scripts/shrink-s2w04-assets.mjs");
