import type { ConversationMessage } from "@/types/Conversation";

const CACHE_PREFIX = "lab-tool-session-cache:";

export function labToolSessionCacheKey(userId: string, worksheetId: string) {
  return `${CACHE_PREFIX}${userId}:${worksheetId.toUpperCase().replace(/[-_\s]/g, "")}`;
}

export function readLabToolSessionCache(userId: string, worksheetId: string) {
  if (typeof window === "undefined") return [] as ConversationMessage[];
  try {
    const raw = window.localStorage.getItem(labToolSessionCacheKey(userId, worksheetId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.messages) ? (parsed.messages as ConversationMessage[]) : [];
  } catch {
    return [] as ConversationMessage[];
  }
}

export function writeLabToolSessionCache(
  userId: string,
  worksheetId: string,
  messages: ConversationMessage[],
  conversationId: string
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      labToolSessionCacheKey(userId, worksheetId),
      JSON.stringify({ messages, conversationId, savedAt: new Date().toISOString() })
    );
  } catch {
    // Local cache is a fallback for restoring an interrupted Lab session.
  }
}

export function clearLabToolSessionCache(userId: string, worksheetId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(labToolSessionCacheKey(userId, worksheetId));
  } catch {
    // Browser storage may be unavailable in restricted modes.
  }
}

export function clearLabToolSessionCacheByConversationId(conversationId: string) {
  if (typeof window === "undefined") return;
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index)
    ).filter((key): key is string => Boolean(key?.startsWith(CACHE_PREFIX)));

    keys.forEach((key) => {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.conversationId === conversationId) {
        window.localStorage.removeItem(key);
      }
    });
  } catch {
    // Browser storage may be unavailable in restricted modes.
  }
}
