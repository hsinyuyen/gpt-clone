# generate-cards

Generate themed card sets for the card battle game system.

## When to use

Use this skill when the user asks to:
- Create a new themed card set / card pool
- Design cards with synergistic abilities
- Generate card data for the battle game
- Create event/limited card pools

## TOP RULE — Catalog-first design (READ BEFORE ANYTHING ELSE)

Card effects in this project are **catalog-driven**. Every `ygoEffect` on a card MUST match a `CatalogEntry` in `src/utils/effectCatalog.ts`. At application boot, `validateCards(ALL_CARDS)` throws if any effect does not match. **This means it is impossible to ship a card whose effect never fires** — but only if you design against the catalog.

**Mandatory workflow before writing a single card effect:**

1. Open `src/utils/effectCatalog.ts` and read the `CATALOG` object end-to-end.
2. For every effect you want to give a card, verify all four dimensions are in the catalog:
   - `action` — must be a key in `CATALOG`
   - `trigger` — must be in that action's `allowedTriggers`
   - `target` — must be in that action's `allowedTargets`
   - `value` — must be inside that action's `valueRange`
3. If the concept you have in mind doesn't fit any catalog entry, **do NOT invent a new trigger/action on the card**. Instead, either:
   - Pick a different concept that the catalog already supports, or
   - Stop and ask the user whether to extend the catalog (which requires a new handler in `effectCatalog.ts`, a new member in `src/types/Card.ts`, and wiring in `src/utils/effectEngine.ts` + `duelEngine.ts`).
4. After generating all cards, mentally run `validateCards` over them — cross-check every effect against the constraints table below.

**Do NOT make up trigger names, action names, or target names.** If you see a concept in an existing card that isn't in the catalog, it's a bug in that card, not license to repeat the pattern.

## Effect catalog reference (keep this in sync with `src/utils/effectCatalog.ts`)

Starting LP is **500**. All effect values must be balanced against this scale.

| action | allowedTriggers | allowedTargets | valueRange | notes |
|---|---|---|---|---|
| `damage_lp` | all except `continuous` | `opponent_lp` | 20–120 | direct LP damage |
| `heal_lp` | all except `continuous` | `own_lp` | 30–150 | capped at starting LP at runtime |
| `boost_atk` | all (incl. `continuous`) | `self`, `own_monster`, `all_own_monsters` | 5–30 | `continuous` → permanent buff |
| `boost_def` | all (incl. `continuous`) | `self`, `own_monster`, `all_own_monsters` | 5–30 | `continuous` → permanent buff |
| `weaken_atk` | all except `continuous` | `opponent_monster`, `all_opponent_monsters`, `random_opponent_monster`, `weakest_opponent_monster`, `strongest_opponent_monster` | 5–25 | lasts `duration` turns (default 1) |
| `weaken_def` | all except `continuous` | same as `weaken_atk` | 5–25 | |
| `destroy_monster` | all except `continuous` | `opponent_monster`, `random_opponent_monster`, `weakest_opponent_monster`, `strongest_opponent_monster` | 1 | |
| `draw_card` | `on_summon`, `on_attack`, `start_of_turn`, `end_of_turn` | `self` | 1–2 | |
| `return_to_hand` | all except `continuous` | `opponent_monster`, `random_opponent_monster`, `weakest_opponent_monster`, `strongest_opponent_monster` | 1 | bounce to owner's hand |
| `piercing` | `continuous` only | `self` | 1 | flag buff — installed once at summon |
| `direct_attack` | `continuous` only | `self` | 1 | flag buff |
| `double_attack` | `continuous` only | `self` | 1 | flag buff |
| `protect` | `on_summon`, `continuous` | `self` | 1 | cannot be battle-destroyed |

**Allowed triggers** (from `src/types/Card.ts`): `on_summon`, `on_attack`, `on_attacked`, `on_destroy`, `start_of_turn`, `end_of_turn`, `continuous`. **No others exist.** Do not use `activated`, `on_flip`, `on_tribute`, or anything else — they were removed.

