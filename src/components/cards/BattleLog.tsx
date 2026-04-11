// Terminal-style battle log
import { useEffect, useRef } from 'react';
import { BattleLogEntry } from '@/types/Card';

interface BattleLogProps {
  entries: BattleLogEntry[];
}

export default function BattleLog({ entries }: BattleLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-700 pt-2">
      <div className="text-xs text-gray-400 mb-1">{">>>"} 戰鬥紀錄</div>
      <div
        ref={scrollRef}
        className="max-h-40 overflow-y-auto text-xs font-mono space-y-1"
      >
        {entries.slice(-20).map((entry, i) => (
          <div
            key={i}
            className={`${
              entry.actor === 'player' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            <span className="text-gray-500">[{entry.turn}]</span>{' '}
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}
