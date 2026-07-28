# S3-W01 題目答題版 MVP 上線接口

對應頁面：`/courses/gamma-mixed-worksheet-demo.html`

## 掛入方式

基本網址：

```text
/courses/gamma-mixed-worksheet-demo.html
```

基本網址會預設載入：

```text
https://gamma.app/docs/S3-W01-hixa52whtzl6aas
```

載入正式 Gamma：

```text
/courses/gamma-mixed-worksheet-demo.html?gamma=https%3A%2F%2Fgamma.app%2Fdocs%2F...
```

`gamma` 參數會覆寫預設 GAMMA。

覆寫 Lab API base：

```text
/courses/gamma-mixed-worksheet-demo.html?apiBase=/api/lab-tools
```

個別覆寫 API：

```text
?textEndpoint=/api/lab-tools/text
?imageEndpoint=/api/lab-tools/image
?musicEndpoint=/api/lab-tools/music
?videoEndpoint=/api/lab-tools/video
```

也支援：

```text
?endpoint.terminal=/api/lab-tools/text
?endpoint.image=/api/lab-tools/image
?endpoint.music=/api/lab-tools/music
?endpoint.video=/api/lab-tools/video
```

## Lab API Request

四種工具都用 `POST`，body 為 JSON：

```json
{
  "task": "任務標題",
  "prompt": "學習單指定提示詞",
  "duration": 5,
  "durationMs": 30000
}
```

`duration` 只給影片；`durationMs` 只給音樂。

## Lab API Response

文字：

```json
{ "success": true, "kind": "text", "text": "3 點文字提醒" }
```

圖片：

```json
{ "success": true, "kind": "image", "imageUrl": "data:image/png;base64,..." }
```

音樂：

```json
{ "success": true, "kind": "music", "audioUrl": "data:audio/mpeg;base64,..." }
```

影片：

```json
{ "success": true, "kind": "video", "videoUrl": "https://..." }
```

影片若仍在處理中可回：

```json
{
  "success": true,
  "kind": "video",
  "status": "processing",
  "videoId": "provider-task-id",
  "message": "影片已送出生成，仍在處理中。"
}
```

## iframe / parent 事件

頁面掛在 iframe 時，會對 parent 發送 `postMessage`：

```ts
type S3W01Event = {
  source: 's3-w01-gamma-mvp';
  type:
    | 'ready'
    | 'questionChange'
    | 'toolChange'
    | 'attachment:add'
    | 'attachment:upload'
    | 'attachment:remove'
    | 'demoResult'
    | 'apiResult'
    | 'review'
    | 'save';
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

`exportState()` 回傳目前四題文字、附件 metadata、審查結果與完成數。

## 上線注意

- 若只用 `file://` 開頁面，Lab API 不會呼叫，會走示範成果。
- 若要呼叫 `/api/lab-tools/*`，必須用 Next server 或正式站台部署，不能只丟靜態 HTML。
- 目前附件只保存 metadata / object URL；正式保存需要由協作端接 Firebase Storage 或等價儲存。
- 正式環境需要後端環境變數：`OPENAI_API_KEY`、`ELEVENLABS_API_KEY`、`SEEDANCE_API_KEY`。
- `gamma` 需要可被 iframe embed 的 GAMMA URL；若 GAMMA 禁止嵌入，左側 iframe 會由瀏覽器顯示 provider 的錯誤狀態，不再使用內建題目卡 fallback。
