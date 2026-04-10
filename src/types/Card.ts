// Card Battle Game - Type Definitions (Yu-Gi-Oh Master Duel Style)

// === Enums ===
export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardElement = 'fire' | 'water' | 'earth' | 'wind' | 'electric' | 'neutral';
export type MonsterCardType = 'normal' | 'effect';
export type CardCategory = 'monster' | 'spell' | 'trap';
export type MonsterPosition = 'attack' | 'defense' | 'facedown_defense';

// === Yu-Gi-Oh Style Card Effect System ===
export type EffectTrigger =
  | 'on_summon'        // when this card is summoned
  | 'on_destroy'       // when this card is destroyed
  | 'on_attack'        // when this card declares an attack
  | 'on_attacked'      // when this card is attacked
  | 'on_flip'          // when flipped face-up
  | 'activated'        // manually activated (spell/trap)
  | 'continuous'       // always active while on field
  | 'on_tribute'       // when used as tribute material
  | 'start_of_turn'    // at the start of owner's turn
  | 'end_of_turn';     // at the end of owner's turn

export type EffectAction =
  | 'damage_lp'          // deal damage to opponent LP
  | 'heal_lp'            // restore own LP
  | 'boost_atk'          // increase ATK
  | 'boost_def'          // increase DEF
  | 'weaken_atk'         // decrease target ATK
  | 'weaken_def'         // decrease target DEF
  | 'destroy_monster'    // destroy a monster
  | 'destroy_spell_trap' // destroy a spell/trap
  | 'draw_card'          // draw cards
  | 'special_summon'     // special summon from hand/graveyard
  | 'return_to_hand'     // return card to hand
  | 'negate_attack'      // negate an attack
  | 'change_position'    // change monster position
  | 'piercing'           // deal piercing damage (ATK - DEF goes to LP)
  | 'direct_attack'      // can attack LP directly
  | 'double_attack'      // can attack twice
  | 'protect';           // cannot be destroyed this turn

export type EffectTarget =
  | 'self'
  | 'opponent_monster'     // target 1 opponent monster
  | 'all_opponent_monsters'
  | 'opponent_lp'
  | 'own_lp'
  | 'own_monster'
  | 'all_own_monsters'
  | 'random_opponent_monster'
  | 'weakest_opponent_monster'
  | 'strongest_opponent_monster';

export interface YgoEffect {
  id: string;
  name: string;
  description: string;
  trigger: EffectTrigger;
  action: EffectAction;
  value: number;
  target: EffectTarget;
  duration?: number;       // turns the effect lasts (for continuous buffs)
  condition?: string;      // human-readable condition (for UI display)
  cooldown?: number;       // turns before effect can be used again
}

// === Legacy Ability (kept for backward compat with old data) ===
export interface CardEffect {
  type: 'heal' | 'shield' | 'buff_atk' | 'buff_def' | 'debuff_atk' | 'debuff_def' | 'stun' | 'dot';
  value: number;
  duration: number;
  target: 'self' | 'enemy' | 'all_allies';
}

export interface CardAbility {
  id: string;
  name: string;
  description: string;
  damage: number;
  effect?: CardEffect;
  cooldown: number;
  energyCost: number;
}

// === Card Definition (static data) ===
export interface CardDefinition {
  id: string;
  name: string;
  nameEn?: string;
  rarity: CardRarity;
  element: CardElement;
  poolId: string;
  setId?: string;

  // Base stats
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpd: number;

  // Legacy abilities (old system)
  abilities: CardAbility[];

  // Yu-Gi-Oh style fields
  level: number;                   // 1-12 stars
  cardCategory: CardCategory;      // monster/spell/trap
  monsterType?: MonsterCardType;   // normal/effect
  ygoEffects?: YgoEffect[];        // structured effects
  effectText?: string;             // display text for card effect

  // Synergy
  synergySetId?: string;
  synergyBonus?: SynergyBonus;

  // Visual
  imageUrl: string;
  emoji: string;
  description: string;
}

export interface SynergyBonus {
  setId: string;
  setName: string;
  requiredCount: number;
  bonusType: 'atk' | 'def' | 'hp' | 'spd' | 'ability_power';
  bonusValue: number;
  bonusDescription: string;
}

