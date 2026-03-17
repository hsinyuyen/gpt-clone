import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Chat from "@/components/Chat";
import MobileSiderbar from "@/components/MobileSidebar";
import Sidebar from "@/components/Sidebar";
import ScriptPanel from "@/components/ScriptPanel";
import TutorialOverlay, { TutorialStep } from "@/components/TutorialOverlay";
import useAnalytics from "@/hooks/useAnalytics";
import { useAuth } from "@/contexts/AuthContext";
import { useConversation } from "@/contexts/ConversationContext";
import { ActiveScript } from "@/types/Script";

export default function Home() {
  const [isComponentVisible, setIsComponentVisible] = useState(false);
  const [isScriptPanelOpen, setIsScriptPanelOpen] = useState(true);
  const [activeScript, setActiveScript] = useState<ActiveScript>(null);
  const [completedScripts, setCompletedScripts] = useState<Set<string>>(new Set());
  const [showCompletionToast, setShowCompletionToast] = useState(false);
  const { trackEvent } = useAnalytics();
  const { user, isLoading } = useAuth();
  const { currentConversation, createNewConversation, selectConversation } = useConversation();
  const router = useRouter();
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCoinTutorial, setShowCoinTutorial] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  // Auto-start tutorial for new kidMode users who haven't completed avatar yet
  useEffect(() => {
    if (user && user.kidMode && !user.avatar) {
      const tutorialKey = `tutorial_main_done_${user.id}`;
      if (!localStorage.getItem(tutorialKey)) {
        const timer = setTimeout(() => setShowTutorial(true), 800);
        return () => clearTimeout(timer);
      }
    }
  }, [user]);

  const handleTutorialComplete = () => {
    setShowTutorial(false);
    if (user) {
      localStorage.setItem(`tutorial_main_done_${user.id}`, "1");
    }
  };

  const handleCoinTutorialComplete = () => {
    setShowCoinTutorial(false);
    if (user) {
      localStorage.setItem(`tutorial_coin_done_${user.id}`, "1");
    }
    // Navigate to shop after tutorial
    router.push("/shop?tab=themes");
  };

  useEffect(() => {
    if (user) {
      trackEvent("page.view", { page: "home" });
    }
  }, [user]);

  // Tutorial steps for main page (first-time)
  const tutorialSteps: TutorialStep[] = [
    {
      target: "[data-tutorial='script-panel']",
      text: "這是「腳本庫」！你可以在這裡找到各種任務，第一步先創建你的 AI 助理吧！",
      position: "left",
      beforeShow: () => {
        if (!isScriptPanelOpen) setIsScriptPanelOpen(true);
      },
    },
    {
      target: "[data-tutorial='script-create-avatar']",
      text: "點這個按鈕就可以開始創建你的專屬 AI 助理角色！跟著 AI 的提示一步一步回答就可以囉！",
      position: "left",
      clickToAdvance: true,
    },
  ];

  // Tutorial steps for coin/shop (after first avatar creation)
  const coinTutorialSteps: TutorialStep[] = [
    {
      target: "[data-tutorial='coin-display']",
      text: "這是你的「金幣」！每次和 AI 對話、完成任務都會獲得金幣喔！",
      position: "bottom",
    },
    {
      target: "[data-tutorial='coin-display']",
      text: "你剛剛完成了第一個任務，已經賺到不少金幣了！金幣可以用來購買很多好東西！",
      position: "bottom",
    },
    {
      target: "[data-tutorial='sidebar-shop']",
      text: "點這裡可以進入「商店」！你可以用金幣購買不同顏色的介面主題、幫 AI 助理加上配件，還有更多好玩的東西等你發掘！",
      position: "right",
      clickToAdvance: true,
    },
  ];

  const toggleComponentVisibility = () => {
    setIsComponentVisible(!isComponentVisible);
  };

  const toggleScriptPanel = () => {
    setIsScriptPanelOpen(!isScriptPanelOpen);
  };

  const handleStartScript = (scriptId: string) => {
    if (scriptId === "create-avatar") {
      setActiveScript("create-avatar");
    } else if (scriptId === "story-helper") {
      setActiveScript("story-helper");
    }
  };

  const handleStopScript = () => {
    setActiveScript(null);
  };

  const handleScriptComplete = () => {
    const wasAvatarScript = activeScript === "create-avatar";

    // Mark script as completed
    if (activeScript) {
      setCompletedScripts(prev => new Set(Array.from(prev).concat(activeScript)));
    }
    // Close script
    setActiveScript(null);

    // Trigger coin tutorial after first avatar creation
    if (user && wasAvatarScript) {
      const coinTutorialKey = `tutorial_coin_done_${user.id}`;
      if (!localStorage.getItem(coinTutorialKey)) {
        // Short delay to let state settle, then start coin tutorial
        setTimeout(() => setShowCoinTutorial(true), 800);
        return; // Skip toast — tutorial replaces it
      }
    }

    // Show completion toast (only if no tutorial)
    setShowCompletionToast(true);
    setTimeout(() => setShowCompletionToast(false), 3000);
  };

  const handleNewSession = () => {
    // Chat component detects currentConversation changes
  };

  const handleSelectSession = (id: string) => {
    // Chat component detects currentConversation changes
  };

  if (isLoading || !user) {
    return (
      <main className="overflow-hidden w-full h-screen relative flex items-center justify-center bg-[var(--terminal-bg)] terminal-screen terminal-scanline">
        <div className="text-[var(--terminal-primary)] glow-text flex items-center gap-2">
          <span className="animate-spin">*</span>
          INITIALIZING_SYSTEM...
        </div>
      </main>
    );
  }

  return (
    <main className="overflow-hidden w-full h-screen relative flex bg-[var(--terminal-bg)]">
      {/* Mobile Sidebar Overlay */}
      {isComponentVisible ? (
        <MobileSiderbar toggleComponentVisibility={toggleComponentVisibility} />
      ) : null}

      {/* Left Sidebar - Desktop */}
      <div className="hidden flex-shrink-0 bg-[var(--terminal-bg)] md:flex md:w-[260px] md:flex-col border-r border-[var(--terminal-primary-dim)]">
        <div className="flex h-full min-h-0 flex-col">
          <Sidebar
            onNewSession={handleNewSession}
            onSelectSession={handleSelectSession}
          />
        </div>
      </div>

      {/* Main Chat Area */}
      <Chat
        toggleComponentVisibility={toggleComponentVisibility}
        toggleScriptPanel={toggleScriptPanel}
        isScriptPanelOpen={isScriptPanelOpen}
        activeScript={activeScript}
        onScriptComplete={handleScriptComplete}
      />

      {/* Right Script Panel - Desktop */}
      <div
        data-tutorial="script-panel"
        className={`
          hidden md:flex flex-shrink-0 bg-[var(--terminal-bg)]
          transition-all duration-300 ease-in-out
          ${isScriptPanelOpen ? "md:w-[280px]" : "md:w-0"}
        `}
      >
        <ScriptPanel
          isOpen={isScriptPanelOpen}
          activeScript={activeScript}
          onStartScript={handleStartScript}
          onStopScript={handleStopScript}
          completedScripts={completedScripts}
        />
      </div>

      {/* Script Panel Toggle Button - Desktop */}
      <button
        onClick={toggleScriptPanel}
        data-tutorial="script-toggle"
        className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-20 bg-[var(--terminal-bg)] border border-[var(--terminal-primary-dim)] border-r-0 p-2 hover:bg-[var(--terminal-primary)]/10"
        style={{ right: isScriptPanelOpen ? "280px" : "0" }}
        title={isScriptPanelOpen ? "關閉腳本庫" : "開啟腳本庫"}
      >
        <span className="text-[var(--terminal-primary)] text-xs">
          {isScriptPanelOpen ? "◁" : "▷"}
        </span>
      </button>

      {/* Completion Toast */}
      {showCompletionToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[var(--terminal-bg)] border-2 border-[var(--terminal-primary)] px-6 py-3 shadow-lg animate-fade-in-up">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✨</span>
            <div>
              <div className="text-[var(--terminal-primary)] font-bold">腳本完成！</div>
              <div className="text-[var(--terminal-primary-dim)] text-xs">AI 助理已設定完成</div>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial Overlay - First time (script panel) */}
      <TutorialOverlay
        steps={tutorialSteps}
        active={showTutorial && !activeScript && !showCoinTutorial}
        onComplete={handleTutorialComplete}
      />

      {/* Tutorial Overlay - Coin/Shop (after avatar creation) */}
      <TutorialOverlay
        steps={coinTutorialSteps}
        active={showCoinTutorial && !activeScript}
        onComplete={handleCoinTutorialComplete}
      />

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.3s ease-out forwards;
        }
      `}</style>
    </main>
  );
}
