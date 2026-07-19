#!/usr/bin/env npx ts-node --compiler-options {"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"resolveJsonModule":true,"paths":{"@/*":["./src/*"]}}
/**
 * Automated card effect test runner.
 * Run: npx ts-node -O '{"module":"commonjs","paths":{"@/*":["./src/*"]}}' --project tsconfig.json scripts/test-effects.ts
 * Or:  npx tsx scripts/test-effects.ts
 */

// Register path aliases
const path = require('path');
const Module = require('module');
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, ...args: any[]) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '..', 'src', request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, ...args);
};

import { ALL_CARDS } from '../src/data/cards/pools';
import {
  CardDefinition,
  DuelState,
  FieldMonster,
  CardEffectDef,
} from '../src/types/Card';
import {
  initDuel,
  declareAttack,
  advancePhase,
  flipSummon,
} from '../src/utils/duelEngine';
import {
  createFieldMonster,
  processOnSummonEffects,
  processOnFlipEffects,
  processOnDestroyEffects,
  hasBuff,
} from '../src/utils/effectEngine';

// ===== Helpers =====

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

function createTestState(): DuelState {
  const dummy = ALL_CARDS.filter((c) => c.cardCategory === 'monster').slice(0, 20);
  return initDuel(dummy, dummy);
}

function setupTestField(opts: {
  playerMonster?: CardDefinition;
  playerMonsterPosition?: 'attack' | 'defense' | 'facedown_defense';
  enemyMonster?: CardDefinition;
  phase?: 'main' | 'battle';
  currentPlayer?: 'player' | 'enemy';
}): DuelState {
  const state = createTestState();
  state.status = 'dueling';
  state.turn = 2;
  state.currentPhase = opts.phase || 'main';
  state.currentPlayer = opts.currentPlayer || 'player';
  state.player.monsters = [null, null, null, null, null];
  state.enemy.monsters = [null, null, null, null, null];
  state.player.hand = [];
  state.enemy.hand = [];
  state.player.graveyard = [];
  state.enemy.graveyard = [];
  state.player.lp = 300;
  state.enemy.lp = 500;
  state.player.hasNormalSummoned = false;
  state.enemy.hasNormalSummoned = false;
  state.log = [];

  if (opts.playerMonster) {
    const fm = createFieldMonster(opts.playerMonster, 1, opts.playerMonsterPosition || 'attack');
    fm.justSummoned = false;
    state.player.monsters[0] = fm;
  }
  if (opts.enemyMonster) {
    const fm = createFieldMonster(opts.enemyMonster, 1, 'attack');
    fm.justSummoned = false;
    state.enemy.monsters[0] = fm;
  }
  return state;
}

function clone(s: DuelState): DuelState {
  return JSON.parse(JSON.stringify(s));
}

// ===== Test functions =====

