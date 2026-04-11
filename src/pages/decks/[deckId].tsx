// Deck editor — two-pane layout: current deck on left, collection on right
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useCards, MAX_DECK_SIZE } from "@/contexts/CardContext";
import CoinDisplay from "@/components/CoinDisplay";
import CardDetail from "@/components/cards/CardDetail";
import {
  CardDefinition,
  PlayerCard,
  CardRarity,
  CardElement,
} from "@/types/Card";
import { getRarityColor, getRarityLabel, getElementEmoji } from "@/utils/cardStats";

export default function DeckEditorPage() {
  const router = useRouter();
  const { deckId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const {
    collection,
    isLoading: cardsLoading,
    getCardDef,
    updateDeckCards,
    updateDeckMeta,
    setActiveDeck,
  } = useCards();

  const deck = useMemo(() => {
    if (!collection || typeof deckId !== "string") return undefined;
    return collection.decks.find((d) => d.id === deckId);
  }, [collection, deckId]);

  // Local draft state — only saved when user clicks save
  const [draftCardIds, setDraftCardIds] = useState<string[]>([]);
  const [draftName, setDraftName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [filterRarity, setFilterRarity] = useState<CardRarity | "all">("all");
  const [filterElement, setFilterElement] = useState<CardElement | "all">("all");
  const [sortBy, setSortBy] = useState<"rarity" | "name" | "level">("rarity");
  const [detailCard, setDetailCard] = useState<{
    def: CardDefinition;
    pc?: PlayerCard;
  } | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (deck) {
      setDraftCardIds(deck.cardIds);
      setDraftName(deck.name);
    }
  }, [deck]);

  if (authLoading || cardsLoading || !user || !collection) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: "var(--terminal-color)" }}>
          載入中...
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <div className="text-lg mb-4">找不到牌組</div>
        <button
          onClick={() => router.push("/decks")}
          className="px-4 py-2 border rounded"
          style={{ borderColor: "var(--terminal-color)", color: "var(--terminal-color)" }}
        >
          ← 返回牌組管理
        </button>
      </div>
    );
  }

  const isDirty =
    JSON.stringify(draftCardIds) !== JSON.stringify(deck.cardIds) || draftName !== deck.name;

  // All owned cards, enriched with definition
  const ownedCards = collection.cards
    .map((pc) => ({
      pc,
      def: getCardDef(pc.cardId),
    }))
    .filter((c): c is { pc: PlayerCard; def: CardDefinition } => Boolean(c.def));

  // Apply filters/sort
  const rarityOrder: Record<string, number> = {
    legendary: 0,
    epic: 1,
    rare: 2,
    common: 3,
  };

  const filtered = ownedCards
    .filter((c) => {
      if (filterRarity !== "all" && c.def.rarity !== filterRarity) return false;
      if (filterElement !== "all" && c.def.element !== filterElement) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "rarity":
          return (rarityOrder[a.def.rarity] || 9) - (rarityOrder[b.def.rarity] || 9);
        case "name":
          return a.def.name.localeCompare(b.def.name);
        case "level":
          return b.pc.level - a.pc.level;
        default:
          return 0;
      }
    });

  // Deck breakdown
  const deckDefs = draftCardIds
    .map((id) => getCardDef(id))
    .filter((d): d is CardDefinition => Boolean(d));

  const rarityCount = deckDefs.reduce(
    (acc, d) => {
      acc[d.rarity] = (acc[d.rarity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const elementCount = deckDefs.reduce(
    (acc, d) => {
      acc[d.element] = (acc[d.element] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const inDeck = (cardId: string) => draftCardIds.includes(cardId);

  const toggleCard = (cardId: string) => {
    setDraftCardIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= MAX_DECK_SIZE) {
        return prev;
      }
      return [...prev, cardId];
    });
  };

  const handleSave = () => {
    if (draftName.trim() !== deck.name) {
      updateDeckMeta(deck.id, { name: draftName.trim() || deck.name });
    }
    updateDeckCards(deck.id, draftCardIds);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1600);
  };

  const handleReset = () => {
    setDraftCardIds(deck.cardIds);
    setDraftName(deck.name);
    setIsEditingName(false);
  };

  const handleClearDeck = () => {
    if (confirm("確定要清空牌組？")) {
      setDraftCardIds([]);
    }
  };

  const isActive = deck.id === collection.activeDeckId;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (isDirty && !confirm("尚未儲存變更，確定離開？")) return;
                router.push("/decks");
              }}
              className="text-sm hover:underline"
              style={{ color: "var(--terminal-color)" }}
            >
              ← 牌組列表
            </button>
            {isEditingName ? (
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setIsEditingName(false);
                  if (e.key === "Escape") {
                    setDraftName(deck.name);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                maxLength={20}
                className="text-xl font-bold bg-black border-b border-[var(--terminal-color)] outline-none px-2"
                style={{ color: "var(--terminal-color)" }}
              />
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="text-xl font-bold hover:underline flex items-center gap-2"
                style={{ color: "var(--terminal-color)" }}
                title="點擊重新命名"
              >
                🗂️ {draftName}
                <span className="text-xs text-gray-500">✏️</span>
              </button>
            )}
            {isActive && (
              <span
                className="text-[10px] px-2 py-0.5 rounded font-bold"
                style={{ backgroundColor: "var(--terminal-color)", color: "#000" }}
              >
                ● 對戰牌組
              </span>
            )}
          </div>
          <CoinDisplay />
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
        {/* LEFT PANEL — Current deck */}
        <div className="lg:col-span-2 flex flex-col border border-gray-700 rounded-lg bg-gray-900/30 min-h-0">
          <div className="border-b border-gray-700 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400">本牌組</div>
              <div className="text-lg font-bold">
                <span
                  className={
                    draftCardIds.length === 0
                      ? "text-red-400"
                      : draftCardIds.length < MAX_DECK_SIZE
                      ? "text-yellow-400"
                      : "text-green-400"
                  }
                >
                  {draftCardIds.length}
                </span>
                <span className="text-gray-500"> / {MAX_DECK_SIZE}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleClearDeck}
                disabled={draftCardIds.length === 0}
                className="text-xs px-2 py-1 border border-gray-600 rounded text-gray-400 hover:text-red-400 hover:border-red-400 disabled:opacity-30 transition-colors"
              >
                清空
              </button>
            </div>
          </div>

          {/* Rarity breakdown */}
          <div className="border-b border-gray-700 px-4 py-2 flex gap-3 text-[10px] flex-wrap">
            {(["legendary", "epic", "rare", "common"] as CardRarity[]).map((r) => (
              <span key={r} className={getRarityColor(r)}>
                {getRarityLabel(r)} {rarityCount[r] || 0}
              </span>
            ))}
            <span className="text-gray-500">|</span>
            {Object.entries(elementCount).map(([el, count]) => (
              <span key={el}>
                {getElementEmoji(el as CardElement)} {count}
              </span>
            ))}
          </div>

          {/* Deck card list */}
          <div className="flex-1 overflow-y-auto p-3">
            {draftCardIds.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-12">
                牌組是空的
                <br />
                <span className="text-xs">從右側收藏點選卡牌加入</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {draftCardIds.map((cardId, idx) => {
                  const def = getCardDef(cardId);
                  const pc = collection.cards.find((c) => c.cardId === cardId);
                  if (!def) return null;
                  return (
                    <button
                      key={`${cardId}_${idx}`}
                      onClick={() => toggleCard(cardId)}
                      className="relative aspect-[3/4] rounded border border-gray-600 bg-black/60 overflow-hidden hover:border-red-400 transition-colors group"
                      title="點擊移除"
                    >
                      {def.imageUrl ? (
                        <img
                          src={def.imageUrl}
                          alt={def.name}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-3xl">
                          {def.emoji}
                        </div>
                      )}
                      {/* Rarity badge */}
                      <div
                        className={`absolute top-0.5 left-0.5 text-[8px] font-bold bg-black/80 px-1 rounded ${getRarityColor(def.rarity)}`}
                      >
                        {getRarityLabel(def.rarity)}
                      </div>
                      {/* Name */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[9px] text-white truncate px-1 py-0.5 text-center">
                        {def.name}
                        {pc && pc.level > 1 && (
                          <span className="text-yellow-400 ml-0.5">Lv{pc.level}</span>
                        )}
                      </div>
                      {/* Remove X overlay */}
                      <div className="absolute inset-0 bg-red-600/0 group-hover:bg-red-600/50 flex items-center justify-center transition-colors">
                        <span className="text-2xl font-bold text-white opacity-0 group-hover:opacity-100">
                          ✕
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save bar */}
          <div className="border-t border-gray-700 p-3 flex items-center justify-between gap-2">
            <div className="text-[10px] text-gray-500">
              {isDirty ? (
                <span className="text-yellow-400">未儲存</span>
              ) : (
                <span className="text-gray-500">已儲存</span>
              )}
              {savedToast && <span className="ml-2 text-green-400">✓ 已儲存</span>}
            </div>
            <div className="flex gap-2">
              {isDirty && (
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 text-xs border border-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                >
                  還原
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!isDirty}
                className="px-4 py-1.5 text-xs border-2 rounded font-bold hover:bg-[var(--terminal-color)] hover:text-black disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--terminal-color)] transition-colors"
                style={{ borderColor: "var(--terminal-color)", color: "var(--terminal-color)" }}
              >
                💾 儲存
              </button>
            </div>
          </div>

          {!isActive && draftCardIds.length > 0 && (
            <div className="border-t border-gray-700 px-3 py-2">
              <button
                onClick={() => setActiveDeck(deck.id)}
                className="w-full text-xs py-1.5 border border-yellow-500 rounded text-yellow-400 hover:bg-yellow-500 hover:text-black transition-colors"
              >
                設為對戰牌組
              </button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Collection */}
        <div className="lg:col-span-3 flex flex-col border border-gray-700 rounded-lg bg-gray-900/30 min-h-0">
          <div className="border-b border-gray-700 px-4 py-3">
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="text-xs text-gray-400">收藏</div>
                <div className="text-lg font-bold">
                  {ownedCards.length} 張卡牌
                  <span className="text-xs text-gray-500 ml-2">點擊加入/移除</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <select
                value={filterRarity}
                onChange={(e) => setFilterRarity(e.target.value as any)}
                className="bg-black border border-gray-600 rounded px-2 py-1 text-xs"
                style={{ color: "var(--terminal-color)" }}
              >
                <option value="all">全部稀有度</option>
                <option value="legendary">傳說</option>
                <option value="epic">史詩</option>
                <option value="rare">稀有</option>
                <option value="common">普通</option>
              </select>
              <select
                value={filterElement}
                onChange={(e) => setFilterElement(e.target.value as any)}
                className="bg-black border border-gray-600 rounded px-2 py-1 text-xs"
                style={{ color: "var(--terminal-color)" }}
              >
                <option value="all">全部屬性</option>
                <option value="fire">🔥 火</option>
                <option value="water">💧 水</option>
                <option value="earth">🌍 地</option>
                <option value="wind">🌬️ 風</option>
                <option value="electric">⚡ 電</option>
                <option value="neutral">⭐ 中立</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-black border border-gray-600 rounded px-2 py-1 text-xs"
                style={{ color: "var(--terminal-color)" }}
              >
                <option value="rarity">按稀有度</option>
                <option value="level">按等級</option>
                <option value="name">按名稱</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-12">
                {ownedCards.length === 0 ? "尚未擁有任何卡牌 — 先去抽卡吧！" : "沒有符合條件的卡牌"}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {filtered.map(({ pc, def }) => {
                  const selected = inDeck(def.id);
                  const deckFull = draftCardIds.length >= MAX_DECK_SIZE && !selected;
                  return (
                    <div key={def.id} className="relative">
                      <button
                        onClick={() => !deckFull && toggleCard(def.id)}
                        disabled={deckFull}
                        className={`relative aspect-[3/4] rounded border-2 overflow-hidden transition-all w-full ${
                          selected
                            ? "border-green-400 ring-2 ring-green-400/50"
                            : deckFull
                            ? "border-gray-800 opacity-30 cursor-not-allowed"
                            : "border-gray-700 hover:border-gray-400"
                        }`}
                      >
                        {def.imageUrl ? (
                          <img
                            src={def.imageUrl}
                            alt={def.name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-4xl bg-gray-900">
                            {def.emoji}
                          </div>
                        )}
                        {/* Rarity badge */}
                        <div
                          className={`absolute top-1 left-1 text-[8px] font-bold bg-black/80 px-1 rounded ${getRarityColor(def.rarity)}`}
                        >
                          {getRarityLabel(def.rarity)}
                        </div>
                        <div className="absolute top-1 right-1 text-[10px] bg-black/80 px-1 rounded">
                          {getElementEmoji(def.element)}
                        </div>
                        {pc.duplicateCount > 0 && (
                          <div className="absolute top-1 right-6 text-[8px] text-yellow-400 bg-black/80 px-1 rounded font-bold">
                            ×{pc.duplicateCount + 1}
                          </div>
                        )}
                        {/* Name + level */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[9px] text-white truncate px-1 py-0.5 text-center">
                          {def.name}
                          {pc.level > 1 && (
                            <span className="text-yellow-400 ml-0.5">Lv{pc.level}</span>
                          )}
                        </div>
                        {/* Selected checkmark */}
                        {selected && (
                          <div className="absolute inset-0 bg-green-400/20 flex items-center justify-center">
                            <div className="w-8 h-8 bg-green-400 rounded-full flex items-center justify-center text-black font-bold">
                              ✓
                            </div>
                          </div>
                        )}
                      </button>
                      {/* Info button — opens CardDetail */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailCard({ def, pc });
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black border border-gray-500 text-[10px] text-gray-300 hover:text-white hover:border-white transition-colors z-10"
                        title="詳細資訊"
                      >
                        i
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {detailCard && (
        <CardDetail
          definition={detailCard.def}
          playerCard={detailCard.pc}
          onClose={() => setDetailCard(null)}
        />
      )}
    </div>
  );
}
