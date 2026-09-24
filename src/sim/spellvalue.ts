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
 * The deduction here is deliberately the game's own — the bound Sweep proves,
 * plus exact tiers from Reveal's marks — with one addition, which is that it
 * also reasons from a Census count. The engine's `safeCells` does not, and
 * that asymmetry is itself one of the things being measured: a spell whose
 * answer the game cannot act on is worth less than the same answer in a form
 * it can.
 *
 *   npx tsx src/sim/spellvalue.ts [seeds]          every magic ladder
 *   npx tsx src/sim/spellvalue.ts [seeds] arcane   one ladder, board by board
 *
 * The per-board view answers a different question from the per-ladder one: not
 * what a spell is worth, but whether there is anything for it to be worth. A
 * spell can only pay at a moment where deduction has run out, so a ladder that
 * rarely corners the player has nothing for one to do, however good it is.
 */

import { loadLadders } from '../data.js';
import { boardConfig } from '../engine/config.js';
import { Game } from '../engine/game.js';
import { SPELLS, type SpellId } from '../engine/spells.js';
import { type Policy, type Run, play } from './honest.js';

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
  const seedAt = (s: number) => s * 2654435761 + 11;
  const pct = (rs: Run[]) =>
    ((100 * rs.filter((r) => r.cleared).length) / rs.length).toFixed(0).padStart(4) + '%';
  const avg = (rs: Run[], pick: (r: Run) => number) =>
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
          .padStart(12)} ${pct(none)} |` +
        `${pct(ex).padStart(16)} ${avg(ex, (r) => r.casts)
          .toFixed(1)
          .padStart(5)} |` +
        `${avg(wo, (r) => r.stuckPoints)
          .toFixed(1)
          .padStart(15)} ${avg(wo, (r) => r.hpLost)
          .toFixed(2)
          .padStart(8)}` +
        ` ${pct(wo)} ${avg(wo, (r) => r.casts)
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
  const offered = (['reveal', 'census', 'exercise'] as const).filter((id) =>
    (type.spells ?? []).includes(id),
  );

  console.log(
    'board   density   cells   stuck/board   guesses   hp lost   cleared   ' +
      offered.map((id) => `${id} saves`.padStart(16)).join(''),
  );

  for (const board of type.boards) {
    const cfg = boardConfig(ladders, type.id, board.n);
    const seedAt = (s: number) => s * 2654435761 + 11;
    const base: Run[] = [];
    for (let s = 0; s < seeds; s++) base.push(play(Game.create(cfg, seedAt(s)), 'none', null));

    // Same seeds for every policy, so the difference between two columns is
    // the spell and never the board.
    const withSpell = new Map<Policy, Run[]>();
    for (const id of offered) {
      const runs: Run[] = [];
      for (let s = 0; s < seeds; s++) runs.push(play(Game.create(cfg, seedAt(s)), id, id));
      withSpell.set(id, runs);
    }
    const mean = (rs: Run[], pick: (r: Run) => number) =>
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
  const magic = ladders.filter((t) => (t.spells ?? []).length > 0 && !t.search);

  console.log(
    `An honest player, ${seeds} seeds x every board of every magic ladder.\n` +
      "Deduction is Sweep's own bound plus exact tiers from Reveal, plus the " +
      'Census count.\n',
  );
  console.log(
    'ladder        policy       cleared   hp lost   guesses  stuck  casts  useful  ' +
      'mana spent  of pool',
  );

  const totals = new Map<Policy, Run[]>();
  /**
   * The spell-less runs each policy is judged against — only over the ladders
   * that actually offer that spell.
   *
   * One baseline for everything was fine while every magic ladder carried
   * every spell being measured. Exercise is not on every ladder, so a single
   * baseline would compare its runs on the ladders that have it against
   * spell-less runs on ladders that do not, and the difference would be a fact
   * about which boards those are rather than about the spell.
   */
  const baselines = new Map<Policy, Run[]>();

  for (const type of magic) {
    let typeBase: Run[] = [];
    for (const policy of ['none', 'reveal', 'census', 'census-best', 'exercise'] as const) {
      const spellId: SpellId | null =
        policy === 'none' ? null : policy === 'census-best' ? 'census' : policy;
      if (spellId && !(type.spells ?? []).includes(spellId)) continue;
      const runs: Run[] = [];

      for (const board of type.boards) {
        const cfg = boardConfig(ladders, type.id, board.n);
        for (let s = 0; s < seeds; s++) {
          runs.push(play(Game.create(cfg, s * 2654435761 + 11), policy, spellId));
        }
      }
      (totals.get(policy) ?? totals.set(policy, []).get(policy)!).push(...runs);
      if (policy === 'none') typeBase = runs;
      else (baselines.get(policy) ?? baselines.set(policy, []).get(policy)!).push(...typeBase);

      const mean = (pick: (r: Run) => number) =>
        runs.reduce((s, r) => s + pick(r), 0) / runs.length;
      console.log(
        `${type.name.padEnd(13)} ${policy.padEnd(12)} ` +
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
    console.log('');
  }

  const mean = (rs: Run[], pick: (r: Run) => number) =>
    rs.reduce((s, r) => s + pick(r), 0) / rs.length;
  const base = totals.get('none')!;
  const baseHp = mean(base, (r) => r.hpLost);
  const baseClear = mean(base, (r) => (r.cleared ? 1 : 0));

  console.log('value against playing spell-less, on the ladders that offer each spell:\n');
  console.log('spell        cost   hp saved/cast   hp saved/mana   clear rate  +pts');
  const perMana: Array<[SpellId, number, number]> = [];

  for (const policy of ['reveal', 'census', 'census-best', 'exercise'] as const) {
    const rs = totals.get(policy);
    const against = baselines.get(policy);
    if (!rs || !against) continue;
    const savedTotal = mean(against, (r) => r.hpLost) - mean(rs, (r) => r.hpLost);
    const casts = mean(rs, (r) => r.casts);
    const spent = mean(rs, (r) => r.manaSpent);
    const clear = mean(rs, (r) => (r.cleared ? 1 : 0));
    const baseClearHere = mean(against, (r) => (r.cleared ? 1 : 0));
    const id: SpellId = policy === 'census-best' ? 'census' : policy;
    perMana.push([id, SPELLS[id].cost, savedTotal / Math.max(0.001, spent)]);
    console.log(
      `${policy.padEnd(12)} ${String(SPELLS[id].cost).padStart(4)}   ` +
        `${(savedTotal / Math.max(0.001, casts)).toFixed(3).padStart(13)}   ` +
        `${(savedTotal / Math.max(0.001, spent)).toFixed(4).padStart(13)}   ` +
        `${(100 * clear).toFixed(1).padStart(9)}%  ` +
        `${(100 * (clear - baseClearHere)).toFixed(1).padStart(4)}`,
    );
  }

  // Priced correctly when a point of mana buys the same certainty either way.
  const [a, b] = perMana;
  if (a && b && b[2] > 0) {
    const fair = a[1] * (b[2] / a[2]);
    console.log(
      `\nequal value per mana would price ${b[0]} at ${fair.toFixed(1)} ` +
        `against ${a[0]} at ${a[1]} (it costs ${b[1]})`,
    );
  }
  console.log(
    `\nspell-less baseline: ${baseHp.toFixed(2)} hp lost, ` +
      `${(100 * baseClear).toFixed(1)}% cleared`,
  );
}

main();