// === Card Pool / Banner ===
export interface RarityRates {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface CardPool {
  id: string;
  name: string;
  description: string;
  type: 'basic' | 'event';
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  imageUrl?: string;
  cardIds: string[];
  rates: RarityRates;
  singleDrawCost: number;
  multiDrawCost: number;
  multiDrawCount: number;
  guaranteedRare: boolean;
}

// === Player Collection ===
export interface PlayerCard {
  cardId: string;
  level: number;         // upgrade level 1-10
  xp: number;
  duplicateCount: number;
  obtainedAt: string;
  isInDeck: boolean;
}

export interface PlayerCardCollection {
  userId: string;
  cards: PlayerCard[];
  activeDeckCardIds: string[];
  totalDraws: number;
  pityCounter: number;
  lastDrawAt?: string;
}

// === Yu-Gi-Oh Battle State ===
export type DuelPhase = 'draw' | 'main' | 'battle' | 'end';

export interface FieldMonster {
  cardId: string;
  definition: CardDefinition;
  playerCardLevel: number; // upgrade level for stat scaling
  position: MonsterPosition;
  currentAtk: number;
  currentDef: number;
  canAttack: boolean;
  hasAttacked: boolean;
  justSummoned: boolean;   // summoning sickness
  turnBuffs: FieldBuff[];
  faceUp: boolean;
  /** Per-effect cooldown counters keyed by YgoEffect.id. Decrements each end-of-turn. */
  effectCooldowns: Record<string, number>;
}

export interface FieldBuff {
  action: EffectAction;
  value: number;
  turnsRemaining: number;
  sourceId: string;
}

export interface FieldSpellTrap {
  cardId: string;
  definition: CardDefinition;
  faceUp: boolean;
  isActivated: boolean;
}

export interface PlayerField {
  lp: number;
  monsters: (FieldMonster | null)[];   // 5 zones
  spellTraps: (FieldSpellTrap | null)[]; // 3 zones
  hand: CardDefinition[];
  deck: CardDefinition[];
  graveyard: CardDefinition[];
  hasNormalSummoned: boolean;
}

export interface DuelLogEntry {
  turn: number;
  actor: 'player' | 'enemy';
  message: string;
  type: 'summon' | 'attack' | 'effect' | 'destroy' | 'damage' | 'phase' | 'draw' | 'info';
}

export interface DuelRewards {
  coinsEarned: number;
  xpPerCard: number;
}

export interface DuelState {
  id: string;
  status: 'preparing' | 'dueling' | 'victory' | 'defeat';
  turn: number;
  maxTurns: number;
  currentPhase: DuelPhase;
  currentPlayer: 'player' | 'enemy';

  player: PlayerField;
  enemy: PlayerField;

  log: DuelLogEntry[];
  chainStack: YgoEffect[];  // effect chain resolution

  rewards?: DuelRewards;
}

// === PvE Opponent ===
export interface PveOpponent {
  id: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  teamCardIds: string[];
  teamLevels: number[];
  rewardCoins: number;
  rewardXp: number;
  emoji: string;
}

// === PvP Room ===
export interface PvpBattleRoom {
  id: string;
  player1Id: string;
  player1Name: string;
  player2Id?: string;
  player2Name?: string;
  status: 'waiting' | 'ready' | 'battling' | 'finished';
  battleState?: DuelState;
  /** Deck snapshot for player1 (card IDs of active deck, taken when room is created) */
  player1DeckCardIds?: string[];
  /** Deck snapshot for player2 (card IDs of active deck, taken when player joins) */
  player2DeckCardIds?: string[];
  currentTurnPlayerId?: string;
  lastActionAt?: string;
  turnTimeLimit: number;
  winnerId?: string;
  createdAt: string;
}

// === Strengthen System ===
export interface StrengthenResult {
  success: boolean;
  newLevel: number;
  newXp: number;
  atkGain: number;
  defGain: number;
  message: string;
}

// Legacy types kept for backward compatibility
export interface ActiveEffect {
  effectType: CardEffect['type'];
  value: number;
  turnsRemaining: number;
  sourceCardId: string;
}

export interface BattleCard {
  cardId: string;
  definition: CardDefinition;
  level: number;
  currentHp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  abilityCooldowns: Record<string, number>;
  activeEffects: ActiveEffect[];
  isDefeated: boolean;
}

export interface BattleLogEntry {
  turn: number;
  actor: 'player' | 'enemy';
  cardName: string;
  action: string;
  damage?: number;
  effect?: string;
  message: string;
}

export interface BattleRewards {
  coinsEarned: number;
  xpPerCard: number;
}

export interface BattleState {
  id: string;
  phase: 'selecting' | 'battling' | 'victory' | 'defeat';
  turn: number;
  maxTurns: number;
  playerTeam: BattleCard[];
  playerActiveIndex: number;
  enemyTeam: BattleCard[];
  enemyActiveIndex: number;
  battleLog: BattleLogEntry[];
  synergyBonuses: { player: SynergyBonus[]; enemy: SynergyBonus[] };
  rewards?: BattleRewards;
}
