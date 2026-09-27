/**
 * The catalogue's diagrams (`docs/strategies.md`) held to the boards under them
 * (`src/sim/diagrams.ts`): every diagram the catalogue draws is one of them token for token, and
 * the reverse; each is a board `Game.fromLayout` accepts, showing the counters it says; and the
 * tutor, pressed on it, answers at the grade of the trick it sits under, which concludes exactly
 * what the diagram's board says it does. A diagram that drifts from the code fails here.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Game } from '../src/engine/game.js';
import type { Cell } from '../src/engine/types.js';
import { type Diagram, DIAGRAMS, diagramGame, pressDiagram } from '../src/sim/diagrams.js';
import { TRICKS, TRICK_IDS, type TrickId } from '../src/sim/tricks.js';
import { TRICK_TEXT } from '../src/sim/tricktext.js';

/** One fenced diagram in the catalogue: the trick it sits under, its cells, and its counters. */
interface Drawn {
  readonly line: number;
  readonly trick: TrickId | undefined;
  readonly heading: string;
  readonly shown: string[];
  readonly counters: Array<readonly [number, number]>;
}

/** Every fenced block in the catalogue, read as a diagram under the nearest bold heading. */
function drawn(): Drawn[] {
  const lines = readFileSync('docs/strategies.md', 'utf8').split('\n');
  const out: Drawn[] = [];
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('## ')) heading = '';
    const bold = /^\*\*(.+?)\.\*\*/.exec(line);
    if (bold) heading = bold[1]!;
    if (line !== '```') continue;
    const start = i + 1;
    const shown: string[] = [];
    const counters: Array<readonly [number, number]> = [];
    for (i++; i < lines.length && lines[i] !== '```'; i++) {
      const tokens = lines[i]!.trim().split(/\s+/);
      const note = tokens.indexOf('LV');
      shown.push(tokens.slice(0, note < 0 ? undefined : note).join(' '));
      if (note < 0) continue;
      for (const m of tokens
        .slice(note)
        .join(' ')
        .matchAll(/LV (\d+) x(\d+)/g)) {
        counters.push([Number(m[1]), Number(m[2])]);
      }
    }
    const trick = TRICK_IDS.find((id) => TRICK_TEXT[id].name === heading);
    out.push({ line: start, trick, heading, shown, counters });
  }
  return out;
}

const same = (d: Diagram, n: Drawn): boolean =>
  d.trick === n.trick && d.shown.join('/') === n.shown.join('/');

/** "2/5" for a candidate mask. */
function candidates(mask: number): string {
  const tiers: number[] = [];
  for (let t = 0; t < 31; t++) if (mask & (1 << t)) tiers.push(t);
  return tiers.join('/');
}

/** What the diagram's trick concluded on each cell in one press of the tutor, in `taught` tokens. */
function taught(d: Diagram): { game: Game; grade: number | null; at: Map<Cell, string> } {
  const { game, grade, lesson } = pressDiagram(d);
  const at = new Map<Cell, string>();
  for (const [c, mask] of lesson?.narrow ?? []) at.set(c, candidates(mask));
  for (const [c, tier] of lesson?.mark ?? []) at.set(c, `${tier}`);
  for (const c of lesson?.open ?? []) at.set(c, 'o');
  return { game, grade, at };
}

describe("the catalogue's diagrams", () => {
  const diagrams = drawn();

  it('are the boards in src/sim/diagrams.ts, each once, both ways', () => {
    expect(diagrams.length).toBeGreaterThanOrEqual(8);
    for (const n of diagrams) {
      const at = `docs/strategies.md:${n.line} under "${n.heading}"`;
      expect(n.trick, `${at} is under no trick's heading`).toBeDefined();
      expect(DIAGRAMS.filter((d) => same(d, n)).length, `${at}: ${n.shown.join(' / ')}`).toBe(1);
    }
    for (const d of DIAGRAMS) {
      const at = `${d.trick}: ${d.shown.join(' / ')}`;
      expect(diagrams.filter((n) => same(d, n)).length, `${at} in the catalogue`).toBe(1);
    }
  });

  it('are boards the game could show, with the counters they show', () => {
    for (const n of diagrams) {
      const d = DIAGRAMS.find((x) => same(x, n))!;
      const game = diagramGame(d);
      expect(game.level, `${d.trick}`).toBe(d.level);
      for (const [tier, left] of n.counters) {
        expect(game.counterFor(tier), `${d.trick}: LV ${tier}`).toBe(left);
      }
    }
  });

  it('are taught by the trick they sit under, at its grade, on the cells they say', () => {
    for (const d of DIAGRAMS) {
      const { game, grade, at } = taught(d);
      const name = `${d.trick}: ${d.shown.join(' / ')}`;
      expect(grade, `${name}: the press's grade`).toBe(TRICKS[d.trick].grade);
      const width = d.shown[0]!.split(' ').length;
      const patch = d.shown.map((_, y) =>
        Array.from({ length: width }, (_, x) => at.get(game.cellAt(x, y)!) ?? '-').join(' '),
      );
      expect(patch, name).toEqual(d.taught.map((row) => row.split(/\s+/).join(' ')));
      const rest = game.grid
        .flat()
        .filter((c) => c.present && !c.open && c.x > width)
        .map((c) => at.get(c) ?? '-');
      expect(new Set(rest), `${name}: the rest of the board`).toEqual(
        new Set([d.taughtRest ?? '-']),
      );
    }
  });
});
