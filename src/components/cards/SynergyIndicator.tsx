// Shows active synergy bonuses
import { SynergyBonus } from '@/types/Card';

interface SynergyIndicatorProps {
  synergies: SynergyBonus[];
  label: string;
}

export default function SynergyIndicator({ synergies, label }: SynergyIndicatorProps) {
  if (synergies.length === 0) return null;

  return (
    <div className="text-xs">
      <span className="text-gray-400">{label}: </span>
      {synergies.map((s, i) => (
        <span key={i} className="text-purple-400 mr-2">
          🔗 {s.bonusDescription}
        </span>
      ))}
    </div>
  );
}
