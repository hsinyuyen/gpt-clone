// Automated card effect verification page
// Simulates a controlled duel environment and tests each card's effects
import { useState, useCallback } from 'react';
import { ALL_CARDS } from '@/data/cards/pools';
import {
  CardDefinition,
  DuelState,
  FieldMonster,
  PlayerField,
  CardEffectDef,
} from '@/types/Card';
import {
  initDuel,
  declareAttack,
  advancePhase,
  normalSummon,
  flipSummon,
} from '@/utils/duelEngine';
import {
  createFieldMonster,
  processOnSummonEffects,
  processOnFlipEffects,
  processOnDestroyEffects,
  processOnAttackEffects,
  processOnAttackedEffects,
  processStartOfTurnEffects,
  processEndOfTurnEffects,
  hasBuff,
} from '@/utils/effectEngine';

// ===== Test Framework =====

interface TestResult {
  cardId: string;
  cardName: string;
  effectId: string;
  effectName: string;
  trigger: string;
  action: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
}

// Create a minimal duel state for testing
function createTestState(): DuelState {
  // Use dummy cards to fill decks
  const dummy = ALL_CARDS.filter((c) => c.cardCategory === 'monster').slice(0, 20);
  return initDuel(dummy, dummy);
}

// Clone and set up a controlled state
function setupTestField(opts: {
  playerMonster?: CardDefinition;
  playerMonsterPosition?: 'attack' | 'defense' | 'facedown_defense';
  enemyMonster?: CardDefinition;
  enemyMonsterPosition?: 'attack' | 'defense' | 'facedown_defense';
  playerHand?: CardDefinition[];
  playerGraveyard?: CardDefinition[];
  phase?: 'main' | 'battle';
  currentPlayer?: 'player' | 'enemy';
}): DuelState {
  const state = createTestState();
  state.status = 'dueling';
  state.turn = 2; // avoid first-turn attack block
  state.currentPhase = opts.phase || 'main';
  state.currentPlayer = opts.currentPlayer || 'player';

  // Clear fields
  state.player.monsters = [null, null, null, null, null];
  state.enemy.monsters = [null, null, null, null, null];
  state.player.hand = [];
  state.enemy.hand = [];
  state.player.graveyard = [];
  state.enemy.graveyard = [];
  state.player.lp = 500;
  state.enemy.lp = 500;
  state.player.hasNormalSummoned = false;
  state.enemy.hasNormalSummoned = false;
  state.log = [];

  if (opts.playerMonster) {
    const fm = createFieldMonster(opts.playerMonster, 1, opts.playerMonsterPosition || 'attack');
    fm.justSummoned = false; // allow attacking
    state.player.monsters[0] = fm;
  }
  if (opts.enemyMonster) {
    const fm = createFieldMonster(opts.enemyMonster, 1, opts.enemyMonsterPosition || 'attack');
    fm.justSummoned = false;
    state.enemy.monsters[0] = fm;
  }
  if (opts.playerHand) state.player.hand = [...opts.playerHand];
  if (opts.playerGraveyard) state.player.graveyard = [...opts.playerGraveyard];

  return state;
}

// Shallow clone for comparison
function cloneState(s: DuelState): DuelState {
  return JSON.parse(JSON.stringify(s));
}

// ===== Individual Effect Tests =====