**`CardEffectDef` shape** (`src/types/Card.ts`): `id`, `name`, `description`, `trigger`, `action`, `value`, `target`, optional `duration`. There is **no** `cooldown` field and **no** `condition` field. Delete them if you see them.

## Instructions

When generating a card set, follow these rules:

### 1. Input Parameters
Ask the user for:
- **Theme name** (Chinese + English): e.g. "深海帝國 (Deep Ocean Empire)"
- **Card count**: Typically 20 cards per event pool
- **Rarity distribution**: Default is 8 common, 6 rare, 4 epic, 2 legendary
- **Element focus**: Which elements to emphasize (fire/water/earth/wind/electric/neutral)
- **Synergy theme**: What bonuses the set provides

### 2. Stat Balancing Rules

Base stat totals by rarity (HP + ATK + DEF + SPD):
- **Common**: ~130 total (e.g. 42/28/25/35)
- **Rare**: ~175 total (e.g. 58/48/35/34)
- **Epic**: ~235 total (e.g. 85/65/50/35)
- **Legendary**: ~285 total (e.g. 105/78/60/42)

### 3. Ygo-style effect design (the part that actually fires)

Effects live in `ygoEffects: CardEffectDef[]`. These are what the duel engine runs.

Design rules, per rarity:
- **Common**: 0–1 effect. Usually one simple on-summon buff/debuff/heal.
- **Rare**: 1–2 effects. Can mix trigger types.
- **Epic**: 2–3 effects. Usually one continuous flag + one reactive.
- **Legendary**: 3–4 effects. Combinations of continuous flags + per-turn heals + reactive effects.

