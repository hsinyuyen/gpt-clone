// Admin page — generate signature ATTACK animations for any card. Uses Kling
// V3 Pro on fal.ai (image-to-video). Search/filter the entire card pool to
// pick which cards to generate animations for.
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useCards } from "@/contexts/CardContext";
import { CardDefinition, CardElement, CardRarity } from "@/types/Card";
import { ALL_CARDS } from "@/data/cards/pools";
import {
  CardAnimationData,
  getAllCardAnimations,
  saveCardAnimation,
} from "@/lib/firestore";

// === Attack prompt templates ============================================
// Element-specific motion vocabulary for cards we don't have a hand-tuned
// hint for — feeds into a generic attack template.
const ELEMENT_ATTACK_MOTION: Record<CardElement, string> = {
  fire: "blazing fire erupts from the creature, scorching flames and embers shoot forward, intense heat distortion",
  water: "torrential water surges forward in a crashing wave, sea spray and high-pressure jets blast the camera",
  earth: "ground cracks open as massive rocks and stone shards launch forward, seismic shockwave ripples outward",
  wind: "swirling tornado winds and razor-sharp air slashes cut forward, leaves and debris whip violently",
  electric: "blinding electric arcs and lightning bolts strike forward in a chain, plasma discharge crackles around the body",
  neutral: "raw energy surges forward in a radiant beam, the creature's aura pulses with pure power",
};

// Hand-crafted per-card attack scenes for the marquee legendary cards.
// Add more as you fine-tune.
const CARD_PROMPT_HINTS: Record<string, string> = {
  worm_emperor:
    "ancient worm emperor opens its enormous fanged mouth and unleashes a devastating purple void beam directly at the camera, dark energy tendrils whip outward, crimson eyes flash, dramatic low angle as the beam impact lights the scene",
  mainframe_worm:
    "biomechanical mainframe worm channels electric arcs along all its segments then fires a blinding neon energy beam forward, holographic data shards erupt outward, cyberpunk anime aesthetic, dramatic camera shake on impact",
  htc_20:
    "ultimate war machine slams its arm cannon forward and discharges a massive blue plasma blast, mechanical plates flare open, sparks and steam burst out, low angle as the cannon recoils with the shot",
  basic_fire_08:
    "majestic sun bird beats its enormous flaming wings and dives forward, exhaling a torrent of golden solar fire, sun rays burst behind it, the entire screen glows with divine flame",
  basic_electric_08:
    "mighty electromagnetic dragon arches back then lunges forward, unleashing a chain of blue and purple lightning bolts from its jaws, electric shockwave radiates outward, anime fight scene aesthetic",
};

const PROMPT_PREFIX =
  "Cinematic attack animation, dynamic action shot, the character lunges and unleashes its signature attack toward the camera, hyperrealistic detail, 24fps cinematic motion blur, dramatic lighting, depth of field,";
const PROMPT_SUFFIX =
  ", anime fight scene aesthetic, Yu-Gi-Oh duel attack cinematic, intense epic mood, dramatic camera shake on impact";

const MODEL_OPTIONS = [
  {
    id: "fal-ai/kling-video/v3/pro/image-to-video",
    label: "Kling V3 Pro（推薦・最高品質・含音效）",
    estimateText: "約 1~5 分鐘 / ~$0.4-0.6 一支",
  },
  {
    id: "fal-ai/kling-video/v3/standard/image-to-video",
    label: "Kling V3 Standard（較便宜）",
    estimateText: "約 1~3 分鐘 / ~$0.2 一支",
  },
];

type Status = "idle" | "generating" | "success" | "error";
type RarityFilter = "all" | CardRarity;
type AnimFilter = "all" | "has" | "none";
type SortMode = "rarity-desc" | "name" | "id";

const RARITY_RANK: Record<CardRarity, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

const RARITY_COLOR: Record<CardRarity, string> = {
  legendary: "text-yellow-400",
  epic: "text-purple-400",
  rare: "text-blue-400",
  common: "text-gray-400",
};

