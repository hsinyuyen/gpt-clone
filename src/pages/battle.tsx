// PvE Battle page - Yu-Gi-Oh Master Duel style
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import { useCards } from '@/contexts/CardContext';
import { useCoin } from '@/contexts/CoinContext';
import CoinDisplay from '@/components/CoinDisplay';
import DuelField from '@/components/cards/DuelField';
import DuelLog from '@/components/cards/DuelLog';
import DuelTutorial from '@/components/cards/DuelTutorial';
import CardTile from '@/components/cards/CardTile';
import { DuelState, PveOpponent } from '@/types/Card';
import { PVE_OPPONENTS } from '@/data/cards/pve-opponents';
import { getQuickRoom } from '@/data/cards/quick-rooms';
import { generateOpponentFromRoom } from '@/utils/randomOpponentGenerator';
import {
  initPveDuel,
  advancePhase,
  normalSummon,
  declareAttack,
  changePosition,
  planAiStep,
  applyAiAction,
  flipSummon,
  resolvePendingSpecialSummon,
} from '@/utils/duelEngine';
import CardGameGuard from '@/components/CardGameGuard';
import {
  incrementBattleWin,
  getUserQuestProgress,
  markPveQuestCompleted,
  UserQuestProgress,
  onQuestImagesChange,
  QuestImageMap,
} from '@/lib/firestore';

const BATTLE_COST = 10;
const DAILY_BATTLE_LIMIT = 10;
const BATTLE_TX_PREFIX = "PvE 決鬥";

type Phase = 'opponent-select' | 'deck-preview' | 'dueling' | 'result';

