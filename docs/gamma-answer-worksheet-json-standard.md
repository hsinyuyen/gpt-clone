# 答題版學習單 Markdown 匯入標準

目前版本：`schemaVersion: 2`。

答題版學習單改用與原版相同的單一 Markdown 匯入流程。Admin 不需要準備額外 JSON，也不需要 AI 萃取設定；匯入後可直接調整標題、系列／週次、班級、Gamma 網址、題目模組、金幣與讀題小測。

## Markdown 任務格式

每一題使用一個二級「任務」標題。系統會保留從此標題到下一個二級標題前的完整任務區塊。

```markdown
# S3 W02｜課程名稱

## 任務 A｜整理線索（45 金幣）

任務說明與教學內容。

### 完成這一題

- 將資料交給 Lab Terminal 整理。
- 把結果貼進答題卡。

### 完成條件

- 完成文字回答。
```

匯入規則：

- 從 `#` 標題與檔名辨認標題、系列及週次。
- 從 `## 任務 ...（N 金幣）` 擷取題目與金幣。
- 優先使用「完成這一題」，其次使用「完成條件」建立可編輯的題目內容。
- 依任務區塊內的 `Lab Terminal`、`Lab Image`、`Lab Music`、`Lab Video` 預選文字、圖片、音樂、影片模組。
- Markdown 內若有 Gamma 網址會自動帶入；沒有網址仍可儲存草稿。
- 發布前必須填入 `https://gamma.app/docs/...`、`public/...` 或 `embed/...` 網址。
- 匯入新檔時不會沿用其他學習單的題目或 Gamma 網址。

## 讀題小測

新匯入題目的 `readChecks` 預設為空陣列。讀題小測只能由 Admin 手動新增，支援：

- 選擇題或文字題。
- 同一題加入多個小測。
- 上移、下移調整順序。
- 刪除到 0 題。

舊版單一 `readCheck` 仍會自動當成一題處理；明確設定 `readChecks: []` 是合法狀態。

## 審核上下文

新建題目只需要：

- 題目標題 `title`
- 題目內容 `prompt`
- 指定工具 `toolId`
- 預期成果種類 `expectedKind`

新建流程不再產生或要求 `reviewBrief`、`promptReviewCriteria`。舊學習單的這兩個欄位仍可讀取，但只作相容提示，也不在一般 Admin 編輯介面顯示。

文字答案的 AI 審查以題目標題與內容為主要依據。媒體繳交只檢查附件格式與 Lab Terminal 簽章，不再做第二次媒體內容 AI 審查。

## 生成前防濫用

學生送出提示詞時，瀏覽器會先阻擋空白、過短、重複、亂碼、測試字串、空泛生成要求、未完成底線模板及錯誤工具。處罰狀態只保存在瀏覽器 `localStorage`，鍵由 `worksheetId + taskId + tool` 組成，不含學生 ID。

- 第 1 次無效輸入只提示。
- 第 2 次鎖定 5 秒，後續每次增加 5 秒，最高 60 秒。
- 重新整理後仍會恢復剩餘倒數。
- 成功生成或 10 分鐘沒有再犯會清除連錯次數。
- 鎖定期間不呼叫生成 API。

Lab Terminal 通過本地與伺服器基本檢查後直接生成文字，不做額外 AI 初審。Lab Image、Lab Music、Lab Video 會由低成本文字模型比較學生提示詞與伺服器取得的已發布題目；通過後才查快取或呼叫高成本生成服務。初審服務失敗時採 fail-closed。

## 媒體簽章與 Admin 管理

媒體生成成功後，後端會將 `worksheetId`、`taskId`、媒體類型、提示詞與內容雜湊寫入簽章 metadata。簽章系統固定啟用，Admin 介面不提供關閉選項。

每份答題版學習單的「管理生成素材」可：

- 按圖片、音樂、影片查看預覽、檔名、大小、日期、題目、提示詞與簽章狀態。
- 發現索引中遺失但仍存在 Storage 或本機快取的孤兒檔案。
- 單筆刪除、清空單一媒體類型或清空整份學習單。
- 同步更新 Firebase Storage、本機快取與 `index.json`；刪除索引項目也會移除其中的簽章 metadata。

已下載到學生裝置或保存在學生 IndexedDB 的副本無法由 Admin 遠端刪除。

## 舊版相容欄位

下列欄位仍可存在於已儲存的 `gammaAnswerConfig`，但新匯入流程不建立：

- `reviewBrief`
- `promptReviewCriteria`
- `readCheck`（改以 `readChecks` 為主）

`taskId`、`accept`、`uploadLabel`、`reviewCriteria`、`mediaAccessKey`、`storageVersion`、`sessionId` 與簽章資料均由系統建立或保管，不需要寫入 Markdown。
