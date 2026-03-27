import React, { useState, useEffect, useRef, useCallback } from "react";
import { getRandomQuestions, QuizQuestion } from "@/data/quizQuestions";

// ============================================================
// Pixel Art Sprite Data (16x16 grids as color arrays)
// ============================================================
const _ = "transparent";
const B = "#1a1a2e";
const G = "#d4a056";
const W = "#e8c88a";
const R = "#cc6644";
const S = "#a67c3d";
const P = "#4a3728";
const H = "#8b6914";
const BL = "#3a5a8c";

const PLAYER_SPRITE = [
  [_,_,_,_,_,H,H,H,H,H,_,_,_,_,_,_],
  [_,_,_,_,H,H,H,H,H,H,H,_,_,_,_,_],
  [_,_,_,_,H,H,H,H,H,H,H,_,_,_,_,_],
  [_,_,_,S,S,S,S,S,S,S,S,S,_,_,_,_],
  [_,_,_,S,B,S,S,S,S,B,S,S,_,_,_,_],
  [_,_,_,S,S,S,S,S,S,S,S,S,_,_,_,_],
  [_,_,_,S,S,S,R,R,S,S,S,S,_,_,_,_],
  [_,_,_,_,S,S,S,S,S,S,S,_,_,_,_,_],
  [_,_,_,BL,BL,BL,BL,BL,BL,BL,BL,_,_,_,_,_],
  [_,_,_,BL,BL,BL,BL,BL,BL,BL,BL,_,_,_,_,_],
  [_,_,BL,BL,BL,BL,BL,BL,BL,BL,BL,BL,_,_,_,_],
  [_,_,S,BL,BL,BL,BL,BL,BL,BL,BL,S,_,_,_,_],
  [_,_,S,_,BL,BL,BL,BL,BL,BL,_,S,_,_,_,_],
  [_,_,_,_,P,P,P,_,P,P,P,_,_,_,_,_],
  [_,_,_,_,P,P,P,_,P,P,P,_,_,_,_,_],
  [_,_,_,_,B,B,B,_,B,B,B,_,_,_,_,_],
];

const MONSTER_SPRITE = [
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,R,R,R,R,R,R,_,_,_,_,_],
  [_,_,_,_,R,R,R,R,R,R,R,R,_,_,_,_],
  [_,_,_,R,R,R,R,R,R,R,R,R,R,_,_,_],
  [_,_,_,R,R,W,W,R,R,W,W,R,R,_,_,_],
  [_,_,_,R,R,B,W,R,R,B,W,R,R,_,_,_],
  [_,_,R,R,R,R,R,R,R,R,R,R,R,R,_,_],
  [_,_,R,R,R,R,R,R,R,R,R,R,R,R,_,_],
  [_,_,R,R,B,R,R,B,R,R,B,R,R,R,_,_],
  [_,_,R,R,R,B,B,R,B,B,R,R,R,R,_,_],
  [_,_,_,R,R,R,R,R,R,R,R,R,R,_,_,_],
  [_,_,_,R,R,R,R,R,R,R,R,R,R,_,_,_],
  [_,_,_,_,R,R,R,R,R,R,R,R,_,_,_,_],
  [_,_,_,_,_,R,R,R,R,R,R,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
];

const BC = "#7c3aed";
const BOSS_SPRITE = [
  [_,_,_,_,BC,_,_,_,_,_,_,BC,_,_,_,_],
  [_,_,_,BC,BC,_,_,_,_,_,_,BC,BC,_,_,_],
  [_,_,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,_,_],
  [_,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,_],
  [_,BC,BC,W,W,BC,BC,BC,BC,BC,W,W,BC,BC,BC,_],
  [_,BC,BC,R,W,BC,BC,BC,BC,BC,R,W,BC,BC,BC,_],
  [BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC],
  [BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC],
  [BC,BC,B,BC,BC,B,BC,BC,B,BC,BC,B,BC,BC,B,BC],
  [BC,BC,BC,B,B,BC,BC,B,B,BC,BC,B,B,BC,BC,BC],
  [_,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,_],
  [_,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,_],
  [_,_,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,_,_],
  [_,_,_,BC,BC,BC,BC,BC,BC,BC,BC,BC,BC,_,_,_],
  [_,_,_,_,BC,BC,BC,BC,BC,BC,BC,BC,_,_,_,_],
  [_,_,_,_,_,_,BC,BC,BC,BC,_,_,_,_,_,_],
];

