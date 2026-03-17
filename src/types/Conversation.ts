// 對話訊息類型
export interface ConversationMessage {
  content: string;
  role: "user" | "system";
  timestamp: string;
}

// 對話 Session 類型
export interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}
