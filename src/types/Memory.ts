export interface UserPreferences {
  language: "zh-TW" | "zh-CN" | "en";
  responseStyle: "formal" | "casual" | "friendly" | "professional";
}

export interface PersonalInfo {
  name?: string;
  nickname?: string;
  occupation?: string;
  interests?: string[];
  customFacts?: string[];
}

export interface TopicSummary {
  id: string;
  topic: string;
  keyPoints: string[];
  timestamp: string;
}

export interface UserMemory {
  userId: string;
  preferences: UserPreferences;
  personalInfo: PersonalInfo;
  topicSummaries: TopicSummary[];
  lastSummarizedIndex: number;
  updatedAt: string;
}

export interface ExtractedMemory {
  personalInfo?: Partial<PersonalInfo>;
  preferences?: Partial<UserPreferences>;
  topicSummary?: {
    topic: string;
    keyPoints: string[];
  };
}

export const createDefaultMemory = (userId: string): UserMemory => ({
  userId,
  preferences: {
    language: "zh-TW",
    responseStyle: "friendly",
  },
  personalInfo: {},
  topicSummaries: [],
  lastSummarizedIndex: 0,
  updatedAt: new Date().toISOString(),
});
