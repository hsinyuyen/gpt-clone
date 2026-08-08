import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Conversation, ConversationMessage } from "@/types/Conversation";
import { useAuth } from "./AuthContext";
import {
  getConversations as getFirestoreConversations,
  saveConversation as saveFirestoreConversation,
  deleteConversationDoc,
} from "@/lib/firestore";
import { clearLabToolSessionCacheByConversationId } from "@/utils/labToolSessionCache";

interface ConversationContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  createNewConversation: (initialMessages?: ConversationMessage[], title?: string, id?: string, activate?: boolean) => Conversation;
  upsertConversationSession: (id: string, title: string, initialMessages?: ConversationMessage[], activate?: boolean) => Conversation;
  selectConversation: (id: string) => void;
  updateConversationMessages: (messages: ConversationMessage[]) => void;
  updateConversationMessagesById: (id: string, messages: ConversationMessage[], title?: string) => void;
  deleteConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  archiveConversation: (title: string, messages: ConversationMessage[]) => void;
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

export const useConversation = () => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("useConversation must be used within a ConversationProvider");
  }
  return context;
};

interface ConversationProviderProps {
  children: React.ReactNode;
}

export const ConversationProvider: React.FC<ConversationProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Load from Firestore
  useEffect(() => {
    if (user) {
      getFirestoreConversations(user.id).then((data) => {
        setConversations(data);
        if (data.length > 0) {
          setCurrentConversationId(data[0].id); // already sorted by updatedAt desc
        }
      });
    } else {
      setConversations([]);
      setCurrentConversationId(null);
    }
  }, [user]);

  const createNewConversation = useCallback((
    initialMessages: ConversationMessage[] = [],
    title?: string,
    id?: string,
    activate = true
  ): Conversation => {
    if (!user) throw new Error("User not logged in");

    const now = new Date().toISOString();
    const firstUserMessage = initialMessages.find((message) => message.role === "user");
    const newConversation: Conversation = {
      id: id || `conv_${Date.now()}`,
      userId: user.id,
      title: title || (firstUserMessage
        ? firstUserMessage.content.slice(0, 30) +
          (firstUserMessage.content.length > 30 ? "..." : "")
        : `對話 ${conversations.length + 1}`),
      messages: initialMessages,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    const updated = [newConversation, ...conversations];
    setConversations(updated);
    if (activate) setCurrentConversationId(newConversation.id);
    saveFirestoreConversation(newConversation); // fire and forget

    return newConversation;
  }, [user, conversations]);

  const upsertConversationSession = useCallback(
    (id: string, title: string, initialMessages: ConversationMessage[] = [], activate = true): Conversation => {
      if (!user) throw new Error("User not logged in");

      const existing = conversations.find((conv) => conv.id === id);
      if (existing) {
        if (activate) setCurrentConversationId(existing.id);
        if (existing.title !== title) {
          const updatedConv = { ...existing, title, updatedAt: new Date().toISOString() };
          setConversations((prev) =>
            prev.map((conv) => (conv.id === existing.id ? updatedConv : conv))
          );
          saveFirestoreConversation(updatedConv);
          return updatedConv;
        }
        return existing;
      }

      return createNewConversation(initialMessages, title, id, activate);
    },
    [conversations, createNewConversation, user]
  );

  const selectConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  const updateConversationMessages = useCallback(
    (messages: ConversationMessage[]) => {
      if (!currentConversationId) return;

      setConversations((prev) => {
        const updated = prev.map((conv) => {
          if (conv.id === currentConversationId) {
            let title = conv.title;
            if (conv.messages.length === 0 && messages.length > 0) {
              const firstUserMsg = messages.find((m) => m.role === "user");
              if (firstUserMsg) {
                title =
                  firstUserMsg.content.slice(0, 30) +
                  (firstUserMsg.content.length > 30 ? "..." : "");
              }
            }
            const updatedConv = {
              ...conv,
              messages,
              title,
              updatedAt: new Date().toISOString(),
            };
            saveFirestoreConversation(updatedConv); // fire and forget
            return updatedConv;
          }
          return conv;
        });
        return updated;
      });
    },
    [currentConversationId]
  );

  const updateConversationMessagesById = useCallback(
    (id: string, messages: ConversationMessage[], title?: string) => {
      if (!user) return;

      setConversations((prev) => {
        const existing = prev.find((conv) => conv.id === id);
        const now = new Date().toISOString();

        if (!existing) {
          const newConversation: Conversation = {
            id,
            userId: user.id,
            title: title || `對話 ${prev.length + 1}`,
            messages,
            createdAt: now,
            updatedAt: now,
            isActive: true,
          };
          saveFirestoreConversation(newConversation);
          setCurrentConversationId(id);
          return [newConversation, ...prev];
        }

        const updatedConv: Conversation = {
          ...existing,
          title: title || existing.title,
          messages,
          updatedAt: now,
        };
        saveFirestoreConversation(updatedConv);
        return prev.map((conv) => (conv.id === id ? updatedConv : conv));
      });
    },
    [user]
  );

  const deleteConversation = useCallback(
    (id: string) => {
      deleteConversationDoc(id); // fire and forget
      clearLabToolSessionCacheByConversationId(id);
      setConversations((prev) => {
        const updated = prev.filter((conv) => conv.id !== id);
        if (id === currentConversationId && updated.length > 0) {
          setCurrentConversationId(updated[0].id);
        } else if (updated.length === 0) {
          setCurrentConversationId(null);
        }
        return updated;
      });
    },
    [currentConversationId]
  );

  const archiveConversation = useCallback(
    (title: string, messages: ConversationMessage[]) => {
      if (!user) return;

      const now = new Date().toISOString();
      const archived: Conversation = {
        id: `conv_${Date.now()}`,
        userId: user.id,
        title,
        messages,
        createdAt: now,
        updatedAt: now,
        isActive: false,
      };

      setConversations((prev) => [archived, ...prev]);
      saveFirestoreConversation(archived);
    },
    [user]
  );

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations((prev) => {
      const updated = prev.map((conv) => {
        if (conv.id === id) {
          const updatedConv = { ...conv, title };
          saveFirestoreConversation(updatedConv); // fire and forget
          return updatedConv;
        }
        return conv;
      });
      return updated;
    });
  }, []);

  const currentConversation =
    conversations.find((c) => c.id === currentConversationId) || null;

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        currentConversation,
        createNewConversation,
        upsertConversationSession,
        selectConversation,
        updateConversationMessages,
        updateConversationMessagesById,
        deleteConversation,
        updateConversationTitle,
        archiveConversation,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
};
