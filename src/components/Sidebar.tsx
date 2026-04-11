import React, { useState, useEffect, useRef } from "react";
import { useZhuyin } from "@/contexts/ZhuyinContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMemory } from "@/contexts/MemoryContext";
import { useConversation } from "@/contexts/ConversationContext";
import { getAnnouncement } from "@/lib/firestore";
import MemoryPanel from "./MemoryPanel";

interface SidebarProps {
  onNewSession?: () => void;
  onSelectSession?: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onNewSession, onSelectSession }) => {
  const { fontSize, setFontSize, zhuyinMode, setZhuyinMode } = useZhuyin();
  const { user, logout } = useAuth();
  const { memory } = useMemory();
  const { conversations, currentConversation, createNewConversation, selectConversation, deleteConversation } = useConversation();
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(false);
  const [showSessions, setShowSessions] = useState(true);
  const [isStoryGalleryOpen, setIsStoryGalleryOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [isNewAnnouncement, setIsNewAnnouncement] = useState(false);
  const lastSeenAnnouncementRef = useRef("");

  // Fetch and poll announcements
  useEffect(() => {
    const fetchAnnouncement = () => {
      getAnnouncement().then((msg) => {
        if (msg && msg !== lastSeenAnnouncementRef.current) {
          setAnnouncement(msg);
          setIsNewAnnouncement(true);
          // Auto-dismiss "new" highlight after 10s
          setTimeout(() => setIsNewAnnouncement(false), 10000);
        } else if (!msg) {
          setAnnouncement("");
        }
      }).catch(() => {});
    };
    fetchAnnouncement();
    const interval = setInterval(fetchAnnouncement, 30000);
    return () => clearInterval(interval);
  }, []);

  const dismissAnnouncement = () => {
    lastSeenAnnouncementRef.current = announcement;
    setIsNewAnnouncement(false);
  };

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

  const storyConvs = conversations.filter((c) => c.title?.startsWith("故事："));

  const menuItems = [
    { id: "stories", label: "STORY_GALLERY", shortcut: "", action: () => setIsStoryGalleryOpen(!isStoryGalleryOpen), badge: storyConvs.length || undefined, active: isStoryGalleryOpen },
    { id: "memory", label: "MEMORY_BANK", shortcut: "Ctrl+M", action: () => setIsMemoryPanelOpen(true), badge: memory?.topicSummaries.length },
    { id: "zhuyin", label: `ZHUYIN_MODE [${zhuyinMode ? "ON" : "OFF"}]`, shortcut: "Ctrl+Z", action: () => setZhuyinMode(!zhuyinMode), active: zhuyinMode },
    { id: "shop", label: "AVATAR_SHOP", shortcut: "Ctrl+S", action: () => window.location.href = "/shop", dataTutorial: "sidebar-shop" },
    { id: "cards", label: "CARD_BATTLE", shortcut: "Ctrl+B", action: () => window.location.href = "/cards" },
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

        {/* Commander Announcement */}
        {announcement && (
          <div
            className={`p-2 border-b transition-all ${
              isNewAnnouncement
                ? "border-yellow-400 bg-yellow-400/10 animate-pulse"
                : "border-[var(--terminal-green)] bg-[var(--terminal-green)]/5"
            }`}
            onClick={dismissAnnouncement}
          >
            <div className="flex items-center gap-1.5 px-1 mb-1">
              <span className={`text-[10px] font-bold ${isNewAnnouncement ? "text-yellow-400" : "text-[var(--terminal-amber)]"}`}>
                {isNewAnnouncement ? "★" : "☆"} COMMANDER
              </span>
              {isNewAnnouncement && (
                <span className="text-[8px] bg-yellow-400 text-black px-1 font-bold animate-bounce">
                  NEW
                </span>
              )}
            </div>
            <div className={`text-xs px-1 leading-relaxed ${
              isNewAnnouncement
                ? "text-yellow-300 font-bold"
                : "text-[var(--terminal-green)]"
            }`}>
              {announcement}
            </div>
            {isNewAnnouncement && (
              <div className="text-[8px] text-yellow-400/60 px-1 mt-1">
                {"// 點擊此處標記已讀"}
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
                (item as any).active
                  ? "text-[var(--terminal-bg)] bg-[var(--terminal-green)]"
                  : "text-[var(--terminal-green)] hover:bg-[var(--terminal-green)] hover:text-[var(--terminal-bg)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-[var(--terminal-amber)] group-hover:text-[var(--terminal-bg)]">{'>'}</span>
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={`text-[10px] px-1 ${
                    (item as any).active
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
              <button
                onClick={handleNewSession}
                className="w-full text-left px-2 py-1.5 text-xs transition-colors flex items-center gap-2 text-[var(--terminal-cyan)] hover:bg-[var(--terminal-green)] hover:text-[var(--terminal-bg)] border border-dashed border-[var(--terminal-green-dim)] hover:border-solid hover:border-[var(--terminal-green)]"
              >
                <span>+</span>
                <span>NEW_SESSION</span>
              </button>
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

        {/* Story Gallery Panel (inline, opens when STORY_GALLERY command is active) */}
        {isStoryGalleryOpen && (
          <div className="border-t border-[var(--terminal-amber)] bg-[var(--terminal-bg)]">
            <div className="px-4 py-2 text-[10px] text-[var(--terminal-amber)]">
              ═══ STORY_GALLERY ═══
            </div>
            {storyConvs.length === 0 ? (
              <div className="text-[10px] text-[var(--terminal-green-dim)] px-4 py-4 text-center">
                還沒有故事，快去創作吧！
              </div>
            ) : (
              <div className="px-2 pb-2 space-y-1 max-h-48 overflow-y-auto">
                {storyConvs.map((conv) => {
                  // Extract first panel image for thumbnail
                  const panelMsg = conv.messages.find((m) => m.content?.startsWith("[STORY_PANEL]"));
                  const imgMatch = panelMsg?.content?.match(/\[IMG\](.*?)\[\/IMG\]/);
                  const thumbUrl = imgMatch ? imgMatch[1] : "";
                  // Extract info from header
                  const headerMsg = conv.messages.find((m) => m.content?.startsWith("[STORY_HEADER]"));
                  const info = headerMsg?.content?.replace(/\[STORY_HEADER\].*?\[\/STORY_HEADER\]\n?/, "").trim() || "";

                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectSession(conv.id)}
                      className={`w-full text-left border p-2 transition-colors group ${
                        currentConversation?.id === conv.id
                          ? "border-[var(--terminal-amber)] bg-[var(--terminal-amber)]/10"
                          : "border-[var(--terminal-amber)]/30 hover:border-[var(--terminal-amber)]"
                      }`}
                    >
                      <div className="flex gap-2">
                        {thumbUrl && (
                          <div className="w-12 h-12 flex-shrink-0 bg-black overflow-hidden">
                            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[var(--terminal-amber)] text-xs font-bold truncate">
                            {conv.title?.replace("故事：", "") || "未命名"}
                          </div>
                          <div className="text-[8px] text-[var(--terminal-green-dim)] mt-0.5 truncate">
                            {info || formatTime(conv.updatedAt)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(e, conv.id); }}
                          className="opacity-0 group-hover:opacity-100 text-[var(--terminal-red)] hover:text-red-400 text-[10px] p-0.5 self-start"
                          title="刪除"
                        >
                          ✕
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
