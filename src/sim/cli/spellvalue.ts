/**
 * What a spell is actually worth, measured.
 *
 * The autoplayer in `autoplay.ts` is omniscient — it clears boards in tier
 * order and never guesses — so it can prove the zero-damage guarantee but it
 * can say nothing at all about spells, because it is never in the situation a
 * spell is for. This one plays honestly instead: it reads only what a player
 * can see, deduces what it can, and when deduction runs out it either spends
 * mana or takes a guess and eats the damage.
 *
 * Run the same boards under different spending policies and the difference in
 * outcome IS the spell's value. Prices then follow from value: two spells are
 * correctly priced relative to each other when a point of mana buys the same
 * amount of certainty through either one.
 *
 * The deduction is the honest player's (`deduce.ts`): one number at a time and
 * pairs of numbers subtracted, the placement rules' readings, exact tiers from
 * Reveal's marks, and the Census count and the Augur's count and ceiling, which
 * Sweep reads as well (`provenByCensus` and `provenByAugur` in
 * `engine/sweep.ts`). A spell whose answer the game cannot act on is worth less
 * than the same answer in a form it can.
 *
 *   npx tsx src/sim/cli/spellvalue.ts [seeds]          every magic ladder
 *   npx tsx src/sim/cli/spellvalue.ts [seeds] arcane   one ladder, board by board
 *   POLICY=gym npx tsx src/sim/cli/spellvalue.ts [seeds] workout
 *                                   WORKOUT with Exercise spent on free kills too
 *
 * The per-board view answers a different question from the per-ladder one: not
 * what a spell is worth, but whether there is anything for it to be worth. A
 * spell can only pay at a moment where deduction has run out, so a ladder that
 * rarely corners the player has nothing for one to do, however good it is.
 */

import { loadLadders } from '../../data.js';
import { boardConfig } from '../../engine/config.js';
import { Game } from '../../engine/game.js';
import { SPELLS, type SpellId } from '../../engine/spells.js';
import { type Policy, type HonestRun, SPELL_POLICIES, play } from '../honest.js';
import { seedAt } from '../tables.js';

/** Every measured policy with the spell it casts, in the order the tables print them. */
const MEASURED: ReadonlyArray<{ policy: Policy; spell: SpellId }> = (
  Object.keys(SPELL_POLICIES) as SpellId[]
).flatMap((spell) => SPELL_POLICIES[spell].map((policy) => ({ policy, spell })));

/**
 * WORKOUT, board by board, under the two ways a player can hold Exercise.
 *
 * `exercise` is the spell as every other ladder measures it: cast when a guess
 * is coming. `workout` adds the mode's own move — a creature already named at
 * one past your level is a free kill with a charge, and pays double for it —
 * which is what a player who has read the button will do. The difference
 * between the two columns is what the double EXP is worth.
 */
function workoutTable(seeds: number, typeId: string): void {
  const ladders = loadLadders();
  const type = ladders.find((t) => t.id === typeId)!;
  console.log(`${type.name}, board by board, ${seeds} seeds each.
`);
  console.log(
    'board  density  lock |  none: stuck  clear |  exercise: clear casts |' +
      '  workout: stuck  hp lost  clear  casts  spent/pool',
  );
  const clearPct = (rs: HonestRun[]) =>
    ((100 * rs.filter((r) => r.cleared).length) / rs.length).toFixed(0).padStart(4) + '%';
  const avg = (rs: HonestRun[], pick: (r: HonestRun) => number) =>
    rs.reduce((a, r) => a + pick(r), 0) / rs.length;
  for (const board of type.boards) {
    const cfg = boardConfig(ladders, type.id, board.n);
    const runs = (policy: Policy) =>
      Array.from({ length: seeds }, (_, s) =>
        play(Game.create(cfg, seedAt(s)), policy, policy === 'none' ? null : 'exercise'),
      );
    const none = runs('none');
    const ex = runs('exercise');
    const wo = runs(process.env.POLICY === 'gym' ? 'gym' : 'workout');
    console.log(
      `${String(board.n).padStart(4)}  ${board.density.toFixed(1).padStart(6)}%  ${board.lock}    |` +
        `${avg(none, (r) => r.stuckPoints)
          .toFixed(1)
          .padStart(12)} ${clearPct(none)} |` +
        `${clearPct(ex).padStart(16)} ${avg(ex, (r) => r.casts)
          .toFixed(1)
          .padStart(5)} |` +
        `${avg(wo, (r) => r.stuckPoints)
          .toFixed(1)
          .padStart(15)} ${avg(wo, (r) => r.hpLost)
          .toFixed(2)
          .padStart(8)}` +
        ` ${clearPct(wo)} ${avg(wo, (r) => r.casts)
          .toFixed(1)
          .padStart(6)}` +
        `${((100 * avg(wo, (r) => r.manaSpent)) / avg(wo, (r) => r.manaPool)).toFixed(0).padStart(10)}%`,
    );
  }
}