function testOnSummon(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({});
    const fm = createFieldMonster(card, 1, 'attack');
    state.player.monsters[0] = fm;
    state.player.hand = ALL_CARDS.filter(c => c.cardCategory === 'monster' && c.id !== card.id).slice(0, 5);
    const graveCandidates = ALL_CARDS.filter(c => c.cardCategory === 'monster' && c.element === card.element && c.id !== card.id);
    state.player.graveyard = graveCandidates.slice(0, 3);
    const weakEnemy = ALL_CARDS.find(c => c.cardCategory === 'monster' && c.baseAtk <= 30);
    if (weakEnemy) state.enemy.monsters[0] = createFieldMonster(weakEnemy, 1, 'attack');

    const before = clone(state);
    const logs = processOnSummonEffects(state, 'player', fm);

    // Check based on action
    switch (effect.action) {
      case 'heal_lp': return state.player.lp > before.player.lp ? { ...base, status: 'pass', message: `LP ${before.player.lp}→${state.player.lp}` } : { ...base, status: 'fail', message: 'LP unchanged' };
      case 'damage_lp': return state.enemy.lp < before.enemy.lp ? { ...base, status: 'pass', message: `Enemy LP ${before.enemy.lp}→${state.enemy.lp}` } : { ...base, status: 'fail', message: 'Enemy LP unchanged' };
      case 'protect': return hasBuff(fm, 'protect') ? { ...base, status: 'pass', message: 'Protect installed' } : { ...base, status: 'fail', message: 'No protect buff' };
      case 'destroy_monster': return state.enemy.graveyard.length > before.enemy.graveyard.length ? { ...base, status: 'pass', message: 'Destroyed' } : { ...base, status: 'fail', message: 'Not destroyed' };
      case 'draw_card': return state.player.hand.length > before.player.hand.length ? { ...base, status: 'pass', message: 'Drew cards' } : { ...base, status: 'fail', message: 'No draw' };
      case 'boost_atk': case 'boost_def': case 'weaken_atk': case 'weaken_def':
        return logs.length > 0 ? { ...base, status: 'pass', message: 'Stat buff applied' } : { ...base, status: 'fail', message: 'No buff' };
      case 'special_summon_from_graveyard': {
        const m = state.player.monsters.filter(x => x !== null).length;
        const b = before.player.monsters.filter(x => x !== null).length;
        return m > b ? { ...base, status: 'pass', message: `Summoned from GY (${b}→${m} monsters)` } : { ...base, status: 'fail', message: `No GY summon (${b}→${m})` };
      }
      case 'return_to_hand': return state.enemy.hand.length > before.enemy.hand.length ? { ...base, status: 'pass', message: 'Returned' } : { ...base, status: 'fail', message: 'Not returned' };
      default: return logs.length > 0 ? { ...base, status: 'pass', message: 'Log generated' } : { ...base, status: 'fail', message: 'No effect' };
    }
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testOnAttack(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const weakEnemies = ALL_CARDS.filter(c => c.cardCategory === 'monster' && c.baseAtk <= 20);
    const state = setupTestField({ playerMonster: card, phase: 'battle' });
    // Place multiple weak enemies so multi-effect cards (destroy+bounce) have enough targets
    for (let i = 0; i < Math.min(3, weakEnemies.length); i++) {
      const fm = createFieldMonster(weakEnemies[i], 1, 'attack');
      fm.justSummoned = false;
      state.enemy.monsters[i] = fm;
    }
    const fm = state.player.monsters[0]!;
    processOnSummonEffects(state, 'player', fm); // install continuous

    const before = clone(state);
    const result = declareAttack(state, 'player', 0, 0);
    const effectLogs = result.log.filter(l => l.type === 'effect' || l.type === 'destroy');

    if (effect.action === 'damage_lp' && result.enemy.lp < before.enemy.lp) return { ...base, status: 'pass', message: `Damage dealt` };
    if (effect.action === 'destroy_monster' && result.enemy.graveyard.length > before.enemy.graveyard.length) return { ...base, status: 'pass', message: 'Destroyed on attack' };
    if (effect.action === 'return_to_hand' && result.enemy.hand.length > before.enemy.hand.length) return { ...base, status: 'pass', message: 'Returned on attack' };
    if (effectLogs.some(l => l.message.includes(effect.name))) return { ...base, status: 'pass', message: 'Effect logged' };
    return { ...base, status: 'fail', message: `No effect evidence` };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testOnAttacked(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    // Use a weaker attacker so the defender (card being tested) SURVIVES combat
    // This ensures on_attacked effects can fire before the defender is destroyed
    const weak = ALL_CARDS.find(c => c.cardCategory === 'monster' && c.baseAtk <= 10) || ALL_CARDS[0];
    const state = setupTestField({ playerMonster: weak, enemyMonster: card, phase: 'battle' });
    // Make sure the defender has its continuous effects installed
    processOnSummonEffects(state, 'enemy', state.enemy.monsters[0]!);
    const before = clone(state);
    const result = declareAttack(state, 'player', 0, 0);
    const effectLogs = result.log.filter(l => l.type === 'effect');
    // Check all log types for effect name
    if (result.log.some(l => l.message.includes(effect.name))) return { ...base, status: 'pass', message: 'Effect fired' };
    if (effect.action === 'return_to_hand' && result.player.hand.length > before.player.hand.length) return { ...base, status: 'pass', message: 'Attacker returned' };
    if (effect.action === 'damage_lp' && result.enemy.lp !== before.enemy.lp) return { ...base, status: 'pass', message: 'Damage reflected' };
    return { ...base, status: 'fail', message: `No on_attacked effect` };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testOnDestroy(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const strong = ALL_CARDS.find(c => c.cardCategory === 'monster' && c.baseAtk >= 80) || ALL_CARDS[0];
    const state = setupTestField({ playerMonster: strong, enemyMonster: card, phase: 'battle' });
    state.enemy.hand = ALL_CARDS.filter(c => c.cardCategory === 'monster' && c.id !== card.id).slice(0, 5);
    const before = clone(state);
    const result = declareAttack(state, 'player', 0, 0);

    if (effect.action === 'special_summon_from_hand') {
      const after = result.enemy.monsters.filter(m => m !== null).length;
      return after >= 1 ? { ...base, status: 'pass', message: `Special summoned (${after} on field)` } : { ...base, status: 'fail', message: `No summon (${after})` };
    }
    const effectLogs = result.log.filter(l => l.type === 'effect' || l.type === 'summon' || l.type === 'destroy' || l.type === 'damage');
    if (effectLogs.some(l => l.message.includes(effect.name))) return { ...base, status: 'pass', message: 'Effect fired' };
    if (effect.action === 'damage_lp' && result.player.lp < before.player.lp) return { ...base, status: 'pass', message: 'Effect fired' };
    if (effect.action === 'destroy_monster' && result.player.graveyard.length > before.player.graveyard.length) return { ...base, status: 'pass', message: 'Destroyed opponent monster' };
    return { ...base, status: 'fail', message: 'No on_destroy effect' };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testContinuous(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ playerMonster: card, phase: 'battle' });
    const fm = state.player.monsters[0]!;
    processOnSummonEffects(state, 'player', fm);
    if (['piercing', 'direct_attack', 'double_attack', 'protect'].includes(effect.action)) {
      return hasBuff(fm, effect.action as any) ? { ...base, status: 'pass', message: `${effect.action} installed` } : { ...base, status: 'fail', message: `${effect.action} NOT installed` };
    }
    if (['boost_atk', 'boost_def'].includes(effect.action)) {
      return fm.turnBuffs.some(b => b.action === effect.action) ? { ...base, status: 'pass', message: 'Buff applied' } : { ...base, status: 'fail', message: 'No buff' };
    }
    return { ...base, status: 'skip', message: 'Not tested' };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testDoubleAttackLimit(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: `${effect.name} (2次限制)`, trigger: effect.trigger, action: effect.action };
  try {
    const weak = ALL_CARDS.find(c => c.cardCategory === 'monster' && c.baseAtk <= 20) || ALL_CARDS[0];
    const state = setupTestField({ playerMonster: card, phase: 'battle' });
    const fm = state.player.monsters[0]!;
    processOnSummonEffects(state, 'player', fm);
    for (let i = 0; i < 3; i++) { state.enemy.monsters[i] = createFieldMonster(weak, 1, 'attack'); state.enemy.monsters[i]!.justSummoned = false; }

    let s = clone(state);
    s = declareAttack(s, 'player', 0, 0); const c1 = s.player.monsters[0]?.attackCount ?? 0;
    s = declareAttack(s, 'player', 0, 1); const c2 = s.player.monsters[0]?.attackCount ?? 0;
    const lpBefore = s.enemy.lp; const graveBefore = s.enemy.graveyard.length;
    s = declareAttack(s, 'player', 0, 2); const c3 = s.player.monsters[0]?.attackCount ?? 0;
    const blocked = s.enemy.lp === lpBefore && s.enemy.graveyard.length === graveBefore;

    return c1 === 1 && c2 === 2 && blocked ? { ...base, status: 'pass', message: `1→${c1}, 2→${c2}, 3rd blocked` } : { ...base, status: 'fail', message: `1→${c1}, 2→${c2}, 3rd blocked: ${blocked}` };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testDirectAttackBypass(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: `${effect.name} (直接攻擊)`, trigger: effect.trigger, action: effect.action };
  try {
    const enemy = ALL_CARDS.find(c => c.cardCategory === 'monster' && c.baseAtk >= 50) || ALL_CARDS[0];
    const state = setupTestField({ playerMonster: card, enemyMonster: enemy, phase: 'battle' });
    const fm = state.player.monsters[0]!;
    processOnSummonEffects(state, 'player', fm);
    const before = clone(state);
    const result = declareAttack(state, 'player', 0, -1);
    return result.enemy.lp < before.enemy.lp ? { ...base, status: 'pass', message: `Direct: ${before.enemy.lp}→${result.enemy.lp}` } : { ...base, status: 'fail', message: `Blocked: LP ${result.enemy.lp}` };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testStartOfTurn(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ playerMonster: card, currentPlayer: 'enemy' });
    state.player.monsters[0]!.justSummoned = false;
    state.currentPhase = 'end';
    const before = clone(state);
    const result = advancePhase(state);
    if (effect.action === 'heal_lp' && result.player.lp > before.player.lp) return { ...base, status: 'pass', message: `Healed ${before.player.lp}→${result.player.lp}` };
    if (effect.action === 'damage_lp' && result.enemy.lp < before.enemy.lp) return { ...base, status: 'pass', message: `Damaged ${before.enemy.lp}→${result.enemy.lp}` };
    if (['boost_atk', 'boost_def'].includes(effect.action)) {
      const m = result.player.monsters[0];
      if (m && m.turnBuffs.some(b => b.action === effect.action)) return { ...base, status: 'pass', message: 'Buff applied' };
    }
    if (effect.action === 'draw_card') {
      // Normal draw phase draws 1 card; the effect draws extra. Check log for effect name.
      if (result.log.some(l => l.message.includes(effect.name))) return { ...base, status: 'pass', message: 'Draw effect logged' };
    }
    if (result.log.some(l => (l.type === 'effect' || l.type === 'draw') && l.message.includes(effect.name))) return { ...base, status: 'pass', message: 'Effect logged' };
    return { ...base, status: 'fail', message: 'No start_of_turn effect' };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testEndOfTurn(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ playerMonster: card, currentPlayer: 'player' });
    state.player.monsters[0]!.justSummoned = false;
    state.currentPhase = 'end';
    const before = clone(state);
    const result = advancePhase(state);
    if (effect.action === 'heal_lp' && result.player.lp > before.player.lp) return { ...base, status: 'pass', message: `Healed` };
    if (effect.action === 'damage_lp' && result.enemy.lp < before.enemy.lp) return { ...base, status: 'pass', message: `Damaged` };
    if (result.log.some(l => l.type === 'effect' && l.message.includes(effect.name))) return { ...base, status: 'pass', message: 'Effect logged' };
    return { ...base, status: 'fail', message: 'No end_of_turn effect' };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

function testOnFlip(card: CardDefinition, effect: CardEffectDef): TestResult {
  const base = { cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action };
  try {
    const state = setupTestField({ phase: 'main' });
    const fm = createFieldMonster(card, 1, 'facedown_defense');
    fm.justSummoned = false;
    state.player.monsters[0] = fm;
    const enemy = ALL_CARDS.find(c => c.cardCategory === 'monster' && c.baseAtk >= 50) || ALL_CARDS[0];
    state.enemy.monsters[0] = createFieldMonster(enemy, 1, 'attack');
    const before = clone(state);
    const result = flipSummon(state, 'player', 0);
    if (effect.action === 'negate_attack') {
      const em = result.enemy.monsters[0];
      return em && !em.canAttack ? { ...base, status: 'pass', message: 'canAttack=false' } : { ...base, status: 'fail', message: `canAttack=${em?.canAttack}` };
    }
    if (result.log.some(l => l.type === 'effect' && l.message.includes(effect.name))) return { ...base, status: 'pass', message: 'Flip effect fired' };
    return { ...base, status: 'fail', message: 'No on_flip effect' };
  } catch (e: any) { return { ...base, status: 'fail', message: `Exception: ${e.message}` }; }
}

// ===== Main =====

function main() {
  console.log('=== Card Effect Automated Test ===\n');

  const results: TestResult[] = [];
  const effectCards = ALL_CARDS.filter(c => c.ygoEffects && c.ygoEffects.length > 0);

  for (const card of effectCards) {
    for (const effect of card.ygoEffects!) {
      switch (effect.trigger) {
        case 'on_summon': results.push(testOnSummon(card, effect)); break;
        case 'on_attack': results.push(testOnAttack(card, effect)); break;
        case 'on_attacked': results.push(testOnAttacked(card, effect)); break;
        case 'on_destroy': results.push(testOnDestroy(card, effect)); break;
        case 'continuous':
          results.push(testContinuous(card, effect));
          if (effect.action === 'double_attack') results.push(testDoubleAttackLimit(card, effect));
          if (effect.action === 'direct_attack') results.push(testDirectAttackBypass(card, effect));
          break;
        case 'start_of_turn': results.push(testStartOfTurn(card, effect)); break;
        case 'end_of_turn': results.push(testEndOfTurn(card, effect)); break;
        case 'on_flip': results.push(testOnFlip(card, effect)); break;
        default: results.push({ cardId: card.id, cardName: card.name, effectId: effect.id, effectName: effect.name, trigger: effect.trigger, action: effect.action, status: 'skip', message: `Unknown trigger` });
      }
    }
  }

  // Print results
  const pass = results.filter(r => r.status === 'pass');
  const fail = results.filter(r => r.status === 'fail');
  const skip = results.filter(r => r.status === 'skip');

  // Print failures first
  if (fail.length > 0) {
    console.log('--- FAILURES ---');
    for (const r of fail) {
      console.log(`  FAIL  ${r.cardName} (${r.cardId}) | ${r.effectName} [${r.trigger}/${r.action}]`);
      console.log(`        ${r.message}`);
    }
    console.log('');
  }

  // Print passes
  console.log('--- PASSED ---');
  for (const r of pass) {
    console.log(`  PASS  ${r.cardName} | ${r.effectName} [${r.trigger}/${r.action}] — ${r.message}`);
  }

  if (skip.length > 0) {
    console.log('\n--- SKIPPED ---');
    for (const r of skip) {
      console.log(`  SKIP  ${r.cardName} | ${r.effectName} — ${r.message}`);
    }
  }

  console.log(`\n=== SUMMARY: ${pass.length} PASS / ${fail.length} FAIL / ${skip.length} SKIP / ${results.length} TOTAL ===`);
  process.exit(fail.length > 0 ? 1 : 0);
}

main();
