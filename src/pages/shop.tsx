import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useCoin } from "@/contexts/CoinContext";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import SpriteAnimator from "@/components/SpriteAnimator";
import CoinDisplay from "@/components/CoinDisplay";
import TutorialOverlay, { TutorialStep } from "@/components/TutorialOverlay";
import { uploadAvatarFrames } from "@/lib/firestore";

// 預設配件選項
const PRESET_ACCESSORIES = [
  { id: "hat", emoji: "🎩", name: "紳士帽", description: "wearing a fancy top hat" },
  { id: "crown", emoji: "👑", name: "皇冠", description: "wearing a golden crown" },
  { id: "glasses", emoji: "👓", name: "眼鏡", description: "wearing cool glasses" },
  { id: "bow", emoji: "🎀", name: "蝴蝶結", description: "with a cute bow tie" },
  { id: "cape", emoji: "🦸", name: "披風", description: "wearing a hero cape" },
  { id: "scarf", emoji: "🧣", name: "圍巾", description: "wearing a cozy scarf" },
  { id: "headphones", emoji: "🎧", name: "耳機", description: "wearing stylish headphones" },
  { id: "flower", emoji: "🌸", name: "花朵", description: "with a beautiful flower" },
];

const ACCESSORY_COST = 500;
const THEME_COST = 30;

type ShopTab = "themes" | "accessories";

