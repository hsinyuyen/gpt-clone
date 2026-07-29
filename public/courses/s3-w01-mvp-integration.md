# S3-W01 GAMMA 答題版 MVP 規格

對應頁面：`/courses/gamma-mixed-worksheet-demo.html`

本規格以目前實作為準，用於 S3W01 學習單 MVP 測試。流程必須模擬學生實際上機：從主頁進入學習單，選擇 S3W01，閱讀左側 GAMMA，再回 Lab Terminal 主頁產出文字、圖片、音樂或影片。

## 入口流程

1. 學生從主頁 `/` 進入。
2. 進入學習單列表 `/worksheets`。
3. 點選 S3W01 MVP 入口。
4. 開啟 `/courses/gamma-mixed-worksheet-demo.html`。
5. 左側顯示 GAMMA，右側顯示 Lab Terminal 答題面板。
6. 學生需要產出內容時，可回主頁 `/` 使用 Lab Terminal。

主頁 Lab Terminal 的媒體生成權限只在 S3W01 學習單開啟期間開放：

```txt
localStorage key: lab-terminal:s3w01-media-access
worksheetId: S3W01
status: open
```

當 S3W01 全部題目完成後，頁面會收回圖片、音樂、影片生成權限；文字工具仍維持原本 Lab Terminal 使用方式，不走預先保存機制。

## GAMMA 載入

預設 GAMMA：

```txt
https://gamma.app/docs/S3-W01-hixa52whtzl6aas
```

頁面網址：

```txt
/courses/gamma-mixed-worksheet-demo.html
```

可用 `gamma` 覆寫：

```txt
/courses/gamma-mixed-worksheet-demo.html?gamma=https%3A%2F%2Fgamma.app%2Fdocs%2F...
```

`gamma` 需要是可被 iframe embed 的 GAMMA URL。若 GAMMA provider 禁止 iframe，瀏覽器會顯示 provider 錯誤狀態；目前不再使用內建題目卡作為 GAMMA fallback。

## 題目與作答型態

| 題目 | 工具 | 產出 | 作答 UI |
| --- | --- | --- | --- |
| 第 1 題 | Lab Terminal | 文字 | 只顯示文字輸入框，不顯示檔案上傳 |
| 第 2 題 | Lab Image | 圖片 | 只顯示附件區，不顯示文字輸入框 |
| 第 3 題 | Lab Music | 音樂 | 只顯示附件區，不顯示文字輸入框 |
| 第 4 題 | Lab Video | 影片 | 只顯示附件區，不顯示文字輸入框 |

右側題目區只保留可對應 GAMMA 目錄的簡短資訊，不再顯示詳細目標與對照說明。題目標題套用發光字體效果；每題通過時顯示彩帶，全部完成時顯示更強的彩帶效果。

## Lab API Request

四種工具都使用 `POST` JSON。

共用欄位：

```json
{
  "task": "任務標題",
  "prompt": "學生提示詞",
  "worksheetId": "S3W01"
}
```

音樂額外欄位：

```json
{
  "durationMs": 30000
}
```

影片額外欄位：

```json
{
  "duration": 5,
  "videoId": "provider-operation-id",
  "fallbackOnly": false
}
```

`videoId` 用於輪詢已送出的 Veo operation。`fallbackOnly: true` 用於學生等待逾時後，先回傳本機保存影片，同時讓原影片在背景繼續等待並保存。

## Lab API Endpoints

```txt
POST /api/lab-tools/text
POST /api/lab-tools/image
POST /api/lab-tools/music
POST /api/lab-tools/video
GET  /api/lab-tools/asset
```

可透過 query 覆寫 endpoint：

```txt
?textEndpoint=/api/lab-tools/text
?imageEndpoint=/api/lab-tools/image
?musicEndpoint=/api/lab-tools/music
?videoEndpoint=/api/lab-tools/video
```

也支援：

```txt
?endpoint.terminal=/api/lab-tools/text
?endpoint.image=/api/lab-tools/image
?endpoint.music=/api/lab-tools/music
?endpoint.video=/api/lab-tools/video
```

## API Provider

| 工具 | Provider | Key |
| --- | --- | --- |
| 文字 | OpenAI Chat Completion | `OPENAI_API_KEY` |
| 圖片 | Nano Banana image model via Google Generative Language API | `NANO_BANANA_API_KEY` |
| 音樂 | ElevenLabs Music API | `ELEVENLABS_API_KEY` |
| 影片 | Veo via Google Generative Language API | `NANO_BANANA_API_KEY` |

目前圖片與影片都會連到 `generativelanguage.googleapis.com`，原因是 Nano Banana 與 Veo 目前走 Google Generative Language API 介面；這不是額外使用 Gemini key，而是使用同一組 `NANO_BANANA_API_KEY`。

可調整環境變數：