Value guidance (all within valueRange):
- `damage_lp`: common 20–40, rare 40–60, epic 60–100, legendary 80–120
- `heal_lp` on_summon: 30–120 (one-shot burst)
- `heal_lp` start_of_turn/end_of_turn: 30–80 (recurring — don't exceed 80, it snowballs)
- `boost_atk`/`boost_def` (turn-limited): 10–25; `continuous`: 5–20 (permanent, be conservative)
- `weaken_atk`/`weaken_def`: 10–25, usually with `duration: 2`

The `abilities[]` field is a legacy system and is NOT what drives the duel. The battle engine only uses `ygoEffects`. Still fill `abilities` for UI display, but put your real design energy into `ygoEffects`.

### 4. Synergy Design
- Define 2 tiers of synergy bonuses:
  - Tier 1 (2 cards): +10% to one stat
  - Tier 2 (4 cards): +15% to another stat
- All cards in the set share the same `synergySetId` and reference the synergy bonuses

### 5. Output Format

Generate a complete TypeScript file at `src/data/cards/[set-name].ts` following this structure:

```typescript
import { CardDefinition, SynergyBonus } from '@/types/Card';

const SYNERGY_TIER1: SynergyBonus = {
  setId: '[set-id]',
  setName: '[套裝名稱]',
  requiredCount: 2,
  bonusType: 'atk',
  bonusValue: 10,
  bonusDescription: '[套裝名稱] 2 件套：攻擊力 +10%',
};

const SYNERGY_TIER2: SynergyBonus = {
  setId: '[set-id]',
  setName: '[套裝名稱]',
  requiredCount: 4,
  bonusType: 'def',
  bonusValue: 15,
  bonusDescription: '[套裝名稱] 4 件套：防禦力 +15%',
};

export const [SET_NAME]_CARDS: CardDefinition[] = [
  {
    id: '[set-id]_01',
    name: '[卡牌名稱]',
    nameEn: '[English Name]',
    rarity: 'common',
    element: 'fire',
    poolId: '[set-id]',
    setId: '[set-id]',
    synergySetId: '[set-id]',
    synergyBonus: SYNERGY_TIER1,
    baseHp: 42,
    baseAtk: 28,
    baseDef: 25,
    baseSpd: 35,
    abilities: [
      { id: '[set-id]_ability1', name: '[技能名]', description: '[描述]', damage: 15, cooldown: 0, energyCost: 0 },
      { id: '[set-id]_ability2', name: '[技能名]', description: '[描述]', damage: 0, cooldown: 3, energyCost: 1, effect: { type: 'buff_atk', value: 15, duration: 2, target: 'self' } },
    ],
    level: 3,
    cardCategory: 'monster',
    monsterType: 'effect',
    ygoEffects: [
      // EVERY entry here MUST match a catalog entry. See TOP RULE above.
      {
        id: '[set-id]_01_eff1',
        name: '[效果名]',
        description: '[效果描述]',
        trigger: 'on_summon',     // must be in allowedTriggers for this action
        action: 'boost_atk',      // must be a key in CATALOG
        value: 15,                // must be in valueRange
        target: 'self',           // must be in allowedTargets for this action
        duration: 2,              // optional — turns the buff lasts (ignored for continuous)
      },
    ],
    effectText: '[卡片說明文字]',
    imageUrl: '',
    emoji: '🔥',
    description: '[風味文字]',
  },
  // ... more cards
];
```

### 6. After generating card data:
1. Add the new cards to `src/data/cards/pools.ts`:
   - Import the new card array
   - Add cards to `ALL_CARDS` (this is the array `validateCards` runs on — if you got an effect wrong, the app refuses to boot)
   - Create a new `CardPool` definition
   - Add to `ALL_POOLS`
2. Run `npx tsc --noEmit` and verify the file is clean.
3. Optionally generate Gemini API prompts for card art:
   ```typescript
   export const [SET_NAME]_ART_PROMPTS: Record<string, string> = {
     '[set-id]_01': 'Pixel art, 16-bit retro style, [detailed character description], [element colors], dark background, chibi',
   };
   ```

### 7. Card Naming Conventions
- Use Chinese names that fit the theme
- Include English translations (nameEn)
- Names should be fun and kid-friendly (elementary school audience)
- Descriptions should be short, flavorful, and exciting
- Abilities should have dramatic-sounding Chinese names

### 8. Design Tips for Interconnected Cards
- Some cards should combo together (e.g., one weakens opponent DEF via `weaken_def`, another deals high `damage_lp` on the next attack)
- Include a mix of attackers (`damage_lp` + `boost_atk`), defenders (`protect` + `boost_def`), healers (`heal_lp` + `start_of_turn`), and disruptors (`destroy_monster`, `return_to_hand`, `weaken_atk`)
- Higher rarity cards should feel more impactful but not strictly better in all situations
- Give each element a personality: fire = aggressive (`damage_lp`, `boost_atk`), water = defensive/healing (`heal_lp`, `protect`), earth = tanky (`boost_def`, `protect`), wind = fast/disruptive (`weaken_atk`, `return_to_hand`, `double_attack`), electric = debuff/burst (`weaken_def`, `damage_lp`, `direct_attack`)

### 9. Red flags — if you see any of these, STOP and rewrite

- `trigger: 'activated'` — does not exist. Use `on_summon`, `start_of_turn`, or `on_attack`.
- `trigger: 'on_flip'` — does not exist. Use `on_summon` instead.
- `action: 'special_summon'` / `'negate_attack'` / `'change_position'` / `'destroy_spell_trap'` — none exist. Pick something from the catalog.
- `cooldown: N` on an effect — field removed. Delete it. If you wanted once-per-N-turns, instead use `start_of_turn` for recurring or `on_summon` for one-shot.
- `value: 500` `heal_lp` — out of range (max 150). The LP pool is 500; healing more than 150 per tick is a design error.
- `damage_lp` with `target: 'opponent_monster'` — wrong target, must be `opponent_lp`.
- `piercing` / `direct_attack` / `double_attack` with any trigger other than `continuous` — invalid. These are flag buffs installed once when the monster is summoned.
