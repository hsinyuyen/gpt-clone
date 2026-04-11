// Master Duel style battle UI - bigger cards, animations, tutorial-ready
import { useState, useEffect, useRef } from 'react';
import {
  DuelState,
  FieldMonster,
  PlayerField,
  CardDefinition,
  DuelPhase,
} from '@/types/Card';
import { getRarityColor } from '@/utils/cardStats';
import { canNormalSummon, getTributesNeeded } from '@/utils/duelEngine';
import { hasBuff } from '@/utils/effectEngine';

// A monster can still declare an attack if it has the `double_attack` flag buff,
// matching the engine check in declareAttack().
function canStillAttack(monster: FieldMonster): boolean {
  return !monster.hasAttacked || hasBuff(monster, 'double_attack');
}

interface DuelFieldProps {
  state: DuelState;
  onSummon: (handIndex: number, zoneIndex: number, position: 'attack' | 'defense' | 'facedown_defense', tributeIndices: number[]) => void;
  onAttack: (attackerZone: number, targetZone: number) => void;
  onChangePosition: (zoneIndex: number) => void;
  onAdvancePhase: () => void;
  isPlayerTurn: boolean;
  /** External dash animation (e.g. AI attack) */
  externalDash?: { from: 'player' | 'enemy'; fromZone: number; toZone: number; isDirect: boolean } | null;
  /** Highlight a zone as the AI's attack target */
  externalHighlight?: { side: 'player' | 'enemy'; zone: number } | null;
}

// Animation state
type AnimType = 'summon' | 'attack' | 'damage' | 'destroy' | 'collision' | null;
interface AnimState {
  type: AnimType;
  zoneIndex: number;
  isEnemy: boolean;
}

// Phase transition banner
function PhaseBanner({ phase, isPlayerTurn, show }: { phase: DuelPhase; isPlayerTurn: boolean; show: boolean }) {
  if (!show) return null;

  const phaseInfo: Record<DuelPhase, { label: string; sub: string; color: string; icon: string }> = {
    draw: { label: '抽卡階段', sub: 'DRAW PHASE', color: '#60a5fa', icon: '🎴' },
    main: { label: '召喚階段', sub: 'SUMMON PHASE', color: '#22c55e', icon: '⭐' },
    battle: { label: '戰鬥階段', sub: 'BATTLE PHASE', color: '#ef4444', icon: '⚔️' },
    end: { label: '結束階段', sub: 'END PHASE', color: '#a855f7', icon: '🏁' },
  };
  const info = phaseInfo[phase];

  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center animate-phase-banner-container">
      <div
        className="relative px-12 py-6 border-y-4 w-full text-center bg-gradient-to-r from-transparent via-black/90 to-transparent"
        style={{ borderColor: info.color, boxShadow: `0 0 40px ${info.color}` }}
      >
        <div className="flex items-center justify-center gap-4 animate-phase-banner-text">
          <span className="text-5xl">{info.icon}</span>
          <div>
            <div className="text-3xl font-bold tracking-widest" style={{ color: info.color, textShadow: `0 0 20px ${info.color}` }}>
              {info.label}
            </div>
            <div className="text-xs font-mono tracking-[0.4em] text-gray-400 mt-1">
              {info.sub}
            </div>
          </div>
          <span className="text-5xl">{info.icon}</span>
        </div>
        <div className="text-xs text-gray-500 mt-2">{isPlayerTurn ? '你的回合' : '對手回合'}</div>
      </div>
    </div>
  );
}

// Deck pile (right-side stack)
function GraveyardPile({
  cards,
  isEnemy,
  onClick,
}: {
  cards: CardDefinition[];
  isEnemy: boolean;
  onClick: () => void;
}) {
  const topCard = cards[cards.length - 1];
  const count = cards.length;
  return (
    <button
      onClick={onClick}
      className={`relative w-[60px] h-[85px] sm:w-[72px] sm:h-[100px] border-2 rounded-md transition-all hover:scale-105 ${
        isEnemy
          ? 'border-red-500/70 bg-gradient-to-br from-gray-900 to-red-950'
          : 'border-purple-500/70 bg-gradient-to-br from-gray-900 to-purple-950'
      } ${count > 0 ? 'hover:shadow-[0_0_12px_rgba(168,85,247,0.5)]' : 'opacity-60'}`}
      title={`${isEnemy ? '對手' : '玩家'}墓地: ${count} 張 (點擊查看)`}
    >
      {count > 0 && topCard ? (
        topCard.imageUrl ? (
          <img
            src={topCard.imageUrl}
            alt={topCard.name}
            className="w-full h-full object-cover rounded-sm opacity-60"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-60">
            {topCard.emoji}
          </div>
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-2xl opacity-50">💀</span>
        </div>
      )}
      {/* Cross overlay to indicate "dead" */}
      {count > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-4xl text-red-500/70 font-black drop-shadow-[0_0_4px_rgba(0,0,0,0.9)]">✕</span>
        </div>
      )}
      <div className="absolute -bottom-4 left-0 right-0 text-center pointer-events-none">
        <span className="text-[10px] sm:text-xs font-mono font-bold text-purple-300 bg-black/80 px-1 rounded">
          {count}
        </span>
      </div>
    </button>
  );
}

function DeckPile({ count, isEnemy, drawing }: { count: number; isEnemy: boolean; drawing: boolean }) {
  const layers = Math.min(5, Math.max(1, Math.ceil(count / 4)));
  return (
    <div
      className={`relative w-[60px] h-[85px] sm:w-[72px] sm:h-[100px] ${drawing ? 'animate-duel-deck-pulse' : ''}`}
      title={`${isEnemy ? '對手' : '玩家'}牌組: ${count} 張`}
    >
      {[...Array(layers)].map((_, i) => (
        <div
          key={i}
          className={`absolute inset-0 border-2 rounded-md ${
            isEnemy
              ? 'border-red-700/80 bg-gradient-to-br from-red-950 to-indigo-950'
              : 'border-blue-600/80 bg-gradient-to-br from-blue-950 to-indigo-900'
          } shadow-md`}
          style={{ transform: `translate(${i * 1.5}px, ${i * -1.5}px)` }}
        >
          {/* Card-back pattern */}
          <div className="absolute inset-1 border border-white/10 rounded-sm flex items-center justify-center">
            <span className="text-[10px] sm:text-xs font-mono text-white/30 rotate-45">DECK</span>
          </div>
        </div>
      ))}
      <div className="absolute -bottom-4 left-0 right-0 text-center pointer-events-none">
        <span className="text-[10px] sm:text-xs font-mono font-bold text-yellow-400 bg-black/70 px-1 rounded">
          {count}
        </span>
      </div>
      {drawing && (
        <div className="absolute inset-0 rounded-md ring-4 ring-yellow-300/80 animate-pulse pointer-events-none" />
      )}
    </div>
  );
}

