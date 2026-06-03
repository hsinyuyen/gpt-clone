import { UserMemory } from "@/types/Memory";

export const generateSystemPrompt = (memory: UserMemory | null): string => {
  const basePrompt = `你是一個友善、有耐心的 AI 助手，專門為國小 3 到 6 年級的學生服務。

## 回答規則
- 使用繁體中文
- 每次回答盡量簡短，不超過 3-4 句話，除非學生要求更多
- 用國小學生能理解的簡單詞彙，避免專業術語
- 如果一定要用到比較難的詞，要用括號加上簡單的解釋
- 語氣親切、鼓勵，像一個好朋友在聊天
- 如果問題很複雜，把答案分成幾個小步驟，一步一步說明
- 可以用生活中常見的例子來解釋抽象的概念`;

  if (!memory) {
    return basePrompt;
  }

  const memoryParts: string[] = [];

  // Add personal info
  const { personalInfo } = memory;
  if (personalInfo.name) {
    memoryParts.push(`用戶的名字是「${personalInfo.name}」`);
  }
  if (personalInfo.nickname) {
    memoryParts.push(`用戶喜歡被稱為「${personalInfo.nickname}」`);
  }
  if (personalInfo.occupation) {
    memoryParts.push(`用戶的職業是${personalInfo.occupation}`);
  }
  if (personalInfo.interests && personalInfo.interests.length > 0) {
    memoryParts.push(`用戶的興趣包括：${personalInfo.interests.join("、")}`);
  }
  if (personalInfo.customFacts && personalInfo.customFacts.length > 0) {
    memoryParts.push(`關於用戶的其他資訊：${personalInfo.customFacts.join("；")}`);
  }

  // Add preferences
  const { preferences } = memory;
  const styleMap = {
    formal: "正式的",
    casual: "輕鬆的",
    friendly: "友善的",
    professional: "專業的",
  };
  if (preferences.responseStyle) {
    memoryParts.push(`用戶偏好${styleMap[preferences.responseStyle]}回應風格`);
  }

  // Add recent topic summaries (last 3)
  const recentSummaries = memory.topicSummaries.slice(-3);
  if (recentSummaries.length > 0) {
    const summaryText = recentSummaries
      .map((s) => `- ${s.topic}：${s.keyPoints.join("、")}`)
      .join("\n");
    memoryParts.push(`最近的對話主題：\n${summaryText}`);
  }

  if (memoryParts.length === 0) {
    return basePrompt;
  }

  return `${basePrompt}

以下是你對這位用戶的記憶，請在回答時適當參考這些資訊：

${memoryParts.join("\n")}

請自然地運用這些資訊，但不要刻意提及「你記得」或「根據記憶」等字眼，除非用戶詢問。`;
};

export default generateSystemPrompt;