```txt
LAB_TEXT_MODEL=gpt-4o-mini
LAB_NANO_BANANA_IMAGE_MODEL=gemini-2.5-flash-image
LAB_VEO_MODEL=veo-3.1-generate-preview
ELEVENLABS_MUSIC_MODEL=music_v1
```

## 快取與重用規則

媒體內容會先保存到本機專案目錄，並同步到 Firebase Storage：

```txt
.lab-tool-cache/{WORKSHEET_ID}/{image|music|video}/
Firebase Storage: lab-tool-cache/{WORKSHEET_ID}/{image|music|video}/{fileName}
```

每種媒體都有本機 `index.json`，並同步一份 Firestore index：

```txt
Primary:  labToolCache/{WORKSHEET_ID}/kinds/{kind}
Fallback: system/labToolCache_{WORKSHEET_ID}_{kind}
```

目前遠端 Firestore rules 尚未開放 `labToolCache` collection 時，會寫入 `system/labToolCache_S3W01_{kind}`；部署新版 `firestore.rules` 後，正式路徑也會可用。

index entry 記錄：

```json
{
  "prompt": "原始提示詞",
  "normalizedPrompt": "正規化後提示詞",
  "fileName": "保存檔名",
  "mimeType": "內容類型",
  "size": 1024000,
  "storagePath": "lab-tool-cache/S3W01/image/1785....png",
  "downloadUrl": "https://firebasestorage.googleapis.com/...",
  "createdAt": "ISO 時間",
  "syncedAt": "ISO 時間"
}
```

目前保存上限：

| 類型 | 預設數量 | 環境變數 |
| --- | ---: | --- |
| 圖片 | 10 | `LAB_IMAGE_CACHE_LIMIT` |
| 音樂 | 3 | `LAB_MUSIC_CACHE_LIMIT` |
| 影片 | 5 | `LAB_VIDEO_CACHE_LIMIT` |

相似提示詞判斷：

- 會先做 Unicode NFKC 正規化。
- 會轉小寫。
- 會移除標點符號、空白與非文字數字符號。
- 使用 bigram overlap 計算相似度。
- 門檻為 `0.72`。

重用規則：

1. 快取數量未達該類型指定數量時，會優先呼叫 API 生成並保存。
2. 快取數量達指定數量後，若學生輸入相似提示詞，會隨機回傳一個符合相似門檻的保存素材。
3. 若 API 出現可恢復錯誤，例如 quota、rate limit、billing、401、permission，會進入 provider cooldown。
4. cooldown 期間若已有保存素材，會回傳本機保存素材。
5. 文字工具不套用媒體快取規則，維持原本 Lab Terminal 文字生成習慣。

可選擇影片快取滿額後直接跳過 API：

```txt
LAB_VIDEO_SKIP_API_WHEN_CACHE_READY=true
```

預設為 `false`，代表仍會嘗試 API；只有相似命中、cooldown、錯誤或逾時 fallback 時才回保存影片。

## API Response

文字：

```json
{
  "success": true,
  "kind": "text",
  "text": "整理後的文字"
}
```

圖片：

```json
{
  "success": true,
  "kind": "image",
  "cached": false,
  "imageUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=image&file=...",
  "downloadUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=image&file=...",
  "fileName": "1785....png",
  "provider": "nano-banana"
}
```

音樂：

```json
{
  "success": true,
  "kind": "music",
  "cached": false,
  "audioUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=music&file=...",
  "downloadUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=music&file=...",
  "fileName": "1785....mp3"
}
```

影片生成中：

```json
{
  "success": true,
  "kind": "video",
  "status": "processing",
  "videoId": "provider-operation-id",
  "provider": "veo",
  "message": "Video generation is still processing."
}
```

影片完成：

```json
{
  "success": true,
  "kind": "video",
  "cached": false,
  "videoUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=video&file=...",
  "downloadUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=video&file=...",
  "fileName": "1785....mp4",
  "videoId": "provider-operation-id",
  "provider": "veo"
}
```

快取命中：

```json
{
  "success": true,
  "kind": "image",
  "cached": true,
  "similarityScore": 0.86,
  "imageUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=image&file=...",
  "downloadUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=image&file=...",
  "fileName": "1785....png",
  "cacheCount": 10,
  "cacheLimit": 10,
  "cacheMatchCount": 3
}
```

逾時 fallback：

```json
{
  "success": true,
  "kind": "video",
  "cached": true,
  "fallback": true,
  "fallbackReason": "timeout",
  "videoUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=video&file=...",
  "downloadUrl": "/api/lab-tools/asset?worksheetId=S3W01&kind=video&file=...",
  "backgroundTracking": true,
  "backgroundVideoId": "provider-operation-id"
}
```

## Asset 下載

`/api/lab-tools/asset` 讀取已保存素材。

讀取順序：

1. 先讀目前 server 的 `LAB_TOOL_CACHE_ROOT` / `.lab-tool-cache`。
2. 若本機檔案不存在，讀 Firestore index。
3. 若本機檔案不存在，API 會使用 index 的 `downloadUrl` 轉址到 Firebase Storage。

