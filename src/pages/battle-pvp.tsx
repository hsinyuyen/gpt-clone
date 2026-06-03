// Real-time PvP Duel page - Yu-Gi-Oh Master Duel style
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  flipSummon,
  swapDuelState,
  resolvePendingSpecialSummon,
} from '@/utils/duelEngine';
import { savePvpRoom, deletePvpRoom, incrementBattleWin } from '@/lib/firestore';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import CardGameGuard from '@/components/CardGameGuard';
import { useCoin } from '@/contexts/CoinContext';

// Firestore rejects undefined — strip them before save
function sanitize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export default function BattlePvpPage() {
  const router = useRouter();
  const { roomId } = router.query;
  const { user, isLoading } = useAuth();
  const { cardImageMap } = useCards();
  const { addCoins } = useCoin();

  const PVP_REWARD_COINS = 20;

  const [room, setRoom] = useState<PvpBattleRoom | null>(null);
  const [showResult, setShowResult] = useState(false);
  const rewardGrantedRef = useRef(false);

  // Opponent attack dash animation
  type DashInfo = { from: 'player' | 'enemy'; fromZone: number; toZone: number; isDirect: boolean };
  const [opponentDash, setOpponentDash] = useState<DashInfo | null>(null);
  const [opponentHighlight, setOpponentHighlight] = useState<{ side: 'player' | 'enemy'; zone: number } | null>(null);
  const prevViewStateRef = useRef<DuelState | null>(null);

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
      cardImageMap,
      room.player1CardLevels || {},
      room.player2CardLevels || {}
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

  // Award coins + track win on PvP victory (ref-guarded to prevent double-fire)
  useEffect(() => {
    if (rewardGrantedRef.current) return;
    if (!user || !room || room.status !== 'finished') return;
    if (room.winnerId !== user.id) return;

    rewardGrantedRef.current = true;
    addCoins(PVP_REWARD_COINS, 'PvP 決鬥勝利');
    incrementBattleWin(user.id, 'pvp');
  }, [room, user, addCoins]);

  // === View-state (always local = 'player' side of the DuelField) ===
  const viewState: DuelState | null = useMemo(() => {
    if (!room?.battleState) return null;
    return isPlayer2 ? swapDuelState(room.battleState) : room.battleState;
  }, [room?.battleState, isPlayer2]);

  // Whose turn is it from the local user's perspective?
  const isPlayerTurn = !!viewState && viewState.currentPlayer === 'player' && viewState.status === 'dueling';

  // Detect opponent attacks from state diff and play dash animation
  useEffect(() => {
    const prev = prevViewStateRef.current;
    prevViewStateRef.current = viewState;
    if (!prev || !viewState) return;
    // Only detect attacks when it was the opponent's turn (not player's)
    if (prev.currentPlayer === 'player') return;

    // Find new attack logs from the enemy
    const newLogs = viewState.log.slice(prev.log.length);
    const attackLog = newLogs.find(
      (l) => l.type === 'attack' && l.actor === 'enemy'
    );
    if (!attackLog) return;

    // Determine attacker zone and target zone from monster state diff
    let fromZone = -1;
    let toZone = -1;
    let isDirect = false;

    // Find which enemy monster attacked (attackCount increased)
    for (let i = 0; i < 5; i++) {
      const prevM = prev.enemy.monsters[i];
      const currM = viewState.enemy.monsters[i];
      if (prevM && currM && currM.attackCount > prevM.attackCount) {
        fromZone = i;
        break;
      }
      // Also check hasAttacked flip
      if (prevM && currM && !prevM.hasAttacked && currM.hasAttacked) {
        fromZone = i;
        break;
      }
    }
    if (fromZone < 0) return;

    // Check if a player monster was destroyed (target zone)
    for (let i = 0; i < 5; i++) {
      if (prev.player.monsters[i] && !viewState.player.monsters[i]) {
        toZone = i;
        break;
      }
    }

    // If no monster was destroyed, check for LP damage (direct attack)
    if (toZone < 0 && viewState.player.lp < prev.player.lp) {
      isDirect = true;
      toZone = -1;
    }

    // If we still can't determine target, check if any player monster took damage
    if (toZone < 0 && !isDirect) {
      for (let i = 0; i < 5; i++) {
        const pM = prev.player.monsters[i];
        const cM = viewState.player.monsters[i];
        if (pM && cM && (cM.currentAtk < pM.currentAtk || cM.currentDef < pM.currentDef)) {
          toZone = i;
          break;
        }
      }
      // Fallback: pick first alive player monster
      if (toZone < 0) {
        toZone = viewState.player.monsters.findIndex((m) => m !== null);
        if (toZone < 0) isDirect = true;
      }
    }

    // Play highlight → dash → clear sequence
    if (!isDirect && toZone >= 0) {
      setOpponentHighlight({ side: 'player', zone: toZone });
    }
    const t1 = setTimeout(() => {
      setOpponentDash({ from: 'enemy', fromZone, toZone, isDirect });
      const t2 = setTimeout(() => {
        setOpponentDash(null);
        setOpponentHighlight(null);
      }, 400);
      return () => clearTimeout(t2);
    }, 300);
    return () => clearTimeout(t1);
  }, [viewState]);

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

  const handleFlipSummon = useCallback((zoneIndex: number) => {
    if (!room?.battleState || !isPlayerTurn) return;
    const newReal = flipSummon(room.battleState, localRealSide, zoneIndex);
    commitNewState(newReal);
  }, [room, isPlayerTurn, localRealSide, commitNewState]);

  // Resolve a pending special summon — only the owner's side can pick.
  const handleResolveSpecialSummon = useCallback((handIndex: number) => {
    if (!room?.battleState?.pendingSpecialSummon) return;
    // Only the side that owns the pending summon may resolve it
    if (room.battleState.pendingSpecialSummon.owner !== localRealSide) return;
    const newReal = resolvePendingSpecialSummon(room.battleState, handIndex);
    commitNewState(newReal);
  }, [room, localRealSide, commitNewState]);

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
    <CardGameGuard>
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

      {/* Actual duel — keep visible during 'finished' so KO animation plays */}
      {(room.status === 'battling' || room.status === 'finished') && viewState && (
        <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
          <div className="flex-1 min-h-0 relative">
            <DuelField
              state={viewState}
              onSummon={handleSummon}
              onAttack={handleAttack}
              onChangePosition={handleChangePosition}
              onFlipSummon={handleFlipSummon}
              onAdvancePhase={handleAdvancePhase}
              isPlayerTurn={isPlayerTurn}
              onResolveSpecialSummon={handleResolveSpecialSummon}
              pendingSpecialSummonIsMine={viewState.pendingSpecialSummon?.owner === 'player'}
              externalDash={opponentDash}
              externalHighlight={opponentHighlight}
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
            {viewState.status === 'victory' && (
              <div className="text-yellow-400 text-sm font-bold mb-3 animate-pulse">
                🪙 +{PVP_REWARD_COINS} 金幣
              </div>
            )}
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
    </CardGameGuard>
  );
}
