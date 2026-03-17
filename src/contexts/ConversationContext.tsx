import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Conversation, ConversationMessage } from "@/types/Conversation";
import { useAuth } from "./AuthContext";
import {
  getConversations as getFirestoreConversations,
  saveConversation as saveFirestoreConversation,
  deleteConversationDoc,
} from "@/lib/firestore";

interface ConversationContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  createNewConversation: () => Conversation;
  selectConversation: (id: string) => void;
  updateConversationMessages: (messages: ConversationMessage[]) => void;
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

  const createNewConversation = useCallback((): Conversation => {
    if (!user) throw new Error("User not logged in");

    const now = new Date().toISOString();
    const newConversation: Conversation = {
      id: `conv_${Date.now()}`,
      userId: user.id,
      title: `對話 ${conversations.length + 1}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    const updated = [newConversation, ...conversations];
    setConversations(updated);
    setCurrentConversationId(newConversation.id);
    saveFirestoreConversation(newConversation); // fire and forget

    return newConversation;
  }, [user, conversations]);

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

  const deleteConversation = useCallback(
    (id: string) => {
      deleteConversationDoc(id); // fire and forget
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
        selectConversation,
        updateConversationMessages,
        deleteConversation,
        updateConversationTitle,
        archiveConversation,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
};
