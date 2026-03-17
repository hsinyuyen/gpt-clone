import React, { useState } from "react";
import { useZhuyin } from "@/contexts/ZhuyinContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMemory } from "@/contexts/MemoryContext";
import { useConversation } from "@/contexts/ConversationContext";
import MemoryPanel from "./MemoryPanel";

interface SidebarProps {
  onNewSession?: () => void;
  onSelectSession?: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onNewSession, onSelectSession }) => {
  const { zhuyinMode, setZhuyinMode, fontSize, setFontSize } = useZhuyin();
  const { user, logout } = useAuth();
  const { memory } = useMemory();
  const { conversations, currentConversation, createNewConversation, selectConversation, deleteConversation } = useConversation();
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false);
  const [showSessions, setShowSessions] = useState(true);

  const handleLogout = () => {
    logout();
  };

  const handleNewSession = () => {
    createNewConversation();
    onNewSession?.();
  };

  const handleSelectSession = (id: string) => {
    selectConversation(id);
    onSelectSession?.(id);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("確定要刪除這個對話嗎？")) {
      deleteConversation(id);
    }
  };

  const ADMIN_USERNAMES = ["admin", "teacher", "老師"];
  const isAdmin = user && ADMIN_USERNAMES.includes(user.username.toLowerCase());

  const menuItems = [
    { id: "new", label: "NEW_SESSION", shortcut: "Ctrl+N", action: handleNewSession },
    { id: "memory", label: "MEMORY_BANK", shortcut: "Ctrl+M", action: () => setIsMemoryPanelOpen(true), badge: memory?.topicSummaries.length },
    { id: "zhuyin", label: `ZHUYIN_MODE [${zhuyinMode ? "ON" : "OFF"}]`, shortcut: "Ctrl+Z", action: () => setZhuyinMode(!zhuyinMode), active: zhuyinMode },
    { id: "shop", label: "AVATAR_SHOP", shortcut: "Ctrl+S", action: () => window.location.href = "/shop", dataTutorial: "sidebar-shop" },
    ...(isAdmin ? [{ id: "admin", label: "ADMIN_PANEL", shortcut: "Ctrl+A", action: () => window.location.href = "/admin" }] : []),
  ];

  // 格式化時間
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    } else if (days === 1) {
      return "昨天";
    } else if (days < 7) {
      return `${days} 天前`;
    } else {
      return date.toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-1 flex-col bg-[var(--terminal-bg)] border-r border-[var(--terminal-green)]">
        {/* Header */}
        <div className="p-3 border-b border-[var(--terminal-green)]">
          <pre className="text-[var(--terminal-green)] text-[10px] glow-text leading-tight">
{`╔═══════════════════╗
║   LAB TERMINAL    ║
║      v2.0.0       ║
╚═══════════════════╝`}
          </pre>
        </div>

        {/* User Info */}
        {user && (
          <div className="p-3 border-b border-[var(--terminal-green)]">
            <div className="text-[10px] text-[var(--terminal-green-dim)]">CURRENT_USER:</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[var(--terminal-cyan)] glow-text-cyan text-sm">
                ◉ {user.displayName || user.username}
              </span>
            </div>
            {user.avatar?.name && (
              <div className="text-[10px] text-[var(--terminal-amber)] mt-1">
                AI_ASSISTANT: {user.avatar.name}
              </div>
            )}
          </div>
        )}

        {/* Commands */}
        <div className="p-2 border-b border-[var(--terminal-green)]">
          <div className="text-[10px] text-[var(--terminal-green-dim)] px-2 mb-2">
            ═══ COMMANDS ═══
          </div>

          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={item.action}
              data-tutorial={(item as any).dataTutorial || undefined}
              className={`w-full text-left px-2 py-1.5 text-xs transition-colors flex items-center justify-between group ${
                item.active
                  ? "text-[var(--terminal-bg)] bg-[var(--terminal-green)]"
                  : "text-[var(--terminal-green)] hover:bg-[var(--terminal-green)] hover:text-[var(--terminal-bg)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-[var(--terminal-amber)] group-hover:text-[var(--terminal-bg)]">{'>'}</span>
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-[10px] px-1 ${
                    item.active
                      ? "bg-[var(--terminal-bg)] text-[var(--terminal-green)]"
                      : "bg-[var(--terminal-green)] text-[var(--terminal-bg)]"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] opacity-50">{item.shortcut}</span>
            </button>
          ))}
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="w-full text-left px-4 py-2 text-[10px] text-[var(--terminal-green-dim)] hover:bg-[var(--terminal-green)]/10 flex items-center justify-between"
          >
            <span>═══ SESSIONS ({conversations.length}) ═══</span>
            <span>{showSessions ? "▼" : "▶"}</span>
          </button>

          {showSessions && (
            <div className="px-2 pb-2 space-y-1">
              {conversations.length === 0 ? (
                <div className="text-[10px] text-[var(--terminal-green-dim)] px-2 py-4 text-center">
                  尚無對話記錄
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectSession(conv.id)}
                    className={`w-full text-left px-2 py-2 text-xs transition-colors group ${
                      currentConversation?.id === conv.id
                        ? "bg-[var(--terminal-green)]/20 border-l-2 border-[var(--terminal-green)]"
                        : "hover:bg-[var(--terminal-green)]/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`truncate ${
                          currentConversation?.id === conv.id
                            ? "text-[var(--terminal-green)] font-bold"
                            : "text-[var(--terminal-green)]"
                        }`}>
                          {conv.title || "新對話"}
                        </div>
                        <div className="text-[10px] text-[var(--terminal-green-dim)] mt-0.5">
                          {conv.messages.length} 則訊息 • {formatTime(conv.updatedAt)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSession(e, conv.id)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--terminal-red)] hover:text-red-400 text-[10px] p-1"
                        title="刪除對話"
                      >
                        ✕
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Font Size Control */}
        <div className="p-2 border-t border-[var(--terminal-green)]">
          <div className="text-[10px] text-[var(--terminal-green-dim)] mb-2 px-2">
            ═══ DISPLAY ═══
          </div>
          <div className="flex gap-1 px-2">
            {(["small", "medium", "large"] as const).map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`flex-1 py-1 text-[10px] uppercase transition-colors ${
                  fontSize === size
                    ? "bg-[var(--terminal-green)] text-[var(--terminal-bg)]"
                    : "border border-[var(--terminal-green)] text-[var(--terminal-green)] hover:bg-[var(--terminal-green)] hover:text-[var(--terminal-bg)]"
                }`}
              >
                {size === "small" ? "S" : size === "medium" ? "M" : "L"}
              </button>
            ))}
          </div>
        </div>

        {/* System Status */}
        <div className="p-2 border-t border-[var(--terminal-green)] text-[10px] text-[var(--terminal-green-dim)]">
          <div>SYS_STATUS: ONLINE</div>
          <div>MEM_BLOCKS: {memory?.topicSummaries.length || 0}</div>
          <div>UPTIME: {new Date().toLocaleTimeString("zh-TW")}</div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="m-2 terminal-btn text-xs hover:bg-[var(--terminal-red)] hover:border-[var(--terminal-red)]"
        >
          {'>'} LOGOUT_SESSION
        </button>
      </div>

      <MemoryPanel
        isOpen={isMemoryPanelOpen}
        onClose={() => setIsMemoryPanelOpen(false)}
      />
    </>
  );
};

export default Sidebar;
