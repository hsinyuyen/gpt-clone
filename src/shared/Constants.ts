import { OpenAIModel } from "@/types/Model";

// LocalStorage Keys
export const LS_UUID = "@ls/uuid";
export const LS_CURRENT_USER = "@ls/currentUser";
export const LS_USERS = "@ls/users";
export const LS_USER_MEMORY = "@ls/memory";
export const LS_CONVERSATIONS = "@ls/conversations";
export const LS_USER_COINS = "@ls/coins";

// 統一的 LocalStorage Keys 物件
export const LS_KEYS = {
  UUID: LS_UUID,
  CURRENT_USER: LS_CURRENT_USER,
  USERS: LS_USERS,
  USER_MEMORY: LS_USER_MEMORY,
  CONVERSATIONS: LS_CONVERSATIONS,
  USER_COINS: LS_USER_COINS,
};

// Memory Settings
export const MEMORY_TRIGGER_COUNT = 10;

export const DEFAULT_OPENAI_MODEL = {
  name: "GPT-4o Mini",
  id: "gpt-4o-mini",
  available: true,
};

export const GPT4_OPENAI_MODEL = {
  name: "GPT-4",
  id: "gpt-4",
  available: false,
};

export const OPENAI_MODELS: OpenAIModel[] = [
  DEFAULT_OPENAI_MODEL,
  GPT4_OPENAI_MODEL,
];
