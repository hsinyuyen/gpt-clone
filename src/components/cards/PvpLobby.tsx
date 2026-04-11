// PvP matchmaking lobby
import { useState, useEffect } from 'react';
import { PvpBattleRoom } from '@/types/Card';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import { getOpenPvpRooms, savePvpRoom, deletePvpRoom } from '@/lib/firestore';
import { v4 as uuidv4 } from 'uuid';

interface PvpLobbyProps {
  onJoinRoom: (room: PvpBattleRoom) => void;
}

export default function PvpLobby({ onJoinRoom }: PvpLobbyProps) {
  const { user } = useAuth();
  const { collection } = useCards();
  const [rooms, setRooms] = useState<PvpBattleRoom[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const getActiveDeckIds = (): string[] => collection?.activeDeckCardIds || [];

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
      alert('你的牌組是空的！請先到收藏頁面設定牌組。');
      return;
    }
    setIsCreating(true);

    const room: PvpBattleRoom = {
      id: uuidv4(),
      player1Id: user.id,
      player1Name: user.displayName || user.username,
      player1DeckCardIds: deckIds,
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
      alert('你的牌組是空的！請先到收藏頁面設定牌組。');
      return;
    }

    const updated: PvpBattleRoom = {
      ...room,
      player2Id: user.id,
      player2Name: user.displayName || user.username,
      player2DeckCardIds: deckIds,
      status: 'ready',
    };

    await savePvpRoom(updated);
    onJoinRoom(updated);
  };

  const handleDeleteRoom = async (roomId: string) => {
    await deletePvpRoom(roomId);
    fetchRooms();
  };

  return (
    <div className="p-4">
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

      {rooms.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <div className="text-4xl mb-3">🏟️</div>
          <p>目前沒有等待中的房間</p>
          <p className="text-xs mt-1">建立一個房間，等待對手加入吧！</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="p-4 border border-gray-600 rounded-lg bg-black/50 flex justify-between items-center"
            >
              <div>
                <div className="font-bold text-sm" style={{ color: 'var(--terminal-color)' }}>
                  {room.player1Name} 的房間
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  建立於 {new Date(room.createdAt).toLocaleTimeString()}
                </div>
              </div>
              <div className="flex gap-2">
                {room.player1Id === user?.id ? (
                  <button
                    onClick={() => handleDeleteRoom(room.id)}
                    className="px-3 py-1 text-xs border border-red-600 text-red-400 rounded hover:bg-red-900/30"
                  >
                    取消
                  </button>
                ) : (
                  <button
                    onClick={() => handleJoinRoom(room)}
                    className="px-3 py-1 text-xs border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
                    style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
                  >
                    加入對戰
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
