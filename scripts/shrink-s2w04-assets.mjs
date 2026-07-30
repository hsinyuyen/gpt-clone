/* S2-W04 素材後製：角色綠幕去背成透明 PNG、場景轉真 JPEG，兩者都壓到能上線的大小。
 *
 *   node scripts/shrink-s2w04-assets.mjs
 *
 * ⚠️ 需要 sharp，但它刻意不列在 package.json（Vercel 用 yarn --frozen-lockfile 建置，
 *    加進 devDependencies 會讓 package.json 與 yarn.lock 不一致而建置失敗）。
 *    要跑就自行安裝：  npm i --no-save sharp
 *
 * 尺寸對齊 S2-W03 實測值：角色邊長 ≤1024 有 alpha、場景 1344x768 無 alpha。
 * 原圖先備份到 assets/_raw/，重跑一律從備份重新處理。
 */
import sharp from "sharp";
import { readdirSync, mkdirSync, existsSync, copyFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public", "games", "assets");
const RAW = join(DIR, "_raw");
if (!existsSync(RAW)) mkdirSync(RAW, { recursive: true });

/** 綠幕去背。不寫死純綠——Gemini 給的是偏灰的綠，所以從四角取樣真正的背景色。 */
async function keyOutBackdrop(srcPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => { const i = (y * width + x) * channels; return [data[i], data[i + 1], data[i + 2]]; };
  const pts = [], P = 12;
  for (const [ox, oy] of [[0, 0], [width - P, 0], [0, height - P], [width - P, height - P]])
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) pts.push(at(ox + x, oy + y));
  const bg = [0, 1, 2].map((c) => Math.round(pts.reduce((s, p) => s + p[c], 0) / pts.length));
  const dist = (r, g, b) => Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  const HARD = 42, SOFT = 96;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = dist(r, g, b);
    if (d <= HARD) { data[i + 3] = 0; continue; }
    if (d < SOFT) {
      data[i + 3] = Math.round(255 * ((d - HARD) / (SOFT - HARD)));
      data[i + 1] = Math.round(g * 0.88 + ((r + b) / 2) * 0.12);
      continue;
    }
    /* 第二道：綠色溢色清理。
       角色腳下的柔和落地陰影會跟綠幕混色，混出來的顏色離背景色夠遠、逃過上面的距離判準，
       結果留下一圈綠斑（第一版實際看到了）。這裡改用「綠明顯壓過紅與藍」來抓：
       壓得越多就越透明，並把綠通道拉回紅藍的平均，把殘留的綠邊也一起中和掉。 */
    const domin = g - Math.max(r, b);
    if (domin > 10) {
      data[i + 3] = Math.round(data[i + 3] * Math.max(0, 1 - (domin - 10) / 34));
      data[i + 1] = Math.round((r + b) / 2);
    }
  }
  return { img: sharp(data, { raw: { width, height, channels } }).png(), bg };
}

const files = readdirSync(DIR).filter((f) => /^s2w04-.*\.(png|jpg)$/i.test(f));
if (!files.length) { console.log("找不到 s2w04-* 素材，先跑 gen-s2w04-assets.mjs"); process.exit(0); }
let before = 0, after = 0;

for (const f of files) {
  const src = join(DIR, f), bak = join(RAW, f);
  if (!existsSync(bak)) copyFileSync(src, bak);
  const b0 = statSync(bak).size; before += b0;

  let out, note = "";
  if (f.endsWith(".jpg")) {
    out = await sharp(bak).rotate()
      .resize({ width: 1344, height: 768, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  } else {
    const { img: keyed, bg } = await keyOutBackdrop(bak);
    out = await keyed.trim({ threshold: 1 })
      .resize({ width: 720, height: 900, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 82 }).toBuffer();
    const st = await sharp(out).stats(); const a = st.channels[3];
    note = a ? `  背景 rgb(${bg})  透明 ${Math.round((1 - a.mean / 255) * 100)}%` : "  ⚠ 沒有 alpha";
  }
  writeFileSync(src, out);
  after += out.length;
  console.log(`${f.padEnd(22)} ${(b0 / 1024 / 1024).toFixed(2)}MB → ${(out.length / 1024).toFixed(0)}KB${note}`);
}
console.log(`\n合計 ${(before / 1024 / 1024).toFixed(1)}MB → ${(after / 1024 / 1024).toFixed(1)}MB`);

