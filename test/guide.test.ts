/**
 * The field guide's shape (`src/ui/guide/entries.ts`) held to the catalogue (`docs/strategies.md`):
 * every section is one of its sections and every heading one of its bold leads there; every
 * trick has one entry, in the section of its grade; every diagram is drawn once, in the entry of
 * its trick; every entry for some ladders belongs to exactly the ladders the catalogue names for
 * it; and the damage table is the engine's. The words are the game's own (decision 0059), so
 * they are held only to being there and being sentences.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { damageIfSurvived } from '../src/engine/combat.js';
import { DIAGRAMS, type Diagram } from '../src/sim/diagrams.js';
import { TRICKS, TRICK_IDS } from '../src/sim/tricks.js';
import {
  type Block,
  DAMAGE_TABLE,
  GUIDE,
  GUIDE_INTRO,
  type GuideEntry,
  laddersFor,
  ownEntries,
} from '../src/ui/guide/entries.js';
import { LADDER_NOTES, namedIn, notesFor } from '../src/ui/guide/ladders.js';
import { ladders } from './helpers.js';

const catalogue = readFileSync('docs/strategies.md', 'utf8');

/** The catalogue as the guide may quote it: no markup, no references to the repository, one line. */
function plain(text: string): string {
  return text
    .replace(/\s*\([^()]*(?:docs\/|src\/|test\/)[^()]*\)/g, '')
    .replace(/\*\*|\*|`/g, '')
    .replace(/\s+/g, ' ');
}

/** The catalogue's numbered sections, by title. */
const sections = new Map(
  [...catalogue.matchAll(/^## \d+\. (.+)$/gm)].map((m, i, all) => [
    m[1]!,
    catalogue.slice(m.index, all[i + 1]?.index),
  ]),
);

const everyEntry = (): Array<{ section: (typeof GUIDE)[number]; entry: GuideEntry }> =>
  GUIDE.flatMap((section) => section.entries.map((entry) => ({ section, entry })));

const diagramsIn = (entry: GuideEntry): Diagram[] =>
  entry.body.flatMap((b: Block) => (typeof b === 'object' && 'diagram' in b ? [b.diagram] : []));

describe('the field guide', () => {
  it('says something in every entry, in whole sentences', () => {
    const said: string[] = [...GUIDE_INTRO];
    for (const section of GUIDE) said.push(...(section.intro ?? []));
    for (const { entry } of everyEntry()) {
      const words = entry.body.flatMap((block) =>
        typeof block === 'string' ? [block] : 'list' in block ? block.list : [],
      );
      expect(words.length, entry.heading ?? 'the list').toBeGreaterThan(0);
      said.push(...words);
    }
    expect(said.length).toBeGreaterThan(40);
    for (const words of said) expect(words, words).toMatch(/[.:]$/);
  });

  it("has the catalogue's sections, and its bold leads for headings", () => {
    for (const section of GUIDE) {
      const source = sections.get(section.title);
      expect(source, `section "${section.title}"`).toBeDefined();
      for (const entry of section.entries) {
        if (!entry.heading) continue;
        const lead = [`**${entry.heading}.**`, `**${entry.heading}**`];
        expect(
          lead.some((l) => source!.includes(l)),
          `"${entry.heading}" in "${section.title}"`,
        ).toBe(true);
      }
    }
  });

  it('teaches every trick once, in the section of its grade', () => {
    for (const id of TRICK_IDS) {
      const found = everyEntry().filter(({ entry }) => entry.trick === id);
      expect(found.length, id).toBe(1);
      expect(found[0]!.section.grade, id).toBe(TRICKS[id].grade);
    }
  });

  it('draws every diagram once, in the entry of its trick', () => {
    for (const d of DIAGRAMS) {
      const found = everyEntry().filter(({ entry }) => diagramsIn(entry).includes(d));
      expect(found.length, `${d.trick}: ${d.shown.join(' / ')}`).toBe(1);
      expect(found[0]!.entry.trick).toBe(d.trick);
    }
  });

  it('puts each entry on the ladders the catalogue names for it, asked of their rules', () => {
    const names = new Set(ladders.map((t) => t.name));
    let named = 0;
    for (const { entry } of everyEntry()) {
      if (!entry.heading) continue;
      // The catalogue names a trick's ladders in brackets after its bold lead.
      const after = catalogue.split(`**${entry.heading}**`)[1];
      const bracket = after ? /^ \(([^)]*)\)/.exec(after) : null;
      const listed = (bracket?.[1] ?? '').split(/,\s*/).filter((n) => names.has(n));
      const mine = laddersFor(entry, ladders).map((t) => t.name);
      if (!listed.length) {
        expect(mine.length, `${entry.heading} is for every ladder`).toBe(ladders.length);
        continue;
      }
      named++;
      expect(new Set(mine), entry.heading).toEqual(new Set(listed));
    }
    expect(named).toBeGreaterThanOrEqual(10);
  });

  it('gives a first-visit card to exactly the ladders a trick of the catalogue is named for', () => {
    // Every ladder the catalogue names in brackets after a trick's lead, in sections 2 to 6.
    const tricks = [...sections.entries()]
      .filter(([title]) => GUIDE.some((s) => s.title === title && s.grade !== undefined))
      .map(([, text]) => text)
      .join('\n');
    const named = new Set(
      [...tricks.matchAll(/\*\*[^*]+\*\* \(([^)]*)\)/g)].flatMap((m) =>
        m[1]!.split(/,\s*/).filter((n) => ladders.some((t) => t.name === n)),
      ),
    );
    const carded = ladders.filter((t) => ownEntries(t).length > 0).map((t) => t.name);
    expect(new Set(carded)).toEqual(named);
    expect(carded.length).toBeGreaterThanOrEqual(7);
  });

  it("shows the damage table the catalogue shows, which is the engine's", () => {
    const rows = [...catalogue.matchAll(/^\| tier (\d+) \|(.*)\|$/gm)];
    expect(rows.map((r) => Number(r[1]))).toEqual([...DAMAGE_TABLE.tiers]);
    const header = /^\| tier at level \|(.*)\|$/m.exec(catalogue)!;
    expect(header[1]!.split('|').map((c) => Number(c.trim()))).toEqual([...DAMAGE_TABLE.levels]);
    for (const r of rows) {
      const tier = Number(r[1]);
      const costs = r[2]!.split('|').map((c) => Number(c.trim()));
      expect(costs, `tier ${tier}`).toEqual(
        DAMAGE_TABLE.levels.map((level) => damageIfSurvived(level, tier)),
      );
    }
  });
});

describe("the field guide's ladder notes", () => {
  const section = sections.get("The ladders' own tricks")!;
  const bullets = section
    .split('\n- **')
    .slice(1)
    .map((b) => ({ heading: /^(.+?)\.\*\* /.exec(b.trim())![1]! }));

  it("are section 7's, under its headings and in its order", () => {
    expect(LADDER_NOTES.map((n) => n.heading)).toEqual(bullets.map((b) => b.heading));
    for (const n of LADDER_NOTES) expect(n.body, n.heading).toMatch(/\.$/);
  });

  it('name real ladders, and ask the data for the ones they only describe', () => {
    const names = new Set(ladders.map((t) => t.name));
    for (const note of LADDER_NOTES) {
      const described = namedIn(note.heading).filter((n) => !names.has(n));
      expect(!!note.also, `${note.heading}: ${described.join(', ')}`).toBe(described.length > 0);
    }
    // "The shapes with magic" are the cut-out shapes the README says carry ARCANE's loadout.
    const readme = plain(readFileSync('README.md', 'utf8'));
    const cut = /The cut-out shapes \(([^)]*)\) carry ARCANE's loadout/.exec(readme)![1]!;
    const magic = LADDER_NOTES.find((n) => n.also)!;
    expect(new Set(ladders.filter((t) => magic.also!(t)).map((t) => t.name))).toEqual(
      new Set(cut.split(/,\s*/)),
    );
  });

  it('reach every ladder but the two that differ from NORMAL only in schedule', () => {
    // HUGE and HUGE x EXTREME have no note of their own; the guide shows their blurb instead.
    const without = ladders.filter((t) => notesFor(t).length === 0).map((t) => t.name);
    expect(without).toEqual(['HUGE', 'HUGE x EXTREME']);
  });
});
