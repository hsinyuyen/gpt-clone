# Lab Terminal 互動課程 — 設計與工程知識庫

> 專案 wiki．整理自 **S5-W15 遊戲開發模擬器** 的設計與實作過程。
> 目的：把「做一款教『怎麼開發』的互動課程 + 可玩小遊戲」踩過的坑與可複用的模式記下來，
> 之後要做 W16、W17… 或其他互動概念課時，直接沿用這裡的心法與程式結構。
> 主檔：[`public/games/s5-w15-game-simulator.html`](../public/games/s5-w15-game-simulator.html)（單一 HTML）
> 相關 API：[`src/pages/api/review-sentence.ts`](../src/pages/api/review-sentence.ts)

---

## 1. 這是什麼

一堂「AI 對話閱讀理解 + 動手」互動課：帶國小 3–6 年級學生，把一款「躲隕石」小遊戲**從一句話想法一路做到上線**，過程中學會 15 個真實開發概念（需求、規格、原型、UI、版本控制、變數、bug、除錯、測試、部署、發布、資料庫…）。最後能**真的玩到自己「做」出來的專業級小遊戲**，進度與金幣**綁定帳號、跨裝置同步**。

版面（桌機三欄，手機收合）：
- **左：專案資料夾** — 每站「請 AI 撰寫」後，產物（`需求.md`、`game.js`、`介面.html`…）累積進資料夾。
- **右：互動卡** — 讀 AI 對話 → 理解題 → 填空 → 白話 prompt →（部分站）二選一決策。
- **左下：遊戲預覽** — 隨進度長出質感，發布後變成完整可玩遊戲。
- 完成頁：技能牆 → 總複習考試 → 「▶ 玩你做好的遊戲」全螢幕可玩版。

---

## 2. 可複用的設計模式（＝這次最重要的收穫）

### 2.1 Prompt 驗證：從「一條條寫規則」→「讓 AI 判讀」
- **踩的坑**：一開始用「槽位(slot)關鍵字比對」當閘門（每站列 target/behavior 關鍵字）。結果是**規則永遠寫不完**——學生一打亂碼夾雜（`檢1c8 c`）、離題（講小狗）就要再補一條 regex。
- **收斂做法**：**本地只做通用最低門檻（字數 ≥6、不能貼上），其餘（亂碼／離題／語意通不通／方向對不對）全交給 AI 判。** AI 端（`review-sentence.ts`）依「這一步該做的事（stageGoal）＋這款遊戲（gameContext）」判斷，**不要求學生講出術語或檔名**，還會順帶回填「（這在工程上叫做：變數）」。
- **關鍵指令**（寫進 AI system prompt）：明確叫 AI「**不准自己猜／腦補／自動修正**，只要有一段看不懂或像亂打就判不過」，否則它會太善良地把亂碼讀成合理句子。
- **離線降級**：沒有 AI 可呼叫時，退回「夠長＋不是明顯亂打（連續重複字元／英數雜訊 `1c8`／單獨亂字母）」的**通用**檢查，並標「離線練習模式」。這是一條通用規則，不是每站一條。

### 2.2 預覽精準對應 prompt：flags（閘門）vs params（長相）
- **踩的坑**：預覽本來只靠「階段存檔旗標」升級 → 學生會覺得「我說 A，畫面卻不是改 A」。
- **做法**：把預覽狀態拆成兩層：
  - `flags`（`proto/ui/feature/vars/bug/live…`）＝**有沒有這塊功能**（闖關門檻、防作弊）。
  - `params`（`accent/axis/shipKind/score/hp/hiscore…`）＝**這塊長什麼樣**，用 `pickColors()/kw()/gameName()` 從**學生實際 prompt** 抽出來。
- 效果：說「上下移動」船就上下動、控制鈕變 ▲▼；說「只要分數」就只畫分數不畫血量；說「紅色」畫面就紅。**畫面 = 學生說的話**。

### 2.3 防作弊分層（讓「30 秒亂點/亂打」過不了）
1. 理解題：**答錯永久鎖定** + **選項洗牌**（避免「永遠選第一個」變新捷徑）+ 每站 2 題全對才解鎖。
2. 填空：關鍵字（接受中英/同義）。
3. Prompt：字數門檻 + **AI 判方向**（線上）/ 嚴格通用檢查（離線）。
4. 輸入框一律 `blockPaste`（擋貼上/拖放）。
- 心法：**真實化 UX（白話、不逼術語）與防作弊不衝突**，靠「AI 判讀 + 理解題鎖定 + 擋貼上」三者一起守。

### 2.4 真實開發流程結構 + 決策站 + re-prompt 修正
- **對照真實軟體/遊戲開發流程排 15 站**，把老師要的「一開始就要決定的事」補進前段：核心玩法、單人/多人、技術選型(web/框架)、外部資料庫。近義站合併（迭代+出錯、除錯+測試、部署+發布）以維持 15 站與 50–65 分鐘。
- **決策站（二選一按鈕）**：學生的選擇寫進 `S.spec`（`control/players/framework/scoring/cloudScore`），再**流進動態產物（.md）與預覽**。產品取捨「不設對錯鎖」，但理解題仍鎖定。
- **Re-prompt 修正環節**（很受用的真實感）：第一次 prompt 講不夠清楚 → AI **反問**（「你沒說往哪個方向動，要左右還是上下？」）→ 學生補一句才完成。用 `stage.refine = { needs, ask, hint, check }` 定義。這模擬了「和 AI 協作時，第一次指令常常不夠精準要再修」的真實經驗。

