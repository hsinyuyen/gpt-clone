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
  const { fontSize, setFontSize } = useZhuyin(); // 注音開關在聊天室頂列，這裡不再重複
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

  // 精簡到只剩「這裡才有」的入口，把垂直空間讓給 SESSIONS：
  // - STORY_GALLERY → 移到上面 AI 助理那一列
  // - ZHUYIN_MODE / AVATAR_SHOP → 聊天室頂列已經有了
  // - LEADERBOARD → 只跟卡牌有關，移到 /cards
  const menuItems = [
    { id: "memory", label: "MEMORY_BANK", shortcut: "Ctrl+M", action: () => setIsMemoryPanelOpen(true), badge: memory?.topicSummaries.length },
    { id: "cards", label: "CARD_BATTLE", shortcut: "Ctrl+B", action: () => window.location.href = "/cards" },
    { id: "worksheets", label: "WORKSHEETS", shortcut: "", action: () => window.location.href = "/worksheets" },
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
          <div className="flex-shrink-0 p-3 border-b border-[var(--terminal-green)]">
            <div className="text-[10px] text-[var(--terminal-green-dim)]">CURRENT_USER:</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[var(--terminal-cyan)] glow-text-cyan text-sm">
                ◉ {user.displayName || user.username}
              </span>
            </div>
            {/* AI 助理 ＋ 故事館（故事都是 AI 助理陪著寫的，放在一起最好找） */}
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-[10px] text-[var(--terminal-amber)] truncate">
                AI_ASSISTANT: {user.avatar?.name || "--"}
              </span>
              <button
                onClick={() => setIsStoryGalleryOpen(!isStoryGalleryOpen)}
                title="故事館"
                className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] border transition-colors ${
                  isStoryGalleryOpen
                    ? "bg-[var(--terminal-amber)] text-[var(--terminal-bg)] border-[var(--terminal-amber)]"
                    : "border-[var(--terminal-amber)]/50 text-[var(--terminal-amber)] hover:bg-[var(--terminal-amber)] hover:text-[var(--terminal-bg)]"
                }`}
              >
                <span>[STORIES]</span>
                {storyConvs.length > 0 && (
                  <span className={`px-1 ${
                    isStoryGalleryOpen
                      ? "bg-[var(--terminal-bg)] text-[var(--terminal-amber)]"
                      : "bg-[var(--terminal-amber)] text-[var(--terminal-bg)]"
                  }`}>
                    {storyConvs.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Commander Announcement */}
        {announcement && (
          <div
            className={`flex-shrink-0 p-2 border-b transition-all ${
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
            <div className={`text-xs px-1 leading-relaxed break-all ${
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
        <div className="flex-shrink-0 p-2 border-b border-[var(--terminal-green)]">
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

        {/* Session List — min-h-0 是必要的：flex 子項預設 min-height:auto 不會縮，
            會把下面的 DISPLAY / STATUS / LOGOUT 擠出畫面外 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
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

        {/* Story Gallery：開啟時跟 SESSIONS 平分剩餘高度（都 flex-1 + min-h-0），
            這樣不論螢幕多矮，下面的 LOGOUT 都不會被擠出畫面 */}
        {isStoryGalleryOpen && (
          <div className="flex-1 min-h-0 flex flex-col border-t border-[var(--terminal-amber)] bg-[var(--terminal-bg)]">
            <div className="flex-shrink-0 px-4 py-2 text-[10px] text-[var(--terminal-amber)] flex items-center justify-between">
              <span>═══ STORY_GALLERY ═══</span>
              <button onClick={() => setIsStoryGalleryOpen(false)} className="px-1 hover:text-[var(--terminal-red)]" title="收起">✕</button>
            </div>
            {storyConvs.length === 0 ? (
              <div className="text-[10px] text-[var(--terminal-green-dim)] px-4 py-4 text-center">
                還沒有故事，快去創作吧！
              </div>
            ) : (
              <div className="flex-1 min-h-0 px-2 pb-2 space-y-1 overflow-y-auto">
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

        {/* Footer：字級 ＋ 狀態 ＋ 登出，壓成兩列，確保 LOGOUT 永遠看得到 */}
        <div className="flex-shrink-0 border-t border-[var(--terminal-green)]">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-[10px] text-[var(--terminal-green-dim)]">DISPLAY</span>
            <div className="flex gap-1 flex-1">
              {(["small", "medium", "large"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`flex-1 py-0.5 text-[10px] uppercase transition-colors ${
                    fontSize === size
                      ? "bg-[var(--terminal-green)] text-[var(--terminal-bg)]"
                      : "border border-[var(--terminal-green)] text-[var(--terminal-green)] hover:bg-[var(--terminal-green)] hover:text-[var(--terminal-bg)]"
                  }`}
                >
                  {size === "small" ? "S" : size === "medium" ? "M" : "L"}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-[var(--terminal-green-dim)]" title="記憶區塊數">
              ● MEM {memory?.topicSummaries.length || 0}
            </span>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full terminal-btn text-xs rounded-none border-x-0 border-b-0 hover:bg-[var(--terminal-red)] hover:border-[var(--terminal-red)]"
          >
            {'>'} LOGOUT_SESSION
          </button>
        </div>
      </div>

      <MemoryPanel
        isOpen={isMemoryPanelOpen}
        onClose={() => setIsMemoryPanelOpen(false)}
      />
    </>
  );
};

export default Sidebar;
