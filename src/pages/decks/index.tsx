// Deck dashboard — list all saved decks with cover art
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useCards, MAX_DECKS, MAX_DECK_SIZE } from "@/contexts/CardContext";
import CoinDisplay from "@/components/CoinDisplay";
import { SavedDeck, CardDefinition } from "@/types/Card";
import { getRarityColor } from "@/utils/cardStats";

export default function DecksDashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const {
    collection,
    isLoading: cardsLoading,
    getCardDef,
    createDeck,
    deleteDeck,
    setActiveDeck,
    duplicateDeck,
  } = useCards();

  const [newDeckName, setNewDeckName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || cardsLoading || !user || !collection) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: "var(--terminal-color)" }}>
          載入中...
        </div>
      </div>
    );
  }

  const decks = collection.decks;
  const activeDeckId = collection.activeDeckId;
  const canCreate = decks.length < MAX_DECKS;

  const handleCreate = () => {
    const id = createDeck(newDeckName || `牌組 ${decks.length + 1}`);
    if (id) {
      setNewDeckName("");
      setIsCreating(false);
      router.push(`/decks/${id}`);
    }
  };

  const handleDelete = (deckId: string, name: string) => {
    if (decks.length <= 1) {
      alert("至少要保留一個牌組");
      return;
    }
    if (confirm(`確定要刪除「${name}」？`)) {
      deleteDeck(deckId);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-700 p-4">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/cards")}
              className="text-sm hover:underline"
              style={{ color: "var(--terminal-color)" }}
            >
              ← 返回收藏
            </button>
            <h1 className="text-xl font-bold" style={{ color: "var(--terminal-color)" }}>
              🗂️ 牌組管理
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <CoinDisplay />
            <button
              onClick={() => router.push("/battle")}
              className="px-3 py-1 text-sm border-2 rounded font-bold transition-colors hover:bg-red-600 hover:text-white"
              style={{ borderColor: "#ef4444", color: "#ef4444" }}
            >
              ⚔️ 對戰
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Info bar */}
        <div className="flex justify-between items-center mb-5">
          <div className="text-xs text-gray-400">
            共 <span className="text-white font-bold">{decks.length}</span> / {MAX_DECKS} 組牌組
            {collection.cards.length > 0 && (
              <span className="ml-3">收藏：{collection.cards.length} 張卡牌</span>
            )}
          </div>
          {canCreate && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-1.5 text-sm border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
              style={{ borderColor: "var(--terminal-color)", color: "var(--terminal-color)" }}
            >
              + 新增牌組
            </button>
          )}
        </div>

        {/* New deck form */}
        {isCreating && (
          <div className="mb-6 p-4 border-2 border-dashed border-gray-600 rounded-lg bg-gray-900/40">
            <div className="text-sm text-gray-300 mb-2">建立新牌組</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="例如：火焰突擊隊"
                maxLength={20}
                autoFocus
                className="flex-1 bg-black border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-[var(--terminal-color)] outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setIsCreating(false);
                }}
              />
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-sm border rounded font-bold hover:bg-[var(--terminal-color)] hover:text-black transition-colors"
                style={{ borderColor: "var(--terminal-color)", color: "var(--terminal-color)" }}
              >
                建立
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewDeckName("");
                }}
                className="px-3 py-2 text-sm border border-gray-600 rounded text-gray-400 hover:text-white"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Deck grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              isActive={deck.id === activeDeckId}
              getCardDef={getCardDef}
              onOpen={() => router.push(`/decks/${deck.id}`)}
              onSetActive={() => setActiveDeck(deck.id)}
              onDuplicate={() => {
                const id = duplicateDeck(deck.id);
                if (id) router.push(`/decks/${id}`);
              }}
              onDelete={() => handleDelete(deck.id, deck.name)}
              canDelete={decks.length > 1}
            />
          ))}

          {canCreate && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="aspect-[4/3] border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-[var(--terminal-color)] hover:text-[var(--terminal-color)] transition-colors"
            >
              <div className="text-4xl mb-2">+</div>
              <div className="text-sm">建立新牌組</div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// === DeckCard sub-component ===

interface DeckCardProps {
  deck: SavedDeck;
  isActive: boolean;
  getCardDef: (id: string) => CardDefinition | undefined;
  onOpen: () => void;
  onSetActive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function DeckCard({
  deck,
  isActive,
  getCardDef,
  onOpen,
  onSetActive,
  onDuplicate,
  onDelete,
  canDelete,
}: DeckCardProps) {
  const coverId = deck.coverCardId || deck.cardIds[0];
  const coverCard = coverId ? getCardDef(coverId) : undefined;
  const previewCards = deck.cardIds.slice(0, 4).map((id) => getCardDef(id)).filter(Boolean);

  // Rarity breakdown for the stat line
  const rarityCount = deck.cardIds.reduce(
    (acc, id) => {
      const def = getCardDef(id);
      if (def) acc[def.rarity] = (acc[def.rarity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const isEmpty = deck.cardIds.length === 0;
  const isUndersized = deck.cardIds.length < MAX_DECK_SIZE;

  return (
    <div
      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
        isActive
          ? "border-[var(--terminal-color)] shadow-[0_0_20px_rgba(0,255,0,0.25)]"
          : "border-gray-700 hover:border-gray-500"
      }`}
    >
      {/* Active indicator */}
      {isActive && (
        <div
          className="absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded font-bold"
          style={{ backgroundColor: "var(--terminal-color)", color: "#000" }}
        >
          ● ACTIVE
        </div>
      )}

      {/* Cover art */}
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-900 to-black overflow-hidden">
          {coverCard?.imageUrl ? (
            <img
              src={coverCard.imageUrl}
              alt={coverCard.name}
              className="absolute inset-0 w-full h-full object-cover opacity-70"
            />
          ) : coverCard ? (
            <div className="absolute inset-0 flex items-center justify-center text-7xl opacity-50">
              {coverCard.emoji}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
              空牌組
            </div>
          )}

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

          {/* Preview strip (top) */}
          {previewCards.length > 0 && (
            <div className="absolute top-2 left-2 flex gap-1">
              {previewCards.map((card, i) => (
                <div
                  key={`${card!.id}_${i}`}
                  className="w-8 h-10 rounded border border-white/40 bg-black/60 overflow-hidden"
                >
                  {card!.imageUrl ? (
                    <img src={card!.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg">
                      {card!.emoji}
                    </div>
                  )}
                </div>
              ))}
              {deck.cardIds.length > 4 && (
                <div className="w-8 h-10 rounded border border-white/20 bg-black/60 flex items-center justify-center text-[10px] text-white/70">
                  +{deck.cardIds.length - 4}
                </div>
              )}
            </div>
          )}

          {/* Name + size label (bottom) */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <div className="text-base font-bold text-white truncate">{deck.name}</div>
            {deck.description && (
              <div className="text-[10px] text-white/60 truncate">{deck.description}</div>
            )}
            <div className="flex items-center gap-2 mt-1 text-[10px]">
              <span
                className={`font-bold ${
                  isEmpty ? "text-red-400" : isUndersized ? "text-yellow-400" : "text-green-400"
                }`}
              >
                {deck.cardIds.length} / {MAX_DECK_SIZE}
              </span>
              {rarityCount.legendary > 0 && (
                <span className={getRarityColor("legendary")}>★{rarityCount.legendary}</span>
              )}
              {rarityCount.epic > 0 && (
                <span className={getRarityColor("epic")}>◆{rarityCount.epic}</span>
              )}
              {rarityCount.rare > 0 && (
                <span className={getRarityColor("rare")}>▲{rarityCount.rare}</span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Action bar */}
      <div className="flex border-t border-gray-700 bg-black/60">
        <button
          onClick={onOpen}
          className="flex-1 py-2 text-xs hover:bg-[var(--terminal-color)] hover:text-black transition-colors"
          style={{ color: "var(--terminal-color)" }}
        >
          編輯
        </button>
        <div className="w-px bg-gray-700" />
        {!isActive && (
          <>
            <button
              onClick={onSetActive}
              className="flex-1 py-2 text-xs text-yellow-400 hover:bg-yellow-500 hover:text-black transition-colors"
              disabled={deck.cardIds.length === 0}
              title={deck.cardIds.length === 0 ? "牌組為空，無法使用" : ""}
            >
              設為對戰牌組
            </button>
            <div className="w-px bg-gray-700" />
          </>
        )}
        <button
          onClick={onDuplicate}
          className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-700 transition-colors"
          title="複製"
        >
          ⿻
        </button>
        {canDelete && (
          <>
            <div className="w-px bg-gray-700" />
            <button
              onClick={onDelete}
              className="px-3 py-2 text-xs text-red-400 hover:bg-red-900 transition-colors"
              title="刪除"
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}
