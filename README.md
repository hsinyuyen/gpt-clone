# gpt-clone — AI 程式教育平台

給國小中高年級（小三～小六）用的繁體中文 AI 學習平台：AI 助理聊天、AI 繪本製作課、學習單、課堂小遊戲、卡牌對戰等。

- **正式站**：https://gpt-clone-beta-six.vercel.app
- **框架**：Next.js 13 + Tailwind CSS + Firebase（Firestore）
- **AI**：OpenAI（聊天/TTS/STT/故事）、Google Gemini（繪本算圖 + AI 審核）

## 快速開始

```bash
git clone https://github.com/hsinyuyen/gpt-clone.git
cd gpt-clone
npm install
cp .env.example .env      # 然後填入金鑰（見下方）
npm run dev               # 開 http://localhost:3000
```

> 套件管理用 **npm**（不是 yarn）。Node 18+。

## 環境變數

複製 `.env.example` 成 `.env` 填值。核心必填：`OPENAI_API_KEY`、`GEMINI_API_KEY`、`MIXPANEL_PROJECT_TOKEN`、`APP_ENV`、`APP_NAME`；其餘為選用功能的金鑰。完整清單與說明見 [.env.example](.env.example)。

- Firebase 前端設定是**寫死**在 `src/lib/firebase.ts`（專案**沒有 Firebase Auth**，改用 localStorage 當 session；Firestore 規則採每個 collection 白名單制）。

## 專案結構（重點）

| 路徑 | 說明 |
| --- | --- |
| `src/pages/api/` | 後端 API（`openai`、`generate-image-gemini`、`review-drawing`、`review-design`、`tts`、`transcribe`…）|
| `src/scripts/` | 對話式腳本（create-avatar、story-helper…）與註冊表 `registry.ts` |
| `src/components/` | UI（Chat、ScriptPanel、Sidebar…）|
| `src/lib/firestore.ts` | Firestore 存取層 |
| `public/courses/` | AI 繪本課（靜態 HTML，如 `l1-character.html`）|
| `public/games/` | 課堂小遊戲（靜態 HTML）|
| `src/pages/admin/` | 老師後台（學習單、班級、可見性設定…）|

## 部署

Vercel（專案 `gpt-clone`，正式站 `gpt-clone-beta-six.vercel.app`）。CLI 部署：

```bash
vercel --prod        # 直接把本機檔案打包上線（不經過 GitHub）
```

環境變數設在 Vercel 專案設定。`.vercelignore` 已排除 `.claude`/`scripts`/`docs`/`nul`/`.env*`。

## 協作流程（版控）

`main` 是正式分支。**不要直接推 `main`**，一律走分支 + PR：

```bash
git checkout main && git pull
git checkout -b feat/你的功能        # 開功能分支
# ...改動、commit...
git push -u origin feat/你的功能
gh pr create --base main             # 開 PR，審核後再 merge
```

- commit 訊息用 `type(scope): 說明`（如 `feat(picturebook): …`、`fix(worksheets): …`）。
- `.env`、`node_modules`、`.next` 都已被 gitignore，不要提交。
