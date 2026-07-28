/* 生成 P1U-W04 需要的美術素材。
 *
 * 走本機 dev server 的 /api/generate-image-gemini（那支會讀 .env.local 的 GEMINI_API_KEY），
 * 所以跑之前 dev server 要開著。
 *
 *   node scripts/gen-w04-assets.mjs
 *
 * 已存在的檔案會跳過 → 中斷後重跑只會補沒生成的，不會重花錢重畫。
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API = "http://localhost:3000/api/generate-image-gemini";
const OUT = join(process.cwd(), "public", "games", "assets");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// 共用風格：跟 W02/W03 的海底城系列對齊，避免第四週畫風忽然不一樣
const SEA = "underwater deep-sea kingdom, warm friendly children's picture-book illustration, saturated colours, soft light rays through water, no text";
const OCTO = (desc) =>
  `A single cartoon octopus boss character, ${desc}. ${SEA}. Full body, 3/4 view, centred, plain simple background so it can be cut out. Chunky friendly shapes, big readable silhouette, suitable for 6-7 year olds. Slightly menacing but never scary or gory.`;

const JOBS = [
  // ── 四隻中 boss（角色圖，1:1）──
  { f: "w4-oct-blade.png",   ar: "1:1",  p: OCTO("deep pink and crimson, holding two curved shining swords with its front tentacles, confident fighting pose") },
  { f: "w4-oct-lantern.png", ar: "1:1",  p: OCTO("golden amber, with a huge glowing anglerfish-style lantern bulb hanging over its head casting bright warm light") },
  { f: "w4-oct-sucker.png",  ar: "1:1",  p: OCTO("teal and turquoise, with very large prominent round suction cups on every tentacle, tentacles curling inward as if pulling water") },
  { f: "w4-oct-armor.png",   ar: "1:1",  p: OCTO("steel grey, wearing a thick riveted metal armour shell plate over its head like a helmet, heavy and tough looking") },
  // ── 章魚王（結尾現身，直式好放滿畫面）──
  { f: "w4-oct-king.png",    ar: "3:4",  p: OCTO("enormous royal purple octopus KING wearing a golden crown, huge and imposing, rising from a dark deep-sea trench, glowing eyes") },
  // ── 場景（16:9）──
  { f: "w4-base.jpg",  ar: "16:9", p: `An octopus army underwater base: dark rocky trench with purple bioluminescent lights, ink clouds drifting, coral watchtowers. ${SEA}` },
  // 前情提要（承 W03）
  { f: "w4-rc1.jpg",   ar: "16:9", p: `A brave little kid diver in a yellow diving suit driving away a small purple octopus scout, victory pose, bubbles everywhere. ${SEA}` },
  { f: "w4-rc2.jpg",   ar: "16:9", p: `Five glowing colourful gemstones safe on pedestals inside a bright underwater castle hall. ${SEA}` },
  { f: "w4-rc3.jpg",   ar: "16:9", p: `An orange octopus captain swimming away fast into a dark trench, calling reinforcements, worried mood. ${SEA}` },
  // 今天說明
  { f: "w4-bf1.jpg",   ar: "16:9", p: `A big army of four large octopuses of different colours advancing together towards the viewer through deep water, dramatic but not scary. ${SEA}` },
  { f: "w4-bf2.jpg",   ar: "16:9", p: `A little kid diver in a yellow diving suit facing a glowing defence line of coral barriers, determined, four octopus silhouettes beyond. ${SEA}` },
  // 幕間（每打退一隻）
  { f: "w4-it1.jpg",   ar: "16:9", p: `Two curved swords sinking down to the sandy seabed, small bubbles trailing, calm after a fight. ${SEA}` },
  { f: "w4-it2.jpg",   ar: "16:9", p: `A big glowing lantern going dark underwater, the water becoming clear and blue again, relief. ${SEA}` },
  { f: "w4-it3.jpg",   ar: "16:9", p: `Swirling water currents calming down and becoming still, loose suction cups drifting away. ${SEA}` },
  { f: "w4-it4.jpg",   ar: "16:9", p: `A broken coral defence line with five gemstones still glowing safely behind it, dawn light from above. ${SEA}` },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let made = 0, skipped = 0, failed = [];
for (const [i, job] of JOBS.entries()) {
  const out = join(OUT, job.f);
  if (existsSync(out)) { console.log(`[${i + 1}/${JOBS.length}] 已存在，跳過  ${job.f}`); skipped++; continue; }
  process.stdout.write(`[${i + 1}/${JOBS.length}] 生成中 ${job.f} … `);
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: job.p, aspectRatio: job.ar }),
    });
    if (!r.ok) { console.log(`失敗 HTTP ${r.status}`); failed.push(job.f); await sleep(1500); continue; }
    const j = await r.json();
    const m = /^data:(image\/[\w+]+);base64,(.+)$/.exec(j.imageUrl || "");
    if (!m) { console.log("失敗（回應沒有圖）"); failed.push(job.f); continue; }
    writeFileSync(out, Buffer.from(m[2], "base64"));
    console.log(`OK ${Math.round(Buffer.from(m[2], "base64").length / 1024)}KB`);
    made++;
  } catch (e) {
    console.log("失敗 " + e.message); failed.push(job.f);
  }
  await sleep(1200); // 別打太快
}
console.log(`\n完成：新生成 ${made}、跳過 ${skipped}、失敗 ${failed.length}`);
if (failed.length) console.log("失敗清單：" + failed.join(", ") + "\n（重跑這支腳本會只補失敗的）");
