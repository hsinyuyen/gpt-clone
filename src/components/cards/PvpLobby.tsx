// PvP matchmaking lobby — real PvP rooms and "online players" (AI-backed)
// rooms are rendered in ONE unified list. Visually they're indistinguishable;
// only the join handler differs. Designed so the lobby always feels alive.
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { PvpBattleRoom } from '@/types/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import { getOpenPvpRooms, savePvpRoom, deletePvpRoom } from '@/lib/firestore';
import { v4 as uuidv4 } from 'uuid';
import { QUICK_ROOMS, QuickRoom } from '@/data/cards/quick-rooms';

interface PvpLobbyProps {
  onJoinRoom: (room: PvpBattleRoom) => void;
}

// Unified lobby entry — the UI doesn't expose which kind it is.
type LobbyEntry =
  | { kind: 'pvp'; id: string; name: string; wins?: number; losses?: number; isMine: boolean; raw: PvpBattleRoom }
  | { kind: 'quick'; id: string; name: string; wins: number; losses: number; raw: QuickRoom };

export default function PvpLobby({ onJoinRoom }: PvpLobbyProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { collection, activeDeck, setActiveDeck } = useCards();
  const [rooms, setRooms] = useState<PvpBattleRoom[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDeckPicker, setShowDeckPicker] = useState(false);

  const getActiveDeckIds = (): string[] => activeDeck?.cardIds || [];
  const getDeckCardLevels = (deckIds: string[]): Record<string, number> => {
    const levels: Record<string, number> = {};
    if (!collection) return levels;
    for (const id of deckIds) {
      const pc = collection.cards.find((c) => c.cardId === id);
      if (pc && pc.level > 1) levels[id] = pc.level;
    }
    return levels;
  };

  const fetchRooms = async () => {
    setRefreshing(true);
    const openRooms = await getOpenPvpRooms();
    setRooms(openRooms);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = async () => {
    if (!user) return;
    const deckIds = getActiveDeckIds();
    if (deckIds.length === 0) {
      alert('你的牌組是空的！請先到牌組管理設定牌組。');
      return;
    }
    setIsCreating(true);

    const room: PvpBattleRoom = {
      id: uuidv4(),
      player1Id: user.id,
      player1Name: user.displayName || user.username,
      player1DeckCardIds: deckIds,
      player1CardLevels: getDeckCardLevels(deckIds),
      status: 'waiting',
      turnTimeLimit: 30,
      createdAt: new Date().toISOString(),
    };

    await savePvpRoom(room);
    onJoinRoom(room);
    setIsCreating(false);
  };

  const handleJoinRoom = async (room: PvpBattleRoom) => {
    if (!user) return;
    const deckIds = getActiveDeckIds();
    if (deckIds.length === 0) {
      alert('你的牌組是空的！請先到牌組管理設定牌組。');
      return;
    }

    const updated: PvpBattleRoom = {
      ...room,
      player2Id: user.id,
      player2Name: user.displayName || user.username,
      player2DeckCardIds: deckIds,
      player2CardLevels: getDeckCardLevels(deckIds),
      status: 'ready',
    };

    await savePvpRoom(updated);
    onJoinRoom(updated);
  };

  const handleDeleteRoom = async (roomId: string) => {
    await deletePvpRoom(roomId);
    fetchRooms();
  };

  const handleEnterQuickRoom = (room: QuickRoom) => {
    if (!user) return;
    const deckIds = getActiveDeckIds();
    if (deckIds.length === 0) {
      alert('你的牌組是空的！請先到牌組管理設定牌組。');
      return;
    }
    const seed = (Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 1e9);
    router.push(`/battle?room=${room.id}&seed=${seed}`);
  };

  // Build the merged lobby list. Real rooms first (so users see them when
  // someone hosts), then quick rooms — all rendered identically.
  const lobbyEntries: LobbyEntry[] = useMemo(() => {
    const entries: LobbyEntry[] = [];
    for (const r of rooms) {
      entries.push({
        kind: 'pvp',
        id: r.id,
        name: r.player1Name,
        isMine: r.player1Id === user?.id,
        raw: r,
      });
    }
    for (const q of QUICK_ROOMS) {
      entries.push({
        kind: 'quick',
        id: q.id,
        name: q.name,
        wins: q.fakeWins,
        losses: q.fakeLosses,
        raw: q,
      });
    }
    return entries;
  }, [rooms, user?.id]);

  return (
    <div className="p-4">
      {/* Active deck bar */}
      <div className="mb-4 p-3 border border-gray-700 rounded bg-gray-900/40">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-gray-400">出戰牌組：</span>
            <span className="text-white font-bold ml-1">
              {activeDeck?.name || '（未選擇）'}
            </span>
            <span className="text-gray-400 text-xs ml-2">
              ({activeDeck?.cardIds.length || 0} 張)
            </span>
          </div>
          <button
            onClick={() => setShowDeckPicker((v) => !v)}
            className="px-3 py-1 text-xs border border-gray-600 rounded hover:border-[var(--terminal-color)] hover:text-[var(--terminal-color)] transition-colors"
          >
            🗂️ 換牌組
          </button>
        </div>
        {showDeckPicker && collection && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {collection.decks.map((deck) => {
              const isActive = deck.id === collection.activeDeckId;
              const isEmpty = deck.cardIds.length === 0;
              return (
                <button
                  key={deck.id}
                  onClick={() => {
                    if (isEmpty) return;
                    setActiveDeck(deck.id);
                    setShowDeckPicker(false);
                  }}
                  disabled={isEmpty}
                  className={`p-2 text-left border rounded transition-colors ${
                    isActive
                      ? 'border-[var(--terminal-color)] bg-[var(--terminal-color)]/10'
                      : 'border-gray-700 hover:border-gray-500'
                  } ${isEmpty ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-sm font-bold text-white truncate">
                    {isActive && '● '}{deck.name}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {deck.cardIds.length} 張{isEmpty && ' · 空牌組'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--terminal-color)' }}>
          ⚔️ PvP 對戰大廳
        </h2>
        <div className="flex gap-2">
          <button
            onClick={fetchRooms}
            disabled={refreshing}
            className="px-3 py-1 text-xs border border-gray-600 rounded hover:border-[var(--terminal-color)] transition-colors"
            style={{ color: 'var(--terminal-color)' }}
          >
            {refreshing ? '更新中...' : '🔄 重新整理'}
          </button>
          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="px-3 py-1 text-xs border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
            style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
          >
            {isCreating ? '建立中...' : '+ 建立房間'}
          </button>
        </div>
      </div>

      {/* Unified lobby list — real PvP rooms + AI-backed rooms together */}
      {lobbyEntries.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <div className="text-4xl mb-3">🏟️</div>
          <p>目前沒有等待中的房間</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lobbyEntries.map((e) => {
            const total = (e.wins || 0) + (e.losses || 0);
            const winRate = total > 0 ? Math.round(((e.wins || 0) / total) * 100) : null;
            const isOwnPvpRoom = e.kind === 'pvp' && e.isMine;

            return (
              <div
                key={`${e.kind}_${e.id}`}
                className="p-3 border border-gray-600 rounded-lg bg-black/40 flex justify-between items-center hover:border-gray-500 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate" style={{ color: 'var(--terminal-color)' }}>
                      {e.name}
                    </div>
                    {total > 0 && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {e.wins} 勝 · {e.losses} 敗 · 勝率 {winRate}%
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {isOwnPvpRoom ? (
                    <button
                      onClick={() => handleDeleteRoom(e.id)}
                      className="px-3 py-1 text-xs border border-red-600 text-red-400 rounded hover:bg-red-900/30"
                    >
                      取消
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        e.kind === 'pvp' ? handleJoinRoom(e.raw) : handleEnterQuickRoom(e.raw)
                      }
                      className="px-3 py-1 text-xs border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
                      style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
                    >
                      加入對戰
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
