// PvP Battle Lobby - matchmaking and room management
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useCoin } from '@/contexts/CoinContext';
import CoinDisplay from '@/components/CoinDisplay';
import PvpLobby from '@/components/cards/PvpLobby';
import { PvpBattleRoom } from '@/types/Card';

export default function BattleLobbyPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  const handleJoinRoom = (room: PvpBattleRoom) => {
    router.push(`/battle-pvp?roomId=${room.id}`);
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-700 p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/battle')}
              className="text-sm hover:underline"
              style={{ color: 'var(--terminal-color)' }}
            >
              ← 返回對戰
            </button>
            <h1 className="text-xl font-bold" style={{ color: 'var(--terminal-color)' }}>
              🏟️ PvP 對戰大廳
            </h1>
          </div>
          <CoinDisplay />
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        <PvpLobby onJoinRoom={handleJoinRoom} />
      </div>
    </div>
  );
}
