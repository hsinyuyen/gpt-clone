# 課堂遊戲設計範本（以 S2-W03《消失的慶典皇冠》為標竿）

> 這份是「未來開發同類課堂遊戲的完美範本」。標竿實作：
> [`public/games/s2-w03-detective-crown.html`](../public/games/s2-w03-detective-crown.html)（阿問偵探社・第三話）。
> S2 是一款連續章節的偵探社遊戲，每週 fork 前一章引擎再演進，見 memory `s2-series-one-game`。

新開一個週次／新遊戲時，照下面 9 條檢查表做，就能達到同樣的品質。

---

## 1. 每一段文字後面都接「拖拉確認題」——絕不讓玩家一路按過去

**原則**：任何丟給玩家的一段文字（旁白／背景／對話／揭曉）後面都要接一道**拖拉填空題**，答對才放行下一步。這是製造「記憶點」、逼玩家讀進去的核心手法。

**可重用元件**（直接照抄）：
```js
function dragQuiz(mount, dq, onDone){
  // dq = { parts:['字',{blank:'答案'},'字',...], bank:['答案1','答案2','干擾1','干擾2'] }
  // 渲染成一句挖空的話 + 字卡庫；全部拖對才呼叫 onDone()
}
```
- 每題 1–2 個空格；bank = 正解 + 1–2 個干擾字。
- 拖錯 `Sfx.pop()` + 提示「再讀一次上面那段」，不記錄、不放行。
- 全對才 `onDone()`（通常是 `st.xxxDone=true; save(); render()` 或顯示「繼續」鈕）。

**標竿裡套用的位置**（未來每個「有文字的畫面」都要照套）：
| 位置 | 拖拉題內容 |
|---|---|
| 序章每一段（含 tap 對話、gate 選擇後） | 該段旁白＋對話的重點 |
| 審問・讀完開場白 | 這個人一開始說了什麼（逼你讀那段囉唆／過短的話）|
| 審問・讀完揭曉 | 揭曉那句話挖到的關鍵（挑跟章末不同的面向，避免重複）|
| 每個觀察線索・答完觀察題 | 單格快速確認該條線索 |
| 每章故事做完（進破案結果前）| 這一章的整體重點 |
| 全案結尾 | 真相重組（把左欄關鍵字拖回完整真相文本）|

資料自洽檢查：**每個空格的正解都必須在該題 bank 裡**；每個該接題的點都要有對應資料（無漏接）。用 grep / DOM 斷言驗。

## 2. 「要教的概念」本身就是一個活的視覺轉換

不要用文字說明概念，要讓概念**在畫面上動起來**。
- W01：把問題問清楚 → 燈一盞盞亮。
- W02：問對格式 → 線索卡當場變成清單／表格／步驟。
- W03：問對長度 → 太長 = 漸層把字**淹沒**（`.toolong` overflow + 底部 fade）、太短 = **缺一角**（`.tooshort` clip-path）。
教學關讓玩家**診斷**（太長／太短）再**修正**（精簡／補齊），對照組同頁並排。

## 3. 謎題邏輯必須「真的成立」，且各張表不能互相打架

這是這次踩過又修好的重點：
- **不在場證明 = 固定「同一個案發時間」，比較每個人各自在哪、誰能證明**——不是把人排在不同時間（那不叫 alibi）。
- 兩張資訊表要回答**不同問題、彼此不矛盾**：
  - 「大廳看守紀錄」→ 只回答「案發時大廳有沒有人看守」（證明作案時機）。
  - 「不在場證明表」→ 回答「同一時間各嫌疑人在哪」（找出沒人證的那個）。
- **給玩家推理用的資訊，不要叫他瞎猜**：把四個人的供詞先攤出來，玩家讀完再排；排錯給「再看他的供詞」而不是隨機試錯。

開發時務必自問：這個謎題如果一個聰明的小孩認真想，邏輯推得通嗎？兩張表擺一起會不會打架？

## 4. 角色／線索要「提前鋪陳」，不能憑空成為謎題核心

