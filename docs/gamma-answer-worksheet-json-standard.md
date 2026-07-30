# 答題版學習單 Markdown JSON 建置標準

目前標準：`schemaVersion: 2`。

學習單 `.md` 尾部固定放一段 `LAB_TERMINAL_WORKSHEET_CONFIG`。這段 JSON 只做題目設計與最小審核設定，不要放整份 GAMMA 內容，也不要放 Lab Tool 的完整提示詞。

## 固定格式

````markdown
<!-- LAB_TERMINAL_WORKSHEET_CONFIG_START -->
```json
{
  "schemaVersion": 2,
  "worksheetType": "gamma-answer",
  "id": "S3W02",
  "title": "S3 W02｜重點找出與提示詞生成",
  "shortTitle": "S3 W02",
  "semester": "S3",
  "week": 2,
  "gammaUrl": "https://gamma.app/docs/xxxxx",
  "questions": []
}
```
<!-- LAB_TERMINAL_WORKSHEET_CONFIG_END -->
````

## Top-Level 欄位

| 欄位 | 必填 | 型別 | 說明 |
| --- | --- | --- | --- |
| `schemaVersion` | 是 | number | 固定 `2`。 |
| `worksheetType` | 是 | string | 固定 `gamma-answer`。 |
| `id` | 是 | string | 學習單 ID，例如 `S3W02`。 |
| `title` | 是 | string | 學習單完整標題。 |
| `shortTitle` | 建議 | string | 列表短標題，例如 `S3 W02`。 |
| `semester` | 是 | string | 課程階段，例如 `S3`。 |
| `week` | 是 | number | 週次，例如 `2`。 |
| `gammaUrl` | 是 | string | GAMMA 分享或 embed 連結。 |
| `questions` | 是 | array | 題目列表，至少 1 題。 |

## Question 欄位

| 欄位 | 必填 | 型別 | 說明 |
| --- | --- | --- | --- |
| `id` | 是 | string | 題目 ID，例如 `q1`。 |
| `title` | 是 | string | 題目標題。 |
| `module` | 是 | string | `text`、`image`、`audio`、`video`。 |
| `coins` | 是 | number | 通過後給學生的金幣數。 |
| `prompt` | 是 | string | 學生答題區看到的短題目。 |
| `needsAiReview` | 是 | boolean | `false` 只做資料驗證；`true` 先防呆再送 AI 審查。 |
| `reviewBrief` | 是 | object | 單題審核摘要。 |

## 文字題資料驗證欄位

只有 `module: "text"` 且 `needsAiReview: false` 時才需要。沒有填也可以，系統會使用基本字數檢查。

| 欄位 | 必填 | 型別 | 說明 |
| --- | --- | --- | --- |
| `reviewPreset` | 選填 | string | 建議 `text-keywords`、`text-length`、`text-three-points`。 |
| `strictness` | 選填 | string | `loose`、`normal`、`strict`。 |
| `requiredConcepts` | 選填 | string[] | 文字答案需要命中的關鍵概念。 |
| `minimumKeywordMatches` | 選填 | number | 至少命中幾個關鍵概念。 |
| `minLength` | 選填 | number | 最少字數。 |
| `maxLength` | 選填 | number | 最多字數。 |

## reviewBrief 欄位

| 欄位 | 必填 | 型別 | 說明 |
| --- | --- | --- | --- |
| `task` | 是 | string | 這題要完成的任務，一句話即可。 |
| `expectedOutput` | 是 | string | 合格答案或檔案應具備的結果。 |
| `mustInclude` | 是 | string[] | 必須包含的條件，建議 3-5 個。 |
| `rejectIf` | 是 | string[] | 不通過的情況，建議 3-5 個。 |

## AI 審查規則

- `needsAiReview: false`：不呼叫 AI，只做資料驗證。
- `needsAiReview: true`：先檢查基本資料，例如是否有檔案、檔案類型是否正確；通過後才送 AI。
- 不要在 `.md` JSON 手寫 `aiReviewMode`，這是系統內部欄位。

## 範例

```json
{
  "schemaVersion": 2,
  "worksheetType": "gamma-answer",
  "id": "S3W02",
  "title": "S3 W02｜重點找出與提示詞生成",
  "shortTitle": "S3 W02",
  "semester": "S3",
  "week": 2,
  "gammaUrl": "https://gamma.app/docs/xxxxx",
  "questions": [
    {
      "id": "q1",
      "title": "找出提示詞重點",
      "module": "text",
      "coins": 80,
      "prompt": "請根據 GAMMA 的範例，寫出這段提示詞中最重要的 3 個要求。",
      "needsAiReview": false,
      "reviewPreset": "text-keywords",
      "requiredConcepts": ["角色", "場景", "風格", "限制"],
      "minimumKeywordMatches": 3,
      "minLength": 30,
      "maxLength": 220,
      "reviewBrief": {
        "task": "學生要列出提示詞中的重點要求。",
        "expectedOutput": "文字答案需包含至少 3 個與題目相關的重點。",
        "mustInclude": ["至少 3 個重點", "內容與 GAMMA 題目相關", "不可只複製題目"],
        "rejectIf": ["答案空白", "只貼題目文字", "內容與題目無關"]
      }
    },
    {
      "id": "q2",
      "title": "生成相識紀念音樂",
      "module": "audio",
      "coins": 100,
      "prompt": "請用 Lab Music 生成一段溫暖、開心、有吉他與明亮鋼琴的音樂，並上傳音樂檔。",
      "needsAiReview": true,
      "reviewBrief": {
        "task": "學生要上傳符合提示詞的相識紀念音樂。",
        "expectedOutput": "音樂應有溫暖、開心的感覺，並包含吉他、明亮鋼琴或鈴聲等元素。",
        "mustInclude": ["音樂檔案", "溫暖或開心風格", "吉他、鋼琴或鈴聲元素"],
        "rejectIf": ["沒有音樂檔", "恐怖或沉重風格", "明顯有人聲歌詞"]
      }
    }
  ]
}
```

## 不要放入 `.md` JSON

- `taskId`
- `toolId`
- `toolPrompt`
- `accept`
- `uploadLabel`
- `reviewCriteria`
- `aiReviewMode`
- `mediaAccessKey`
- `storageVersion`
- `classIds`
- `isPublished`
