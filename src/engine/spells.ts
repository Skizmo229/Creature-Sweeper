/**
 * Spells, and the economy they spend.
 *
 * The thing to hold onto: mana and HP are two currencies for the same
 * commodity — certainty. HP buys it after the fact by absorbing a wrong guess;
 * mana buys it in advance by removing the guess. That is why the set stays
 * small and why every cost is quoted against the mana a whole board carries.
 *
 * Mana is earned at +tier per kill — linear, where EXP is exponential at
 * 2^(E-1). That difference does the balancing by itself: early on you are
 * mana-rich and EXP-poor, late on the reverse, so spells are most available
 * exactly when you are weakest and thin out as your level takes over.
 *
 * THE PRICES ARE MEANT TO BITE. Buying your way out of every moment a
 * deductive player is cornered costs a large share of a late board's pool, so
 * you cannot answer everything, and which moments to buy is the decision. The
 * early boards stay cheap on purpose, because that is where the spells are
 * introduced. The measurements are in decision 0013 and `docs/tuning.md`;
 * `test/spells.test.ts` asserts the share.
 *
 * One consequence worth keeping in view: this is a single global table, and it
 * should stay one — with one deliberate exception, WORKOUT, whose Exercise runs
 * on a price of its own (`WorkoutRule` in types.ts, read by `Game.spellCost`)
 * because the rising price IS that mode rather than a tuning of it. The
 * variation between ladders is already carried twice over, by income and by
 * demand (both measured in `docs/tuning.md`). A per-ladder price would be a
 * third axis saying what those two already say, and it would stop "Reveal
 * costs 75" being a fact the player learns once.
 *
 * NOTE: not one of these removes a creature. That is deliberate. The upper
 * level thresholds are C_k, the TOTAL exp available from tiers at or below k,
 * so anything that deletes a creature without paying its EXP would make that
 * gate permanently unreachable. Keeping the set to information, protection and
 * movement means the zero-damage guarantee survives magic untouched.
 */

import { manaForTier } from './combat.js';

/** A spell, by the id the ladder data and the `SPELLS` table use. */
export type SpellId = 'reveal' | 'census' | 'exercise' | 'beacon' | 'augur';

/** One spell's entry in the table: its name, price, whether it takes a target, its tooltip. */
export interface Spell {
  readonly id: SpellId;
  readonly name: string;
  readonly cost: number;
  /** Whether casting needs a target cell. */
  readonly targeted: boolean;
  /** One line for the button's tooltip. */
  readonly blurb: string;
}

/**
 * Levels Exercise lends you for one fight.
 *
 * One, and it has to be one. Damage is `E * (ceil(E/L) - 1)`, a staircase
 * rather than a slope, so a single level is worth nothing at all until it
 * crosses a step and then worth the whole step at once — at level 2 against a
 * tier 5 it turns 10 damage into 5, and at level 4 against a tier 4 it turns 4
 * into none. Two levels would clear two steps at a time and start trivialising
 * the fights the ladder is built around.
 */
export const EXERCISE_LEVELS = 1;

/**
 * Empty cells you must uncover yourself to earn one mana.
 *
 * Kills stay the primary income because that total is exact and known at
 * design time, and because it scales WITH difficulty: a denser board carries
 * more creatures and so more mana. Paying per cell instead would scale against
 * difficulty: cells outnumber kill-mana several times over on the sparsest
 * board and fall short of it on the densest, so sparse easy boards would end
 * up the mana-rich ones.
 *
 * So exploration is a trickle rather than a wage, a minority of income on the
 * magic ladders (both measured in the design reference), and it does three
 * things kills cannot: it pays before the first kill lands, it keeps paying
 * while you are stuck on a frontier, and it is the ONLY income in search
 * modes, where nothing can be killed at all.
 */
export const MANA_PER_EMPTY_CELLS = 4;

/** The spell table, one global price list (the header says why). */
export const SPELLS: Record<SpellId, Spell> = {
  reveal: {
    id: 'reveal',
    name: 'Reveal',
    cost: 75,
    targeted: true,
    blurb:
      'Learn one cell exactly, and clear the empty ground touching it. A creature is marked with its true tier; empty ground opens.',
  },
  census: {
    id: 'census',
    name: 'Census',
    cost: 30,
    targeted: true,
    blurb:
      'How many creatures surround this cell. Pairs with the number — sum plus count often pins the exact layout.',
  },
  exercise: {
    id: 'exercise',
    name: 'Exercise',
    cost: 150,
    targeted: false,
    blurb: `Fight your next battle ${EXERCISE_LEVELS} level higher.`,
  },
  beacon: {
    id: 'beacon',
    name: 'Beacon',
    // Where a mana of it saves what a mana of Reveal does on ORACLE (decision 0037).
    cost: 85,
    targeted: false,
    blurb: 'Open the largest untouched blank region. The unstuck button.',
  },
  augur: {
    id: 'augur',
    name: 'Augur',
    // Census and the old strongest-only Augur together, since it answers what both did and was
    // measured as useful as casting both (decision 0087).
    cost: 50,
    targeted: true,
    blurb:
      'The tier of every creature hidden around this cell, strongest first, but not where. At or below your level the whole ring is free.',
  },
};

/**
 * The keyboard shortcut for a spell: the letter its name starts with.
 *
 * Derived rather than stored, so a spell cannot end up with a key that
 * disagrees with the label the player is reading. The UI shows the letter in
 * brackets — [B]eacon — which is the whole explanation of the control.
 *
 * Deriving it does mean two spells could want the same letter (decision 0006).
 * A test asserts the built set stays distinct and clear of the keys the board
 * already uses, so a clash surfaces when a spell is added rather than when a
 * player presses a key and the wrong thing happens.
 */
export function spellKey(id: SpellId): string {
  return SPELLS[id].name[0]!.toLowerCase();
}

/** The name with its shortcut marked, e.g. "[B]eacon". */
export function spellLabel(id: SpellId): string {
  const { name } = SPELLS[id];
  return `[${name[0]}]${name.slice(1)}`;
}

/**
 * The order spells are offered in: cheapest first.
 *
 * Derived from the prices rather than written down, for the same reason
 * `spellKey` is derived from the name — a stored order is a second place the
 * truth lives, and the two drift (decision 0006). A row in declaration order
 * reads as an arbitrary list rather than a price list.
 *
 * Ties break on id, so the order is total and stable rather than dependent on
 * however the record happened to be declared.
 */
export const SPELL_ORDER: readonly SpellId[] = (Object.keys(SPELLS) as SpellId[]).sort(
  (a, b) => SPELLS[a].cost - SPELLS[b].cost || a.localeCompare(b),
);

/** A loadout in the order it should be offered. Never trusts its input's. */
export function orderSpells(ids: readonly SpellId[]): SpellId[] {
  return SPELL_ORDER.filter((id) => ids.includes(id));
}

/** Is this ladder-data name a spell? */
export function isSpellId(value: string): value is SpellId {
  return Object.hasOwn(SPELLS, value);
}

/** Total mana a board can yield, for sanity-checking a loadout's prices. */
export function totalMana(quantity: readonly number[]): number {
  return quantity.reduce((sum, count, i) => sum + count * manaForTier(i + 1), 0);
}
