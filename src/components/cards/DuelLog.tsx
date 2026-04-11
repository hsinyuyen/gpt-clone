// Duel battle log - terminal style scrolling log
import { useEffect, useRef } from 'react';
import { DuelLogEntry } from '@/types/Card';

interface DuelLogProps {
  entries: DuelLogEntry[];
  maxVisible?: number;
}

const typeColors: Record<string, string> = {
  summon: 'text-green-400',
  attack: 'text-red-400',
  effect: 'text-purple-400',
  destroy: 'text-red-500',
  damage: 'text-orange-400',
  phase: 'text-cyan-400',
  draw: 'text-blue-400',
  info: 'text-gray-400',
};

export default function DuelLog({ entries, maxVisible = 50 }: DuelLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = entries.slice(-maxVisible);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div
      ref={scrollRef}
      className="bg-black/80 border border-gray-800 rounded p-2 max-h-40 overflow-y-auto font-mono text-xs"
    >
      {visible.map((entry, i) => (
        <div key={i} className={`${typeColors[entry.type] || 'text-gray-400'} leading-relaxed`}>
          <span className="text-gray-600 mr-1">[T{entry.turn}]</span>
          <span className={entry.actor === 'player' ? 'text-green-600' : 'text-red-600'}>
            {entry.actor === 'player' ? '▸' : '◂'}
          </span>
          {' '}{entry.message}
        </div>
      ))}
      {entries.length === 0 && (
        <div className="text-gray-600 italic">等待決鬥開始...</div>
      )}
    </div>
  );
}