function byBoard(seeds: number, typeId: string): void {
  const ladders = loadLadders();
  const type = ladders.find((t) => t.id === typeId);
  if (!type) throw new Error(`no ladder "${typeId}"`);
  if (type.workout) {
    workoutTable(seeds, typeId);
    return;
  }

  console.log(`${type.name}, board by board, ${seeds} seeds each.
`);
  // A column per spell the ladder actually offers, so the table answers "what
  // is this ladder's loadout worth on this ladder" rather than reporting on a
  // spell nobody there can cast.
  const offered = (Object.keys(SPELL_POLICIES) as SpellId[]).filter(
    (id) => SPELL_POLICIES[id].length > 0 && (type.spells ?? []).includes(id),
  );

  console.log(
    'board   density   cells   stuck/board   guesses   hp lost   cleared   ' +
      offered.map((id) => `${id} saves`.padStart(16)).join(''),
  );

  for (const board of type.boards) {
    const cfg = boardConfig(ladders, type.id, board.n);
    const base: HonestRun[] = [];
    for (let s = 0; s < seeds; s++) base.push(play(Game.create(cfg, seedAt(s)), 'none', null));

    // Same seeds for every policy, so the difference between two columns is
    // the spell and never the board.
    const withSpell = new Map<SpellId, HonestRun[]>();
    for (const id of offered) {
      const policy = SPELL_POLICIES[id][0]!;
      const runs: HonestRun[] = [];
      for (let s = 0; s < seeds; s++) runs.push(play(Game.create(cfg, seedAt(s)), policy, id));
      withSpell.set(id, runs);
    }
    const mean = (rs: HonestRun[], pick: (r: HonestRun) => number) =>
      rs.reduce((a, r) => a + pick(r), 0) / rs.length;

    console.log(
      `${String(board.n).padStart(4)}  ${board.density.toFixed(1).padStart(7)}%  ` +
        `${String(board.cells).padStart(6)}  ${mean(base, (r) => r.stuckPoints)
          .toFixed(1)
          .padStart(11)}  ` +
        `${mean(base, (r) => r.guesses)
          .toFixed(1)
          .padStart(8)}  ` +
        `${mean(base, (r) => r.hpLost)
          .toFixed(2)
          .padStart(7)}  ` +
        `${(100 * mean(base, (r) => (r.cleared ? 1 : 0))).toFixed(0).padStart(7)}%  ` +
        offered
          .map((id) =>
            (mean(base, (r) => r.hpLost) - mean(withSpell.get(id)!, (r) => r.hpLost))
              .toFixed(2)
              .padStart(16),
          )
          .join(''),
    );
  }
}

function main(): void {
  const seeds = Number(process.argv[2] ?? 40);
  if (process.argv[3]) {
    byBoard(seeds, process.argv[3]);
    return;
  }
  const ladders = loadLadders();
  // A search ladder with spells (SEER) is measured like the rest: the honest player plays at
  // level 0 there, where only "nothing left to hide" opens a cell, and one HP is the whole stake.
  const magic = ladders.filter((t) => (t.spells ?? []).length > 0);

  console.log(
    `An honest player, ${seeds} seeds x every board of every magic ladder.\n` +
      "Deduction is Sweep's own bound plus exact tiers from Reveal, plus the " +
      'Census count and the Augur ceiling.\n',
  );
  console.log(
    'ladder        policy       cleared   hp lost   guesses  stuck  casts  useful  ' +
      'mana spent  of pool',
  );

  const totals = new Map<Policy, HonestRun[]>();
  /**
   * The spell-less runs each policy is judged against — only over the ladders
   * that actually offer that spell. Not every ladder offers every spell, so one
   * baseline for all would set a spell's runs beside spell-less runs on boards
   * it never sees, and the difference would be about the boards, not the spell.
   */
  const baselines = new Map<Policy, HonestRun[]>();

  for (const type of magic) {
    let typeBase: HonestRun[] = [];
    for (const { policy, spell: spellId } of [
      { policy: 'none' as Policy, spell: null },
      ...MEASURED,
    ]) {
      if (spellId && !(type.spells ?? []).includes(spellId)) continue;
      const runs: HonestRun[] = [];

      for (const board of type.boards) {
        const cfg = boardConfig(ladders, type.id, board.n);
        for (let s = 0; s < seeds; s++)
          runs.push(play(Game.create(cfg, seedAt(s)), policy, spellId));
      }
      (totals.get(policy) ?? totals.set(policy, []).get(policy)!).push(...runs);
      if (policy === 'none') typeBase = runs;
      else (baselines.get(policy) ?? baselines.set(policy, []).get(policy)!).push(...typeBase);

      printPolicyRow(type.name, policy, runs);
    }
    console.log('');
  }

  printValueTable(totals, baselines);
}