function testOnSummon(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({});
    const fm = createFieldMonster(card, 1, 'attack');
    state.player.monsters[0] = fm;
    state.player.hand = ALL_CARDS.filter((c) => c.cardCategory === 'monster' && c.id !== card.id).slice(0, 5);

    // Put some monsters in graveyard for graveyard summon tests
    const graveyardCandidates = ALL_CARDS.filter((c) => c.cardCategory === 'monster' && c.element === card.element && c.id !== card.id);
    state.player.graveyard = graveyardCandidates.slice(0, 3);

    // Put a weak enemy monster for destroy/weaken tests
    const weakEnemy = ALL_CARDS.find((c) => c.cardCategory === 'monster' && c.baseAtk <= 30);
    if (weakEnemy) state.enemy.monsters[0] = createFieldMonster(weakEnemy, 1, 'attack');

    const before = cloneState(state);
    const logs = processOnSummonEffects(state, 'player', fm);

    return verifyEffect(state, before, effect, logs, base);
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

function testOnAttack(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const weakEnemy = ALL_CARDS.find((c) => c.cardCategory === 'monster' && c.baseAtk <= 20) || ALL_CARDS[0];
    const state = setupTestField({
      playerMonster: card,
      enemyMonster: weakEnemy,
      phase: 'battle',
    });

    // Install continuous buffs first if the card has any
    const fm = state.player.monsters[0]!;
    const contEffects = (card.ygoEffects || []).filter((e) => e.trigger === 'continuous');
    if (contEffects.length > 0) {
      processOnSummonEffects(state, 'player', fm);
    }

    const before = cloneState(state);
    const result = declareAttack(state, 'player', 0, 0);

    // Check logs for evidence of the effect firing
    const effectLogs = result.log.filter((l) => l.type === 'effect' || l.type === 'destroy' || l.type === 'damage' || l.type === 'summon');
    const hasEffectLog = effectLogs.some((l) => l.message.includes(effect.name));

    if (effect.action === 'damage_lp' && result.enemy.lp < before.enemy.lp) {
      return { ...base, status: 'pass', message: `LP damage dealt: ${before.enemy.lp} → ${result.enemy.lp}` };
    }
    if (effect.action === 'destroy_monster' && result.enemy.graveyard.length > before.enemy.graveyard.length) {
      return { ...base, status: 'pass', message: 'Monster destroyed on attack' };
    }
    if (effect.action === 'return_to_hand') {
      const enemyHandGrew = result.enemy.hand.length > before.enemy.hand.length;
      if (enemyHandGrew) return { ...base, status: 'pass', message: 'Monster returned to hand on attack' };
    }
    if (hasEffectLog) {
      return { ...base, status: 'pass', message: `Effect fired: ${effectLogs.map(l => l.message).join('; ')}` };
    }

    return { ...base, status: 'fail', message: `No evidence of effect firing. Logs: ${result.log.map(l => l.message).join(' | ')}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

function testOnAttacked(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const strongAttacker = ALL_CARDS.find((c) => c.cardCategory === 'monster' && c.baseAtk >= 60) || ALL_CARDS[0];
    const state = setupTestField({
      playerMonster: strongAttacker,
      enemyMonster: card,
      phase: 'battle',
    });

    const before = cloneState(state);
    const result = declareAttack(state, 'player', 0, 0);

    const effectLogs = result.log.filter((l) => l.type === 'effect');
    const hasEffectLog = effectLogs.some((l) => l.message.includes(effect.name));

    if (hasEffectLog) {
      return { ...base, status: 'pass', message: `Effect fired: ${effectLogs.map(l => l.message).join('; ')}` };
    }
    if (effect.action === 'return_to_hand' && result.player.hand.length > before.player.hand.length) {
      return { ...base, status: 'pass', message: 'Attacker returned to hand' };
    }
    if (effect.action === 'weaken_atk' && result.player.monsters[0] && result.player.monsters[0]!.currentAtk < before.player.monsters[0]!.currentAtk) {
      return { ...base, status: 'pass', message: 'Attacker ATK weakened' };
    }

    return { ...base, status: 'fail', message: `No evidence of on_attacked effect. Logs: ${result.log.map(l => l.message).join(' | ')}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

function testOnDestroy(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const strongAttacker = ALL_CARDS.find((c) => c.cardCategory === 'monster' && c.baseAtk >= 80) || ALL_CARDS[0];
    const state = setupTestField({
      playerMonster: strongAttacker,
      enemyMonster: card,
      phase: 'battle',
    });

    // Put hand cards for special_summon_from_hand
    state.enemy.hand = ALL_CARDS.filter((c) => c.cardCategory === 'monster' && c.id !== card.id).slice(0, 5);

    const before = cloneState(state);
    const result = declareAttack(state, 'player', 0, 0);

    if (effect.action === 'special_summon_from_hand') {
      const enemyMonstersAfter = result.enemy.monsters.filter((m) => m !== null).length;
      const enemyMonstersBefore = before.enemy.monsters.filter((m) => m !== null).length;
      // Card was destroyed but a new one should appear
      if (enemyMonstersAfter >= 1) {
        return { ...base, status: 'pass', message: `Special summon from hand succeeded. Monsters on field: ${enemyMonstersAfter}` };
      }
      return { ...base, status: 'fail', message: `No monster summoned from hand after destroy. Field: ${enemyMonstersAfter} monsters` };
    }
    if (effect.action === 'damage_lp') {
      // The attacker deals battle damage, but the effect should deal additional damage
      const effectLogs = result.log.filter((l) => l.type === 'effect' && l.message.includes(effect.name));
      if (effectLogs.length > 0) {
        return { ...base, status: 'pass', message: `Destroy effect fired: ${effectLogs[0].message}` };
      }
    }

    const allLogs = result.log.filter(l => l.type === 'effect' || l.type === 'summon');
    if (allLogs.some(l => l.message.includes(effect.name))) {
      return { ...base, status: 'pass', message: `Effect fired on destroy` };
    }

    return { ...base, status: 'fail', message: `No evidence of on_destroy effect. Logs: ${result.log.map(l => l.message).join(' | ')}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

function testContinuous(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ playerMonster: card, phase: 'battle' });
    const fm = state.player.monsters[0]!;

    // Install continuous via on_summon handler
    processOnSummonEffects(state, 'player', fm);

    if (['piercing', 'direct_attack', 'double_attack', 'protect'].includes(effect.action)) {
      const has = hasBuff(fm, effect.action as any);
      if (has) {
        return { ...base, status: 'pass', message: `Flag buff ${effect.action} installed` };
      }
      return { ...base, status: 'fail', message: `Flag buff ${effect.action} NOT found on monster` };
    }

    // Stat buffs
    if (effect.action === 'boost_atk' || effect.action === 'boost_def') {
      const buffFound = fm.turnBuffs.some((b) => b.action === effect.action);
      if (buffFound) return { ...base, status: 'pass', message: `Continuous ${effect.action} buff applied` };
      return { ...base, status: 'fail', message: `Continuous ${effect.action} buff NOT found` };
    }

    return { ...base, status: 'skip', message: 'Continuous test not implemented for this action' };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

function testStartOfTurn(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ playerMonster: card, currentPlayer: 'enemy' });
    const fm = state.player.monsters[0]!;
    fm.justSummoned = false;
    state.currentPhase = 'end';

    const before = cloneState(state);
    // Advance from enemy end → player draw (fires start_of_turn for player)
    const result = advancePhase(state);

    if (effect.action === 'heal_lp' && result.player.lp > before.player.lp) {
      return { ...base, status: 'pass', message: `Heal on turn start: ${before.player.lp} → ${result.player.lp}` };
    }
    if (effect.action === 'boost_def' || effect.action === 'boost_atk') {
      const monster = result.player.monsters[0];
      if (monster && monster.turnBuffs.some(b => b.action === effect.action)) {
        return { ...base, status: 'pass', message: `${effect.action} buff applied at turn start` };
      }
    }
    if (effect.action === 'damage_lp' && result.enemy.lp < before.enemy.lp) {
      return { ...base, status: 'pass', message: `Damage on turn start: ${before.enemy.lp} → ${result.enemy.lp}` };
    }

    const effectLogs = result.log.filter(l => l.type === 'effect');
    if (effectLogs.some(l => l.message.includes(effect.name))) {
      return { ...base, status: 'pass', message: 'Effect fired at start of turn' };
    }

    return { ...base, status: 'fail', message: `No evidence of start_of_turn effect. Logs: ${result.log.map(l => l.message).join(' | ')}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

function testEndOfTurn(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ playerMonster: card, currentPlayer: 'player' });
    const fm = state.player.monsters[0]!;
    fm.justSummoned = false;
    state.currentPhase = 'end';

    const before = cloneState(state);
    const result = advancePhase(state);

    if (effect.action === 'heal_lp' && result.player.lp > before.player.lp) {
      return { ...base, status: 'pass', message: `Heal on turn end: ${before.player.lp} → ${result.player.lp}` };
    }
    if (effect.action === 'damage_lp' && result.enemy.lp < before.enemy.lp) {
      return { ...base, status: 'pass', message: `Damage on turn end: ${before.enemy.lp} → ${result.enemy.lp}` };
    }

    const effectLogs = result.log.filter(l => l.type === 'effect');
    if (effectLogs.some(l => l.message.includes(effect.name))) {
      return { ...base, status: 'pass', message: 'Effect fired at end of turn' };
    }

    return { ...base, status: 'fail', message: `No evidence of end_of_turn effect. Logs: ${result.log.map(l => l.message).join(' | ')}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

function testOnFlip(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ phase: 'main' });
    // Set card face-down in player zone
    const fm = createFieldMonster(card, 1, 'facedown_defense');
    fm.justSummoned = false;
    state.player.monsters[0] = fm;

    // Put an enemy monster for negate_attack test
    const enemy = ALL_CARDS.find((c) => c.cardCategory === 'monster' && c.baseAtk >= 50) || ALL_CARDS[0];
    state.enemy.monsters[0] = createFieldMonster(enemy, 1, 'attack');

    const before = cloneState(state);
    const result = flipSummon(state, 'player', 0);

    if (effect.action === 'negate_attack') {
      const enemyMonster = result.enemy.monsters[0];
      if (enemyMonster && !enemyMonster.canAttack) {
        return { ...base, status: 'pass', message: 'Enemy monster canAttack set to false after flip' };
      }
      return { ...base, status: 'fail', message: `Enemy canAttack not negated. canAttack=${enemyMonster?.canAttack}` };
    }

    const effectLogs = result.log.filter(l => l.type === 'effect');
    if (effectLogs.some(l => l.message.includes(effect.name))) {
      return { ...base, status: 'pass', message: 'Flip effect fired' };
    }

    return { ...base, status: 'fail', message: `No evidence of on_flip effect. Logs: ${result.log.map(l => l.message).join(' | ')}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

// Special test for double_attack: verify exactly 2 attacks allowed, not 3
function testDoubleAttackLimit(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: `${effect.name} (2次限制)`, trigger: effect.trigger, action: effect.action };
  try {
    const weakEnemy = ALL_CARDS.find((c) => c.cardCategory === 'monster' && c.baseAtk <= 20) || ALL_CARDS[0];
    const state = setupTestField({ playerMonster: card, phase: 'battle' });
    const fm = state.player.monsters[0]!;
    processOnSummonEffects(state, 'player', fm);

    // Fill enemy with 3 weak monsters
    for (let i = 0; i < 3; i++) {
      state.enemy.monsters[i] = createFieldMonster(weakEnemy, 1, 'attack');
      state.enemy.monsters[i]!.justSummoned = false;
    }

    let current = cloneState(state);

    // Attack 1
    const after1 = declareAttack(current, 'player', 0, 0);
    const atk1Count = after1.player.monsters[0]?.attackCount ?? 0;

    // Attack 2
    const after2 = declareAttack(after1, 'player', 0, 1);
    const atk2Count = after2.player.monsters[0]?.attackCount ?? 0;

    // Attack 3 — should be blocked
    const enemyLpBefore3 = after2.enemy.lp;
    const enemyGraveBefore3 = after2.enemy.graveyard.length;
    const after3 = declareAttack(after2, 'player', 0, 2);
    const atk3Count = after3.player.monsters[0]?.attackCount ?? 0;
    const attack3Blocked = after3.enemy.lp === enemyLpBefore3 && after3.enemy.graveyard.length === enemyGraveBefore3;

    if (atk1Count === 1 && atk2Count === 2 && attack3Blocked) {
      return { ...base, status: 'pass', message: `Attack counts: 1→${atk1Count}, 2→${atk2Count}, 3rd blocked: ${attack3Blocked}` };
    }
    return { ...base, status: 'fail', message: `Attack counts: 1→${atk1Count}, 2→${atk2Count}, 3rd blocked: ${attack3Blocked}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

// Special test for direct_attack: verify can attack LP directly even with enemy monsters
function testDirectAttackBypass(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: `${effect.name} (直接攻擊)`, trigger: effect.trigger, action: effect.action };
  try {
    const enemy = ALL_CARDS.find((c) => c.cardCategory === 'monster' && c.baseAtk >= 50) || ALL_CARDS[0];
    const state = setupTestField({
      playerMonster: card,
      enemyMonster: enemy,
      phase: 'battle',
    });
    const fm = state.player.monsters[0]!;
    processOnSummonEffects(state, 'player', fm);

    const before = cloneState(state);
    // targetZone = -1 means direct attack
    const result = declareAttack(state, 'player', 0, -1);

    if (result.enemy.lp < before.enemy.lp) {
      return { ...base, status: 'pass', message: `Direct attack succeeded: LP ${before.enemy.lp} → ${result.enemy.lp} (enemy still has monsters)` };
    }
    return { ...base, status: 'fail', message: `Direct attack blocked. LP unchanged: ${result.enemy.lp}` };
  } catch (e: any) {
    return { ...base, status: 'fail', message: `Exception: ${e.message}` };
  }
}

// Verify helper
function verifyEffect(state: DuelState, before: DuelState, effect: CardEffectDef, logs: any[], base: any): TestResult {
  const hasLog = logs.length > 0;

  switch (effect.action) {
    case 'heal_lp':
      if (state.player.lp > before.player.lp) return { ...base, status: 'pass', message: `Healed: ${before.player.lp} → ${state.player.lp}` };
      break;
    case 'damage_lp':
      if (state.enemy.lp < before.enemy.lp) return { ...base, status: 'pass', message: `Damaged: ${before.enemy.lp} → ${state.enemy.lp}` };
      break;
    case 'boost_atk':
    case 'boost_def':
    case 'weaken_atk':
    case 'weaken_def':
      if (hasLog) return { ...base, status: 'pass', message: `Stat buff applied` };
      break;
    case 'destroy_monster':
      if (state.enemy.graveyard.length > before.enemy.graveyard.length) return { ...base, status: 'pass', message: 'Monster destroyed' };
      if (state.enemy.monsters.filter(m => m).length < before.enemy.monsters.filter(m => m).length) return { ...base, status: 'pass', message: 'Monster removed from field' };
      break;
    case 'draw_card':
      if (state.player.hand.length > before.player.hand.length) return { ...base, status: 'pass', message: 'Cards drawn' };
      break;
    case 'return_to_hand':
      if (state.enemy.hand.length > before.enemy.hand.length) return { ...base, status: 'pass', message: 'Monster returned to hand' };
      break;
    case 'protect':
      if (state.player.monsters[0]?.turnBuffs.some(b => b.action === 'protect')) return { ...base, status: 'pass', message: 'Protect buff installed' };
      break;
    case 'piercing':
    case 'direct_attack':
    case 'double_attack':
      if (state.player.monsters[0] && hasBuff(state.player.monsters[0], effect.action)) return { ...base, status: 'pass', message: `${effect.action} flag installed` };
      break;
    case 'special_summon_from_hand': {
      const newMonsters = state.player.monsters.filter(m => m !== null).length;
      const oldMonsters = before.player.monsters.filter(m => m !== null).length;
      if (newMonsters > oldMonsters) return { ...base, status: 'pass', message: 'Monster summoned from hand' };
      break;
    }
    case 'special_summon_from_graveyard': {
      const newMonsters = state.player.monsters.filter(m => m !== null).length;
      const oldMonsters = before.player.monsters.filter(m => m !== null).length;
      if (newMonsters > oldMonsters) return { ...base, status: 'pass', message: 'Monster summoned from graveyard' };
      if (state.player.graveyard.length < before.player.graveyard.length) return { ...base, status: 'pass', message: 'Monster removed from graveyard (summoned)' };
      break;
    }
    case 'negate_attack':
      if (hasLog) return { ...base, status: 'pass', message: 'Attack negated' };
      break;
  }

  if (hasLog) return { ...base, status: 'pass', message: `Effect log generated: ${logs.map((l: any) => l.message).join('; ')}` };
  return { ...base, status: 'fail', message: 'No observable effect change or log' };
}

// ===== Run all tests =====

function runAllTests(): TestResult[] {
  const results: TestResult[] = [];
  const effectCards = ALL_CARDS.filter((c) => c.ygoEffects && c.ygoEffects.length > 0);

  for (const card of effectCards) {
    for (const effect of card.ygoEffects!) {
      switch (effect.trigger) {
        case 'on_summon':
          results.push(testOnSummon(card, effect));
          break;
        case 'on_attack':
          results.push(testOnAttack(card, effect));
          break;
        case 'on_attacked':
          results.push(testOnAttacked(card, effect));
          break;
        case 'on_destroy':
          results.push(testOnDestroy(card, effect));
          break;
        case 'continuous':
          results.push(testContinuous(card, effect));
          // Extra tests for specific continuous effects
          if (effect.action === 'double_attack') {
            results.push(testDoubleAttackLimit(card, effect));
          }
          if (effect.action === 'direct_attack') {
            results.push(testDirectAttackBypass(card, effect));
          }
          break;
        case 'start_of_turn':
          results.push(testStartOfTurn(card, effect));
          break;
        case 'end_of_turn':
          results.push(testEndOfTurn(card, effect));
          break;
        case 'on_flip':
          results.push(testOnFlip(card, effect));
          break;
        default:
          results.push({
            cardId: card.id,
            cardName: card.name,
            effectId: effect.id,
            effectName: effect.name,
            trigger: effect.trigger,
            action: effect.action,
            status: 'skip',
            message: `Unknown trigger: ${effect.trigger}`,
          });
      }
    }
  }

  return results;
}

// ===== Page Component =====

export default function DebugEffectsPage() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | 'fail' | 'pass'>('all');

  const handleRun = useCallback(() => {
    setRunning(true);
    // Use setTimeout to let the UI update before running
    setTimeout(() => {
      const r = runAllTests();
      setResults(r);
      setRunning(false);
    }, 50);
  }, []);

  const filtered = results?.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  }) || [];

  const passCount = results?.filter((r) => r.status === 'pass').length ?? 0;
  const failCount = results?.filter((r) => r.status === 'fail').length ?? 0;
  const skipCount = results?.filter((r) => r.status === 'skip').length ?? 0;
  const total = results?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--terminal-color)' }}>
          Effect Debug / 效果自動測試
        </h1>
        <p className="text-sm text-gray-400 mb-4">
          自動模擬每張卡的每個效果觸發場景，驗證是否正確發動。共 {ALL_CARDS.filter(c => c.ygoEffects?.length).length} 張效果卡。
        </p>

        <div className="flex gap-3 mb-6">
          <button
            onClick={handleRun}
            disabled={running}
            className="px-6 py-2 rounded font-bold transition-all disabled:opacity-50"
            style={{
              background: 'var(--terminal-color)',
              color: '#000',
            }}
          >
            {running ? '測試中...' : '執行全部測試'}
          </button>

          {results && (
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded text-sm border ${filter === 'all' ? 'bg-gray-700 border-gray-500' : 'border-gray-700'}`}
              >
                全部 ({total})
              </button>
              <button
                onClick={() => setFilter('pass')}
                className={`px-3 py-1 rounded text-sm border ${filter === 'pass' ? 'bg-green-900 border-green-500' : 'border-gray-700'}`}
              >
                通過 ({passCount})
              </button>
              <button
                onClick={() => setFilter('fail')}
                className={`px-3 py-1 rounded text-sm border ${filter === 'fail' ? 'bg-red-900 border-red-500' : 'border-gray-700'}`}
              >
                失敗 ({failCount})
              </button>
            </div>
          )}
        </div>

        {results && (
          <div className="mb-4 p-3 rounded border border-gray-700 bg-gray-900">
            <div className="flex gap-6 text-sm">
              <span className="text-green-400">PASS: {passCount}</span>
              <span className="text-red-400">FAIL: {failCount}</span>
              <span className="text-yellow-400">SKIP: {skipCount}</span>
              <span className="text-gray-400">TOTAL: {total}</span>
              <span className={failCount === 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {failCount === 0 ? 'ALL PASSED' : `${failCount} FAILURES`}
              </span>
            </div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="py-2 px-2 text-gray-400">Status</th>
                  <th className="py-2 px-2 text-gray-400">Card</th>
                  <th className="py-2 px-2 text-gray-400">Effect</th>
                  <th className="py-2 px-2 text-gray-400">Trigger</th>
                  <th className="py-2 px-2 text-gray-400">Action</th>
                  <th className="py-2 px-2 text-gray-400">Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={`${r.cardId}-${r.effectId}-${i}`}
                    className={`border-b border-gray-800 ${
                      r.status === 'fail' ? 'bg-red-950/30' : r.status === 'skip' ? 'bg-yellow-950/20' : ''
                    }`}
                  >
                    <td className="py-1.5 px-2">
                      <span className={`font-mono text-xs font-bold ${
                        r.status === 'pass' ? 'text-green-400' : r.status === 'fail' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-gray-300">{r.cardName}<br/><span className="text-xs text-gray-600">{r.cardId}</span></td>
                    <td className="py-1.5 px-2 text-gray-300">{r.effectName}</td>
                    <td className="py-1.5 px-2"><span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-purple-300">{r.trigger}</span></td>
                    <td className="py-1.5 px-2"><span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-cyan-300">{r.action}</span></td>
                    <td className="py-1.5 px-2 text-xs text-gray-400 max-w-md truncate">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
