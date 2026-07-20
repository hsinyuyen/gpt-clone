# 安全政策 SECURITY

## 回報安全問題

發現漏洞或安全疑慮，**不要開公開 issue / PR**。請**私下**直接聯絡專案負責人（GitHub `@hsinyuyen`）並附上重現步驟。修好前請勿公開。

## 密鑰管理（最重要）

- **絕對不要把任何密鑰 commit 進版控**：OpenAI / Gemini / Pixellab / Mixpanel 等 API key、密碼、token。
- 真金鑰只放在**本機 `.env`**（已被 `.gitignore` 排除）與 **Vercel 專案環境變數**。版控裡只有 `.env.example`（範本，沒有真值）。
- 需要的變數清單見 [.env.example](.env.example)。跟專案負責人索取真值。
- **萬一不小心 commit 了金鑰**：立刻通知負責人 → 到該服務後台**撤銷/輪替那把金鑰** → 再清 git 歷史。光是刪檔沒用，金鑰一旦推上去就要當作已洩漏。

### Firebase 前端 config 不是密鑰
`src/lib/firebase.ts` 與各遊戲 HTML 裡硬寫的 `apiKey: "AIzaSy…"` 是 Firebase **前端公開設定**（web app 本來就會出現在 client，Google 官方設計如此）。它**不是秘密**，把關靠的是 Firestore 規則，不是藏這把 key。不用把它當洩漏處理。

## 資料/存取模型（**協作者必讀，目前是刻意的取捨**）

- 本 app **沒有** Firebase Authentication，改用 `localStorage` 的自訂 session（`@session/currentUser`）。所以 Firestore 規則裡 `request.auth` 永遠是 `null`。
- 因此 [firestore.rules](firestore.rules) 採**每個 collection 白名單**：app 有用到的 collection 開 `read, write: if true`，其餘一律預設拒絕。
- **這代表**：只要知道 collection 名稱，任何 client 都能讀寫那些 collection——**不是** per-user 隔離。這是針對「低敏感度的國小教育 app」目前的權衡（存的資料僅：暱稱、學習進度、金幣、遊戲進度等）。
- **紅線**：因為規則是開放的，**不要把真正敏感的資料放進 Firestore**（個資、金流、密碼、可識別的兒童敏感資訊都不要）。
- **升級路徑**：要做到「每人只能改自己的資料」，需先導入 Firebase **Anonymous Auth**（每個 session 一個穩定 uid）再改成 per-user 規則。規則檔頂部有註記，要升級再跟負責人討論。

## 改動 Firestore 規則

- 新增 collection → **一定要同步更新 `firestore.rules`**（否則預設拒絕，功能會壞）。
- 改規則前先想清楚：不要把某個 collection 改成能被濫用（例如允許刪除他人資料）。規則變動要在 PR 裡講清楚。

## 相依套件

- 定期更新相依套件；建議在 GitHub 開啟 **Dependabot 警示**（Settings → Code security）。
- 加新套件前先看 star/維護狀況，避免引入來路不明的套件。

## GitHub 儲存庫的安全設定（由負責人設定，見 [CONTRIBUTING.md](CONTRIBUTING.md) 與 `.github/`）

- `main` 開啟**分支保護**：需 PR + 至少 1 個 approve 才能合併、禁止直接 push。
- 開啟 **Secret scanning + Push protection**（自動擋住把金鑰推上去）。
- 協作者用 **Write** 權限邀請即可，不要給 Admin。