export default function Shop() {
  const router = useRouter();
  const { user, isLoading, updateUser } = useAuth();
  const { coins, spendCoins, canAfford } = useCoin();
  const { currentTheme, setTheme, purchaseTheme, hasTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<ShopTab>("themes");
  const [selectedAccessory, setSelectedAccessory] = useState<string | null>(null);
  const [customDescription, setCustomDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewFrames, setPreviewFrames] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [themeMessage, setThemeMessage] = useState<string | null>(null);
  const [showShopTutorial, setShowShopTutorial] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  // Check if redirected with tab query param
  useEffect(() => {
    if (router.query.tab === "themes") {
      setActiveTab("themes");
    }
  }, [router.query.tab]);

  // Trigger shop tutorial on first visit
  useEffect(() => {
    if (user && !isLoading) {
      const shopTutorialKey = `tutorial_shop_done_${user.id}`;
      if (!localStorage.getItem(shopTutorialKey)) {
        const timer = setTimeout(() => setShowShopTutorial(true), 600);
        return () => clearTimeout(timer);
      }
    }
  }, [user, isLoading]);

  const handleShopTutorialComplete = () => {
    setShowShopTutorial(false);
    if (user) {
      localStorage.setItem(`tutorial_shop_done_${user.id}`, "1");
    }
  };

  const shopTutorialSteps: TutorialStep[] = [
    {
      target: "[data-tutorial='shop-themes-tab']",
      text: "歡迎來到商店！這裡可以用金幣購買介面主題和 AI 助理配件！先來看看主題吧！",
      position: "bottom",
      beforeShow: () => setActiveTab("themes"),
    },
    {
      target: "[data-tutorial='shop-theme-item']",
      text: "試試看！點這個主題就可以購買並套用，介面顏色馬上就會改變喔！",
      position: "bottom",
      clickToAdvance: true,
    },
    {
      target: "[data-tutorial='shop-back-btn']",
      text: "看！整個介面的顏色都變了！點「返回」回到主頁看看效果吧！金幣還能用來買配件和更多東西，多跟 AI 對話、完成任務就能賺取更多金幣！",
      position: "bottom",
      clickToAdvance: true,
    },
  ];

  const avatar = user?.avatar;

  const handleBuyTheme = (themeId: string) => {
    const theme = THEMES.find((t) => t.id === themeId);
    if (!theme) return;

    if (hasTheme(themeId)) {
      // Already owned — just apply it
      setTheme(themeId);
      setThemeMessage(`已切換至「${theme.label}」主題！`);
      setTimeout(() => setThemeMessage(null), 2000);
      return;
    }

    if (!canAfford(theme.price)) {
      setThemeMessage(`金幣不足！需要 ${theme.price} ◆`);
      setTimeout(() => setThemeMessage(null), 2000);
      return;
    }

    const success = spendCoins(theme.price, `購買主題: ${theme.label}`);
    if (success) {
      purchaseTheme(themeId);
      setTheme(themeId);
      setThemeMessage(`成功購買並套用「${theme.label}」主題！`);
      setTimeout(() => setThemeMessage(null), 3000);
    }
  };

  const handleSelectAccessory = (accessoryId: string) => {
    if (selectedAccessory === accessoryId) {
      setSelectedAccessory(null);
    } else {
      setSelectedAccessory(accessoryId);
      setCustomDescription("");
    }
    setPreviewFrames(null);
    setError(null);
  };

  const handleGeneratePreview = async () => {
    if (!avatar) return;

    const accessory = PRESET_ACCESSORIES.find(a => a.id === selectedAccessory);
    const accessoryDescription = accessory?.description || customDescription;

    if (!accessoryDescription) {
      setError("請選擇配件或輸入描述");
      return;
    }

    if (!canAfford(ACCESSORY_COST)) {
      setError(`需要 ${ACCESSORY_COST} ◆ 才能生成配件！`);
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const success = spendCoins(ACCESSORY_COST, `購買配件: ${accessory?.name || "自訂配件"}`);
      if (!success) {
        setError("金幣不足！");
        setIsGenerating(false);
        return;
      }

      const basePrompt = avatar.prompt || `A cute ${avatar.name} character, pixel art style`;
      const newPrompt = `${basePrompt}, ${accessoryDescription}`;

      const response = await fetch("/api/generate-avatar-pixellab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: newPrompt,
          name: avatar.name,
        }),
      });

      const result = await response.json();

      if (result.success && result.frames) {
        setPreviewFrames(result.frames);
      } else {
        setError(result.error || "生成失敗");
      }
    } catch (err: any) {
      setError(err.message || "生成失敗");
    }

    setIsGenerating(false);
  };

  const handleApplyAccessory = async () => {
    if (!previewFrames || !avatar || !user) return;

    const accessory = PRESET_ACCESSORIES.find(a => a.id === selectedAccessory);
    const accessoryDescription = accessory?.description || customDescription;

    let frames = previewFrames;
    let imageUrl = previewFrames[0];
    try {
      const avatarId = avatar.id || `avatar_${Date.now()}`;
      const urls = await uploadAvatarFrames(user.id, avatarId, previewFrames);
      frames = urls;
      imageUrl = urls[0];
    } catch (e) {
      console.error("Failed to upload frames, using base64 fallback:", e);
    }

    const updatedAvatar = {
      ...avatar,
      imageUrl,
      frames,
      frameCount: frames.length,
      prompt: `${avatar.prompt}, ${accessoryDescription}`,
    };

    await updateUser({ ...user, avatar: updatedAvatar });
    router.push("/");
  };

  if (isLoading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--terminal-bg)] terminal-screen terminal-scanline">
        <div className="text-[var(--terminal-primary)] glow-text flex items-center gap-2">
          <span className="animate-spin">*</span>
          LOADING...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--terminal-bg)] terminal-screen terminal-scanline">
      {/* Header */}
      <div className="border-b border-[var(--terminal-primary-dim)] p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              data-tutorial="shop-back-btn"
              onClick={() => router.push("/")}
              className="text-[var(--terminal-primary)] hover:glow-text"
            >
              ← 返回
            </button>
            <pre className="text-[var(--terminal-primary)] glow-text text-xs">
{`╔═══════════════════╗
║   AVATAR_SHOP     ║
╚═══════════════════╝`}
            </pre>
          </div>
          <CoinDisplay />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <div className="flex border-b border-[var(--terminal-primary-dim)]">
          <button
            data-tutorial="shop-themes-tab"
            onClick={() => setActiveTab("themes")}
            className={`px-6 py-2 text-sm transition-all ${
              activeTab === "themes"
                ? "text-[var(--terminal-bg)] bg-[var(--terminal-primary)] border-b-2 border-[var(--terminal-primary)]"
                : "text-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)]/10"
            }`}
          >
            主題商店
          </button>
          <button
            onClick={() => setActiveTab("accessories")}
            className={`px-6 py-2 text-sm transition-all ${
              activeTab === "accessories"
                ? "text-[var(--terminal-bg)] bg-[var(--terminal-primary)] border-b-2 border-[var(--terminal-primary)]"
                : "text-[var(--terminal-primary)] hover:bg-[var(--terminal-primary)]/10"
            }`}
          >
            配件商店
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {/* ===== THEME SHOP TAB ===== */}
        {activeTab === "themes" && (
          <div className="space-y-6">
            {/* Message */}
            {themeMessage && (
              <div className="border border-[var(--terminal-primary)] bg-[var(--terminal-primary)]/10 p-3 text-[var(--terminal-primary)] text-sm text-center">
                {themeMessage}
              </div>
            )}

            <div className="text-[var(--terminal-accent)] text-xs mb-2">
              {'>'} 選擇介面主題（每個 {THEME_COST} ◆）
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {THEMES.map((theme) => {
                const owned = hasTheme(theme.id);
                const active = currentTheme.id === theme.id;
                const affordable = canAfford(theme.price);

                return (
                  <button
                    key={theme.id}
                    data-tutorial={theme.id === "matrix" ? "shop-theme-item" : undefined}
                    onClick={() => handleBuyTheme(theme.id)}
                    disabled={!owned && !affordable && theme.price > 0}
                    className={`relative p-4 border-2 text-left transition-all ${
                      active
                        ? "border-[var(--terminal-primary)] shadow-[0_0_16px_var(--terminal-primary-glow)]"
                        : owned
                        ? "border-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)]"
                        : affordable || theme.price === 0
                        ? "border-[var(--terminal-primary-dim)] opacity-80 hover:opacity-100 hover:border-[var(--terminal-primary)]"
                        : "border-gray-700 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    {/* Color preview bar */}
                    <div
                      className="h-2 rounded-full mb-3"
                      style={{ backgroundColor: theme.preview }}
                    />

                    {/* Theme preview mini terminal */}
                    <div
                      className="rounded p-2 mb-3 text-[10px] leading-relaxed"
                      style={{
                        backgroundColor: theme.vars["--terminal-bg"],
                        color: theme.vars["--terminal-primary"],
                        border: `1px solid ${theme.vars["--terminal-primary-dim"]}`,
                      }}
                    >
                      <div style={{ color: theme.vars["--terminal-accent"] }}>{'>'} LAB TERMINAL</div>
                      <div>Hello World!</div>
                      <div style={{ color: theme.vars["--terminal-highlight"] }}>USER@LAB:~$</div>
                    </div>

                    {/* Theme info */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[var(--terminal-primary)] text-sm font-bold">
                          {theme.label}
                        </div>
                        <div className="text-[var(--terminal-primary-dim)] text-[10px]">
                          {theme.name}
                        </div>
                      </div>
                      <div className="text-right">
                        {active ? (
                          <span className="text-[var(--terminal-primary)] text-xs">使用中</span>
                        ) : owned ? (
                          <span className="text-[var(--terminal-primary-dim)] text-xs">已擁有</span>
                        ) : theme.price === 0 ? (
                          <span className="text-[var(--terminal-primary-dim)] text-xs">免費</span>
                        ) : (
                          <span className="text-yellow-400 text-xs">{theme.price} ◆</span>
                        )}
                      </div>
                    </div>

                    {/* Active indicator */}
                    {active && (
                      <div
                        className="absolute top-2 right-2 w-2 h-2 rounded-full"
                        style={{ backgroundColor: theme.preview, boxShadow: `0 0 8px ${theme.preview}` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="text-[var(--terminal-primary-dim)] text-xs space-y-1">
              <div>• 點擊主題即可購買並套用</div>
              <div>• 已購買的主題可隨時切換</div>
              <div>• 主題會改變整個介面的配色</div>
            </div>
          </div>
        )}

        {/* ===== ACCESSORIES TAB ===== */}
        {activeTab === "accessories" && (
          <>
            {!avatar?.imageUrl ? (
              <div className="text-center py-12">
                <div className="text-[var(--terminal-primary-dim)] text-lg mb-4">
                  尚未創建 AI 助理
                </div>
                <button
                  onClick={() => router.push("/")}
                  className="terminal-btn px-6 py-2"
                >
                  前往創建
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-8">
                {/* 左側：當前 Avatar 和預覽 */}
                <div className="space-y-6">
                  <div className="border border-[var(--terminal-primary-dim)] p-4">
                    <div className="text-[var(--terminal-accent)] text-xs mb-4">
                      {'>'} {previewFrames ? "預覽新造型" : "當前造型"}
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="border-2 border-[var(--terminal-primary)] p-2">
                        {previewFrames ? (
                          <SpriteAnimator
                            frames={previewFrames}
                            frameCount={previewFrames.length}
                            fps={8}
                            width={160}
                            height={160}
                            playing={true}
                          />
                        ) : avatar.frames && avatar.frames.length > 1 ? (
                          <SpriteAnimator
                            frames={avatar.frames}
                            frameCount={avatar.frames.length}
                            fps={8}
                            width={160}
                            height={160}
                            playing={true}
                          />
                        ) : (
                          <img
                            src={avatar.imageUrl}
                            alt={avatar.name}
                            className="w-40 h-40 object-contain bg-white"
                            style={{ imageRendering: "pixelated" }}
                          />
                        )}
                      </div>
                      <div className="text-[var(--terminal-primary)] text-lg mt-3 glow-text">
                        {avatar.name}
                      </div>
                    </div>

                    {previewFrames && (
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={handleApplyAccessory}
                          className="flex-1 terminal-btn py-2 bg-green-500/20 border-green-500 text-green-400 hover:bg-green-500 hover:text-black"
                        >
                          ✓ 套用新造型
                        </button>
                        <button
                          onClick={() => setPreviewFrames(null)}
                          className="flex-1 terminal-btn py-2 hover:bg-[var(--terminal-red)] hover:border-[var(--terminal-red)]"
                        >
                          ✕ 取消
                        </button>
                      </div>
                    )}
                  </div>

                  {isGenerating && (
                    <div className="border border-[var(--terminal-primary)] p-4 text-center">
                      <div className="animate-spin text-4xl text-[var(--terminal-primary)] mb-2">*</div>
                      <div className="text-[var(--terminal-primary)]">正在生成新造型...</div>
                    </div>
                  )}

                  {error && (
                    <div className="border border-[var(--terminal-red)] bg-red-500/10 p-3 text-[var(--terminal-red)] text-sm">
                      {error}
                    </div>
                  )}
                </div>

                {/* 右側：配件選擇 */}
                <div className="space-y-6">
                  <div className="border border-[var(--terminal-primary-dim)] p-4">
                    <div className="text-[var(--terminal-accent)] text-xs mb-4">
                      {'>'} 選擇配件
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_ACCESSORIES.map((accessory) => (
                        <button
                          key={accessory.id}
                          onClick={() => handleSelectAccessory(accessory.id)}
                          className={`p-3 border text-center transition-all ${
                            selectedAccessory === accessory.id
                              ? "border-[var(--terminal-primary)] glow-text"
                              : "border-[var(--terminal-primary-dim)] opacity-60 hover:opacity-100 hover:border-[var(--terminal-primary)]"
                          }`}
                          style={selectedAccessory === accessory.id ? {
                            backgroundColor: "var(--terminal-primary)",
                            color: "var(--terminal-bg)",
                            boxShadow: "0 0 12px var(--terminal-primary)",
                          } : undefined}
                        >
                          <div className="text-2xl mb-1">{accessory.emoji}</div>
                          <div className="text-[10px] text-[var(--terminal-primary-dim)]">
                            {accessory.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border border-[var(--terminal-primary-dim)] p-4">
                    <div className="text-[var(--terminal-accent)] text-xs mb-4">
                      {'>'} 或者輸入自訂描述
                    </div>
                    <textarea
                      value={customDescription}
                      onChange={(e) => {
                        setCustomDescription(e.target.value);
                        setSelectedAccessory(null);
                      }}
                      placeholder="例如: wearing a wizard hat with stars"
                      className="w-full bg-transparent border border-[var(--terminal-primary-dim)] text-[var(--terminal-primary)] p-2 text-sm resize-none"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={handleGeneratePreview}
                    disabled={isGenerating || (!selectedAccessory && !customDescription) || !canAfford(ACCESSORY_COST)}
                    className={`w-full terminal-btn py-3 text-sm flex items-center justify-center gap-2 ${
                      !canAfford(ACCESSORY_COST)
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-[var(--terminal-primary)] hover:text-[var(--terminal-bg)]"
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <span className="animate-spin">*</span>
                        生成中...
                      </>
                    ) : (
                      <>
                        <span>🎨 生成新造型</span>
                        <span className="text-yellow-400">(-{ACCESSORY_COST} ◆)</span>
                      </>
                    )}
                  </button>

                  <div className="text-[var(--terminal-primary-dim)] text-xs space-y-1">
                    <div>• 每次生成需花費 {ACCESSORY_COST} ◆</div>
                    <div>• 生成後可以選擇是否套用</div>
                    <div>• 配件會永久保存在你的 AI 助理上</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Shop Tutorial */}
      <TutorialOverlay
        steps={shopTutorialSteps}
        active={showShopTutorial}
        onComplete={handleShopTutorialComplete}
      />
    </main>
  );
}