### 2.5 逐階段可見產出（progressive build）
- 「每個階段在學習過程中完成一部分」＝ 左側資料夾**檔案累積** + 遊戲預覽**質感逐步長出**（原型線框 → 介面套色+星空 → 功能加會動的船+推進器 → 變數加 HUD → 迭代加難度 → 發布全開）。學生看得到自己一步步把遊戲做出來。

### 2.6 誠實示意（無法真做的概念）
- 單一離線 HTML 無法真的連多人伺服器/接雲端 DB。原則：**用程序化畫面「示意」概念 + 明確標註「今天先做單人/本機示意」**，不假裝可玩。例：多人＝畫半透明第二台船 + caption；資料庫＝用 localStorage 存最高分當「雲端成績簿」。誠實示意 > 假可玩。

### 2.7 專業遊戲質感（單檔、程序化、零外部資源）
- 全部用 Canvas 程序化畫 + WebAudio 即時合成音效，**不依賴任何外部圖片/音檔**（維持單檔、可離線）：三層視差星空、發光太空船+推進器粒子、會旋轉的不規則隕石、撞擊爆炸粒子、畫面震動、無敵閃爍、難度漸增、險閃獎勵、新紀錄。
- 共用引擎：把繪圖/音效抽成模組層 `g*` 函式（`gStars/gDrawAsteroid/gShip/gBurst/Sfx…`），**預覽（showcase）與完整遊戲（play）共用**，避免兩份實作分歧。

### 2.8 帳號綁定：讓「獨立靜態頁」也能綁到 app 帳號
- 遊戲是獨立 HTML，本身不知道誰登入。橋接方式：**同網域 localStorage 共享** → 讀 `localStorage['@session/currentUser']` 拿 userId。
- 用 **Firebase compat CDN**（不能 import app 的 bundle）連 Firestore：
  - 進度存 `gameProgress/{userId}.s5w15`（debounce 800ms）；開場先用本機即時顯示，再從雲端載入，**用 `progressScore()` 比較，雲端較新才採用** → 跨裝置續玩。
  - 金幣寫進帳號真正餘額 `coins/{userId}`，用 **`runTransaction` + rewardId 冪等**（`s5w15_stage_{i}` / `s5w15_exam`），重玩或跨裝置都不會重複刷。
  - 未登入 → 訪客模式，只存本機 + 提示登入。
- **可複用結論**：任何「獨立頁面 / 小工具」要綁 app 帳號，都可走「讀 session localStorage + Firebase CDN + 冪等交易」這條路。

### 2.9 Firestore 安全規則的現實（本專案沒有 Firebase Auth）
- **關鍵事實**：這個 app 用**自訂 localStorage 登入，沒有 Firebase Authentication** → 規則裡 `request.auth` 永遠 null。**任何依賴 `request.auth` 的規則會讓整個 app 無法讀寫。**（當初 spec 那套 `isTeacher()`/`request.auth.uid` 規則其實不能用。）
- 現行規則（[`firestore.rules`](../firestore.rules)）：**非過期**（取代會在 ~30 天後失效的測試模式）、**只開放 app 實際用到的 collection**（含 `users` 子集合、`studentProgress/.../worksheets`、新增 `gameProgress`）、其餘預設拒絕。
- **要真正的 per-user 權限**：得先導入 **Firebase Anonymous Auth**（每 session 一個穩定 uid），再改成 `request.auth.uid == userId`。這是目前最大的技術債。

### 2.10 統一資料模型，避免平行陣列錯位
- 原本 `STAGES / STAGE_VIS / ARTIFACTS / STAGE_COIN` 四個平行陣列靠 index 對齊，重排/新增站時**極易錯位**。收斂為**單一 `STAGES` 物件陣列**（每站帶 term/passage/quiz/taskExample/goal/decision/refine/…），其餘由它衍生。

### 2.11 用多代理審核工作流重新設計
- 這次的大改版是先跑一個 **audit 工作流**：5 個代理各從一個角度審（prompt 真實性 / 開發流程吻合度 / 預覽對應 / 需求完整度 / 教學+防作弊），再由 synthesis 代理整合成可實作規格。**大改版前先讓多個獨立視角審一遍，比一次到位更穩。**

---

## 3. 關鍵檔案地圖

| 檔案 | 作用 |
|------|------|
| `public/games/s5-w15-game-simulator.html` | 整個互動課 + 遊戲（單檔）。內含 STAGES 資料、Account(帳號綁定)、GamePreview(逐步預覽)、PlayGame(完整可玩)、共用 `g*` 繪圖引擎、Sfx 音效、EXAM 考題 |
| `src/pages/api/review-sentence.ts` | AI 批改學生白話 prompt（依 stageGoal 判方向，不逼術語）|
| `src/scripts/registry.ts` / `ScriptPanel.tsx` / `types/Script.ts` | 主頁右側「腳本區」入口（`Script.externalUrl` → 導向遊戲頁）|
| `firestore.rules` / `firebase.json` / `.firebaserc` | Firestore 安全規則（非過期、scoped、無 auth 版）|

Firestore collection：`gameProgress/{userId}`（遊戲進度）、`coins/{userId}`（金幣，與 app/學習單共用）。

---

## 4. 後續／技術債
- [ ] **Firebase Anonymous Auth** → 換上 per-user 嚴格規則（目前最大技術債）。
- [ ] 正式網域 `chat-clone-gpt.vercel.app` 已失效，實際用 `gpt-clone-beta-six.vercel.app`（CLAUDE.md 待更新）。
- [ ] 遊戲音效預設開，行動裝置需使用者手勢後才會出聲（WebAudio 限制）——已在首次 tap 觸發。
- [ ] 若要把「原始 .md 學習單」也備份到 Storage，需另設 Storage rules。

---
> 最後更新：2026-07（由 S5-W15 遊戲開發模擬器的設計/實作過程整理）