任何要玩家在謎題裡操作的角色，都必須在**之前**就登場過。
- 反例（修掉的 bug）：林主席直到 ch4 時間軸才第一次以名字出現，玩家根本不認識就要排她。
- 正解：ch1 案情先種名字（慶典主席）→ ch4 觀察線索點名她的辦公室 → 審問揭曉再帶到 → 供詞卡正式介紹。**四層鋪陳**，登場才自然。

## 5. 進度與金幣一定要綁帳號（可跨裝置、共用電腦不串號）

照 S2-W03 的 `Account` 模組實作（見 `帳號綁定` 區塊）：
- session 來源：`@session/currentUser`（localStorage/sessionStorage，本專案**沒有 Firebase Auth**，見 memory `no-firebase-auth`）。
- 進度：`gameProgress/{uid}.{gameKey}`（每個遊戲獨立 gameKey，如 `s2w03`）。
- 金幣：`coins/{uid}`，用 `creditCoins(id, amount, reason)` **冪等交易**（同一個 id 只加一次），錢包全系列共用。
- 本機存檔鍵綁 uid：`STORE = 'xxx_progress:' + uid`（共用電腦下一位學生不會繼承上一位）。
- 開機 `boot()` 讀雲端，用 `progressScore()` 比大小 reconcile，取進度較前者。

## 6. 掛進課程 = 建一份 worksheet 文件（Firestore，不是程式碼）

遊戲型 worksheet 是 `worksheets` collection 的文件（**管理 UI 的新增表單不含遊戲欄位，要另外寫**）：
- 關鍵欄位：`externalGameUrl`（如 `/games/s2-w03-detective-crown.html`）、`gameKey`（如 `s2w03`）、`semester`、`week`、`isPublished`。
- 系列可見性：`classIds:[]` 留空，靠 `system/seriesVisibility.map[semester] = [classId...]` 放行；同系列新 worksheet 只要 `isPublished:true` 就自動出現（見 memory `worksheet-series-visibility`、`worksheet-doc-fields`）。
- 文件 id 慣例：`ws_s2_w03`。學生頁 `src/pages/worksheets/index.tsx` 讀 `externalGameUrl` 直接開遊戲、讀 `gameProgress[gameKey]` 顯示進度。

## 7. 不提供「跳過」

用第 1 條的拖拉題卡住每一段來確保投入，**不要放跳過鈕**（連老師／測試用的也在正式版拿掉）。學生卡關靠自適應提示，不是跳過。

## 8. 驗證方式（這款動畫 canvas 遊戲的實務）

- **截圖會 timeout**（畫面持續動畫）→ 改用 DOM 斷言 + `read_console_messages` 抓錯（見 memory `canvas-game-preview-testing`）。
- **拖放測試**用真實 `PointerEvent`（pointerdown→move→up）；`dnd` 用 `elementFromPoint` 判落點，所以**要先 `slot.scrollIntoView({block:'center'})` 把空格捲進視窗**，否則座標在視窗外抓不到落點（測試假象，非 bug）。
- 資料自洽用 grep / 小腳本：每個空格正解都在 bank、每個該接題的點都有資料。
- 存檔／worksheet 這種 Firestore 資料，用 client SDK 寫一次性 `.mjs`（放**專案內**才 resolve 得到 `firebase`）讀取確認，用完刪除、不進 commit。

## 9. 美術與精準內容

- AI 生圖：**不用 emoji、要真實圖片**；場景圖 16:9（1344×768），近照 1:1。
- AI 畫不準的東西（**精確時鐘時間、中文字、表格**）一律改用**程式畫**（SVG 時鐘 `svgClock`、HTML 表格如看守紀錄／祈福牌），保證跟題目 100% 對得上。

---

## 一句話總結

> **每段文字都要有互動記憶點、要教的概念要變成看得見的動態、謎題邏輯要真的成立、角色要提前鋪陳、進度金幣綁帳號、不給跳過。** 照這六件事做，就是這次的完美範本。
