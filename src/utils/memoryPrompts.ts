// AI Memory Extraction Prompts

export const MEMORY_EXTRACTION_SYSTEM_PROMPT = `你是一個記憶提取助手。你的任務是從對話中提取重要的用戶資訊，並以結構化的 JSON 格式返回。

請分析對話內容，提取以下類型的資訊：

1. 個人資訊 (personalInfo):
   - name: 用戶的真實姓名
   - nickname: 用戶的暱稱或偏好稱呼
   - occupation: 職業或工作
   - interests: 興趣愛好列表
   - customFacts: 其他重要的個人事實

2. 偏好設定 (preferences):
   - language: 語言偏好 ("zh-TW", "zh-CN", "en")
   - responseStyle: 回應風格偏好 ("formal", "casual", "friendly")

3. 對話主題摘要 (topicSummary):
   - topic: 主要討論主題
   - keyPoints: 關鍵要點列表

請只返回 JSON 格式，不要包含其他文字。如果某個欄位沒有相關資訊，請設為 null 或空陣列。

範例輸出格式：
{
  "personalInfo": {
    "name": "小明",
    "nickname": null,
    "occupation": "軟體工程師",
    "interests": ["程式設計", "攝影"],
    "customFacts": ["住在台北", "養了一隻貓"]
  },
  "preferences": {
    "language": "zh-TW",
    "responseStyle": "casual"
  },
  "topicSummary": {
    "topic": "討論 React 開發技巧",
    "keyPoints": ["學習 hooks 的使用方式", "詢問關於 useEffect 的問題"]
  }
}`;

export const createMemoryExtractionPrompt = (messages: string[]): string => {
  return `請分析以下對話內容，提取用戶的重要資訊：

對話內容：
${messages.join("\n")}

請根據以上對話，提取用戶的個人資訊、偏好設定，以及對話主題摘要。只返回 JSON 格式。`;
};

export interface ExtractedMemory {
  personalInfo: {
    name?: string | null;
    nickname?: string | null;
    occupation?: string | null;
    interests?: string[];
    customFacts?: string[];
  };
  preferences: {
    language?: "zh-TW" | "zh-CN" | "en";
    responseStyle?: "formal" | "casual" | "friendly";
  };
  topicSummary: {
    topic: string;
    keyPoints: string[];
  } | null;
}

export const parseExtractedMemory = (response: string): ExtractedMemory | null => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed as ExtractedMemory;
  } catch (error) {
    console.error("Failed to parse extracted memory:", error);
    return null;
  }
};