// Collision burst effect overlay
function CollisionBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center animate-duel-collision-container">
      <div className="relative w-40 h-40">
        {/* Central flash */}
        <div className="absolute inset-0 rounded-full bg-yellow-400/60 animate-duel-collision-flash" />
        {/* Spark particles */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-orange-400 rounded-full animate-duel-spark"
            style={{
              top: '50%', left: '50%',
              animationDelay: `${i * 0.04}s`,
              '--spark-angle': `${i * 45}deg`,
            } as React.CSSProperties}
          />
        ))}
        {/* Impact ring */}
        <div className="absolute inset-0 border-4 border-yellow-300/80 rounded-full animate-duel-impact-ring" />
        {/* Shockwave */}
        <div className="absolute -inset-8 border-2 border-orange-400/40 rounded-full animate-duel-shockwave" />
      </div>
    </div>
  );
}

function LpDisplay({ lp, label, isEnemy, prevLp }: { lp: number; label: string; isEnemy: boolean; prevLp: number }) {
  const pct = Math.max(0, (lp / 100) * 100);
  const diff = lp - prevLp;
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (diff !== 0) {
      setShowDiff(true);
      const t = setTimeout(() => setShowDiff(false), 1200);
      return () => clearTimeout(t);
    }
  }, [lp]);

  return (
    <div className={`flex items-center gap-2 relative ${isEnemy ? 'flex-row-reverse' : ''}`}>
      <span className="text-xs text-gray-400 w-8">{label}</span>
      <div className="flex-1 bg-gray-800 rounded h-4 min-w-[120px] relative overflow-hidden">
        <div
          className="h-4 rounded transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: isEnemy ? '#ef4444' : '#22c55e' }}
        />
      </div>
      <span className={`text-base font-bold font-mono min-w-[50px] text-right ${
        lp <= 25 ? 'text-red-400 animate-pulse' : ''
      }`} style={lp > 25 ? { color: 'var(--terminal-color)' } : undefined}>
        {lp}
      </span>
      {showDiff && diff !== 0 && (
        <span className={`absolute ${isEnemy ? 'left-10' : 'right-14'} text-sm font-bold animate-bounce ${
          diff < 0 ? 'text-red-400' : 'text-green-400'
        }`}>
          {diff > 0 ? '+' : ''}{diff}
        </span>
      )}
    </div>
  );
}

function PhaseBar({ currentPhase, isPlayerTurn }: { currentPhase: DuelPhase; isPlayerTurn: boolean }) {
  const phases: { key: DuelPhase; label: string; full: string }[] = [
    { key: 'draw', label: '抽卡', full: '抽卡' },
    { key: 'main', label: '召喚', full: '召喚階段' },
    { key: 'battle', label: '戰鬥', full: '戰鬥階段' },
    { key: 'end', label: '結束', full: '結束' },
  ];

  return (
    <div className="flex items-center justify-center gap-1 py-1" data-tutorial="duel-phase-bar">
      {phases.map((p) => (
        <div
          key={p.key}
          className={`px-2 py-0.5 rounded text-xs font-bold transition-all duration-300 ${
            p.key === currentPhase
              ? 'bg-[var(--terminal-color)] text-black scale-110 shadow-lg'
              : 'bg-gray-800 text-gray-500'
          }`}
          title={p.full}
        >
          {p.label}
        </div>
      ))}
      <span className="ml-2 text-xs text-gray-400">
        {isPlayerTurn ? '你的回合' : '對手回合'}
      </span>
    </div>
  );
}

