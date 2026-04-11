// Real-time PvP Duel page - Yu-Gi-Oh Master Duel style
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import CoinDisplay from '@/components/CoinDisplay';
import DuelField from '@/components/cards/DuelField';
import DuelLog from '@/components/cards/DuelLog';
import { DuelState, PvpBattleRoom } from '@/types/Card';
import {
  initPvpDuel,
  advancePhase,
  normalSummon,
  declareAttack,
  changePosition,
  swapDuelState,
} from '@/utils/duelEngine';
import { savePvpRoom, deletePvpRoom } from '@/lib/firestore';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

// Firestore rejects undefined — strip them before save
function sanitize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default function BattlePvpPage() {
  const router = useRouter();
  const { roomId } = router.query;
  const { user, isLoading } = useAuth();
  const { cardImageMap } = useCards();

  const [room, setRoom] = useState<PvpBattleRoom | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  // Live-listen to the room
  useEffect(() => {
    if (!roomId || typeof roomId !== 'string') return;
    const unsub = onSnapshot(doc(db, 'pvpRooms', roomId), (snap) => {
      if (snap.exists()) setRoom(snap.data() as PvpBattleRoom);
      else setRoom(null);
    });
    return () => unsub();
  }, [roomId]);

  // Determine which side this local user is on
  const isPlayer1 = !!(user && room && user.id === room.player1Id);
  const isPlayer2 = !!(user && room && user.id === room.player2Id);
  const localRealSide: 'player' | 'enemy' = isPlayer1 ? 'player' : 'enemy';

  // Player1 initializes the duel state as soon as both players are ready
  useEffect(() => {
    if (!room || !isPlayer1) return;
    if (room.status !== 'ready') return;
    if (!room.player1DeckCardIds || !room.player2DeckCardIds) return;
    if (room.battleState) return;

    const initial = initPvpDuel(
      room.player1DeckCardIds,
      room.player2DeckCardIds,
      cardImageMap
    );
    // Auto-advance the first player's draw phase (skip draw click on turn 1).
    // initPvpDuel coin-flips firstPlayer; in real-state terms, 'player' = player1
    // and 'enemy' = player2.
    const afterDraw = advancePhase(initial);
    const firstPlayerId = afterDraw.firstPlayer === 'player' ? room.player1Id : room.player2Id;

    const updated: PvpBattleRoom = {
      ...room,
      battleState: afterDraw,
      status: 'battling',
      currentTurnPlayerId: firstPlayerId,
      lastActionAt: new Date().toISOString(),
    };
    savePvpRoom(sanitize(updated));
  }, [room, isPlayer1, cardImageMap]);

  // Show result overlay once battle finishes
  useEffect(() => {
    if (room?.battleState?.status === 'victory' || room?.battleState?.status === 'defeat') {
      // Let the KO animation play before showing result
      const t = setTimeout(() => setShowResult(true), 1800);
      return () => clearTimeout(t);
    }
  }, [room?.battleState?.status]);

  // === View-state (always local = 'player' side of the DuelField) ===
  const viewState: DuelState | null = useMemo(() => {
    if (!room?.battleState) return null;
    return isPlayer2 ? swapDuelState(room.battleState) : room.battleState;
  }, [room?.battleState, isPlayer2]);

  // Whose turn is it from the local user's perspective?
  const isPlayerTurn = !!viewState && viewState.currentPlayer === 'player' && viewState.status === 'dueling';

  // === Shared mutator: apply a function to the REAL state, save to Firestore ===
  const commitNewState = useCallback(async (newReal: DuelState) => {
    if (!room) return;
    const updated: PvpBattleRoom = {
      ...room,
      battleState: newReal,
      currentTurnPlayerId: newReal.currentPlayer === 'player' ? room.player1Id : room.player2Id,
      lastActionAt: new Date().toISOString(),
      ...(newReal.status === 'victory' && { status: 'finished' as const, winnerId: room.player1Id }),
      ...(newReal.status === 'defeat' && { status: 'finished' as const, winnerId: room.player2Id }),
    };
    await savePvpRoom(sanitize(updated));
  }, [room]);

  // === Player actions ===
  const handleSummon = useCallback((
    handIndex: number,
    zoneIndex: number,
    position: 'attack' | 'defense' | 'facedown_defense',
    tributeIndices: number[]
  ) => {
    if (!room?.battleState || !isPlayerTurn) return;
    const newReal = normalSummon(
      room.battleState,
      localRealSide,
      handIndex,
      zoneIndex,
      position,
      tributeIndices
    );
    commitNewState(newReal);
  }, [room, isPlayerTurn, localRealSide, commitNewState]);

  const handleAttack = useCallback((attackerZone: number, targetZone: number) => {
    if (!room?.battleState || !isPlayerTurn) return;
    if (room.battleState.currentPhase !== 'battle') return;
    const newReal = declareAttack(room.battleState, localRealSide, attackerZone, targetZone);
    commitNewState(newReal);
  }, [room, isPlayerTurn, localRealSide, commitNewState]);

  const handleChangePosition = useCallback((zoneIndex: number) => {
    if (!room?.battleState || !isPlayerTurn) return;
    const field = localRealSide === 'player' ? room.battleState.player : room.battleState.enemy;
    const monster = field.monsters[zoneIndex];
    if (!monster) return;
    const newPos = monster.position === 'attack' ? 'defense' : 'attack';
    const newReal = changePosition(room.battleState, localRealSide, zoneIndex, newPos);
    commitNewState(newReal);
  }, [room, isPlayerTurn, localRealSide, commitNewState]);

  const handleAdvancePhase = useCallback(() => {
    if (!room?.battleState || !isPlayerTurn) return;
    let newReal = advancePhase(room.battleState);
    // Same "one-click end turn" UX as PvE: battle → skip end → opponent draw
    if (room.battleState.currentPhase === 'battle' && newReal.currentPhase === 'end') {
      newReal = advancePhase(newReal);
    }
    commitNewState(newReal);
  }, [room, isPlayerTurn, commitNewState]);

  const handleLeaveRoom = async () => {
    if (room && isPlayer1 && room.status !== 'battling') {
      await deletePvpRoom(room.id);
    }
    router.push('/battle-lobby');
  };

  // ========== Render ==========

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  // Room does not exist
  if (!room) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3">🏚️</div>
          <div className="text-gray-400 mb-4">房間不存在或已結束</div>
          <button
            onClick={() => router.push('/battle-lobby')}
            className="px-5 py-2 border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
            style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
          >
            返回大廳
          </button>
        </div>
      </div>
    );
  }

  // Authorization check - only the two involved players can see this room
  if (!isPlayer1 && !isPlayer2) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-4">你不是這個房間的玩家</div>
          <button
            onClick={() => router.push('/battle-lobby')}
            className="px-5 py-2 border-2 rounded font-bold"
            style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
          >
            返回大廳
          </button>
        </div>
      </div>
    );
  }

  const opponentName = isPlayer1 ? room.player2Name : room.player1Name;
  const opponentJoined = isPlayer1 ? !!room.player2Id : !!room.player1Id;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-700 p-3 flex-shrink-0">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={handleLeaveRoom}
              className="text-sm hover:underline"
              style={{ color: 'var(--terminal-color)' }}
            >
              ← 離開房間
            </button>
            <h1 className="text-lg font-bold" style={{ color: 'var(--terminal-color)' }}>
              ⚔️ PvP 決鬥
            </h1>
            {opponentName && (
              <span className="text-xs text-gray-400">
                vs <span className="text-purple-400 font-bold">{opponentName}</span>
              </span>
            )}
          </div>
          <CoinDisplay />
        </div>
      </div>

      {/* Waiting screen */}
      {room.status === 'waiting' && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4 animate-pulse">⏳</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--terminal-color)' }}>
              等待對手加入...
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              分享房間代碼，或等待其他玩家在大廳加入
            </p>
            <div className="bg-gray-900 border border-gray-700 rounded p-3 mb-4">
              <div className="text-xs text-gray-500 mb-1">房間 ID</div>
              <div className="text-xs font-mono text-purple-300 break-all">{room.id}</div>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-5 py-2 border-2 border-red-500 text-red-400 rounded font-bold transition-colors hover:bg-red-900/30"
            >
              取消房間
            </button>
          </div>
        </div>
      )}

      {/* Ready / Initializing screen */}
      {room.status === 'ready' && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">⚔️</div>
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--terminal-color)' }}>
              {opponentJoined ? '決鬥即將開始...' : '等待對手...'}
            </h2>
            <p className="text-sm text-gray-400">初始化決鬥場地中</p>
          </div>
        </div>
      )}

      {/* Actual duel */}
      {room.status === 'battling' && viewState && (
        <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
          <div className="flex-1 min-h-0 relative">
            <DuelField
              state={viewState}
              onSummon={handleSummon}
              onAttack={handleAttack}
              onChangePosition={handleChangePosition}
              onAdvancePhase={handleAdvancePhase}
              isPlayerTurn={isPlayerTurn}
            />
            {/* Turn indicator for the waiting player */}
            {!isPlayerTurn && viewState.status === 'dueling' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900/95 px-4 py-2 rounded-lg border border-purple-600 shadow-lg z-20">
                <span className="text-sm animate-pulse font-bold text-purple-400">
                  ⌛ 等待 {opponentName} 行動中...
                </span>
              </div>
            )}
          </div>
          <div className="flex-shrink-0 p-2">
            <DuelLog entries={viewState.log} />
          </div>
        </div>
      )}

      {/* Result overlay */}
      {showResult && viewState && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div
            className="bg-gray-900 border-2 rounded-lg p-6 max-w-md w-full text-center"
            style={{ borderColor: viewState.status === 'victory' ? '#eab308' : '#ef4444' }}
          >
            <div className={`text-5xl mb-4 ${viewState.status === 'victory' ? 'text-yellow-400' : 'text-red-400'}`}>
              {viewState.status === 'victory' ? '🏆' : '💀'}
            </div>
            <h2
              className={`text-2xl font-bold mb-2 ${
                viewState.status === 'victory' ? 'text-yellow-400' : 'text-red-400'
              }`}
            >
              {viewState.status === 'victory' ? '決鬥勝利！' : '決鬥敗北...'}
            </h2>
            <div className="text-gray-400 text-sm mb-4">
              第 {viewState.turn} 回合結束
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <div className="text-gray-500">你的 LP</div>
                <div className="text-lg font-bold" style={{ color: 'var(--terminal-color)' }}>
                  {viewState.player.lp}
                </div>
              </div>
              <div>
                <div className="text-gray-500">對手 LP</div>
                <div className="text-lg font-bold text-red-400">
                  {viewState.enemy.lp}
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/battle-lobby')}
              className="w-full py-2 border-2 rounded font-bold transition-all hover:scale-105"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              返回大廳
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