/** One ladder under one policy: the row of the per-ladder table. */
function printPolicyRow(typeName: string, policy: Policy, runs: HonestRun[]): void {
  const mean = (pick: (r: HonestRun) => number) =>
    runs.reduce((s, r) => s + pick(r), 0) / runs.length;
  console.log(
    `${typeName.padEnd(13)} ${policy.padEnd(12)} ` +
      `${(100 * mean((r) => (r.cleared ? 1 : 0))).toFixed(1).padStart(6)}%  ` +
      `${mean((r) => r.hpLost)
        .toFixed(2)
        .padStart(7)}   ` +
      `${mean((r) => r.guesses)
        .toFixed(1)
        .padStart(7)}  ` +
      `${mean((r) => r.stuckPoints)
        .toFixed(1)
        .padStart(5)}  ` +
      `${mean((r) => r.casts)
        .toFixed(1)
        .padStart(5)}  ` +
      `${(
        (100 * mean((r) => r.castsThatHelped)) /
        Math.max(
          0.001,
          mean((r) => r.casts),
        )
      )
        .toFixed(0)
        .padStart(5)}%  ` +
      `${mean((r) => r.manaSpent)
        .toFixed(0)
        .padStart(10)}  ` +
      `${((100 * mean((r) => r.manaSpent)) / mean((r) => r.manaPool)).toFixed(0).padStart(6)}%`,
  );
}

/** A measured policy's price and the HP it saved per mana spent. */
interface PerMana {
  policy: Policy;
  cost: number;
  value: number;
}

/**
 * The price at which each measured spell saves as much HP per mana as Reveal as played: its own
 * cost scaled by its value per mana over Reveal's, since what a cast saves is fixed and only the
 * price moves (issue #8). A spell that saved nothing has no price that makes it pay.
 */
function printFairPrices(perMana: readonly PerMana[]): void {
  const ref = perMana.find((p) => p.policy === 'reveal');
  if (!ref || ref.value <= 0) return;
  console.log(`\nequal value per mana with reveal at ${ref.cost} would price:`);
  for (const p of perMana) {
    if (p === ref) continue;
    const fair = p.value > 0 ? (p.cost * p.value) / ref.value : null;
    console.log(
      `  ${p.policy.padEnd(12)} ${fair === null ? '  none' : fair.toFixed(1).padStart(6)}` +
        `   (it costs ${p.cost})`,
    );
  }
}

/** Each spell against playing spell-less, on the ladders that offer it, and the fair price. */
function printValueTable(
  totals: Map<Policy, HonestRun[]>,
  baselines: Map<Policy, HonestRun[]>,
): void {
  const mean = (rs: HonestRun[], pick: (r: HonestRun) => number) =>
    rs.reduce((s, r) => s + pick(r), 0) / rs.length;
  const base = totals.get('none')!;
  const baseHp = mean(base, (r) => r.hpLost);
  const baseClear = mean(base, (r) => (r.cleared ? 1 : 0));

  console.log('value against playing spell-less, on the ladders that offer each spell:\n');
  console.log('spell        cost   hp saved/cast   hp saved/mana   clear rate  +pts');
  const perMana: PerMana[] = [];

  for (const { policy, spell: id } of MEASURED) {
    const rs = totals.get(policy);
    const against = baselines.get(policy);
    if (!rs || !against) continue;
    const savedTotal = mean(against, (r) => r.hpLost) - mean(rs, (r) => r.hpLost);
    const casts = mean(rs, (r) => r.casts);
    const spent = mean(rs, (r) => r.manaSpent);
    const clear = mean(rs, (r) => (r.cleared ? 1 : 0));
    const baseClearHere = mean(against, (r) => (r.cleared ? 1 : 0));
    perMana.push({ policy, cost: SPELLS[id].cost, value: savedTotal / Math.max(0.001, spent) });
    console.log(
      `${policy.padEnd(12)} ${String(SPELLS[id].cost).padStart(4)}   ` +
        `${(savedTotal / Math.max(0.001, casts)).toFixed(3).padStart(13)}   ` +
        `${(savedTotal / Math.max(0.001, spent)).toFixed(4).padStart(13)}   ` +
        `${(100 * clear).toFixed(1).padStart(9)}%  ` +
        `${(100 * (clear - baseClearHere)).toFixed(1).padStart(4)}`,
    );
  }

  printFairPrices(perMana);
  console.log(
    `\nspell-less baseline: ${baseHp.toFixed(2)} hp lost, ` +
      `${(100 * baseClear).toFixed(1)}% cleared`,
  );
}

main();
