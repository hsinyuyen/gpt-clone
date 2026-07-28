/* 生成 P1U-W04 需要的美術素材。
 *
 * 走本機 dev server 的 /api/generate-image-gemini（會讀 .env.local 的 GEMINI_API_KEY），
 * 所以跑之前 dev server 要開著。
 *
 *   node scripts/gen-w04-assets.mjs          # 只補還沒有的
 *   node scripts/gen-w04-assets.mjs --force  # 全部重畫
 *
 * ── 風格必須對齊 W03（第一版做錯過一次）──────────────────────────────
 * W03 的角色是「柔和厚塗、氣質溫暖、大眼睛帶白色高光、單隻角色浮著、
 * 背景全空、有 alpha 去背」；場景是「厚塗油畫感、寶石色調、光束、氣泡、細節豐富」。
 * 第一版我生成的是扁平向量卡通＋整片場景背景＋角色站在地上，兩邊都不對，全部重做。
 *
 * ── 去背 ─────────────────────────────────────────────────────────────
 * Gemini 不會直接輸出 alpha，所以角色一律要求畫在「純綠幕」上，
 * 再由 scripts/shrink-w04-assets.mjs 去背成透明 PNG（跟 W03 一樣有 alpha）。
 * 綠幕選純綠 #00FF00，跟四隻章魚的配色（桃紅／金黃／青綠／鋼灰）距離都夠遠。
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API = "http://localhost:3000/api/generate-image-gemini";
const OUT = join(process.cwd(), "public", "games", "assets");
const FORCE = process.argv.includes("--force");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// 角色：柔和厚塗 + 綠幕 + 浮著 + 單隻
const CHAR = (desc) =>
  `A single cute cartoon octopus character: ${desc}.
Art style: soft painterly digital illustration, smooth airbrushed shading and gradients, warm friendly children's storybook art, chibi proportions with a big round head-body and curling tentacles, large glossy expressive eyes with bright white highlights, gentle rim light. NOT flat vector art, NOT hard cel shading, NOT outlined comic style.
Composition: the character floating as if swimming, full body, centred, facing the viewer, nothing else in frame.
Background: a completely flat solid pure green chroma-key background, RGB(0,255,0), absolutely uniform, no scenery, no ground, no shadow cast on the background, no other creatures, no props, no text.
Friendly and appealing to 6-7 year olds; may look tough or grumpy but never scary, never gory.`;

// 場景：厚塗油畫感、寶石色調、光束、氣泡
const SCENE = (desc) =>
  `${desc}.
Art style: rich painterly digital painting like a high-quality children's storybook illustration, deep saturated jewel tones, dramatic god rays shining down through the water, floating bubbles, ornate coral and architecture detail, atmospheric depth, soft glowing highlights. Painterly brushwork, NOT flat vector art, NOT cel shaded cartoon.
Wide cinematic underwater scene. No text, no letters, no numbers, no UI.`;

const JOBS = [
  // ── 教學關的練習玩偶（新增）──
  { f: "w4-oct-dummy.png",   ar: "1:1", p: CHAR("a PRACTICE DUMMY octopus — clearly a soft stuffed toy made of beige canvas and burlap cloth, with visible stitching seams, patched fabric, two simple flat button eyes sewn on, a target bullseye patch on its head, floppy soft fabric tentacles, no real facial expression because it is a doll, hanging like a training punching dummy") },
  // ── 四隻中 boss ──
  { f: "w4-oct-boxer.png",   ar: "1:1", p: CHAR("a deep pink and crimson octopus BOXER wearing big red padded boxing gloves on two of its front tentacles, raised in a boxing guard, headband, determined grin") },
  { f: "w4-oct-lantern.png", ar: "1:1", p: CHAR("a golden amber octopus with a huge glowing anglerfish lantern bulb on a stalk above its head, the bulb casting a warm bright glow over its face") },
  { f: "w4-oct-sucker.png",  ar: "1:1", p: CHAR("a teal and turquoise octopus with very large prominent round suction cups covering every tentacle, tentacles curling inward as if sucking water toward itself") },
  { f: "w4-oct-armor.png",   ar: "1:1", p: CHAR("a steel grey octopus wearing a thick riveted iron armour helmet shell covering its head, heavy metal plating, tough and sturdy, small eyes peeking out from under the helmet") },
  { f: "w4-oct-king.png",    ar: "3:4", p: CHAR("an ENORMOUS royal purple octopus KING wearing a tall golden crown with jewels, majestic and imposing, thick powerful tentacles spreading wide, glowing amber eyes, regal presence") },
  // ── 場景 ──
  { f: "w4-base.jpg",  ar: "16:9", p: SCENE("An octopus army's underwater fortress base built into a dark rocky trench: purple bioluminescent lamps, drifting ink clouds, coral watchtowers and barricades") },
  { f: "w4-rc1.jpg",   ar: "16:9", p: SCENE("A brave little child diver in a yellow diving suit driving away a small purple scout octopus, triumphant pose, swirling bubbles, shafts of light from above") },
  { f: "w4-rc2.jpg",   ar: "16:9", p: SCENE("Five glowing coloured gemstones resting safely on ornate golden pedestals inside a grand bright underwater castle hall") },
  { f: "w4-rc3.jpg",   ar: "16:9", p: SCENE("An orange octopus captain fleeing fast into a dark deep-sea trench to call for reinforcements, looking back over its shoulder") },
  { f: "w4-bf1.jpg",   ar: "16:9", p: SCENE("A huge army of four large octopuses of different colours advancing together through deep water toward the viewer, imposing but not frightening") },
  { f: "w4-bf2.jpg",   ar: "16:9", p: SCENE("A little child diver in a yellow diving suit standing before a glowing coral defence line, four octopus silhouettes looming beyond it, determined mood") },
  { f: "w4-it1.jpg",   ar: "16:9", p: SCENE("A pair of red boxing gloves sinking slowly down to the sandy seabed, trailing small bubbles, calm after a fight") },
  { f: "w4-it2.jpg",   ar: "16:9", p: SCENE("A large anglerfish lantern going dark underwater as the murky water clears back to bright blue, a feeling of relief") },
  { f: "w4-it3.jpg",   ar: "16:9", p: SCENE("Swirling whirlpool currents settling into stillness, loosened suction cups drifting away in the calm water") },
  { f: "w4-it4.jpg",   ar: "16:9", p: SCENE("A broken coral defence barricade with five gemstones still glowing safely behind it, warm dawn light streaming from the surface") },
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
if (failed.length) console.log("失敗清單：" + failed.join(", "));
console.log("接著跑：node scripts/shrink-w04-assets.mjs（去背 ＋ 壓縮）");
