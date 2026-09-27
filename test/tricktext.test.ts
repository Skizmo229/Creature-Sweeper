/**
 * The trick text (`src/sim/tricktext.ts`) held to the catalogue (`docs/strategies.md`), both
 * ways: every trick the code knows is in the catalogue's table of technique ids, every id in
 * that table is a trick, every name is a heading in the catalogue, and each heading is in the
 * section its grade says.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRICK_TEXT } from '../src/sim/tricktext.js';
import { TRICKS, TRICK_IDS } from '../src/sim/tricks.js';

const catalogue = readFileSync('docs/strategies.md', 'utf8');

/** The lines of one numbered section, from its heading to the next. */
function section(n: number): string {
  const from = catalogue.indexOf(`\n## ${n}. `);
  expect(from, `section ${n}`).toBeGreaterThanOrEqual(0);
  const to = catalogue.indexOf('\n## ', from + 1);
  return catalogue.slice(from, to < 0 ? undefined : to);
}

describe('the trick text', () => {
  it('names every trick, and every trick it names is one', () => {
    const table = section(10);
    // The second column names the technique, sometimes inside a sentence ("read by `x`: ...").
    const ids = [...table.matchAll(/^\| [^|]+ \| ([^|]*`[a-z-]+`[^|]*) \|/gm)]
      .map((m) => /`([a-z-]+)`/.exec(m[1]!)![1]!)
      .filter((id, i, all) => all.indexOf(id) === i);
    for (const id of TRICK_IDS) expect(ids, `${id} in the table`).toContain(id);
    for (const id of ids) expect(TRICK_IDS, `${id} a trick`).toContain(id);
  });

  it("uses the catalogue's headings, each in the section of its grade", () => {
    for (const id of TRICK_IDS) {
      const text = TRICK_TEXT[id];
      const heading = `**${text.name}`;
      expect(catalogue, `${id}: ${heading}`).toContain(heading);
      expect(section(text.section), `${id} in section ${text.section}`).toContain(heading);
      // Sections 2 to 6 are grades 0 to 4.
      expect(text.section - 2, `${id}'s section is its grade`).toBe(TRICKS[id].grade);
      expect(text.rule.endsWith('.'), `${id}'s rule is a sentence`).toBe(true);
    }
  });
});