// ============================================================
// Map & Constants
// ============================================================
// 0=wall, 1=floor, 2=monster, 3=boss, 4=chest
const DUNGEON_MAP = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,0,0,1,1,1,1,1,0,0,1,1,1,1,1,0],
  [0,1,1,1,1,0,0,1,1,2,1,1,0,0,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,0,0,1,2,1,1,1,0],
  [0,1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,4,1,1,0],
  [0,0,0,1,1,0,0,0,0,1,1,0,0,0,1,1,1,1,1,0],
  [0,1,1,1,1,0,0,1,1,1,1,0,0,0,0,0,1,1,0,0],
  [0,1,2,1,1,1,1,1,1,2,1,0,0,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,1,0],
  [0,1,1,4,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,0,0,0,0,1,1,0,0,0,1,1,1,3,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

const TILE = 24;
const MW = DUNGEON_MAP[0].length;
const MH = DUNGEON_MAP.length;
const MOVE_SPEED = 0.15; // tiles per frame for interpolation

const MONSTER_NAMES = ["Bug 怪","Null 獸","Error 蟲","Crash 龍","Lag 史萊姆","Glitch 精靈"];

function drawSprite(ctx: CanvasRenderingContext2D, sprite: string[][], x: number, y: number, scale: number = 1.5, flash: boolean = false) {
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const c = sprite[row][col];
      if (c === "transparent") continue;
      ctx.fillStyle = flash ? "#ffffff" : c;
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

// ============================================================
// Types
// ============================================================
interface Monster { id: number; x: number; y: number; hp: number; maxHp: number; name: string; isBoss: boolean; defeated: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; }

interface GState {
  // Logical tile position (integer)
  tileX: number;
  tileY: number;
  // Visual position (float, interpolates toward tile position)
  visualX: number;
  visualY: number;
  playerHp: number;
  maxHp: number;
  score: number;
  monsters: Monster[];
  combatMonster: Monster | null;
  combatQuestion: QuizQuestion | null;
  particles: Particle[];
  gameOver: boolean;
  questionsUsed: number;
  // Track which tiles had chests (so we only heal once)
  usedChests: Set<string>;
}

// ============================================================
// Component
// ============================================================
const DungeonQuizGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gs = useRef<GState | null>(null);
  const questions = useRef<QuizQuestion[]>([]);
  const raf = useRef<number>(0);
  const keys = useRef<Set<string>>(new Set());
  const lastMove = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const [combatMonster, setCombatMonster] = useState<Monster | null>(null);
  const [combatQuestion, setCombatQuestion] = useState<QuizQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [playerHp, setPlayerHp] = useState(5);
  const [gameOver, setGameOver] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<"correct" | "wrong" | null>(null);
  const [hpMessage, setHpMessage] = useState<string | null>(null);

  // Init
  useEffect(() => {
    questions.current = getRandomQuestions(20);
    const monsters: Monster[] = [];
    let mid = 0;
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        if (DUNGEON_MAP[y][x] === 2) monsters.push({ id: mid++, x, y, hp: 1, maxHp: 1, name: MONSTER_NAMES[Math.floor(Math.random() * MONSTER_NAMES.length)], isBoss: false, defeated: false });
        else if (DUNGEON_MAP[y][x] === 3) monsters.push({ id: mid++, x, y, hp: 3, maxHp: 3, name: "God Class BOSS", isBoss: true, defeated: false });
      }
    gs.current = { tileX: 1, tileY: 1, visualX: 1, visualY: 1, playerHp: 5, maxHp: 5, score: 0, monsters, combatMonster: null, combatQuestion: null, particles: [], gameOver: false, questionsUsed: 0, usedChests: new Set() };
  }, []);

  // Keyboard: preventDefault on arrow keys to avoid scrolling
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
        e.preventDefault();
      }
      keys.current.add(e.key);
    };
    const onUp = (e: KeyboardEvent) => { keys.current.delete(e.key); };
    // Attach to the container so we can focus it
    const el = containerRef.current;
    if (el) {
      el.addEventListener("keydown", onDown);
      el.addEventListener("keyup", onUp);
      el.focus();
    }
    // Also on window as fallback
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      if (el) { el.removeEventListener("keydown", onDown); el.removeEventListener("keyup", onUp); }
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Try move
  const tryMove = useCallback((dx: number, dy: number) => {
    const s = gs.current;
    if (!s || s.combatMonster || s.gameOver) return;
    const nx = s.tileX + dx;
    const ny = s.tileY + dy;
    if (nx < 0 || nx >= MW || ny < 0 || ny >= MH) return;
    if (DUNGEON_MAP[ny][nx] === 0) return;

    s.tileX = nx;
    s.tileY = ny;
    // visualX/Y will interpolate in game loop

    // Monster?
    const mon = s.monsters.find(m => m.x === nx && m.y === ny && !m.defeated);
    if (mon) {
      s.combatMonster = mon;
      const qi = s.questionsUsed % questions.current.length;
      s.combatQuestion = questions.current[qi];
      s.questionsUsed++;
      setCombatMonster(mon);
      setCombatQuestion(questions.current[qi]);
      setSelectedAnswer(null);
      setAnswerResult(null);
    }

    // Chest?
    const key = `${nx},${ny}`;
    if (DUNGEON_MAP[ny][nx] === 4 && !s.usedChests.has(key)) {
      s.usedChests.add(key);
      s.playerHp = Math.min(s.playerHp + 2, s.maxHp);
      setPlayerHp(s.playerHp);
      setHpMessage("+2 HP!");
      setTimeout(() => setHpMessage(null), 1500);
    }
  }, []);

  // Answer
  const handleAnswer = useCallback((idx: number) => {
    const s = gs.current;
    if (!s || !s.combatMonster || !s.combatQuestion) return;
    setSelectedAnswer(idx);
    const correct = idx === s.combatQuestion.correctIndex;

    if (correct) {
      setAnswerResult("correct");
      s.combatMonster.hp--;
      if (s.combatMonster.hp <= 0) {
        s.combatMonster.defeated = true;
        const pts = s.combatMonster.isBoss ? 5 : 1;
        s.score += pts;
        setScore(s.score);
        for (let i = 0; i < 12; i++) s.particles.push({ x: s.combatMonster.x * TILE + TILE / 2, y: s.combatMonster.y * TILE + TILE / 2, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 30 + Math.random() * 20, color: s.combatMonster.isBoss ? BC : R });
        setTimeout(() => { if (gs.current) { gs.current.combatMonster = null; gs.current.combatQuestion = null; } setCombatMonster(null); setCombatQuestion(null); setSelectedAnswer(null); setAnswerResult(null); }, 800);
      } else {
        setTimeout(() => { if (gs.current?.combatMonster) { const qi = gs.current.questionsUsed % questions.current.length; gs.current.combatQuestion = questions.current[qi]; gs.current.questionsUsed++; setCombatQuestion(questions.current[qi]); setSelectedAnswer(null); setAnswerResult(null); } }, 800);
      }
    } else {
      setAnswerResult("wrong");
      s.playerHp--;
      setPlayerHp(s.playerHp);
      if (s.playerHp <= 0) {
        s.gameOver = true; setGameOver(true);
        setTimeout(() => { if (gs.current) { gs.current.combatMonster = null; gs.current.combatQuestion = null; } setCombatMonster(null); setCombatQuestion(null); }, 1000);
      } else {
        setTimeout(() => { if (gs.current) { gs.current.combatMonster = null; gs.current.combatQuestion = null; gs.current.tileX = Math.max(1, gs.current.tileX - 1); } setCombatMonster(null); setCombatQuestion(null); setSelectedAnswer(null); setAnswerResult(null); }, 1000);
      }
    }
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;

    const loop = () => {
      const s = gs.current;
      if (!s) { raf.current = requestAnimationFrame(loop); return; }
      frame++;

      // Keyboard movement (throttled)
      if (!s.combatMonster && !s.gameOver && frame - lastMove.current > 8) {
        const k = keys.current;
        if (k.has("ArrowUp") || k.has("w")) { tryMove(0, -1); lastMove.current = frame; }
        else if (k.has("ArrowDown") || k.has("s")) { tryMove(0, 1); lastMove.current = frame; }
        else if (k.has("ArrowLeft") || k.has("a")) { tryMove(-1, 0); lastMove.current = frame; }
        else if (k.has("ArrowRight") || k.has("d")) { tryMove(1, 0); lastMove.current = frame; }
      }

      // Smooth interpolation: visual position lerps toward tile position
      const dx = s.tileX - s.visualX;
      const dy = s.tileY - s.visualY;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        s.visualX += dx * MOVE_SPEED;
        s.visualY += dy * MOVE_SPEED;
      } else {
        s.visualX = s.tileX;
        s.visualY = s.tileY;
      }

      // Particles
      s.particles = s.particles.map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 1, vy: p.vy + 0.1 })).filter(p => p.life > 0);

      // Camera follows visual pos
      const camX = s.visualX * TILE - canvas.width / 2 + TILE / 2;
      const camY = s.visualY * TILE - canvas.height / 2 + TILE / 2;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(-camX, -camY);

      // Tiles
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
        const t = DUNGEON_MAP[y][x];
        const px = x * TILE, py = y * TILE;
        if (t === 0) { ctx.fillStyle = "#1a1a2e"; ctx.fillRect(px, py, TILE, TILE); ctx.fillStyle = "#252545"; ctx.fillRect(px, py, TILE, 3); }
        else { ctx.fillStyle = (x + y) % 2 === 0 ? "#2a2218" : "#251f16"; ctx.fillRect(px, py, TILE, TILE);
          if (t === 4 && !s.usedChests.has(`${x},${y}`)) { ctx.fillStyle = G; ctx.fillRect(px + 6, py + 8, 12, 10); ctx.fillStyle = W; ctx.fillRect(px + 10, py + 10, 4, 3); ctx.fillStyle = S; ctx.fillRect(px + 6, py + 8, 12, 2); }
        }
      }

      // Monsters
      for (const m of s.monsters) {
        if (m.defeated) continue;
        const bob = Math.sin(frame * 0.08 + m.id) * 2;
        const fl = s.combatMonster?.id === m.id && answerResult === "correct" && frame % 6 < 3;
        drawSprite(ctx, m.isBoss ? BOSS_SPRITE : MONSTER_SPRITE, m.x * TILE, m.y * TILE + bob, 1.5, fl);
        if (m.isBoss) { ctx.fillStyle = "#333"; ctx.fillRect(m.x * TILE + 2, m.y * TILE - 4, 20, 3); ctx.fillStyle = R; ctx.fillRect(m.x * TILE + 2, m.y * TILE - 4, 20 * (m.hp / m.maxHp), 3); }
      }

      // Player (smooth position)
      const ppx = s.visualX * TILE;
      const ppy = s.visualY * TILE;
      const pBob = s.combatMonster ? 0 : Math.sin(frame * 0.1) * 1;
      // Walk animation: alternate legs when moving
      const isMoving = Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05;
      const walkFrame = isMoving ? Math.floor(frame / 4) % 2 : 0;
      const hurt = answerResult === "wrong" && frame % 4 < 2;
      drawSprite(ctx, PLAYER_SPRITE, ppx, ppy + pBob + (isMoving && walkFrame ? -1 : 0), 1.5, hurt);

      // Particles
      for (const p of s.particles) { ctx.globalAlpha = p.life / 50; ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1;
      ctx.restore();

      // HUD
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(4, 4, 90, 18);
      ctx.font = "11px monospace";
      ctx.fillStyle = R;
      let hp = "HP ";
      for (let i = 0; i < s.maxHp; i++) hp += i < s.playerHp ? "+" : "-";
      ctx.fillText(hp, 8, 16);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(canvas.width - 74, 4, 70, 18);
      ctx.fillStyle = G;
      ctx.fillText("KO: " + s.score, canvas.width - 68, 16);

      // HP message
      if (hpMessage) {
        ctx.fillStyle = "#00ff88";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText(hpMessage, canvas.width / 2, canvas.height / 2 - 20);
        ctx.textAlign = "left";
      }

      // Game over
      if (s.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = R; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
        ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillStyle = G; ctx.font = "11px monospace";
        ctx.fillText("Score: " + s.score, canvas.width / 2, canvas.height / 2 + 10);
        ctx.textAlign = "left";
      }

      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [tryMove, answerResult, hpMessage]);

  const dirClick = (dx: number, dy: number) => { if (!combatMonster && !gameOver) tryMove(dx, dy); };

  return (
    <div ref={containerRef} tabIndex={0} className="relative w-full select-none outline-none" style={{ WebkitTapHighlightColor: "transparent" }}>
      <canvas ref={canvasRef} width={360} height={240} className="w-full border border-[var(--terminal-primary-dim)] rounded-lg" style={{ imageRendering: "pixelated" }} />

      {/* D-pad */}
      {!combatMonster && !gameOver && (
        <div className="absolute bottom-2 left-2 flex flex-col items-center gap-0.5 opacity-60">
          <button onPointerDown={() => dirClick(0,-1)} className="w-8 h-8 bg-[var(--terminal-primary-dim)] rounded text-[var(--terminal-bg)] text-xs font-bold active:bg-[var(--terminal-primary)]">^</button>
          <div className="flex gap-0.5">
            <button onPointerDown={() => dirClick(-1,0)} className="w-8 h-8 bg-[var(--terminal-primary-dim)] rounded text-[var(--terminal-bg)] text-xs font-bold active:bg-[var(--terminal-primary)]">{"<"}</button>
            <button onPointerDown={() => dirClick(1,0)} className="w-8 h-8 bg-[var(--terminal-primary-dim)] rounded text-[var(--terminal-bg)] text-xs font-bold active:bg-[var(--terminal-primary)]">{">"}</button>
          </div>
          <button onPointerDown={() => dirClick(0,1)} className="w-8 h-8 bg-[var(--terminal-primary-dim)] rounded text-[var(--terminal-bg)] text-xs font-bold active:bg-[var(--terminal-primary)]">v</button>
        </div>
      )}

      {/* Combat overlay */}
      {combatMonster && combatQuestion && (
        <div className="absolute inset-0 bg-black/80 rounded-lg flex flex-col items-center justify-center p-3">
          <div className="text-[var(--terminal-red)] text-xs font-bold mb-1">{combatMonster.isBoss ? "!! BOSS !!" : "遭遇怪物!"}</div>
          <div className="text-[var(--terminal-accent)] text-sm font-bold mb-2">{combatMonster.name}{combatMonster.isBoss && ` (${combatMonster.hp}/${combatMonster.maxHp})`}</div>
          <div className="w-full max-w-xs">
            <div className="text-[var(--terminal-primary)] text-xs mb-3 text-center leading-relaxed">{combatQuestion.question}</div>
            <div className="grid grid-cols-1 gap-1.5">
              {combatQuestion.options.map((opt, idx) => {
                let cls = "border-[var(--terminal-primary-dim)] text-[var(--terminal-primary-dim)] hover:border-[var(--terminal-primary)] hover:text-[var(--terminal-primary)]";
                if (selectedAnswer !== null) {
                  if (idx === combatQuestion!.correctIndex) cls = "border-green-500 text-green-400 bg-green-900/30";
                  else if (idx === selectedAnswer && answerResult === "wrong") cls = "border-red-500 text-red-400 bg-red-900/30";
                }
                return <button key={idx} onClick={() => selectedAnswer === null && handleAnswer(idx)} disabled={selectedAnswer !== null} className={`w-full text-left px-3 py-1.5 rounded border text-[10px] transition-all ${cls} ${selectedAnswer !== null ? "cursor-default" : "cursor-pointer"}`}>{String.fromCharCode(65 + idx)}. {opt}</button>;
              })}
            </div>
            {answerResult && <div className={`text-center mt-2 text-xs font-bold ${answerResult === "correct" ? "text-green-400" : "text-red-400"}`}>{answerResult === "correct" ? (combatMonster.hp <= 0 ? "擊敗了!" : "答對了! 繼續攻擊!") : "答錯了! HP-1, 先撤退..."}</div>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-1 px-1">
        <span className="text-[var(--terminal-primary-dim)] text-[9px]">方向鍵/WASD 移動 | 碰到怪物答題</span>
        <span className="text-[var(--terminal-accent)] text-[9px]">KO: {score}</span>
      </div>
    </div>
  );
};

export default DungeonQuizGame;
