// Fake "online players" injected into the PvP lobby. These rooms look
// indistinguishable from real PvP rooms — clicking one starts the standard
// PvP-style flow but the opponent on the other end is an AI generated from
// randomOpponentGenerator.ts.
//
// Display rules (per spec):
//   - No emoji avatar
//   - No separate "room name"
//   - No "host" label — just the player nickname
//   - No difficulty shown to the user (kept internally for AI tuning)
//   - Random win/loss record displayed
import { CardElement } from '@/types/Card';

export interface QuickRoom {
  id: string;
  /** Player nickname — the only thing displayed in the lobby. */
  name: string;
  /** Internal: primary element bias for the generated deck */
  theme: CardElement | 'mixed';
  /** Internal: deck strength tier */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Decorative win/loss record */
  fakeWins: number;
  fakeLosses: number;
}

export const QUICK_ROOMS: QuickRoom[] = [
  { id: 'qr_01', name: 'alex_92', theme: 'electric', difficulty: 'easy', fakeWins: 12, fakeLosses: 8 },
  { id: 'qr_02', name: 'mike.dragon', theme: 'fire', difficulty: 'easy', fakeWins: 18, fakeLosses: 5 },
  { id: 'qr_03', name: 'sk8r_kid', theme: 'water', difficulty: 'easy', fakeWins: 9, fakeLosses: 11 },
  { id: 'qr_04', name: 'xxlilxx', theme: 'earth', difficulty: 'easy', fakeWins: 14, fakeLosses: 9 },
  { id: 'qr_05', name: 'ninjaboi', theme: 'wind', difficulty: 'medium', fakeWins: 22, fakeLosses: 13 },
  { id: 'qr_06', name: 'bluefox22', theme: 'mixed', difficulty: 'medium', fakeWins: 31, fakeLosses: 14 },
  { id: 'qr_07', name: 'rocket.man', theme: 'earth', difficulty: 'medium', fakeWins: 27, fakeLosses: 18 },
  { id: 'qr_08', name: 'starboy_77', theme: 'electric', difficulty: 'medium', fakeWins: 24, fakeLosses: 19 },
  { id: 'qr_09', name: 'dark_moon', theme: 'mixed', difficulty: 'easy', fakeWins: 16, fakeLosses: 12 },
  { id: 'qr_10', name: 'ghostieee', theme: 'mixed', difficulty: 'medium', fakeWins: 35, fakeLosses: 22 },
  { id: 'qr_11', name: 'cyber_kid', theme: 'fire', difficulty: 'hard', fakeWins: 47, fakeLosses: 13 },
  { id: 'qr_12', name: 'night0wl', theme: 'water', difficulty: 'hard', fakeWins: 52, fakeLosses: 18 },
];

export function getQuickRoom(id: string): QuickRoom | undefined {
  return QUICK_ROOMS.find((r) => r.id === id);
}