這樣 Vercel / 正式部署環境即使沒有本機 `.lab-tool-cache`，仍可透過 Firebase Storage 正常預覽、播放與下載。大型影片不會經過 Next API 代理回傳，避免部署後遇到 API response size 限制。

```txt
/api/lab-tools/asset?worksheetId=S3W01&kind=image&file=1785.png
```

若需要瀏覽器下載而不是 inline 預覽，加入：

```txt
download=1
```

```txt
/api/lab-tools/asset?worksheetId=S3W01&kind=music&file=1785.mp3&download=1
```

前端對圖片、音樂、影片都需要顯示下載按鈕；音樂與影片也需要播放按鈕。

## 學習單存檔

存檔採「本機暫存保底 + Firestore 同步」。

Firestore 路徑：

```txt
studentProgress/{studentId}/worksheets/S3W01
```

主要欄位：

```txt
mvpDraft
studentId
studentName
worksheetId
courseId
semester
week
classId
lastUpdatedAt
```

`mvpDraft` 內容包含：

```txt
version
courseId
activeIndex
activeQuestionId
questions[]
completedCount
exportedAt
savedAt
source
reason
```

本機暫存 key 需依學生分開：

```txt
s3-w01-gamma-mvp:{STORAGE_VERSION}:{studentId}:{questionId}
```

目前版本：

```txt
v21-reset-progress-20260728
```

讀取策略：

1. 開頁先清除舊版 S3W01 本機暫存。
2. 嘗試從 Firestore 讀取同版本 `mvpDraft`。
3. Firestore 讀取超過 2200ms 時，先使用本機暫存。
4. 若本機暫存比 Firestore 新，保留本機暫存並稍後同步。
5. Firestore 寫入超過 5000ms 時，不阻塞學生操作，保留本機暫存。

附件注意事項：

- Firestore 只保存附件 metadata 與可下載 URL。
- 不保存大型圖片、音樂、影片二進位內容。
- `data:` 與 `blob:` URL 不寫入 Firestore。
- 正式跨裝置保存檔案本體時，需改接 Firebase Storage 或等價檔案儲存。

## AI 審核

目前 MVP 的 AI 審核是前端本機規則檢查，不呼叫外部 AI API。

通過條件依題型判斷：

- 文字題：文字內容需符合題目要求。
- 圖片題：需有圖片附件，或內容能被辨識為圖片生成結果。
- 音樂題：需有音訊附件，或內容能被辨識為音樂生成結果。
- 影片題：需有影片附件，或內容能被辨識為影片生成結果。

每題通過會：

1. 保存 review 結果。
2. 同步 Firestore。
3. 更新題目完成狀態。
4. 顯示單題彩帶。
5. 自動切到下一題。

全部完成會：

1. 顯示完整完成彩帶。
2. 收回 S3W01 media access。
3. 同步 Firestore 完成狀態。

## iframe / parent 事件

頁面掛在 iframe 時，會對 parent 發送 `postMessage`：

```ts
type S3W01Event = {
  source: 's3-w01-gamma-mvp';
  type:
    | 'ready'
    | 'questionChange'
    | 'toolChange'
    | 'toolHome'
    | 'attachment:add'
    | 'attachment:upload'
    | 'attachment:remove'
    | 'demoResult'
    | 'apiResult'
    | 'review'
    | 'save'
    | 'firestoreSave'
    | 'complete';
  detail: Record<string, unknown>;
  at: string;
};
```

父層接法：

```js
window.addEventListener('message', (event) => {
  if (event.data?.source !== 's3-w01-gamma-mvp') return;
  console.log(event.data.type, event.data.detail);
});
```

## 同頁 JS API

若與頁面同源且可直接操作 child window：

```js
const api = iframe.contentWindow.S3W01_MVP;
api.exportState();
api.switchQuestion(2);
api.reviewCurrentAnswer();
api.runToolOrDemo();
```

`exportState()` 回傳目前四題文字、附件 metadata、審查結果、完成數與目前題目位置。

## 上線注意

- 若只用 `file://` 開頁面，Lab API 不會呼叫，會走示範成果。
- 若要呼叫 `/api/lab-tools/*`，必須使用 Next server 或正式站台部署。
- `.lab-tool-cache/` 是本機生成素材快取，不應提交 Git。
- 上線環境不能依賴 `.lab-tool-cache/` 本機檔案；必須先同步到 Firebase Storage + Firestore index。
- 正式環境需要設定 `OPENAI_API_KEY`、`NANO_BANANA_API_KEY`、`ELEVENLABS_API_KEY`。
- 圖片與影片目前共用 `NANO_BANANA_API_KEY`，但呼叫不同模型。
- 文字工具不使用媒體快取，保持學生原本 Lab Terminal 文字生成習慣。
