# 協作指南 CONTRIBUTING

歡迎加入 `gpt-clone`！這份文件是**協作的標準流程**。先讀 [README.md](README.md) 把環境跑起來，再照這裡的流程開發。

## 環境設定（一次性）

```bash
git clone https://github.com/hsinyuyen/gpt-clone.git
cd gpt-clone
npm install
cp .env.example .env      # 跟專案負責人拿金鑰填進去（金鑰不會進版控）
npm run dev               # http://localhost:3000
```

## 分支與 PR 流程（一律照走）

**不要直接 push `main`。** `main` 是正式分支，只能透過 PR 合併。

```bash
git checkout main && git pull            # 先同步最新
git checkout -b <type>/<簡短描述>          # 例：feat/l2-story、fix/coin-race
# ...開發、commit（可多顆）...
git push -u origin <你的分支>
gh pr create --base main                 # 開 PR，等負責人 review 後 merge
```

- 分支命名：`feat/…`（新功能）、`fix/…`（修 bug）、`chore/…`（雜項/設定）、`docs/…`（文件）。
- **一個 PR 做一件事**，小而聚焦，好 review。
- PR 由**專案負責人 review 後合併**（見 `.github/CODEOWNERS`）；合併後刪掉該分支。

## Commit 訊息

用 `type(scope): 說明`（中文可）：

```
feat(picturebook): L2「你的故事」逐頁編故事
fix(worksheets): 修正金幣重複入帳
chore(ci): 加 typecheck workflow
```

常用 type：`feat` / `fix` / `chore` / `docs` / `refactor` / `test`。

## 開 PR 前的自檢（**每次都要**）

1. `npx tsc --noEmit` 沒有型別錯誤。
2. `npm run build` 能過（會跑 lint）。
3. **實際跑過**你改的東西（`npm run dev`，或對應的遊戲/學習單頁面實測一輪）——不要只看程式。
4. **沒有把任何金鑰/密碼 commit 進去**（見 [SECURITY.md](SECURITY.md)）。
5. 如果新增了 Firestore collection：**同步更新 `firestore.rules`**（否則預設拒絕，功能會壞）。

## 程式風格

- TypeScript **strict mode**；偏好 functional components + hooks；`async/await` 不用 `.then()`；2 空格縮排。
- 前端 Next.js 13 + Tailwind；後端資料 Firebase（Firestore）。
- 目標客群是國小學生、介面繁體中文；低年級內容要**注音、圖示不用 emoji、真實圖片**。
- 單檔 canvas 遊戲放 `public/games/`；繪本課放 `public/courses/`（都是自包含 HTML）。

## 部署

正式站在 **Vercel**（`vercel --prod`，直接打包本機檔案上線，不經 GitHub）。**只有專案負責人部署**；協作者透過 PR 進 `main`，不要自行 `vercel --prod`。

## 有問題？

開 issue 或直接問專案負責人。安全相關**不要開公開 issue**，見 [SECURITY.md](SECURITY.md)。
