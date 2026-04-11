// Duel tutorial overlay - guided walkthrough of the battle UI
import TutorialOverlay, { TutorialStep } from '@/components/TutorialOverlay';

interface DuelTutorialProps {
  active: boolean;
  onComplete: () => void;
}

const DUEL_STEPS: TutorialStep[] = [
  {
    target: '[data-tutorial="duel-phase-bar"]',
    text: '這是階段列。決鬥按照「抽牌 → 主要 → 戰鬥 → 主要2 → 結束」的順序進行。目前高亮的就是當前階段。',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="duel-player-lp"]',
    text: '這是你的生命值 (LP)。初始為 100，LP 降到 0 就輸了！',
    position: 'top',
  },
  {
    target: '[data-tutorial="duel-enemy-lp"]',
    text: '這是對手的生命值。把對手的 LP 打到 0 就贏了！',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="duel-hand"]',
    text: '這是你的手牌。在主要階段中，點擊一張怪獸卡來選擇它（發光的卡牌代表可以出牌）。',
    position: 'top',
  },
  {
    target: '[data-tutorial="duel-player-field"]',
    text: '這是你的怪獸區（5格）。選好手牌後，點擊閃爍的「召喚」格子來召喚怪獸。等級5-6需要1隻祭品，等級7以上需要2隻祭品。',
    position: 'top',
  },
  {
    target: '[data-tutorial="duel-enemy-field"]',
    text: '這是對手的怪獸區。在戰鬥階段，先點擊你的怪獸，再點擊對手的怪獸來攻擊。如果對手場上沒有怪獸，可以直接攻擊對手 LP！',
    position: 'bottom',
  },
  {
    target: '[data-tutorial="duel-actions"]',
    text: '這裡顯示操作提示。「下一階段」按鈕會推進到下一個階段。在結束階段點擊「結束回合」會把回合交給對手。',
    position: 'top',
  },
];

export default function DuelTutorial({ active, onComplete }: DuelTutorialProps) {
  return (
    <TutorialOverlay
      steps={DUEL_STEPS}
      active={active}
      onComplete={onComplete}
      skippable
    />
  );
}
