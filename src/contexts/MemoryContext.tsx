import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { v4 as uuid } from "uuid";
import { UserMemory, createDefaultMemory, TopicSummary } from "@/types/Memory";
import { ExtractedMemory } from "@/utils/memoryPrompts";
import { MEMORY_TRIGGER_COUNT } from "@/shared/Constants";
import { useAuth } from "./AuthContext";
import {
  getMemory as getFirestoreMemory,
  saveMemory as saveFirestoreMemory,
} from "@/lib/firestore";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MemoryContextType {
  memory: UserMemory | null;
  isExtracting: boolean;
  messageCount: number;
  triggerMemoryExtraction: (messages: Message[]) => Promise<void>;
  updateMemory: (updates: Partial<UserMemory>) => void;
  mergeExtractedMemory: (extracted: ExtractedMemory) => void;
  clearMemory: () => void;
  shouldTriggerExtraction: (count: number) => boolean;
  incrementMessageCount: () => number;
  resetMessageCount: () => void;
}

const MemoryContext = createContext<MemoryContextType | null>(null);

export const MemoryProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [memory, setMemory] = useState<UserMemory | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  // Load memory from Firestore
  useEffect(() => {
    if (user) {
      getFirestoreMemory(user.id).then((data) => {
        setMemory(data || createDefaultMemory(user.id));
      });
      setMessageCount(0);
    } else {
      setMemory(null);
      setMessageCount(0);
    }
  }, [user]);

  const persistMemory = useCallback(
    (updatedMemory: UserMemory) => {
      if (!user) return;
      const final = { ...updatedMemory, updatedAt: new Date().toISOString() };
      saveFirestoreMemory(user.id, final); // fire and forget
      setMemory(final);
    },
    [user]
  );

  const updateMemory = useCallback(
    (updates: Partial<UserMemory>) => {
      if (!memory) return;
      persistMemory({ ...memory, ...updates });
    },
    [memory, persistMemory]
  );

  const mergeExtractedMemory = useCallback(
    (extracted: ExtractedMemory) => {
      if (!memory) return;

      const updatedMemory: UserMemory = { ...memory };

      // Merge personal info
      if (extracted.personalInfo) {
        const { personalInfo } = extracted;
        if (personalInfo.name) updatedMemory.personalInfo.name = personalInfo.name;
        if (personalInfo.nickname) updatedMemory.personalInfo.nickname = personalInfo.nickname;
        if (personalInfo.occupation) updatedMemory.personalInfo.occupation = personalInfo.occupation;
        if (personalInfo.interests && personalInfo.interests.length > 0) {
          const existing = updatedMemory.personalInfo.interests || [];
          const newItems = personalInfo.interests.filter((i) => !existing.includes(i));
          updatedMemory.personalInfo.interests = [...existing, ...newItems];
        }
        if (personalInfo.customFacts && personalInfo.customFacts.length > 0) {
          const existing = updatedMemory.personalInfo.customFacts || [];
          const newItems = personalInfo.customFacts.filter((f) => !existing.includes(f));
          updatedMemory.personalInfo.customFacts = [...existing, ...newItems];
        }
      }

      // Merge preferences
      if (extracted.preferences) {
        if (extracted.preferences.language) {
          updatedMemory.preferences.language = extracted.preferences.language;
        }
        if (extracted.preferences.responseStyle) {
          updatedMemory.preferences.responseStyle =
            extracted.preferences.responseStyle as "formal" | "casual" | "friendly" | "professional";
        }
      }

      // Add topic summary
      if (extracted.topicSummary && extracted.topicSummary.topic) {
        const newSummary: TopicSummary = {
          id: uuid(),
          topic: extracted.topicSummary.topic,
          keyPoints: extracted.topicSummary.keyPoints || [],
          timestamp: new Date().toISOString(),
        };
        const summaries = [...updatedMemory.topicSummaries, newSummary].slice(-10);
        updatedMemory.topicSummaries = summaries;
      }

      persistMemory(updatedMemory);
    },
    [memory, persistMemory]
  );

  const triggerMemoryExtraction = useCallback(
    async (messages: Message[]) => {
      if (!memory || messages.length === 0) return;

      setIsExtracting(true);
      try {
        const response = await fetch("/api/extract-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        const data = await response.json();
        if (data.memory) {
          mergeExtractedMemory(data.memory);
        }
      } catch (error) {
        console.error("Memory extraction failed:", error);
      } finally {
        setIsExtracting(false);
      }
    },
    [memory, mergeExtractedMemory]
  );

  const clearMemory = useCallback(() => {
    if (!user) return;
    const newMemory = createDefaultMemory(user.id);
    persistMemory(newMemory);
    setMessageCount(0);
  }, [user, persistMemory]);

  const shouldTriggerExtraction = useCallback((count: number): boolean => {
    return count > 0 && count % MEMORY_TRIGGER_COUNT === 0;
  }, []);

  const incrementMessageCount = useCallback((): number => {
    const newCount = messageCount + 1;
    setMessageCount(newCount);
    return newCount;
  }, [messageCount]);

  const resetMessageCount = useCallback(() => {
    setMessageCount(0);
  }, []);

  return (
    <MemoryContext.Provider
      value={{
        memory,
        isExtracting,
        messageCount,
        triggerMemoryExtraction,
        updateMemory,
        mergeExtractedMemory,
        clearMemory,
        shouldTriggerExtraction,
        incrementMessageCount,
        resetMessageCount,
      }}
    >
      {children}
    </MemoryContext.Provider>
  );
};

export const useMemory = () => {
  const context = useContext(MemoryContext);
  if (!context) {
    throw new Error("useMemory must be used within MemoryProvider");
  }
  return context;
};

export default MemoryContext;
