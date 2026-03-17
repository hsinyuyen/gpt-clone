import React, { useState } from "react";
import { useMemory } from "@/contexts/MemoryContext";
import { useAuth } from "@/contexts/AuthContext";

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const MemoryPanel: React.FC<MemoryPanelProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { memory, clearMemory, messageCount } = useMemory();
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleClearMemory = () => {
    clearMemory();
    setShowConfirmClear(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="terminal-border bg-[var(--terminal-bg)] w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--terminal-primary-dim)]">
          <div className="flex items-center justify-between">
            <div>
              <pre className="text-[var(--terminal-primary)] glow-text text-[10px] leading-tight">
{`╔════════════════════════╗
║    MEMORY_BANK v1.0    ║
╚════════════════════════╝`}
              </pre>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--terminal-primary)] hover:text-[var(--terminal-red)] text-xl"
            >
              [×]
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {/* User Info */}
          {user && (
            <div className="space-y-1">
              <div className="text-[var(--terminal-accent)]">═══ USER_INFO ═══</div>
              <div className="text-[var(--terminal-primary)] pl-2">
                <div>ID: {user.username}</div>
                <div>NAME: {user.displayName || user.username}</div>
                <div>SESSION_MSG_COUNT: {messageCount}</div>
              </div>
            </div>
          )}

          {/* Personal Info */}
          {memory && (
            <>
              <div className="space-y-1">
                <div className="text-[var(--terminal-accent)]">═══ PERSONAL_DATA ═══</div>
                <div className="text-[var(--terminal-primary)] pl-2 space-y-1">
                  {memory.personalInfo.name && (
                    <div>REAL_NAME: {memory.personalInfo.name}</div>
                  )}
                  {memory.personalInfo.nickname && (
                    <div>NICKNAME: {memory.personalInfo.nickname}</div>
                  )}
                  {memory.personalInfo.occupation && (
                    <div>OCCUPATION: {memory.personalInfo.occupation}</div>
                  )}
                  {memory.personalInfo.interests && memory.personalInfo.interests.length > 0 && (
                    <div>INTERESTS: [{memory.personalInfo.interests.join(", ")}]</div>
                  )}
                  {memory.personalInfo.customFacts && memory.personalInfo.customFacts.length > 0 && (
                    <div className="space-y-1">
                      <div>CUSTOM_FACTS:</div>
                      {memory.personalInfo.customFacts.map((fact, i) => (
                        <div key={i} className="pl-4 text-[var(--terminal-primary-dim)]">
                          [{i}] {fact}
                        </div>
                      ))}
                    </div>
                  )}
                  {!memory.personalInfo.name &&
                   !memory.personalInfo.nickname &&
                   !memory.personalInfo.occupation &&
                   (!memory.personalInfo.interests || memory.personalInfo.interests.length === 0) && (
                    <div className="text-[var(--terminal-primary-dim)] italic">
                      {"// NO_PERSONAL_DATA_RECORDED"}
                    </div>
                  )}
                </div>
              </div>

              {/* Preferences */}
              <div className="space-y-1">
                <div className="text-[var(--terminal-accent)]">═══ PREFERENCES ═══</div>
                <div className="text-[var(--terminal-primary)] pl-2">
                  <div>
                    LANG: {
                      memory.preferences.language === "zh-TW" ? "ZH-TW" :
                      memory.preferences.language === "zh-CN" ? "ZH-CN" : "EN"
                    }
                  </div>
                  <div>
                    STYLE: {memory.preferences.responseStyle.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Topic Summaries */}
              {memory.topicSummaries.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[var(--terminal-accent)]">
                    ═══ TOPIC_LOGS ({memory.topicSummaries.length}) ═══
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {memory.topicSummaries.slice(-5).reverse().map((summary) => (
                      <div key={summary.id} className="pl-2 border-l-2 border-[var(--terminal-highlight)]">
                        <div className="text-[var(--terminal-highlight)] text-xs">
                          [{new Date(summary.timestamp).toLocaleDateString("zh-TW")}]
                        </div>
                        <div className="text-[var(--terminal-primary)]">
                          TOPIC: {summary.topic}
                        </div>
                        <div className="text-[var(--terminal-primary-dim)] text-xs">
                          POINTS: {summary.keyPoints.join(" | ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Last Updated */}
              <div className="text-[10px] text-[var(--terminal-primary-dim)] text-center pt-2 border-t border-[var(--terminal-primary-dim)]">
                LAST_SYNC: {new Date(memory.updatedAt).toLocaleString("zh-TW")}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--terminal-primary-dim)]">
          {showConfirmClear ? (
            <div className="space-y-2">
              <div className="text-[var(--terminal-red)] text-xs text-center">
                WARNING: THIS WILL ERASE ALL MEMORY DATA
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleClearMemory}
                  className="flex-1 terminal-btn text-xs py-2 hover:bg-[var(--terminal-red)] hover:border-[var(--terminal-red)]"
                >
                  CONFIRM_DELETE
                </button>
                <button
                  onClick={() => setShowConfirmClear(false)}
                  className="flex-1 terminal-btn text-xs py-2"
                >
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmClear(true)}
              className="w-full terminal-btn text-xs py-2 hover:bg-[var(--terminal-red)] hover:border-[var(--terminal-red)]"
            >
              {'>'} CLEAR_MEMORY_BANK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemoryPanel;
