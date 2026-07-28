/* W04 素材後製：角色去背成透明 PNG、場景轉真 JPEG，兩者都壓到能上線的大小。
 *
 *   node scripts/shrink-w04-assets.mjs
 *
 * 為什麼需要這支：
 *  1. Gemini 一律回傳 PNG（就算副檔名寫 .jpg），單張 1.2–1.9MB，
 *     15 張比 W03 整包素材還大 75%，學校網路載不動。
 *  2. Gemini 不輸出 alpha，所以角色是畫在純綠幕上的，要在這裡去背，
 *     才能跟 W03 的角色圖一樣有透明背景（W03 實測 channels=4、hasAlpha=true）。
 *
 * 原圖會先備份到 assets/_raw/，重跑一律從備份重新處理，不會拿處理過的再處理一次。
 */
import sharp from "sharp";
import { readdirSync, mkdirSync, existsSync, copyFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public", "games", "assets");
const RAW = join(DIR, "_raw");
if (!existsSync(RAW)) mkdirSync(RAW, { recursive: true });

/** 綠幕去背。
 *  ⚠️ 不能寫死「純綠 #00FF00」：實測 Gemini 給的是偏灰的鼠尾草綠（約 140,191,106），
 *  寫死門檻會整張失效。改成從四個角落取樣真正的背景色，再依色彩距離去背。
 *  角落一定是背景，因為 prompt 指定角色置中且畫面裡沒有別的東西。 */
async function keyOutBackdrop(srcPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => { const i = (y * width + x) * channels; return [data[i], data[i + 1], data[i + 2]]; };

  // 四角各取 12x12 的平均當背景色
  const pts = [];
  const P = 12;
  for (const [ox, oy] of [[0, 0], [width - P, 0], [0, height - P], [width - P, height - P]])
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) pts.push(at(ox + x, oy + y));
  const bg = [0, 1, 2].map((c) => Math.round(pts.reduce((s, p) => s + p[c], 0) / pts.length));

  const dist = (r, g, b) => Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  const HARD = 42;   // 距離小於這個 → 確定是背景
  const SOFT = 96;   // 到這個距離之間 → 邊緣過渡，做半透明
  for (let i = 0; i < data.length; i += channels) {
    const d = dist(data[i], data[i + 1], data[i + 2]);
    if (d <= HARD) data[i + 3] = 0;
    else if (d < SOFT) {
      data[i + 3] = Math.round(255 * ((d - HARD) / (SOFT - HARD)));
      // 壓掉邊緣吃到的背景色溢色
      data[i + 1] = Math.round(data[i + 1] * 0.88 + ((data[i] + data[i + 2]) / 2) * 0.12);
    }
  }
  return { img: sharp(data, { raw: { width, height, channels } }).png(), bg };
}

/** 去背後角色四周會留一大圈空白 → 裁掉，讓遊戲裡的縮放不會白白浪費畫布 */
const trimTransparent = (s) => s.trim({ threshold: 1 });

const files = readdirSync(DIR).filter((f) => /^w4-.*\.(png|jpg)$/i.test(f));
let before = 0, after = 0;

for (const f of files) {
  const src = join(DIR, f), bak = join(RAW, f);
  if (!existsSync(bak)) copyFileSync(src, bak);
  const b0 = statSync(bak).size; before += b0;

  let out, note = "";
  if (f.endsWith(".jpg")) {
    out = await sharp(bak).rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  } else {
    const { img: keyed, bg } = await keyOutBackdrop(bak);
    out = await trimTransparent(keyed)
      .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 82 }).toBuffer();
    const st = await sharp(out).stats();
    const a = st.channels[3];
    const clear = a ? Math.round((1 - a.mean / 255) * 100) : 0;   // 透明面積佔比，太低代表沒去乾淨
    note = a ? `  背景色 rgb(${bg})  透明 ${clear}%` : "  ⚠ 沒有 alpha";
  }
  writeFileSync(src, out);
  after += out.length;
  console.log(`${f.padEnd(20)} ${(b0 / 1024 / 1024).toFixed(2)}MB → ${(out.length / 1024).toFixed(0)}KB${note}`);
}
console.log(`\n合計 ${(before / 1024 / 1024).toFixed(1)}MB → ${(after / 1024 / 1024).toFixed(1)}MB`);
