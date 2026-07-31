# 系列基準（Series Conventions）

> **動工前先讀這份，並打開同系列上一週的檔案對照。**
> 新的一週要跟同系列前幾週對齊（S2 對 S2、P1U 對 P1U）——畫風、引擎、
> 調色盤、金幣/進度管線、worksheet 文件都要一致。**最可靠的做法是「fork
> 上一週的檔案來改」，而不是從頭寫**，這樣不變量自動繼承、不會漂移。

每加完一週，回來更新這份（尤其新增/變動的不變量、班級、金幣總額）。

---

## 通用（所有遊戲型課程共通）

- **單檔遊戲**：`public/games/<series>-w<NN>-<slug>.html`，所有 CSS/JS 內嵌、素材放 `public/games/assets/`。
- **帳號 chassis**：`Account` 物件——`coins/{uid}`（用 transaction id 冪等入帳）、`gameProgress/{uid}[gameKey]`（存進度）。`GAMEKEY` 逐字等於 worksheet 的 `gameKey`。
- **完成鎖**：head 載入 `/courses/lesson-lock.js`；完成時 `LessonLock.markComplete('game:<gameKey>', {type:'score',score,label})`；進場 `isLocked` → 顯示成品展示、不重玩。**接了鎖就一定要在 `src/pages/admin/students/[id].tsx` 的 `redoRows` 加 `lessonKeys.game('<gameKey>')`**，否則破關即永久鎖死（Firestore 規則禁刪，救不回來）。
- **金幣 HUD**：只顯示累計數字，不顯示「/總額」（總額含小老師 TA，正常玩到不了，會像有領不到的一段）。
- **素材去背**：Gemini 一律輸出綠幕 PNG → `scripts/*shrink*.mjs` 四角取樣去背（不是寫死純綠）→ `sharp` 壓縮（`sharp` 刻意不進 package.json，用 `npm i --no-save sharp`）。
- **上線四步**：見長期記憶「遊戲型課程部署檢查清單」（金幣/進度綁定、完成鎖、**建 worksheet 文件**、admin 重做入口）。**最常漏建 worksheet 文件**。
- **worksheet 文件**：`worksheets/ws_<sem>_w<NN>`，欄位 `semester`/`week`/`gameKey`/`externalGameUrl`/`isPublished:true`/`classId`/`classIds`/`tasks`；`tasks[].coins` 合計＝遊戲最大金幣（含 TA）。**班級 ID 與 semester 格式從同系列既有 worksheet 撈，不要猜**（仿 `scripts/create-s2w04-worksheet.mjs`，dry-run 預設）。
- **正式站**：`gpt-clone-beta-six.vercel.app`（`vercel --prod`）；見 CLAUDE.md。Vercel 沒接 GitHub，main 會跟正式站分歧。

---

## S2 — 阿問偵探社（劇情推理，DOM 引擎）

- **檔名**：`s2-w<NN>-<slug>.html`（W01 detective、W02 detective-format、W03 detective-crown、W04 detective-tone）。
- **引擎**：**DOM 單頁**——`el()/pic()/Sfx`，章節式 `CHAPTERS[]` + `goCh(i)`，**單頁不捲動**（每關塞一個畫面；寬螢幕左右分欄、直向上下橫幅、矮橫排卡片並排）。**不是 canvas**（那是 P1U）。
- **調色盤**（沿用 S2-W03，讓整季看起來同一系列）：`--bg:#0b1a2e --bg2:#081422 --panel:#14304f --panel2:#0f2540 --ink:#eef5ff --line:#28517d --gold:#ffcf5c`。
- **畫風**：柔和厚塗童書插畫、土色系、全身站姿 3/4 視角、腳下柔和落地陰影。角色 `s2w<NN>-*.png`（去背透明約 73–75%），場景 `s2w<NN>-*.jpg`（1344×768 無 alpha）。**AI 生圖前先看上一週實際素材對齊**（曾因沒對齊畫成扁平向量＋整場景背景）。
- **搭檔**：阿問（AI 夥伴）。AI 審核走對應 API（W04 語氣審核＝`/api/review-tone`，`gpt-4o-mini`）；一定要留本地後備，逾時/連不上放行不卡學生。
- **worksheet**：`ws_s2_w<NN>`，`semester:"S2"`，`classIds:["cls_1783062672346_x3ui","cls_1782986992650_lp84"]`（主帶 `cls_1783062672346_x3ui`）。
- **gameKey**：`s2w<NN>`（例 `s2w04`）。

## P1U — 動作技能（滑鼠/鍵盤，canvas 引擎）

- **檔名**：`p1u-w<NN>-<slug>.html`（W01 mouse、W02 castle、W03 octopus-vanguard、W04 octopus-siege）。
- **引擎**：**canvas 單檔**——節奏拍 QTE、「兩手齊發」判定（左手按住＝held、右手事件）。
- **畫風**：章魚軍團題材；武器/道具立繪 `pov-*.png` 等，綠幕去背（sword/hammer/shield/wand 各有不同 alpha，別憑外觀猜有沒有去背——查 alpha 通道）。
- **worksheet**：`ws_p1u_w<NN>`，`semester:"P1"`，`classIds:["cls_1776246403295_x65q","cls_1782986992650_lp84"]`。
- **gameKey**：`p1uw<NN>`（例 `p1uw04`）。

---

## 動工前 checklist

1. 打開同系列上一週的 `.html`，確認引擎、調色盤、chassis、章節結構。
2. **fork 它**、改成這一週的內容（優先於從頭寫）。
3. 生圖前先看上一週的實際素材（尺寸、alpha、畫風）。
4. 收尾照「部署檢查清單」四步，班級/金幣總額從同系列既有 worksheet 撈。
