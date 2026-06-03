// Gacha draw animation - terminal style reveal with epic legendary cinematic
import { useState, useEffect, useRef } from 'react';
import { CardDefinition } from '@/types/Card';
import { useCards } from '@/contexts/CardContext';
import { useCardAnimations } from '@/contexts/CardAnimationContext';
import { useVideoCache } from '@/contexts/VideoCacheContext';
import { getRarityColor, getRarityLabel, getElementEmoji } from '@/utils/cardStats';
import VideoPreloader from './VideoPreloader';

interface DrawAnimationProps {
  cards: CardDefinition[];
  onComplete: () => void;
}

export default function DrawAnimation({ cards, onComplete }: DrawAnimationProps) {
  const { cardImageMap } = useCards();
  const { getDrawRevealUrl: getRawDrawRevealUrl } = useCardAnimations();
  const { getCachedUrl } = useVideoCache();
  // Wrap so all consumers get the in-memory blob URL when available
  const getDrawRevealUrl = (cardId: string) => getCachedUrl(getRawDrawRevealUrl(cardId));
  const [revealedCount, setRevealedCount] = useState(0);
  const [isRevealing, setIsRevealing] = useState(true);
  // Cinematic queue: legendary cards drawn that have a reveal video — show
  // them one-by-one in a fullscreen takeover BEFORE the normal reveal grid
  const [cinematicQueue, setCinematicQueue] = useState<CardDefinition[]>([]);
  const [currentCinematic, setCurrentCinematic] = useState<CardDefinition | null>(null);
  const [cinematicPhase, setCinematicPhase] = useState<'intro' | 'flash' | 'video' | 'card' | null>(null);
  const cinematicProcessedRef = useRef(false);

  // On mount: queue up legendary cards for the cinematic intro
  useEffect(() => {
    if (cinematicProcessedRef.current) return;
    cinematicProcessedRef.current = true;
    const legendaries = cards.filter((c) => c.rarity === 'legendary');
    if (legendaries.length > 0) {
      setCinematicQueue(legendaries);
    }
  }, [cards]);

  // Drive the cinematic queue: every legendary card starts with the
  // black-screen intro (catchphrase) → bright flash → video (if any) → big card
  useEffect(() => {
    if (currentCinematic || cinematicQueue.length === 0) return;
    const next = cinematicQueue[0];
    setCinematicQueue((q) => q.slice(1));
    setCurrentCinematic(next);
    setCinematicPhase('intro');
  }, [cinematicQueue, currentCinematic]);

  // Phase auto-advancers: intro → flash → video (or card if no video)
  useEffect(() => {
    if (!currentCinematic) return;
    if (cinematicPhase === 'intro') {
      const t = setTimeout(() => setCinematicPhase('flash'), 3200);
      return () => clearTimeout(t);
    }
    if (cinematicPhase === 'flash') {
      const t = setTimeout(() => {
        const hasVideo = !!getDrawRevealUrl(currentCinematic.id);
        setCinematicPhase(hasVideo ? 'video' : 'card');
      }, 500);
      return () => clearTimeout(t);
    }
  }, [cinematicPhase, currentCinematic, getDrawRevealUrl]);

  // After the cinematic finishes for a card, advance
  const advanceCinematic = () => {
    setCurrentCinematic(null);
    setCinematicPhase(null);
  };

  // Skip current intro phase early on click
  const skipIntro = () => {
    if (cinematicPhase === 'intro') setCinematicPhase('flash');
  };

  // Once cinematic queue is fully drained, start the regular reveal sequence
  const cinematicActive = currentCinematic !== null || cinematicQueue.length > 0;

  useEffect(() => {
    if (cinematicActive) return; // wait for cinematic to finish
    if (revealedCount < cards.length) {
      const timer = setTimeout(() => {
        setRevealedCount((prev) => prev + 1);
      }, cards.length === 1 ? 800 : 300);
      return () => clearTimeout(timer);
    } else {
      setIsRevealing(false);
    }
  }, [revealedCount, cards.length, cinematicActive]);

  const getBorderGlow = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return 'border-yellow-400 shadow-[0_0_25px_rgba(250,204,21,0.7)] animate-pulse';
      case 'epic':
        return 'border-purple-400 shadow-[0_0_18px_rgba(192,132,252,0.55)]';
      case 'rare':
        return 'border-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.4)]';
      default:
        return 'border-gray-500';
    }
  };

  const resolveImage = (card: CardDefinition): string => {
    return card.imageUrl || cardImageMap[card.id] || '';
  };

  const highestRarity = cards.reduce<string>((acc, c) => {
    const order = { common: 0, rare: 1, epic: 2, legendary: 3 } as const;
    return order[c.rarity as keyof typeof order] > order[acc as keyof typeof order]
      ? c.rarity
      : acc;
  }, 'common');

  const isSingle = cards.length === 1;

  // === Cinematic legendary reveal overlay =================================
  if (currentCinematic) {
    const card = currentCinematic;
    const videoUrl = getDrawRevealUrl(card.id);
    const img = resolveImage(card);
    const catchphrase = card.description || `傳說之力，現在覺醒...`;
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center overflow-hidden">
        {/* Preload all upcoming cinematic videos so playback starts instantly */}
        <VideoPreloader urls={[videoUrl, ...cinematicQueue.map((c) => getDrawRevealUrl(c.id))]} />

        {/* === Phase: Intro — black screen + catchphrase ============= */}
        {cinematicPhase === 'intro' && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center cursor-pointer text-center px-8" onClick={skipIntro}>
            {/* Subtle vignette pulse */}
            <div className="absolute inset-0 bg-gradient-radial from-yellow-900/10 via-transparent to-transparent animate-pulse" />
            {/* Top: tiny LEGENDARY badge */}
            <div className="text-yellow-500/70 text-xs tracking-[0.5em] mb-12 animate-cinematic-text-fade">
              ★  L E G E N D A R Y  ★
            </div>
            {/* Center: dramatic name */}
            <div
              className="text-yellow-300 text-5xl md:text-7xl font-bold mb-3 tracking-widest animate-cinematic-text-fade"
              style={{ textShadow: '0 0 40px rgba(250,204,21,0.7), 0 0 80px rgba(250,204,21,0.3)' }}
            >
              {card.name}
            </div>
            {card.nameEn && (
              <div className="text-yellow-500/60 text-sm md:text-base italic mb-8 animate-cinematic-text-fade">
                — {card.nameEn} —
              </div>
            )}
            {/* Catchphrase / description */}
            <div className="text-gray-300 text-base md:text-lg max-w-2xl leading-relaxed mt-4 animate-cinematic-text-fade-delay">
              『 {catchphrase} 』
            </div>
            {/* Skip hint */}
            <div className="absolute bottom-8 text-gray-600 text-xs tracking-widest animate-pulse">
              點擊任意處跳過 →
            </div>
          </div>
        )}

        {/* === Phase: Flash — bright transition ==================== */}
        {cinematicPhase === 'flash' && (
          <div className="absolute inset-0 bg-white animate-cinematic-flash pointer-events-none" />
        )}

        {/* Background animated star field — only after intro */}
        {(cinematicPhase === 'video' || cinematicPhase === 'card') && (
          <div className="absolute inset-0 bg-gradient-radial from-yellow-900/20 via-black to-black animate-pulse" />
        )}

        {cinematicPhase === 'video' && videoUrl && (
          <>
            <video
              src={videoUrl}
              autoPlay
              playsInline
              onEnded={() => setCinematicPhase('card')}
              onError={() => setCinematicPhase('card')}
              className="max-w-full max-h-[80vh] object-contain z-10"
            />
            <button
              onClick={() => setCinematicPhase('card')}
              className="absolute top-4 right-4 px-3 py-1.5 text-xs border border-yellow-500 text-yellow-300 hover:bg-yellow-900/30 z-20"
            >
              SKIP →
            </button>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-yellow-400 text-sm tracking-widest animate-pulse z-10">
              ★ LEGENDARY DROP INCOMING ★
            </div>
          </>
        )}

        {cinematicPhase === 'card' && (
          <>
            {/* Radiating golden rings */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border-4 border-yellow-500/40 animate-ping" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border-2 border-yellow-400/60 animate-ping" style={{ animationDelay: '0.3s' }} />

            {/* Title banner */}
            <div className="text-yellow-400 text-3xl font-bold tracking-[0.5em] mb-4 z-10 animate-fade-in"
                 style={{ textShadow: '0 0 30px rgba(250,204,21,0.8)' }}>
              ★ 傳 說 卡 ★
            </div>

            {/* Big card display */}
            <div className="relative w-80 h-[28rem] z-10 animate-card-zoom-in">
              <div className="absolute inset-0 rounded-2xl border-4 border-yellow-400 bg-gradient-to-b from-gray-900 via-yellow-950/40 to-black overflow-hidden shadow-[0_0_60px_rgba(250,204,21,0.9)]">
                <div className="flex justify-between px-4 pt-3">
                  <span className={`text-base font-bold ${getRarityColor(card.rarity)}`}>
                    {getRarityLabel(card.rarity)}
                  </span>
                  <span className="text-2xl">{getElementEmoji(card.element)}</span>
                </div>
                <div className="flex-1 flex items-center justify-center px-4 py-3 h-72">
                  {img ? (
                    <img src={img} alt={card.name} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <span className="text-9xl">{card.emoji}</span>
                  )}
                </div>
                <div className="text-center px-3 py-3 border-t-2 border-yellow-600">
                  <div className="text-xl font-bold text-yellow-300" style={{ textShadow: '0 0 10px rgba(250,204,21,0.8)' }}>
                    {card.name}
                  </div>
                  {card.nameEn && (
                    <div className="text-xs text-yellow-500/70 mt-1 italic">{card.nameEn}</div>
                  )}
                </div>
              </div>

              {/* Holographic shine sweep */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
                <div className="absolute inset-0 animate-holo-sweep"
                     style={{
                       background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)',
                       backgroundSize: '200% 100%',
                     }}
                />
              </div>
            </div>

            <button
              onClick={advanceCinematic}
              className="mt-8 px-8 py-3 text-base font-bold border-2 border-yellow-500 text-yellow-300 rounded hover:bg-yellow-500 hover:text-black transition-all z-10"
            >
              繼 續 →
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      {/* Preload all draw-reveal videos for any legendary cards we'll show */}
      <VideoPreloader urls={cards.filter((c) => c.rarity === 'legendary').map((c) => getDrawRevealUrl(c.id))} />
      <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--terminal-color)' }}>
        {isRevealing ? '>>> 抽卡中...' : '>>> 抽卡完成！'}
      </h2>

      {/* Single draw: big hero display */}
      {isSingle ? (
        <div className="mb-8">
          {(() => {
            const card = cards[0];
            const revealed = revealedCount > 0;
            const img = resolveImage(card);
            return (
              <div
                key={card.id}
                className={`w-64 h-96 rounded-xl border-4 transition-all duration-700 flex flex-col overflow-hidden ${
                  revealed
                    ? `${getBorderGlow(card.rarity)} bg-gradient-to-b from-gray-900 to-black`
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                {revealed ? (
                  <>
                    <div className="flex justify-between px-3 pt-2">
                      <span className={`text-sm font-bold ${getRarityColor(card.rarity)}`}>
                        {getRarityLabel(card.rarity)}
                      </span>
                      <span className="text-xl">{getElementEmoji(card.element)}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center px-3 py-2">
                      {img ? (
                        <img
                          src={img}
                          alt={card.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <span className="text-8xl">{card.emoji}</span>
                      )}
                    </div>
                    <div
                      className="text-center font-bold text-lg px-2 py-2 border-t border-gray-700"
                      style={{ color: 'var(--terminal-color)' }}
                    >
                      {card.name}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-6xl text-gray-600 animate-pulse">？</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        /* Multi-draw: grid */
        <div className="grid grid-cols-5 gap-3 max-w-4xl mb-8">
          {cards.map((card, i) => {
            const revealed = i < revealedCount;
            const img = resolveImage(card);
            return (
              <div
                key={`${card.id}_${i}`}
                className={`w-32 h-44 rounded-lg border-2 transition-all duration-500 flex flex-col overflow-hidden ${
                  revealed
                    ? `${getBorderGlow(card.rarity)} bg-gradient-to-b from-gray-900 to-black`
                    : 'border-gray-700 bg-gray-800'
                }`}
              >
                {revealed ? (
                  <>
                    <div className="flex justify-between px-1.5 pt-1">
                      <span className={`text-[10px] font-bold ${getRarityColor(card.rarity)}`}>
                        {getRarityLabel(card.rarity)}
                      </span>
                      <span className="text-xs">{getElementEmoji(card.element)}</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center px-1 py-1">
                      {img ? (
                        <img
                          src={img}
                          alt={card.name}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <span className="text-4xl">{card.emoji}</span>
                      )}
                    </div>
                    <div
                      className="text-center text-[10px] font-bold px-1 py-1 border-t border-gray-700 truncate"
                      style={{ color: 'var(--terminal-color)' }}
                    >
                      {card.name}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-3xl text-gray-600 animate-pulse">？</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isRevealing && (
        <div className="flex flex-col items-center gap-3">
          {highestRarity === 'legendary' && (
            <div className="text-yellow-400 text-sm font-bold animate-pulse">
              ★ LEGENDARY DROP ★
            </div>
          )}
          <button
            onClick={onComplete}
            className="px-6 py-2 border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
            style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
          >
            確認
          </button>
        </div>
      )}
    </div>
  );
}