export default function CardAnimationsAdminPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { cardImageMap } = useCards();
  const [animations, setAnimations] = useState<Record<string, CardAnimationData>>({});
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, { elapsed: number; phase: string }>>({});
  const cancelFlagsRef = React.useRef<Record<string, boolean>>({});

  const [modelId, setModelId] = useState(MODEL_OPTIONS[0].id);
  const [duration, setDuration] = useState("3");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [customPrompts, setCustomPrompts] = useState<Record<string, string>>({});

  // Card selection / filter UI state
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [animFilter, setAnimFilter] = useState<AnimFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("rarity-desc");

  useEffect(() => {
    if (!isLoading && (!user || !["admin", "teacher", "老師"].includes(user.username.toLowerCase()))) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    getAllCardAnimations().then(setAnimations);
  }, []);

  const resolveImageUrl = (card: CardDefinition): string => {
    return cardImageMap[card.id] || card.imageUrl || "";
  };

  // Build the displayed card list based on filters
  const filteredCards: CardDefinition[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = ALL_CARDS.filter((c) => {
      if (rarityFilter !== "all" && c.rarity !== rarityFilter) return false;
      const hasAnim = !!animations[c.id]?.attackUrl;
      if (animFilter === "has" && !hasAnim) return false;
      if (animFilter === "none" && hasAnim) return false;
      if (q) {
        const hay = `${c.name} ${c.nameEn || ""} ${c.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list];
    list.sort((a, b) => {
      if (sortMode === "rarity-desc") {
        const dr = (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0);
        if (dr !== 0) return dr;
        return a.name.localeCompare(b.name, "zh-TW");
      }
      if (sortMode === "name") return a.name.localeCompare(b.name, "zh-TW");
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [search, rarityFilter, animFilter, sortMode, animations]);

  const buildPrompt = (card: CardDefinition): string => {
    const custom = customPrompts[card.id]?.trim();
    if (custom) return custom;
    const handTuned = CARD_PROMPT_HINTS[card.id];
    if (handTuned) {
      return `${PROMPT_PREFIX} ${handTuned}${PROMPT_SUFFIX}`;
    }
    // Generic: combine card metadata + element-specific motion
    const elementMotion = ELEMENT_ATTACK_MOTION[card.element] || ELEMENT_ATTACK_MOTION.neutral;
    const subject = `${card.name}${card.nameEn ? ` (${card.nameEn})` : ""}`;
    const desc = card.description ? `, ${card.description}` : "";
    return `${PROMPT_PREFIX} subject: ${subject}${desc}, ${elementMotion}, the creature's signature attack pose${PROMPT_SUFFIX}`;
  };

  const cancelGeneration = (cardId: string) => {
    cancelFlagsRef.current[cardId] = true;
    setStatuses((s) => ({ ...s, [cardId]: "idle" }));
    setProgress((p) => {
      const next = { ...p };
      delete next[cardId];
      return next;
    });
  };

  const generate = async (card: CardDefinition) => {
    const key = card.id;
    const imageUrl = resolveImageUrl(card);

    if (!imageUrl) {
      setErrors((e) => ({ ...e, [key]: "找不到卡片圖片，請先在「卡片圖片」頁上傳圖" }));
      setStatuses((s) => ({ ...s, [key]: "error" }));
      return;
    }

    cancelFlagsRef.current[key] = false;
    setStatuses((s) => ({ ...s, [key]: "generating" }));
    setErrors((e) => ({ ...e, [key]: "" }));
    setProgress((p) => ({ ...p, [key]: { elapsed: 0, phase: "提交任務中..." } }));

    const startTime = Date.now();
    const tickProgress = (phase: string) => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setProgress((p) => ({ ...p, [key]: { elapsed, phase } }));
    };

    try {
      const prompt = buildPrompt(card);

      const submitRes = await fetch("/api/generate-video-fal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          modelId,
          imageUrl,
          prompt,
          duration,
          generateAudio,
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) throw new Error(submitData.error || "提交失敗");
      const { statusUrl, responseUrl } = submitData;
      if (!statusUrl || !responseUrl) {
        throw new Error("fal 沒回傳 statusUrl/responseUrl");
      }

      tickProgress("等待 Kling 處理中...");

      const pollIntervalMs = 5000;
      const maxAttempts = 120;

      for (let i = 0; i < maxAttempts; i++) {
        if (cancelFlagsRef.current[key]) throw new Error("使用者取消");
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        if (cancelFlagsRef.current[key]) throw new Error("使用者取消");

        const pollRes = await fetch("/api/generate-video-fal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "poll", statusUrl, responseUrl }),
        });
        const pollData = await pollRes.json();
        if (!pollRes.ok) {
          tickProgress(`⚠ 查詢失敗 (${pollData.error || pollRes.status}) 重試中...`);
          continue;
        }

        if (pollData.status === "COMPLETED" && pollData.videoUrl) {
          tickProgress("✓ 完成，儲存中...");
          await saveCardAnimation(card.id, "attackUrl", pollData.videoUrl);
          await saveCardAnimation(card.id, "drawRevealUrl", pollData.videoUrl);
          setAnimations((prev) => ({
            ...prev,
            [card.id]: {
              ...(prev[card.id] || {}),
              attackUrl: pollData.videoUrl,
              drawRevealUrl: pollData.videoUrl,
              updatedAt: new Date().toISOString(),
            },
          }));
          setStatuses((s) => ({ ...s, [key]: "success" }));
          setProgress((p) => {
            const next = { ...p };
            delete next[key];
            return next;
          });
          return;
        }

        if (pollData.status === "FAILED") {
          throw new Error(`Kling 生成失敗：${JSON.stringify(pollData.details || pollData.error)}`);
        }

        const phaseLabel =
          pollData.status === "IN_QUEUE"
            ? `排隊中${pollData.queuePosition !== undefined ? `（第 ${pollData.queuePosition} 位）` : ""}`
            : pollData.status === "IN_PROGRESS"
            ? "Kling 渲染中..."
            : `狀態: ${pollData.status}`;
        tickProgress(phaseLabel);
      }

      throw new Error("超過 10 分鐘仍未完成 — 請去 fal.ai dashboard 查看");
    } catch (err: any) {
      setErrors((e) => ({ ...e, [key]: err.message || String(err) }));
      setStatuses((s) => ({ ...s, [key]: "error" }));
      setProgress((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  };

  const setManualUrl = async (card: CardDefinition, url: string) => {
    if (!url.trim()) return;
    await saveCardAnimation(card.id, "attackUrl", url.trim());
    await saveCardAnimation(card.id, "drawRevealUrl", url.trim());
    setAnimations((prev) => ({
      ...prev,
      [card.id]: {
        ...(prev[card.id] || {}),
        attackUrl: url.trim(),
        drawRevealUrl: url.trim(),
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const clearAnimation = async (card: CardDefinition) => {
    await saveCardAnimation(card.id, "attackUrl", "");
    await saveCardAnimation(card.id, "drawRevealUrl", "");
    setAnimations((prev) => {
      const next = { ...prev };
      delete next[card.id];
      return next;
    });
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-yellow-400">
        載入中...
      </div>
    );
  }

  const totalWithAnim = Object.values(animations).filter((a) => a.attackUrl).length;

  return (
    <div className="min-h-screen bg-black text-yellow-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-yellow-400">🎬 卡片簽名攻擊動畫</h1>
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 text-sm border border-gray-600 hover:bg-gray-800"
          >
            ← 返回 Admin
          </button>
        </div>

        <div className="border border-yellow-700 bg-yellow-900/10 p-3 mb-4 text-xs">
          <p className="font-bold text-yellow-400 mb-1">⚠ 操作說明</p>
          <ul className="list-disc ml-5 space-y-0.5 text-yellow-200/80">
            <li>影片描述該卡正在<b>攻擊</b>的畫面（攻擊與抽卡登場共用同一支影片）</li>
            <li>用 <b>Kling V3 Pro</b>，以該卡的卡片圖片為基底進行 image-to-video</li>
            <li>每次生成需要 <b>1~5 分鐘</b>，瀏覽器要保持開啟，可隨時取消</li>
            <li>生成的 URL 會即時存到 Firestore，遊戲端會自動套用</li>
            <li>目前已生成：<b>{totalWithAnim}</b> 張動畫</li>
          </ul>
        </div>

        {/* Global generation settings */}
        <div className="border-2 border-purple-700 bg-purple-900/10 p-3 mb-4 rounded-lg">
          <h3 className="font-bold text-purple-300 text-sm mb-2">⚙ 生成設定（套用到所有卡）</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <label className="block text-xs text-gray-400 mb-1">模型</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-2 py-1.5 bg-black border border-gray-600 text-yellow-100"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <div className="text-[10px] text-gray-500 mt-1">
                {MODEL_OPTIONS.find((m) => m.id === modelId)?.estimateText}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">時長（秒）</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-2 py-1.5 bg-black border border-gray-600 text-yellow-100"
              >
                {["3", "4", "5", "6", "7", "8", "10"].map((d) => (
                  <option key={d} value={d}>{d} 秒</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">音效</label>
              <label className="flex items-center gap-2 px-2 py-1.5 bg-black border border-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateAudio}
                  onChange={(e) => setGenerateAudio(e.target.checked)}
                />
                <span className="text-sm">生成原生音效</span>
              </label>
            </div>
          </div>
        </div>

        {/* Card selector / filters */}
        <div className="border border-cyan-700 bg-cyan-900/10 p-3 mb-4 rounded-lg space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 搜尋卡片名稱 / ID..."
              className="flex-1 min-w-[200px] px-3 py-1.5 bg-black border border-gray-600 text-yellow-100 text-sm"
            />
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
              className="px-2 py-1.5 bg-black border border-gray-600 text-yellow-100 text-sm"
            >
              <option value="all">全部稀有度</option>
              <option value="legendary">傳說</option>
              <option value="epic">史詩</option>
              <option value="rare">稀有</option>
              <option value="common">普通</option>
            </select>
            <select
              value={animFilter}
              onChange={(e) => setAnimFilter(e.target.value as AnimFilter)}
              className="px-2 py-1.5 bg-black border border-gray-600 text-yellow-100 text-sm"
            >
              <option value="all">全部</option>
              <option value="has">✓ 已生成</option>
              <option value="none">✗ 未生成</option>
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-2 py-1.5 bg-black border border-gray-600 text-yellow-100 text-sm"
            >
              <option value="rarity-desc">稀有度由高到低</option>
              <option value="name">名稱字母</option>
              <option value="id">ID</option>
            </select>
          </div>
          <div className="text-[11px] text-cyan-300">
            顯示 {filteredCards.length} / {ALL_CARDS.length} 張卡
          </div>
        </div>

        {/* Card list */}
        <div className="space-y-3">
          {filteredCards.length === 0 ? (
            <div className="text-center py-12 text-gray-500">沒有符合條件的卡片</div>
          ) : (
            filteredCards.map((card) => {
              const status = statuses[card.id] || "idle";
              const error = errors[card.id];
              const anim = animations[card.id];
              const url = anim?.attackUrl || anim?.drawRevealUrl;
              const imageUrl = resolveImageUrl(card);
              const finalPrompt = buildPrompt(card);

              return (
                <div key={card.id} className="border-2 border-yellow-600 rounded-lg bg-gray-950 p-3">
                  <div className="flex flex-col md:flex-row gap-3">
                    {/* Left: card info + image */}
                    <div className="flex items-start gap-3 md:w-1/3">
                      {imageUrl ? (
                        <img src={imageUrl} alt={card.name} className="w-20 h-20 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-20 h-20 rounded bg-gray-800 flex items-center justify-center text-3xl flex-shrink-0">
                          {card.emoji}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-yellow-400 truncate">{card.name}</h2>
                          <span className={`text-[10px] font-bold ${RARITY_COLOR[card.rarity]}`}>
                            {card.rarity.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate">{card.nameEn}</div>
                        <div className="text-[9px] text-gray-500 mt-0.5">{card.id} · {card.element}</div>
                        {!imageUrl && (
                          <div className="text-[10px] text-red-400 mt-1">⚠ 尚未上傳卡片圖</div>
                        )}
                      </div>
                    </div>

                    {/* Right: video preview + controls */}
                    <div className="flex-1 border border-gray-700 rounded p-2 bg-black/40">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold">⚔ 攻擊動畫</span>
                        {url && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-green-400">✓ 已設定</span>
                            <button
                              onClick={() => clearAnimation(card)}
                              className="text-[10px] text-red-400 hover:text-red-300"
                              title="清除此動畫"
                            >
                              清除
                            </button>
                          </div>
                        )}
                      </div>

                      {url && (
                        <video
                          src={url}
                          controls
                          muted
                          className="w-full rounded mb-2 max-h-40 bg-black"
                        />
                      )}

                      <details className="mb-2 text-[11px]">
                        <summary className="cursor-pointer text-gray-400 hover:text-yellow-300">
                          🎨 編輯 Prompt（留空使用預設模板）
                        </summary>
                        <textarea
                          value={customPrompts[card.id] ?? ""}
                          onChange={(e) => setCustomPrompts((p) => ({ ...p, [card.id]: e.target.value }))}
                          placeholder={finalPrompt}
                          className="w-full mt-1 p-2 bg-black border border-gray-700 text-yellow-100 text-[11px] font-mono"
                          rows={4}
                        />
                        <div className="text-[10px] text-gray-500 mt-1 break-words">
                          將實際送出：<code className="text-yellow-300/60">{customPrompts[card.id]?.trim() || finalPrompt}</code>
                        </div>
                      </details>

                      {status === "generating" ? (
                        <div className="space-y-2 mb-2">
                          <div className="w-full py-2 px-3 text-xs border border-yellow-600 bg-yellow-900/20 rounded">
                            <div className="font-bold text-yellow-300">🎞 {progress[card.id]?.phase || "處理中..."}</div>
                            <div className="text-[10px] text-gray-400 mt-1">
                              已等候 {progress[card.id]?.elapsed || 0} 秒
                            </div>
                          </div>
                          <button
                            onClick={() => cancelGeneration(card.id)}
                            className="w-full py-1.5 text-xs border border-red-600 text-red-400 hover:bg-red-900/30 rounded"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => generate(card)}
                          disabled={!imageUrl}
                          className={`w-full py-2 text-xs font-bold border rounded mb-2 transition-colors ${
                            !imageUrl
                              ? "border-gray-700 text-gray-600 cursor-not-allowed"
                              : "border-yellow-500 text-yellow-300 hover:bg-yellow-900/30"
                          }`}
                        >
                          {!imageUrl
                            ? "需先上傳卡片圖"
                            : url
                            ? "🔁 重新生成攻擊動畫"
                            : "🎬 生成攻擊動畫"}
                        </button>
                      )}

                      <details className="text-[10px] text-gray-400">
                        <summary className="cursor-pointer">手動指定 URL</summary>
                        <input
                          type="text"
                          placeholder="https://..."
                          className="w-full mt-1 px-2 py-1 bg-black border border-gray-700 text-yellow-100"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const target = e.target as HTMLInputElement;
                              setManualUrl(card, target.value);
                              target.value = "";
                            }
                          }}
                        />
                        <div className="mt-1">按 Enter 儲存</div>
                      </details>

                      {error && (
                        <div className="mt-2 text-[10px] text-red-400 break-words">
                          ✗ {error}
                        </div>
                      )}
                      {status === "success" && (
                        <div className="mt-2 text-[10px] text-green-400">
                          ✓ 生成完成！
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
