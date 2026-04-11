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
import {
  initPveDuel,
  advancePhase,
  normalSummon,
  declareAttack,
  changePosition,
  planAiStep,
  applyAiAction,
} from '@/utils/duelEngine';

type Phase = 'opponent-select' | 'deck-preview' | 'dueling' | 'result';

export default function BattlePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { collection, getCardDef, cardImageMap, refreshCollection, activeDeck, setActiveDeck } = useCards();
  const { addCoins } = useCoin();

  const [phase, setPhase] = useState<Phase>('opponent-select');
  const [selectedOpponent, setSelectedOpponent] = useState<PveOpponent | null>(null);
  const [showDeckPicker, setShowDeckPicker] = useState(false);
  const [duelState, setDuelState] = useState<DuelState | null>(null);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const [aiDash, setAiDash] = useState<{ from: 'player' | 'enemy'; fromZone: number; toZone: number; isDirect: boolean } | null>(null);
  const [aiHighlight, setAiHighlight] = useState<{ side: 'player' | 'enemy'; zone: number } | null>(null);
  const aiTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

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
  }, [collection, selectedOpponent, cardImageMap, activeDeck, runAiTurn]);

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
        {/* Opponent Selection */}
        {phase === 'opponent-select' && (
          <div className="max-w-4xl mx-auto px-4 py-6 w-full">
            <h2 className="text-sm text-gray-400 mb-4">{">>>"}選擇對手</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PVE_OPPONENTS.map((opp) => {
                const diffColor = opp.difficulty === 'easy' ? 'text-green-400'
                  : opp.difficulty === 'medium' ? 'text-yellow-400' : 'text-red-400';
                const diffLabel = opp.difficulty === 'easy' ? '簡單'
                  : opp.difficulty === 'medium' ? '中等' : '困難';

                return (
                  <button
                    key={opp.id}
                    onClick={() => {
                      setSelectedOpponent(opp);
                      setPhase('deck-preview');
                    }}
                    className="p-4 border border-gray-600 rounded-lg bg-black/50 text-left hover:border-[var(--terminal-color)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{opp.emoji}</span>
                      <div className="flex-1">
                        <div className="font-bold" style={{ color: 'var(--terminal-color)' }}>
                          {opp.name}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{opp.description}</div>
                        <div className="flex gap-3 mt-2 text-xs">
                          <span className={diffColor}>{diffLabel}</span>
                          <span className="text-yellow-400">◆ {opp.rewardCoins}</span>
                          <span className="text-blue-400">✦ {opp.rewardXp} XP</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
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
                disabled={!activeDeck || activeDeck.cardIds.length === 0}
                className="px-8 py-2 border-2 rounded font-bold text-lg transition-all hover:scale-105 hover:bg-[var(--terminal-color)] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-transparent disabled:hover:text-[var(--terminal-color)]"
                style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
              >
                ⚔️ 開始決鬥！
              </button>
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
                onAdvancePhase={handleAdvancePhase}
                isPlayerTurn={isPlayerTurn}
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
  );
}