// Summon FX overlay - magic circle, light pillar, sparks
function SummonFx() {
  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-visible">
      {/* Light pillar */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-16 h-full bg-gradient-to-t from-yellow-300/0 via-yellow-300/80 to-cyan-200/0 blur-md animate-duel-summon-pillar" />
      {/* Central flash */}
      <div className="absolute inset-0 bg-yellow-300/40 mix-blend-screen animate-duel-summon-flash" />
      {/* Magic circle */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-4 border-yellow-300 rounded-full animate-duel-summon-circle"
        style={{ boxShadow: '0 0 30px rgba(250,204,21,0.9), inset 0 0 20px rgba(250,204,21,0.7)' }} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-cyan-300 rounded-full animate-duel-summon-circle" style={{ animationDelay: '0.1s' }} />
      {/* Sparks shooting outward */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-yellow-200 rounded-full animate-duel-summon-spark"
          style={{
            '--ang': `${i * 45}deg`,
            boxShadow: '0 0 6px rgba(255,230,100,0.9)',
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// Destroy FX overlay - explosion + debris + shockwave
function DestroyFx() {
  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-visible">
      {/* Central explosion flash */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-orange-400/80 rounded-full blur-md animate-duel-destroy-flash" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-yellow-200/90 rounded-full animate-duel-destroy-flash" />
      {/* Shockwave */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-yellow-300 rounded-full animate-duel-destroy-shock" />
      {/* Debris particles */}
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 w-2 h-2 bg-orange-500 animate-duel-destroy-debris"
          style={{
            '--ang': `${i * 30}deg`,
            boxShadow: '0 0 4px rgba(249,115,22,0.9)',
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function MonsterZone({
  monster,
  isEnemy,
  isSelected,
  isTarget,
  isSummonTarget,
  isAiTarget,
  anim,
  onClick,
  onInspect,
  dashStyle,
}: {
  monster: FieldMonster | null;
  isEnemy: boolean;
  isSelected: boolean;
  isTarget: boolean;
  isSummonTarget: boolean;
  isAiTarget?: boolean;
  anim: AnimType;
  onClick: () => void;
  onInspect?: (card: CardDefinition) => void;
  dashStyle?: React.CSSProperties;
}) {
  const animClass = anim === 'summon' ? 'animate-duel-summon'
    : anim === 'attack' ? 'animate-duel-attack'
    : anim === 'damage' ? 'animate-duel-damage'
    : anim === 'destroy' ? 'animate-duel-destroy'
    : '';

  if (!monster) {
    return (
      <button
        onClick={onClick}
        className={`relative w-[120px] h-[160px] sm:w-[140px] sm:h-[185px] border-2 border-dashed rounded-lg flex items-center justify-center transition-all overflow-visible ${
          isSummonTarget
            ? 'border-[var(--terminal-color)] bg-[var(--terminal-color)]/10 animate-pulse shadow-[0_0_12px_var(--terminal-color)]'
            : isTarget
            ? 'border-yellow-400 bg-yellow-900/20'
            : 'border-gray-700/50 hover:border-gray-600'
        }`}
      >
        {anim === 'destroy' && <DestroyFx />}
        {isSummonTarget ? (
          <span className="text-sm font-bold" style={{ color: 'var(--terminal-color)' }}>召喚</span>
        ) : (
          <span className="text-gray-800 text-xs">空</span>
        )}
      </button>
    );
  }

  const isDefense = monster.position === 'defense' || monster.position === 'facedown_defense';
  const isFaceDown = !monster.faceUp;

  return (
    <button
      onClick={onClick}
      style={dashStyle}
      className={`w-[120px] h-[160px] sm:w-[140px] sm:h-[185px] border-2 rounded-lg flex flex-col items-center justify-center transition-all duration-500 relative overflow-hidden ${animClass} ${
        isAiTarget
          ? 'border-red-500 ring-4 ring-red-500 animate-duel-target-pulse shadow-[0_0_24px_rgba(239,68,68,0.9)] z-10'
          : isSelected
          ? 'border-[var(--terminal-color)] ring-2 ring-[var(--terminal-color)] scale-110 z-10 shadow-[0_0_16px_var(--terminal-color)]'
          : isTarget
          ? 'border-red-500 ring-2 ring-red-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
          : monster.canAttack && canStillAttack(monster) && !isEnemy
          ? 'border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]'
          : 'border-gray-600'
      } ${isDefense ? 'rotate-90' : ''} ${isFaceDown ? 'bg-indigo-900/60' : 'bg-gray-900'}`}
      title={`${monster.definition.name} ATK:${monster.currentAtk} DEF:${monster.currentDef}`}
    >
      {anim === 'summon' && <SummonFx />}
      {isFaceDown ? (
        <span className="text-5xl">❓</span>
      ) : monster.definition.imageUrl ? (
        <img
          src={monster.definition.imageUrl}
          alt={monster.definition.name}
          className={`w-full h-full object-cover scale-110 ${isDefense ? '-rotate-90' : ''}`}
          loading="eager"
        />
      ) : (
        <span className={`text-5xl ${isDefense ? '-rotate-90' : ''}`}>{monster.definition.emoji}</span>
      )}
      {/* ATK/DEF overlay */}
      {monster.faceUp && (
        <div className={`absolute bottom-0 left-0 right-0 text-center bg-black/80 py-1 ${isDefense ? '-rotate-90' : ''}`}>
          <span className="text-xs sm:text-sm font-mono font-bold">
            <span className="text-orange-400">{monster.currentAtk}</span>
            <span className="text-gray-500">/</span>
            <span className="text-blue-400">{monster.currentDef}</span>
          </span>
        </div>
      )}
      {/* Name overlay */}
      {monster.faceUp && (
        <div className={`absolute top-0 left-0 right-0 bg-black/70 text-center py-0.5 ${isDefense ? '-rotate-90' : ''}`}>
          <span className="text-[10px] sm:text-xs text-gray-300 truncate block px-1">{monster.definition.name}</span>
        </div>
      )}
      {monster.turnBuffs.length > 0 && (
        <div className="absolute -top-1 -right-1 z-10">
          <span className="text-[9px] bg-purple-600 text-white rounded-full w-4 h-4 flex items-center justify-center shadow">
            {monster.turnBuffs.length}
          </span>
        </div>
      )}
      {isAiTarget && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-red-500 text-2xl animate-bounce drop-shadow-[0_0_6px_rgba(239,68,68,0.9)] pointer-events-none">
          🎯
        </div>
      )}
      {/* Inspect button — always visible if monster is face-up */}
      {monster.faceUp && onInspect && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onInspect(monster.definition);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onInspect(monster.definition);
            }
          }}
          className={`absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/80 border border-cyan-400 text-cyan-300 text-[10px] font-bold hover:bg-cyan-900 hover:scale-110 transition-all cursor-pointer z-20 ${isDefense ? '-rotate-90' : ''}`}
          title="查看卡片詳細資料"
        >
          ℹ
        </span>
      )}
    </button>
  );
}

function HandCard({
  card,
  isSelected,
  onClick,
  onInspect,
  canPlay,
}: {
  card: CardDefinition;
  isSelected: boolean;
  onClick: () => void;
  onInspect?: (card: CardDefinition) => void;
  canPlay: boolean;
}) {
  const rarityBorder = card.rarity === 'legendary' ? 'border-yellow-500'
    : card.rarity === 'epic' ? 'border-purple-500'
    : card.rarity === 'rare' ? 'border-blue-500'
    : 'border-gray-600';

  return (
    <button
      onClick={onClick}
      data-tutorial="duel-hand-card"
      className={`flex-shrink-0 w-[100px] h-[135px] sm:w-[120px] sm:h-[160px] border-2 rounded transition-all relative overflow-hidden ${rarityBorder} ${
        isSelected
          ? 'ring-2 ring-[var(--terminal-color)] -translate-y-5 scale-115 z-10 shadow-[0_0_20px_var(--terminal-color)]'
          : canPlay
          ? 'hover:-translate-y-3 hover:scale-105 hover:shadow-lg cursor-pointer shadow-[0_2px_8px_rgba(0,255,136,0.2)]'
          : 'opacity-50 cursor-default'
      } bg-gray-900`}
      title={`${card.name} (Lv.${card.level || 1}) ATK:${card.baseAtk} DEF:${card.baseDef}`}
    >
      {card.imageUrl ? (
        <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover scale-110" loading="eager" />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span className="text-4xl sm:text-5xl">{card.emoji}</span>
          <span className="text-[9px] sm:text-[10px] text-gray-400 truncate w-full text-center px-1">
            {card.name}
          </span>
        </div>
      )}
      {/* Level */}
      <div className="absolute top-0 left-0 bg-black/80 px-1 rounded-br">
        <span className="text-[10px] sm:text-xs text-yellow-400 font-bold">{card.level || 1}</span>
      </div>
      {/* ATK/DEF */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-center py-0.5">
        <span className="text-[11px] sm:text-xs font-mono font-bold text-orange-400">{card.baseAtk}</span>
        <span className="text-[10px] text-gray-600">/</span>
        <span className="text-[11px] sm:text-xs font-mono font-bold text-blue-400">{card.baseDef}</span>
      </div>
      {/* Playable indicator */}
      {canPlay && !isSelected && (
        <div className="absolute inset-0 border-2 border-[var(--terminal-color)]/30 rounded animate-pulse pointer-events-none" />
      )}
      {/* Inspect button */}
      {onInspect && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onInspect(card);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onInspect(card);
            }
          }}
          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/80 border border-cyan-400 text-cyan-300 text-[10px] font-bold hover:bg-cyan-900 hover:scale-110 transition-all cursor-pointer z-20"
          title="查看卡片詳細資料"
        >
          ℹ
        </span>
      )}
    </button>
  );
}

export default function DuelField({
  state,
  onSummon,
  onAttack,
  onChangePosition,
  onAdvancePhase,
  isPlayerTurn,
  externalDash,
  externalHighlight,
}: DuelFieldProps) {
  const [selectedHandCard, setSelectedHandCard] = useState<number | null>(null);
  const [selectedMonster, setSelectedMonster] = useState<number | null>(null);
  const [tributeSelection, setTributeSelection] = useState<number[]>([]);
  const [summonMode, setSummonMode] = useState(false);
  const [attackMode, setAttackMode] = useState(false);
  const [showCardInfo, setShowCardInfo] = useState<CardDefinition | null>(null);
  const [showGraveyard, setShowGraveyard] = useState<'player' | 'enemy' | null>(null);
  const [anims, setAnims] = useState<AnimState[]>([]);
  const [showCollision, setShowCollision] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [showPhaseBanner, setShowPhaseBanner] = useState(false);
  const [bannerPhase, setBannerPhase] = useState<DuelPhase>(state.currentPhase);
  const [dashAnim, setDashAnim] = useState<{ from: 'player' | 'enemy'; fromZone: number; toZone: number; isDirect: boolean } | null>(null);
  const [prevPlayerLp, setPrevPlayerLp] = useState(state.player.lp);
  const [prevEnemyLp, setPrevEnemyLp] = useState(state.enemy.lp);
  const [playerDrawing, setPlayerDrawing] = useState(false);
  const [enemyDrawing, setEnemyDrawing] = useState(false);
  const [playerFlyCard, setPlayerFlyCard] = useState<number>(0); // increment to retrigger
  const [enemyFlyCard, setEnemyFlyCard] = useState<number>(0);

  const playerField = state.player;
  const enemyField = state.enemy;
  const isMainPhase = state.currentPhase === 'main';
  const isBattlePhase = state.currentPhase === 'battle';

  // Track LP changes for diff display
  const prevStateRef = useRef(state);
  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev.player.lp !== state.player.lp) setPrevPlayerLp(prev.player.lp);
    if (prev.enemy.lp !== state.enemy.lp) setPrevEnemyLp(prev.enemy.lp);

    // Show phase banner when phase OR turn owner changes (skip draw, it's auto)
    if (prev.currentPhase !== state.currentPhase || prev.currentPlayer !== state.currentPlayer) {
      if (state.currentPhase !== 'draw') {
        setBannerPhase(state.currentPhase);
        setShowPhaseBanner(true);
        setTimeout(() => setShowPhaseBanner(false), 1400);
      }
    }

    // Detect animations from state changes
    const newAnims: AnimState[] = [];
    // Check for new monsters (summon animation)
    for (let i = 0; i < 5; i++) {
      if (!prev.player.monsters[i] && state.player.monsters[i]) {
        newAnims.push({ type: 'summon', zoneIndex: i, isEnemy: false });
      }
      if (!prev.enemy.monsters[i] && state.enemy.monsters[i]) {
        newAnims.push({ type: 'summon', zoneIndex: i, isEnemy: true });
      }
      // Destroy animation
      if (prev.player.monsters[i] && !state.player.monsters[i]) {
        newAnims.push({ type: 'destroy', zoneIndex: i, isEnemy: false });
      }
      if (prev.enemy.monsters[i] && !state.enemy.monsters[i]) {
        newAnims.push({ type: 'destroy', zoneIndex: i, isEnemy: true });
      }
    }
    if (newAnims.length > 0) {
      setAnims(newAnims);
      setTimeout(() => setAnims([]), 800);
    }

    // Trigger collision effect when LP changes (battle damage occurred)
    const lpChanged = prev.player.lp !== state.player.lp || prev.enemy.lp !== state.enemy.lp;
    if (lpChanged && (prev.player.lp > state.player.lp || prev.enemy.lp > state.enemy.lp)) {
      setShowCollision(true);
      setScreenShake(true);
      setTimeout(() => setShowCollision(false), 600);
      setTimeout(() => setScreenShake(false), 400);
    }

    // Detect game end → trigger KO finish shake (overlay rendered from state.status)
    if (
      prev.status === 'dueling' &&
      (state.status === 'victory' || state.status === 'defeat')
    ) {
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 600);
    }

    // Detect draws (deck shrunk OR hand grew)
    if (
      prev.player.deck.length > state.player.deck.length ||
      prev.player.hand.length < state.player.hand.length
    ) {
      setPlayerDrawing(true);
      setPlayerFlyCard((n) => n + 1);
      setTimeout(() => setPlayerDrawing(false), 800);
    }
    if (
      prev.enemy.deck.length > state.enemy.deck.length ||
      prev.enemy.hand.length < state.enemy.hand.length
    ) {
      setEnemyDrawing(true);
      setEnemyFlyCard((n) => n + 1);
      setTimeout(() => setEnemyDrawing(false), 800);
    }

    prevStateRef.current = state;
  }, [state]);

  const getAnim = (zoneIndex: number, isEnemy: boolean): AnimType => {
    return anims.find((a) => a.zoneIndex === zoneIndex && a.isEnemy === isEnemy)?.type || null;
  };

  // Compute dash transform for the attacking monster
  const COL_WIDTH = 152; // 140 (card) + 12 (gap)
  const ROW_DIST = 230;  // distance between player & enemy rows
  const activeDash = externalDash ?? dashAnim;
  const getDashStyle = (zoneIndex: number, isEnemy: boolean): React.CSSProperties | undefined => {
    if (!activeDash) return undefined;
    const dashFromIsEnemy = activeDash.from === 'enemy';
    if (activeDash.fromZone !== zoneIndex || dashFromIsEnemy !== isEnemy) return undefined;

    let dx = 0;
    let dy = 0;
    if (activeDash.isDirect) {
      // Dash to opponent's LP bar (centered, far away)
      const dirSign = dashFromIsEnemy ? 1 : -1;
      // Find the source's offset from center: zone 2 is center
      dx = (2 - activeDash.fromZone) * COL_WIDTH;
      dy = dirSign * (ROW_DIST + 60);
    } else {
      // Dash to opposing zone
      const dirSign = dashFromIsEnemy ? 1 : -1;
      dx = (activeDash.toZone - activeDash.fromZone) * COL_WIDTH;
      dy = dirSign * ROW_DIST;
    }
    return {
      transform: `translate(${dx}px, ${dy}px) scale(1.15)`,
      zIndex: 30,
      boxShadow: '0 0 30px rgba(255,200,0,0.9)',
    };
  };


  const handleHandClick = (idx: number) => {
    if (!isPlayerTurn || !isMainPhase) return;
    const card = playerField.hand[idx];
    if (selectedHandCard === idx) {
      resetSelection();
      return;
    }
    setSelectedHandCard(idx);
    setSelectedMonster(null);
    setAttackMode(false);
    if (card.cardCategory === 'monster' && canNormalSummon(playerField, card)) {
      setSummonMode(true);
      setTributeSelection([]);
    } else {
      setSummonMode(false);
    }
  };

  const handlePlayerZoneClick = (idx: number) => {
    if (!isPlayerTurn) return;
    const monster = playerField.monsters[idx];

    // Summon mode: place card
    if (summonMode && selectedHandCard !== null) {
      const card = playerField.hand[selectedHandCard];
      const tribNeeded = getTributesNeeded(card);

      if (tribNeeded > 0 && monster) {
        const newTributes = tributeSelection.includes(idx)
          ? tributeSelection.filter((t) => t !== idx)
          : [...tributeSelection, idx];
        setTributeSelection(newTributes);
        if (newTributes.length >= tribNeeded) {
          const emptyZone = playerField.monsters.findIndex((m) => m === null);
          if (emptyZone >= 0) {
            onSummon(selectedHandCard, emptyZone, 'attack', newTributes);
          }
          resetSelection();
        }
        return;
      }

      if (!monster) {
        onSummon(selectedHandCard, idx, 'attack', []);
        resetSelection();
        return;
      }
    }

    // Select attacker
    if (isBattlePhase && monster && monster.faceUp && monster.position === 'attack' && canStillAttack(monster)) {
      setSelectedMonster(idx);
      setAttackMode(true);
      setSelectedHandCard(null);
      setSummonMode(false);
      return;
    }

    // Change position
    if (isMainPhase && monster && !summonMode) {
      onChangePosition(idx);
      return;
    }

    if (monster) setShowCardInfo(monster.definition);
  };

  const handleEnemyZoneClick = (idx: number) => {
    if (!isPlayerTurn) return;
    if (attackMode && selectedMonster !== null) {
      // Trigger dash animation, then attack after animation completes
      const attacker = selectedMonster;
      setDashAnim({ from: 'player', fromZone: attacker, toZone: idx, isDirect: false });
      resetSelection();
      setTimeout(() => {
        onAttack(attacker, idx);
        setDashAnim(null);
      }, 500);
      return;
    }
    const monster = enemyField.monsters[idx];
    if (monster && monster.faceUp) setShowCardInfo(monster.definition);
  };

  const handleDirectAttack = () => {
    if (attackMode && selectedMonster !== null) {
      const attacker = selectedMonster;
      setDashAnim({ from: 'player', fromZone: attacker, toZone: -1, isDirect: true });
      resetSelection();
      setTimeout(() => {
        onAttack(attacker, -1);
        setDashAnim(null);
      }, 500);
    }
  };

  const resetSelection = () => {
    setSelectedHandCard(null);
    setSelectedMonster(null);
    setTributeSelection([]);
    setSummonMode(false);
    setAttackMode(false);
  };

  const canDirectAttack = attackMode && enemyField.monsters.every((m) => m === null);

  return (
    <div className={`flex flex-col h-full bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 relative ${screenShake ? 'animate-duel-screen-shake' : ''}`}>
      {/* Phase transition banner */}
      <PhaseBanner phase={bannerPhase} isPlayerTurn={isPlayerTurn} show={showPhaseBanner} />
      {/* CSS Animations */}
      <style>{`
        @keyframes duel-summon {
          0% { transform: scale(0) rotate(180deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(0deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes duel-attack {
          0% { transform: translateY(0); }
          30% { transform: translateY(-20px) scale(1.1); }
          60% { transform: translateY(10px); }
          100% { transform: translateY(0); }
        }
        @keyframes duel-damage {
          0%, 100% { filter: brightness(1); }
          25% { filter: brightness(2) hue-rotate(30deg); transform: translateX(-3px); }
          50% { filter: brightness(0.5); transform: translateX(3px); }
          75% { filter: brightness(1.5); transform: translateX(-2px); }
        }
        @keyframes duel-destroy {
          0% { transform: scale(1); opacity: 1; filter: brightness(1); }
          30% { transform: scale(1.1); filter: brightness(3) saturate(0); }
          100% { transform: scale(0) rotate(45deg); opacity: 0; }
        }
        @keyframes duel-collision-flash {
          0% { transform: scale(0); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.8; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes duel-spark {
          0% { transform: translate(-50%, -50%) rotate(var(--spark-angle, 0deg)) translateY(0); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--spark-angle, 0deg)) translateY(-80px); opacity: 0; }
        }
        @keyframes duel-impact-ring {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes duel-shockwave {
          0% { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes duel-collision-container {
          0% { opacity: 1; }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes phase-banner-container {
          0% { opacity: 0; transform: scale(0.8); }
          15% { opacity: 1; transform: scale(1); }
          85% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.1); }
        }
        @keyframes phase-banner-text {
          0% { transform: translateX(-30px); opacity: 0; }
          15% { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(0); opacity: 1; }
        }
        .animate-phase-banner-container { animation: phase-banner-container 1.4s ease-out forwards; }
        .animate-phase-banner-text { animation: phase-banner-text 0.6s ease-out forwards; }
        /* === Summon FX === */
        @keyframes duel-summon-pillar {
          0% { transform: scaleY(0); opacity: 0; }
          30% { transform: scaleY(1.4); opacity: 1; }
          100% { transform: scaleY(1); opacity: 0; }
        }
        @keyframes duel-summon-circle {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          40% { transform: scale(1.4) rotate(180deg); opacity: 1; }
          100% { transform: scale(1.8) rotate(360deg); opacity: 0; }
        }
        @keyframes duel-summon-flash {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes duel-summon-spark {
          0% { transform: translate(-50%, -50%) rotate(var(--ang, 0deg)) translateY(0) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--ang, 0deg)) translateY(-90px) scale(0); opacity: 0; }
        }
        .animate-duel-summon-pillar { animation: duel-summon-pillar 0.7s ease-out forwards; transform-origin: bottom; }
        .animate-duel-summon-circle { animation: duel-summon-circle 0.7s ease-out forwards; }
        .animate-duel-summon-flash { animation: duel-summon-flash 0.5s ease-out forwards; }
        .animate-duel-summon-spark { animation: duel-summon-spark 0.7s ease-out forwards; }

        /* === Destroy FX === */
        @keyframes duel-destroy-flash {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes duel-destroy-debris {
          0% { transform: translate(-50%, -50%) rotate(var(--ang, 0deg)) translateY(0) scale(1) rotate(0deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(var(--ang, 0deg)) translateY(-110px) scale(0.3) rotate(360deg); opacity: 0; }
        }
        @keyframes duel-destroy-shock {
          0% { transform: scale(0.2); opacity: 1; border-width: 8px; }
          100% { transform: scale(3); opacity: 0; border-width: 1px; }
        }
        .animate-duel-destroy-flash { animation: duel-destroy-flash 0.5s ease-out forwards; }
        .animate-duel-destroy-debris { animation: duel-destroy-debris 0.7s ease-out forwards; }
        .animate-duel-destroy-shock { animation: duel-destroy-shock 0.7s ease-out forwards; }

        /* === KO FX === */
        @keyframes duel-ko-flash {
          0% { opacity: 0; }
          20% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes duel-ko-text {
          0% { transform: scale(0) rotate(-15deg); opacity: 0; }
          40% { transform: scale(2) rotate(0deg); opacity: 1; }
          60% { transform: scale(1.5) rotate(0deg); opacity: 1; }
          100% { transform: scale(1.5) rotate(0deg); opacity: 1; }
        }
        @keyframes duel-ko-shock {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(5); opacity: 0; }
        }
        .animate-duel-ko-flash { animation: duel-ko-flash 1.2s ease-out forwards; }
        .animate-duel-ko-text { animation: duel-ko-text 1.4s cubic-bezier(0.2, 0.9, 0.3, 1.2) forwards; }
        .animate-duel-ko-shock { animation: duel-ko-shock 1.2s ease-out forwards; }

        @keyframes duel-deck-pulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.12); filter: brightness(1.6) drop-shadow(0 0 12px rgba(250,204,21,0.8)); }
        }
        .animate-duel-deck-pulse { animation: duel-deck-pulse 0.6s ease-in-out; }
        @keyframes duel-fly-card-player {
          0% { transform: translate(0, 0) scale(0.6) rotate(-12deg); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translate(-260px, 80px) scale(1) rotate(0deg); opacity: 0; }
        }
        @keyframes duel-fly-card-enemy {
          0% { transform: translate(0, 0) scale(0.6) rotate(12deg); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translate(-260px, -80px) scale(1) rotate(0deg); opacity: 0; }
        }
        .animate-duel-fly-card-player { animation: duel-fly-card-player 0.7s ease-out forwards; }
        .animate-duel-fly-card-enemy { animation: duel-fly-card-enemy 0.7s ease-out forwards; }
        @keyframes duel-target-pulse {
          0%, 100% { box-shadow: 0 0 12px rgba(239,68,68,0.7), inset 0 0 8px rgba(239,68,68,0.4); }
          50% { box-shadow: 0 0 30px rgba(239,68,68,1), inset 0 0 16px rgba(239,68,68,0.7); }
        }
        .animate-duel-target-pulse { animation: duel-target-pulse 0.5s ease-in-out infinite; }
        @keyframes duel-screen-shake {
          0%, 100% { transform: translate(0); }
          10% { transform: translate(-4px, 2px); }
          20% { transform: translate(4px, -2px); }
          30% { transform: translate(-3px, -3px); }
          40% { transform: translate(3px, 3px); }
          50% { transform: translate(-2px, 1px); }
          60% { transform: translate(2px, -1px); }
          70% { transform: translate(-1px, 2px); }
          80% { transform: translate(1px, -1px); }
        }
        .animate-duel-summon { animation: duel-summon 0.5s ease-out; }
        .animate-duel-attack { animation: duel-attack 0.4s ease-in-out; }
        .animate-duel-damage { animation: duel-damage 0.4s ease-in-out; }
        .animate-duel-destroy { animation: duel-destroy 0.5s ease-in forwards; }
        .animate-duel-collision-flash { animation: duel-collision-flash 0.5s ease-out forwards; }
        .animate-duel-spark { animation: duel-spark 0.4s ease-out forwards; }
        .animate-duel-impact-ring { animation: duel-impact-ring 0.5s ease-out forwards; }
        .animate-duel-shockwave { animation: duel-shockwave 0.6s ease-out forwards; }
        .animate-duel-collision-container { animation: duel-collision-container 0.6s ease-out forwards; }
        .animate-duel-screen-shake { animation: duel-screen-shake 0.4s ease-in-out; }
      `}</style>

      {/* Turn & Phase */}
      <div className="border-b border-gray-800 pb-1 mb-1">
        <div className="flex justify-between items-center px-2">
          <span className="text-xs text-gray-500 font-mono">T{state.turn}/{state.maxTurns}</span>
          <PhaseBar currentPhase={state.currentPhase} isPlayerTurn={isPlayerTurn} />
        </div>
      </div>

      {/* Enemy LP */}
      <div className="px-3 mb-2" data-tutorial="duel-enemy-lp">
        <LpDisplay lp={enemyField.lp} label="對手" isEnemy prevLp={prevEnemyLp} />
      </div>

      {/* Enemy hand (face-down) */}
      <div className="flex justify-center gap-1 mb-2 px-2">
        {enemyField.hand.map((_, i) => (
          <div key={i} className="w-7 h-10 sm:w-9 sm:h-12 bg-indigo-900/40 border border-indigo-700/50 rounded-sm" />
        ))}
        <span className="text-xs text-gray-500 self-center ml-1">{enemyField.hand.length}</span>
      </div>

      {/* ===== FIELD ===== */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-2 relative">
        {/* Collision burst effect */}
        <CollisionBurst active={showCollision} />

        {/* Enemy deck pile (top-right) */}
        <div className="absolute right-3 sm:right-6 top-2 z-10 flex flex-col items-center">
          <div className="text-[9px] text-red-400 mb-1 font-mono">ENEMY DECK</div>
          <div className="relative">
            <DeckPile count={enemyField.deck.length} isEnemy drawing={enemyDrawing} />
            {enemyDrawing && (
              <div
                key={`efly-${enemyFlyCard}`}
                className="absolute inset-0 pointer-events-none animate-duel-fly-card-enemy"
              >
                <div className="w-[60px] h-[85px] sm:w-[72px] sm:h-[100px] border-2 border-red-700/80 bg-gradient-to-br from-red-950 to-indigo-950 rounded-md shadow-lg" />
              </div>
            )}
          </div>
        </div>

        {/* Enemy graveyard pile (top-left) */}
        <div className="absolute left-3 sm:left-6 top-2 z-10 flex flex-col items-center">
          <div className="text-[9px] text-red-400 mb-1 font-mono">ENEMY GRAVE</div>
          <GraveyardPile
            cards={enemyField.graveyard}
            isEnemy
            onClick={() => setShowGraveyard('enemy')}
          />
        </div>

        {/* Player deck pile (bottom-right) */}
        <div className="absolute right-3 sm:right-6 bottom-2 z-10 flex flex-col items-center">
          <div className="relative">
            <DeckPile count={playerField.deck.length} isEnemy={false} drawing={playerDrawing} />
            {playerDrawing && (
              <div
                key={`pfly-${playerFlyCard}`}
                className="absolute inset-0 pointer-events-none animate-duel-fly-card-player"
              >
                <div className="w-[60px] h-[85px] sm:w-[72px] sm:h-[100px] border-2 border-blue-600/80 bg-gradient-to-br from-blue-950 to-indigo-900 rounded-md shadow-lg" />
              </div>
            )}
          </div>
          <div className="text-[9px] text-blue-400 mt-1 font-mono">YOUR DECK</div>
        </div>

        {/* Player graveyard pile (bottom-left) */}
        <div className="absolute left-3 sm:left-6 bottom-2 z-10 flex flex-col items-center">
          <GraveyardPile
            cards={playerField.graveyard}
            isEnemy={false}
            onClick={() => setShowGraveyard('player')}
          />
          <div className="text-[9px] text-purple-300 mt-1 font-mono">YOUR GRAVE</div>
        </div>
        {/* Enemy monster zones */}
        <div className="flex gap-2 sm:gap-3 justify-center" data-tutorial="duel-enemy-field">
          {enemyField.monsters.map((m, i) => (
            <MonsterZone
              key={i}
              monster={m}
              isEnemy
              isSelected={false}
              isTarget={attackMode && m !== null}
              isSummonTarget={false}
              anim={getAnim(i, true)}
              dashStyle={getDashStyle(i, true)}
              onClick={() => handleEnemyZoneClick(i)}
              onInspect={setShowCardInfo}
            />
          ))}
        </div>

        {/* Field divider + direct attack */}
        <div className="w-full max-w-lg border-t border-gray-700 relative">
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 px-4 py-0.5 rounded border border-gray-700">
            <span className="text-[10px] text-gray-500 font-mono">DUEL FIELD</span>
          </div>
          {canDirectAttack && (
            <button
              onClick={handleDirectAttack}
              className="absolute right-2 -translate-y-1/2 px-4 py-1 bg-red-900/60 border-2 border-red-500 rounded text-xs text-red-300 font-bold animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.4)]"
            >
              直接攻擊！
            </button>
          )}
        </div>

        {/* Player monster zones */}
        <div className="flex gap-2 sm:gap-3 justify-center" data-tutorial="duel-player-field">
          {playerField.monsters.map((m, i) => (
            <MonsterZone
              key={i}
              monster={m}
              isEnemy={false}
              isAiTarget={externalHighlight?.side === 'player' && externalHighlight.zone === i}
              isSelected={selectedMonster === i || tributeSelection.includes(i)}
              isTarget={false}
              isSummonTarget={summonMode && m === null}
              anim={getAnim(i, false)}
              dashStyle={getDashStyle(i, false)}
              onClick={() => handlePlayerZoneClick(i)}
              onInspect={setShowCardInfo}
            />
          ))}
        </div>
      </div>

      {/* Player LP */}
      <div className={`px-3 mb-2 relative ${
        externalDash?.isDirect && externalDash.from === 'enemy' ? 'animate-duel-target-pulse rounded' : ''
      }`} data-tutorial="duel-player-lp">
        <LpDisplay lp={playerField.lp} label="LP" isEnemy={false} prevLp={prevPlayerLp} />
        {externalDash?.isDirect && externalDash.from === 'enemy' && (
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-red-400 text-xs font-bold animate-bounce">
            ⚠️ 直接攻擊！
          </div>
        )}
      </div>

      {/* Player hand */}
      <div className="border-t border-gray-800 pt-2 pb-1 px-2" data-tutorial="duel-hand">
        <div className="flex gap-1.5 sm:gap-2 justify-center overflow-x-auto py-1">
          {playerField.hand.map((card, i) => (
            <HandCard
              key={`${card.id}_${i}`}
              card={card}
              isSelected={selectedHandCard === i}
              onClick={() => handleHandClick(i)}
              onInspect={setShowCardInfo}
              canPlay={isPlayerTurn && isMainPhase && card.cardCategory === 'monster' && canNormalSummon(playerField, card)}
            />
          ))}
        </div>
      </div>

      {/* Action bar */}
      {isPlayerTurn && state.status === 'dueling' && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 bg-black/60" data-tutorial="duel-actions">
          <div className="text-xs text-gray-400 flex-1">
            {summonMode && selectedHandCard !== null && getTributesNeeded(playerField.hand[selectedHandCard]) > 0
              ? `選擇 ${getTributesNeeded(playerField.hand[selectedHandCard])} 隻怪獸作為祭品`
              : summonMode
              ? '👆 點擊閃爍的「召喚」格子放置怪獸'
              : attackMode
              ? '👆 點擊對手的怪獸進行攻擊'
              : isMainPhase
              ? '👆 從手牌選一張卡，然後放到場上'
              : isBattlePhase
              ? '👆 點擊你的怪獸來攻擊'
              : ''}
          </div>
          <div className="flex gap-2">
            {(summonMode || attackMode) && (
              <button
                onClick={resetSelection}
                className="px-3 py-1.5 text-xs border border-gray-600 text-gray-400 rounded hover:border-red-500 hover:text-red-400 transition-colors"
              >
                取消
              </button>
            )}
            <button
              onClick={onAdvancePhase}
              data-tutorial="duel-next-phase"
              className="px-5 py-1.5 text-xs border-2 rounded font-bold transition-all hover:scale-105 hover:bg-[var(--terminal-color)] hover:text-black"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              {state.currentPhase === 'main' ? '進入戰鬥階段 →'
                : state.currentPhase === 'battle' ? '結束回合 →'
                : '下一階段 →'}
            </button>
          </div>
        </div>
      )}

      {/* Graveyard viewer modal */}
      {showGraveyard && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setShowGraveyard(null)}
        >
          <div
            className="bg-gray-900 border-2 border-purple-500 rounded-lg p-5 max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="text-xl font-bold text-purple-400">
                💀 {showGraveyard === 'player' ? '你的墓地' : '對手墓地'} (
                {(showGraveyard === 'player' ? playerField.graveyard : enemyField.graveyard).length} 張)
              </h2>
              <button
                onClick={() => setShowGraveyard(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Card grid */}
            <div className="flex-1 overflow-y-auto">
              {(showGraveyard === 'player' ? playerField.graveyard : enemyField.graveyard).length === 0 ? (
                <div className="text-center text-gray-500 py-12">
                  <div className="text-5xl mb-3">💀</div>
                  <p>墓地是空的</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {(showGraveyard === 'player' ? playerField.graveyard : enemyField.graveyard).map(
                    (card, i) => (
                      <button
                        key={`${card.id}_${i}`}
                        onClick={() => {
                          setShowCardInfo(card);
                          setShowGraveyard(null);
                        }}
                        className="border border-purple-700 rounded-lg bg-black/60 hover:border-purple-400 hover:scale-105 transition-all p-2 text-left"
                        title={`點擊查看 ${card.name} 詳細資料`}
                      >
                        {card.imageUrl ? (
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            className="w-full aspect-square rounded object-cover opacity-80"
                          />
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center text-4xl">
                            {card.emoji}
                          </div>
                        )}
                        <div className="text-xs font-bold mt-1 truncate" style={{ color: 'var(--terminal-color)' }}>
                          {card.name}
                        </div>
                        <div className="flex justify-between text-[10px] mt-1">
                          <span className="text-orange-400">ATK {card.baseAtk}</span>
                          <span className="text-blue-400">DEF {card.baseDef}</span>
                        </div>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 mt-3 text-center flex-shrink-0">
              點擊任一卡片可查看詳細資料
            </div>
          </div>
        </div>
      )}

      {/* Card info popup */}
      {showCardInfo && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCardInfo(null)}
        >
          <div
            className="bg-gray-900 border-2 border-[var(--terminal-color)] rounded-lg p-5 max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: 'var(--terminal-color)' }}>
                  {showCardInfo.emoji} {showCardInfo.name}
                </h2>
                <div className="flex gap-3 mt-1">
                  <span className={`text-sm font-bold ${getRarityColor(showCardInfo.rarity)}`}>
                    {'★'.repeat(showCardInfo.level || 1)}
                  </span>
                  <span className="text-sm text-gray-400">Lv.{showCardInfo.level || 1}</span>
                </div>
              </div>
              <button
                onClick={() => setShowCardInfo(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Image */}
            {showCardInfo.imageUrl && (
              <div className="text-center mb-4">
                <img
                  src={showCardInfo.imageUrl}
                  alt={showCardInfo.name}
                  className="w-56 h-56 mx-auto rounded-lg object-cover border-2"
                  style={{ borderColor: 'var(--terminal-color)' }}
                />
              </div>
            )}

            {/* ATK / DEF */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="text-center p-3 bg-black/50 rounded border border-gray-700">
                <div className="text-sm font-bold text-orange-400">ATK</div>
                <div className="text-2xl font-bold mt-1" style={{ color: 'var(--terminal-color)' }}>
                  {showCardInfo.baseAtk}
                </div>
              </div>
              <div className="text-center p-3 bg-black/50 rounded border border-gray-700">
                <div className="text-sm font-bold text-blue-400">DEF</div>
                <div className="text-2xl font-bold mt-1" style={{ color: 'var(--terminal-color)' }}>
                  {showCardInfo.baseDef}
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-300 italic mb-4 leading-relaxed">
              {showCardInfo.description}
            </p>

            {/* Effect text */}
            {showCardInfo.effectText && (
              <div className="mb-3 p-3 bg-purple-900/20 border border-purple-700 rounded">
                <div className="text-xs font-bold text-purple-400 mb-1">✨ 卡片效果</div>
                <p className="text-sm text-purple-200 leading-relaxed">{showCardInfo.effectText}</p>
              </div>
            )}

            {/* Structured YGO effects */}
            {showCardInfo.ygoEffects && showCardInfo.ygoEffects.length > 0 && (
              <div className="mb-3 space-y-2">
                {showCardInfo.ygoEffects.map((effect) => (
                  <div key={effect.id} className="p-2 bg-black/50 border border-purple-800 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold text-purple-300">{effect.name}</span>
                      <span className="text-[10px] text-gray-500 uppercase">{effect.trigger}</span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{effect.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Abilities fallback */}
            {(!showCardInfo.ygoEffects || showCardInfo.ygoEffects.length === 0) &&
              showCardInfo.abilities && showCardInfo.abilities.length > 0 && (
                <div className="mb-3 space-y-2">
                  <div className="text-xs font-bold" style={{ color: 'var(--terminal-color)' }}>技能</div>
                  {showCardInfo.abilities.map((ability) => (
                    <div key={ability.id} className="p-2 bg-black/50 border border-gray-700 rounded">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold" style={{ color: 'var(--terminal-color)' }}>
                          {ability.name}
                        </span>
                        {ability.damage > 0 && (
                          <span className="text-xs text-red-400">DMG {ability.damage}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{ability.description}</p>
                    </div>
                  ))}
                </div>
              )}

            {/* Synergy */}
            {showCardInfo.synergyBonus && (
              <div className="mb-3 p-3 bg-purple-900/30 border border-purple-600 rounded">
                <div className="text-sm font-bold text-purple-400 mb-1">
                  🔗 套裝: {showCardInfo.synergyBonus.setName}
                </div>
                <p className="text-xs text-purple-200 leading-relaxed">
                  {showCardInfo.synergyBonus.bonusDescription}
                </p>
              </div>
            )}

            <button
              onClick={() => setShowCardInfo(null)}
              className="w-full mt-3 py-2 text-sm border-2 rounded font-bold transition-colors hover:bg-[var(--terminal-color)] hover:text-black"
              style={{ borderColor: 'var(--terminal-color)', color: 'var(--terminal-color)' }}
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Duel result overlay - dramatic K.O. effect */}
      {state.status !== 'dueling' && state.status !== 'preparing' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden">
          {/* Full-screen flash */}
          <div
            className={`absolute inset-0 animate-duel-ko-flash ${
              state.status === 'victory' ? 'bg-yellow-200' : 'bg-red-600'
            }`}
          />
          {/* Dimming backdrop */}
          <div className="absolute inset-0 bg-black/85" />
          {/* Shockwave rings */}
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-4 animate-duel-ko-shock ${
              state.status === 'victory' ? 'border-yellow-300' : 'border-red-400'
            }`}
          />
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-4 animate-duel-ko-shock ${
              state.status === 'victory' ? 'border-yellow-300' : 'border-red-400'
            }`}
            style={{ animationDelay: '0.2s' }}
          />
          {/* Dramatic KO text */}
          <div className="relative text-center animate-duel-ko-text">
            <div
              className={`text-7xl sm:text-8xl font-black tracking-widest mb-2 ${
                state.status === 'victory' ? 'text-yellow-300' : 'text-red-500'
              }`}
              style={{
                textShadow:
                  state.status === 'victory'
                    ? '0 0 30px rgba(250,204,21,1), 0 0 60px rgba(250,204,21,0.8), 4px 4px 0 #000'
                    : '0 0 30px rgba(239,68,68,1), 0 0 60px rgba(239,68,68,0.8), 4px 4px 0 #000',
              }}
            >
              {state.status === 'victory' ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div
              className={`text-3xl sm:text-4xl font-bold mb-4 ${
                state.status === 'victory' ? 'text-yellow-400' : 'text-red-400'
              }`}
            >
              {state.status === 'victory' ? '🏆 勝利！' : '💀 敗北...'}
            </div>
            <div className="text-gray-300 text-sm">
              第 {state.turn} 回合 · LP {playerField.lp} vs {enemyField.lp}
            </div>
          </div>
        </div>
      )}

      {/* AI turn overlay */}
      {!isPlayerTurn && state.status === 'dueling' && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-gray-900/95 px-6 py-3 rounded-lg border border-gray-600 shadow-lg">
          <span className="text-sm animate-pulse font-bold" style={{ color: 'var(--terminal-color)' }}>
            ⚔️ 對手回合中...
          </span>
        </div>
      )}
    </div>
  );
}
