/* 壓縮 W04 素材。
 *
 * Gemini 回傳的一律是 PNG（就算副檔名寫 .jpg），單張 1.2–1.9 MB，
 * 15 張合計 23 MB —— 比 W03 整包還大，學校網路載不動。
 *
 * 這支腳本把它們縮到跟 W03 同一個量級：
 *   角色 PNG  → 邊長 ≤ 720、保留透明、pngquant 式壓縮
 *   場景 .jpg → 邊長 ≤ 1280、真正編成 JPEG（副檔名終於名副其實）
 *
 *   node scripts/shrink-w04-assets.mjs
 *
 * 會就地覆蓋，原圖先備份到 assets/_raw/（要重壓可以從那裡拿）。
 */
import sharp from "sharp";
import { readdirSync, mkdirSync, existsSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public", "games", "assets");
const RAW = join(DIR, "_raw");
if (!existsSync(RAW)) mkdirSync(RAW, { recursive: true });

const files = readdirSync(DIR).filter((f) => /^w4-.*\.(png|jpg)$/i.test(f));
let before = 0, after = 0;

for (const f of files) {
  const src = join(DIR, f), bak = join(RAW, f);
  if (!existsSync(bak)) copyFileSync(src, bak);      // 只備份一次，重跑不會用壓過的覆蓋原圖
  const b0 = statSync(bak).size; before += b0;

  const isScene = f.endsWith(".jpg");
  const img = sharp(bak).rotate();
  const out = isScene
    ? await img.resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true }).toBuffer()
    : await img.resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
        .png({ quality: 80, compressionLevel: 9, palette: true }).toBuffer();

  const { writeFileSync } = await import("node:fs");
  writeFileSync(src, out);
  after += out.length;
  console.log(
    `${f.padEnd(20)} ${(b0 / 1024 / 1024).toFixed(2)}MB → ${(out.length / 1024).toFixed(0)}KB  (${Math.round((1 - out.length / b0) * 100)}% 省下)`
  );
}
console.log(`\n合計 ${(before / 1024 / 1024).toFixed(1)}MB → ${(after / 1024 / 1024).toFixed(1)}MB`);
console.log(`原圖備份在 public/games/assets/_raw/（別提交，已在 .gitignore 排除）`);