export default function BattlePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { collection, getCardDef, cardImageMap, refreshCollection, activeDeck, setActiveDeck } = useCards();
  const { addCoins, spendCoins, canAfford, transactions } = useCoin();

  const [phase, setPhase] = useState<Phase>('opponent-select');
  const [selectedOpponent, setSelectedOpponent] = useState<PveOpponent | null>(null);
  const [questProgress, setQuestProgress] = useState<UserQuestProgress | null>(null);
  const [questImages, setQuestImages] = useState<QuestImageMap>({});
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [duelState, setDuelState] = useState<DuelState | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const [aiDash, setAiDash] = useState<{ from: 'player' | 'enemy'; fromZone: number; toZone: number; isDirect: boolean } | null>(null);
  const [aiHighlight, setAiHighlight] = useState<{ side: 'player' | 'enemy'; zone: number } | null>(null);
  const aiTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate today's battle count from transaction history
  const todayBattleCount = (() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    return transactions.filter(
      (tx) =>
        tx.amount < 0 &&
        tx.reason.startsWith(BATTLE_TX_PREFIX) &&
        new Date(tx.timestamp).getTime() >= todayMs
    ).length;
  })();

  const canStartBattle = canAfford(BATTLE_COST) && todayBattleCount < DAILY_BATTLE_LIMIT;
  const remainingBattles = DAILY_BATTLE_LIMIT - todayBattleCount;

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  // Load quest progress whenever user changes
  useEffect(() => {
    if (!user) return;
    getUserQuestProgress(user.id).then(setQuestProgress);
  }, [user]);

  // Subscribe to quest card images (live — admin updates appear instantly)
  useEffect(() => {
    const unsub = onQuestImagesChange(setQuestImages);
    return () => unsub();
  }, []);

  // If launched from /battle-rooms with ?room=<id>, generate the AI opponent
  // and skip the opponent-select screen.
  useEffect(() => {
    if (!router.isReady) return;
    if (selectedOpponent) return;
    const roomId = router.query.room;
    if (typeof roomId !== 'string') return;
    const room = getQuickRoom(roomId);
    if (!room) return;
    const seed = typeof router.query.seed === 'string' ? Number(router.query.seed) : undefined;
    const generated = generateOpponentFromRoom(room, seed);
    setSelectedOpponent(generated);
    setPhase('deck-preview');
  }, [router.isReady, router.query, selectedOpponent]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, []);

  // Preload card images when cardImageMap changes
  useEffect(() => {
    const urls = Object.values(cardImageMap).filter(Boolean);
    if (urls.length === 0) { setImagesReady(true); return; }
    let loaded = 0;
    const total = urls.length;
    const onLoad = () => { loaded++; if (loaded >= total) setImagesReady(true); };
    urls.forEach((url) => {
      const img = new Image();
      img.onload = onLoad;
      img.onerror = onLoad; // count errors as loaded to not block
      img.src = url;
    });
    // Timeout fallback: mark ready after 5s regardless
    const t = setTimeout(() => setImagesReady(true), 5000);
    return () => clearTimeout(t);
  }, [cardImageMap]);

  // Show tutorial on first duel (check localStorage)
  useEffect(() => {
    if (phase === 'dueling' && duelState) {
      const seen = localStorage.getItem('duel-tutorial-seen');
      if (!seen) setShowTutorial(true);
    }
  }, [phase, duelState]);

  // Run AI turn — step-by-step playback so the player can see each action
  const runAiTurn = useCallback((initialState: DuelState) => {
    setIsPlayerTurn(false);
    let current = initialState;
    let safety = 0;

    const finishWithVictory = (s: DuelState) => {
      setDuelState(s);
      setAiDash(null);
      setAiHighlight(null);
      handleDuelEnd(s);
      // Let the KO overlay play out before showing the result modal
      setTimeout(() => setPhase('result'), 1800);
    };

    const step = () => {
      safety++;
      if (safety > 30) {
        setIsPlayerTurn(true);
        return;
      }

      const plan = planAiStep(current);

      if (plan.kind === 'done') {
        // AI has handed turn back to player. If we're sitting in player.draw,
        // play the draw beat (~900ms) then auto-advance to main so the player
        // never has to manually click through their draw phase.
        if (current.currentPlayer === 'player' && current.currentPhase === 'draw') {
          aiTimerRef.current = setTimeout(() => {
            current = advancePhase(current);
            setDuelState(current);
            setIsPlayerTurn(true);
          }, 900);
          return;
        }
        setIsPlayerTurn(true);
        return;
      }

      // Attack: highlight target → dash → apply damage
      if (plan.kind === 'attack' && plan.action && plan.action.zoneIndex !== undefined) {
        const fromZone = plan.action.zoneIndex;
        const toZone = plan.action.targetZone ?? -1;
        const isDirect = toZone < 0;

        // 1. Highlight the attack target so the player sees what's about to happen
        if (!isDirect) {
          setAiHighlight({ side: 'player', zone: toZone });
        }

        aiTimerRef.current = setTimeout(() => {
          // 2. Start dash animation
          setAiDash({ from: 'enemy', fromZone, toZone, isDirect });

          aiTimerRef.current = setTimeout(() => {
            // 3. Apply damage and clear dash/highlight (DuelField triggers
            // collision burst from LP delta automatically)
            current = applyAiAction(current, 'attack', plan.action);
            setDuelState(current);
            setAiDash(null);
            setAiHighlight(null);

            if (current.status === 'victory' || current.status === 'defeat') {
              finishWithVictory(current);
              return;
            }
            aiTimerRef.current = setTimeout(step, 700);
          }, 500);
        }, 600);
        return;
      }

      // Summon / phase advance: apply immediately, give time for the banner / summon anim to play
      current = applyAiAction(current, plan.kind, plan.action);
      setDuelState(current);

      if (current.status === 'victory' || current.status === 'defeat') {
        finishWithVictory(current);
        return;
      }

      const delay = plan.kind === 'summon' ? 1100 : 700;
      aiTimerRef.current = setTimeout(step, delay);
    };

    aiTimerRef.current = setTimeout(step, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDuel = useCallback(() => {
    if (!collection || !selectedOpponent || !activeDeck) return;

    // Check daily limit
    if (todayBattleCount >= DAILY_BATTLE_LIMIT) {
      alert(`今天已經玩了 ${DAILY_BATTLE_LIMIT} 場了，明天再來吧！`);
      return;
    }

    // Check and deduct coins
    if (!spendCoins(BATTLE_COST, `${BATTLE_TX_PREFIX}費用: ${selectedOpponent.name}`)) {
      alert(`金幣不足！需要 ${BATTLE_COST} 幣才能開始決鬥。`);
      return;
    }

    // Expand active deck ids into PlayerCard instances. A single cardId may
    // appear multiple times in a deck — expand each occurrence so the duel
    // engine sees the correct count.
    const deckCards = activeDeck.cardIds
      .map((id) => collection.cards.find((c) => c.cardId === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    if (deckCards.length === 0) {
      alert('你的牌組是空的！請先到牌組管理設定牌組。');
      return;
    }

    const state = initPveDuel(deckCards, selectedOpponent, cardImageMap);
    setPhase('dueling');

    if (state.firstPlayer === 'player') {
      // Player goes first — auto-advance their draw phase straight into main.
      const afterDraw = advancePhase(state); // draw → main
      setDuelState(afterDraw);
      setIsPlayerTurn(true);
    } else {
      // Enemy goes first — show coin-flip log briefly, then hand off to AI.
      setDuelState(state);
      setIsPlayerTurn(false);
      runAiTurn(state);
    }
  }, [collection, selectedOpponent, cardImageMap, activeDeck, runAiTurn, spendCoins, todayBattleCount]);

  // Player summons a monster
  const handleSummon = useCallback((
    handIndex: number,
    zoneIndex: number,
    position: 'attack' | 'defense' | 'facedown_defense',
    tributeIndices: number[]
  ) => {
    if (!duelState || !isPlayerTurn) return;
    const newState = normalSummon(duelState, 'player', handIndex, zoneIndex, position, tributeIndices);
    setDuelState(newState);
  }, [duelState, isPlayerTurn]);

  // Player declares an attack
  const handleAttack = useCallback((attackerZone: number, targetZone: number) => {
    if (!duelState || !isPlayerTurn) return;
    if (duelState.currentPhase !== 'battle') return;
    const newState = declareAttack(duelState, 'player', attackerZone, targetZone);

    if (newState.status === 'victory' || newState.status === 'defeat') {
      setDuelState(newState);
      handleDuelEnd(newState);
      // Let the KO overlay play out before showing the result modal
      setTimeout(() => setPhase('result'), 1800);
      return;
    }

    setDuelState(newState);
  }, [duelState, isPlayerTurn]);

  // Player changes a monster's position
  const handleChangePosition = useCallback((zoneIndex: number) => {
    if (!duelState || !isPlayerTurn) return;
    const monster = duelState.player.monsters[zoneIndex];
    if (!monster) return;
    const newPos = monster.position === 'attack' ? 'defense' : 'attack';
    const newState = changePosition(duelState, 'player', zoneIndex, newPos);
    setDuelState(newState);
  }, [duelState, isPlayerTurn]);

  const handleFlipSummon = useCallback((zoneIndex: number) => {
    if (!duelState || !isPlayerTurn) return;
    const newState = flipSummon(duelState, 'player', zoneIndex);
    setDuelState(newState);
  }, [duelState, isPlayerTurn]);

  // Player resolves a pending special summon — picks which hand card to summon
  const handleResolveSpecialSummon = useCallback((handIndex: number) => {
    if (!duelState) return;
    const newState = resolvePendingSpecialSummon(duelState, handIndex);
    setDuelState(newState);
  }, [duelState]);

  // Auto-resolve enemy AI's pending special summon (random pick)
  useEffect(() => {
    if (!duelState?.pendingSpecialSummon) return;
    if (duelState.pendingSpecialSummon.owner !== 'enemy') return;
    const candidates = duelState.pendingSpecialSummon.candidateHandIndices;
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const t = setTimeout(() => {
      setDuelState((prev) => (prev ? resolvePendingSpecialSummon(prev, pick) : prev));
    }, 900);
    return () => clearTimeout(t);
  }, [duelState?.pendingSpecialSummon]);

  // Player advances to next phase. From battle phase, collapse end → opponent
  // so the player only needs ONE click to end their turn.
  const handleAdvancePhase = useCallback(() => {
    if (!duelState || !isPlayerTurn) return;
    let newState = advancePhase(duelState);

    // Battle → end → opponent.draw (skip the empty 'end' click)
    if (duelState.currentPhase === 'battle' && newState.currentPhase === 'end') {
      newState = advancePhase(newState);
    }

    if (newState.status === 'victory' || newState.status === 'defeat') {
      setDuelState(newState);
      handleDuelEnd(newState);
      setTimeout(() => setPhase('result'), 1800);
      return;
    }

    // If it's now enemy's turn, hand off to the AI pump
    if (newState.currentPlayer === 'enemy') {
      setDuelState(newState);
      runAiTurn(newState);
      return;
    }

    setDuelState(newState);
  }, [duelState, isPlayerTurn, runAiTurn]);

  const handleDuelEnd = (state: DuelState) => {
    if (!selectedOpponent) return;
    if (state.status === 'victory') {
      addCoins(selectedOpponent.rewardCoins, `PvE 決鬥勝利: ${selectedOpponent.name}`);
      if (user) {
        incrementBattleWin(user.id, "pve");
        // Persist quest progress — only counts if it's an official PVE_OPPONENTS quest
        // (skip random quick-room AIs which use different ID prefix)
        const isOfficialQuest = PVE_OPPONENTS.some((q) => q.id === selectedOpponent.id);
        if (isOfficialQuest) {
          markPveQuestCompleted(user.id, selectedOpponent.id).then(setQuestProgress);
        }
      }
    }
  };

  const handleResultClose = () => {
    refreshCollection();
    setPhase('opponent-select');
    setDuelState(null);
    setSelectedOpponent(null);
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--terminal-color)' }}>載入中...</div>
      </div>
    );
  }

  return (
    <CardGameGuard>
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-700 p-3 flex-shrink-0">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/cards')}
              className="text-sm hover:underline"
              style={{ color: 'var(--terminal-color)' }}
            >
              ← 返回
            </button>
            <h1 className="text-lg font-bold" style={{ color: 'var(--terminal-color)' }}>
              ⚔️ 決鬥
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <CoinDisplay />
            <button
              onClick={() => router.push('/battle-lobby')}
              className="px-3 py-1 text-sm border rounded transition-colors hover:bg-purple-900/30"
              style={{ borderColor: '#a855f7', color: '#a855f7' }}
            >
              PvP
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col">
        {/* Opponent Selection — horizontal card row, each quest gates by its OWN lesson */}
        {phase === 'opponent-select' && (
          <div className="max-w-6xl mx-auto px-4 py-6 w-full">
            <h2 className="text-sm text-gray-400 mb-1">{">>>"}任務之路</h2>
            <p className="text-xs text-gray-500 mb-4">
              依序闖關 → 每關先學一堂 Prompt 課程，再進入戰鬥。輸了可以重打不用重學！
            </p>

            {/* Horizontal scroll quest cards */}
            <div className="overflow-x-auto pb-4 -mx-4 px-4">
              <div className="flex gap-4 min-w-max">
                {PVE_OPPONENTS.map((opp, idx) => {
                  const completedIds = questProgress?.completedPveQuestIds || [];
                  const completedLessons = questProgress?.completedPromptLessonIds || [];
                  const isCompleted = completedIds.includes(opp.id);
                  const prevId = idx > 0 ? PVE_OPPONENTS[idx - 1].id : null;
                  const prevDone = prevId ? completedIds.includes(prevId) : true;
                  const isUnlocked = prevDone;
                  const lessonDone = !!opp.lessonId && completedLessons.includes(opp.lessonId);

                  const diffColor =
                    opp.difficulty === 'easy' ? 'from-green-600 to-emerald-700 border-green-500'
                    : opp.difficulty === 'medium' ? 'from-yellow-600 to-orange-700 border-yellow-500'
                    : opp.difficulty === 'hard' ? 'from-red-600 to-rose-800 border-red-500'
                    : 'from-purple-700 to-pink-900 border-purple-500';
                  const diffLabel = opp.difficulty === 'easy' ? '簡單'
                    : opp.difficulty === 'medium' ? '中等'
                    : opp.difficulty === 'hard' ? '困難'
                    : '☠ 噩夢級';

                  // Determine card state and primary action
                  let primaryBtn: { label: string; color: string; onClick: () => void } | null = null;
                  if (!isUnlocked) {
                    primaryBtn = null;
                  } else if (!lessonDone) {
                    primaryBtn = {
                      label: '📚 進入課程',
                      color: 'border-cyan-400 text-cyan-200 bg-cyan-900/40 hover:bg-cyan-500 hover:text-black',
                      onClick: () => router.push(`/prompt-course?lesson=${opp.lessonId}&returnQuest=${opp.id}`),
                    };
                  } else {
                    primaryBtn = {
                      label: isCompleted ? '🔁 再挑戰一次' : '⚔ 開始戰鬥',
                      color: 'border-yellow-400 text-yellow-200 bg-yellow-900/40 hover:bg-yellow-400 hover:text-black animate-pulse',
                      onClick: () => {
                        setSelectedOpponent(opp);
                        setPhase('deck-preview');
                      },
                    };
                  }

                  return (
                    <div
                      key={opp.id}
                      className={`relative w-56 sm:w-64 flex-shrink-0 rounded-xl overflow-hidden border-2 bg-gradient-to-b transition-all ${
                        isUnlocked
                          ? `${diffColor} shadow-lg hover:scale-[1.02]`
                          : 'border-gray-700 from-gray-800 to-gray-900 opacity-60'
                      }`}
                    >
                      {/* Status corner badge */}
                      <div className="absolute top-2 right-2 z-10">
                        {isCompleted && (
                          <span className="text-[10px] px-2 py-0.5 bg-green-600 text-white font-bold rounded">✓ 已通關</span>
                        )}
                        {!isCompleted && lessonDone && isUnlocked && (
                          <span className="text-[10px] px-2 py-0.5 bg-yellow-600 text-white font-bold rounded">⚔ 可戰鬥</span>
                        )}
                        {!isCompleted && !lessonDone && isUnlocked && (
                          <span className="text-[10px] px-2 py-0.5 bg-cyan-600 text-white font-bold rounded">📖 待學</span>
                        )}
                        {!isUnlocked && (
                          <span className="text-[10px] px-2 py-0.5 bg-gray-600 text-white font-bold rounded">🔒 未解鎖</span>
                        )}
                      </div>

                      {/* Quest number badge */}
                      <div className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-black/70 border-2 border-white/40 flex items-center justify-center text-xs font-bold text-white">
                        {idx + 1}
                      </div>

                      {/* Card art area — full image if available, else styled emoji */}
                      <div className="aspect-[4/3] relative flex items-center justify-center bg-gradient-to-br from-black/30 to-black/60 overflow-hidden">
                        {(questImages[opp.id] || opp.imageUrl) ? (
                          <img
                            src={questImages[opp.id] || opp.imageUrl}
                            alt={opp.name}
                            className={`w-full h-full object-cover ${!isUnlocked ? 'grayscale' : ''}`}
                          />
                        ) : (
                          <>
                            {/* Decorative ring */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
                            <span className={`text-7xl drop-shadow-2xl ${!isUnlocked ? 'grayscale opacity-50' : ''}`}>
                              {opp.emoji}
                            </span>
                          </>
                        )}
                        {/* Difficulty stripe at bottom of art */}
                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 text-[10px] text-center font-bold tracking-widest text-white">
                          {diffLabel}
                        </div>
                      </div>

                      {/* Card body */}
                      <div className="p-3 bg-black/70">
                        <div className="text-[10px] text-gray-400 mb-1">任務 {idx + 1}</div>
                        <h3 className="font-bold text-sm text-white mb-1 truncate">{opp.name}</h3>
                        <p className="text-[11px] text-gray-300 leading-snug mb-2 line-clamp-2 h-8">
                          {opp.description}
                        </p>

                        <div className="text-[11px] text-yellow-300 font-bold mb-2">
                          ◆ {opp.rewardCoins} 金幣
                        </div>

                        {primaryBtn ? (
                          <button
                            onClick={primaryBtn.onClick}
                            className={`w-full py-2 text-xs font-bold border-2 rounded transition-colors ${primaryBtn.color}`}
                          >
                            {primaryBtn.label}
                          </button>
                        ) : (
                          <div className="w-full py-2 text-xs text-center text-gray-500 border-2 border-gray-700 rounded">
                            完成任務 {idx} 後解鎖
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick link to course page */}
            <div className="mt-4 text-center">
              <button
                onClick={() => router.push('/prompt-course')}
                className="text-xs text-cyan-400 hover:underline"
              >
                📚 查看完整 Prompt Engineering 課程列表 →
              </button>
            </div>
          </div>
        )}

        {/* Deck Preview */}
        {phase === 'deck-preview' && selectedOpponent && (
          <div className="max-w-4xl mx-auto px-4 py-6 w-full">
            <h2 className="text-sm text-gray-400 mb-2">{">>>"}對手: {selectedOpponent.name}</h2>
            <p className="text-xs text-gray-500 mb-4">{selectedOpponent.description}</p>

            {/* Active deck header with picker */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm" style={{ color: 'var(--terminal-color)' }}>
                出戰牌組：
                <span className="ml-2 text-white font-bold">
                  {activeDeck?.name || '（未選擇）'}
                </span>
                <span className="ml-2 text-gray-400 text-xs">
                  ({activeDeck?.cardIds.length || 0} 張)
                </span>
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeckPicker((v) => !v)}
                  className="px-3 py-1 text-xs border border-gray-600 rounded hover:border-[var(--terminal-color)] hover:text-[var(--terminal-color)] transition-colors"
                >
                  🗂️ 換牌組
                </button>
                <button
                  onClick={() => router.push('/decks')}
                  className="px-3 py-1 text-xs border border-gray-600 rounded text-gray-400 hover:text-white transition-colors"
                >
                  編輯牌組
                </button>
              </div>
            </div>

            {/* Deck picker popover */}
            {showDeckPicker && collection && (
              <div className="mb-4 p-3 border border-gray-700 rounded bg-gray-900/60">
                <div className="text-xs text-gray-400 mb-2">選擇要使用的牌組</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
              {(activeDeck?.cardIds || []).map((cardId, i) => {
                const def = getCardDef(cardId);
                const pc = collection?.cards.find((c) => c.cardId === cardId);
                if (!def) return null;
                return <CardTile key={`${cardId}_${i}`} definition={def} playerCard={pc} compact />;
              })}
              {(!activeDeck || activeDeck.cardIds.length === 0) && (
                <div className="col-span-full text-center text-sm text-gray-500 py-6 border border-dashed border-gray-700 rounded">
                  牌組為空，請先到「牌組管理」加入卡牌
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setPhase('opponent-select')}
                className="px-4 py-2 border border-gray-600 rounded text-gray-400 hover:text-white transition-colors"
              >
                返回
              </button>
              <button
                onClick={startDuel}
                disabled={!activeDeck || activeDeck.cardIds.length === 0 || !canStartBattle}
                className="px-8 py-2 border-2 rounded font-bold text-lg transition-all hover:scale-105 hover:bg-[var(--terminal-color)] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent disabled:hover:text-[var(--terminal-color)]"
                style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
              >
                ⚔️ 開始決鬥！（{BATTLE_COST} 幣）
              </button>
              <div className="w-full text-center mt-2 text-xs text-gray-500">
                今日剩餘 {remainingBattles} / {DAILY_BATTLE_LIMIT} 場
                {!canAfford(BATTLE_COST) && <span className="text-red-400 ml-2">（金幣不足）</span>}
                {remainingBattles <= 0 && <span className="text-red-400 ml-2">（已達今日上限）</span>}
              </div>
            </div>
          </div>
        )}

        {/* Duel */}
        {phase === 'dueling' && duelState && (
          <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
            <div className="flex-1 min-h-0 relative">
              <DuelField
                state={duelState}
                onSummon={handleSummon}
                onAttack={handleAttack}
                onChangePosition={handleChangePosition}
                onFlipSummon={handleFlipSummon}
                onAdvancePhase={handleAdvancePhase}
                isPlayerTurn={isPlayerTurn}
                onResolveSpecialSummon={handleResolveSpecialSummon}
                pendingSpecialSummonIsMine={duelState.pendingSpecialSummon?.owner === 'player'}
                externalDash={aiDash}
                externalHighlight={aiHighlight}
              />
              {/* Tutorial help button */}
              <button
                onClick={() => setShowTutorial(true)}
                className="absolute top-1 right-1 w-7 h-7 rounded-full border border-gray-600 text-gray-400 text-xs hover:border-[var(--terminal-color)] hover:text-[var(--terminal-color)] transition-colors z-10"
                title="決鬥教學"
              >
                ?
              </button>
            </div>
            <div className="flex-shrink-0 p-2">
              <DuelLog entries={duelState.log} />
            </div>
            {/* Duel Tutorial */}
            <DuelTutorial
              active={showTutorial}
              onComplete={() => {
                setShowTutorial(false);
                localStorage.setItem('duel-tutorial-seen', '1');
              }}
            />
          </div>
        )}
      </div>

      {/* Result overlay */}
      {phase === 'result' && duelState && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border-2 rounded-lg p-6 max-w-md w-full text-center"
            style={{ borderColor: duelState.status === 'victory' ? '#eab308' : '#ef4444' }}
          >
            <div className={`text-5xl mb-4 ${
              duelState.status === 'victory' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {duelState.status === 'victory' ? '🏆' : '💀'}
            </div>
            <h2 className={`text-2xl font-bold mb-2 ${
              duelState.status === 'victory' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {duelState.status === 'victory' ? '決鬥勝利！' : '決鬥敗北...'}
            </h2>
            <div className="text-gray-400 text-sm mb-4">
              第 {duelState.turn} 回合結束
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <div className="text-gray-500">你的 LP</div>
                <div className="text-lg font-bold" style={{ color: 'var(--terminal-color)' }}>
                  {duelState.player.lp}
                </div>
              </div>
              <div>
                <div className="text-gray-500">對手 LP</div>
                <div className="text-lg font-bold text-red-400">
                  {duelState.enemy.lp}
                </div>
              </div>
            </div>
            {duelState.status === 'victory' && selectedOpponent && (
              <div className="bg-black/50 rounded p-3 mb-4">
                <div className="text-yellow-400 text-sm font-bold mb-1">獎勵</div>
                <div className="text-sm">◆ {selectedOpponent.rewardCoins} 金幣</div>
                <div className="text-sm text-blue-400">✦ {selectedOpponent.rewardXp} XP</div>
              </div>
            )}
            <button
              onClick={handleResultClose}
              className="w-full py-2 border-2 rounded font-bold transition-all hover:scale-105"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              返回
            </button>
          </div>
        </div>
      )}
    </div>
    </CardGameGuard>
  );
}
