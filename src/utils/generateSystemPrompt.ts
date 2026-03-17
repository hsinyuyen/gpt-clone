import { UserMemory } from "@/types/Memory";

export const generateSystemPrompt = (memory: UserMemory | null): string => {
  const basePrompt = `你是一個友善且有幫助的 AI 助手。請用繁體中文回答問題。`;

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
