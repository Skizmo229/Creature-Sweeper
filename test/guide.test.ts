/**
 * The field guide's words (`src/ui/guide/entries.ts`) held to the catalogue (`docs/strategies.md`),
 * which they copy: every paragraph and list item is the catalogue's word for word, less its
 * markup and its references to the repository; every section is one of its sections and every
 * heading one of its bold leads there; every trick has one entry, in the section of its grade;
 * every diagram is drawn once, in the entry of its trick; every entry for some ladders belongs to
 * exactly the ladders the catalogue names for it; and the damage table is the engine's.
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
} from '../src/ui/guide/entries.js';
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
  it('quotes the catalogue word for word, and nothing else', () => {
    const text = plain(catalogue);
    const quoted: string[] = [...GUIDE_INTRO];
    for (const section of GUIDE) quoted.push(...(section.intro ?? []));
    for (const { entry } of everyEntry()) {
      for (const block of entry.body) {
        if (typeof block === 'string') quoted.push(block);
        else if ('list' in block) quoted.push(...block.list);
      }
    }
    expect(quoted.length).toBeGreaterThan(40);
    for (const words of quoted) expect(text, words).toContain(words);
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
