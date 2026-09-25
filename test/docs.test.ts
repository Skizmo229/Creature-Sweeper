/**
 * The maps of the tree in `README.md` and `docs/architecture.md`, held to the tree. A map that
 * names a file that is gone, or leaves out one that exists, sends a reader to the wrong place.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The first fenced block after a heading. */
function block(file: string, heading: string): string[] {
  const text = readFileSync(file, 'utf8');
  const from = text.indexOf(heading);
  expect(from, `${file} has no "${heading}"`).toBeGreaterThanOrEqual(0);
  const open = text.indexOf('```\n', from) + 4;
  return text.slice(open, text.indexOf('\n```', open)).split('\n');
}

/** The README's tree: box-drawing depth, one name per line. */
function readmePaths(): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const line of block('README.md', '## Layout').slice(1)) {
    const m = /^((?:│ {2}| {3})*)[├└]─ (\S+)/.exec(line);
    if (!m) continue;
    const depth = m[1]!.length / 3;
    stack.length = depth;
    stack.push(m[2]!.replace(/\/$/, ''));
    out.push(stack.join('/'));
  }
  return out;
}

/**
 * The architecture map: a name column at two spaces a level, then the description. Lines indented
 * past the name column continue a description. A line may name several files, comma-separated.
 */
function architecturePaths(): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const line of block('docs/architecture.md', '## The map')) {
    const m = /^( *)(\S.*?)(?: {2,}|$)/.exec(line);
    if (!m || m[1]!.length >= 8) continue;
    const depth = m[1]!.length / 2;
    const names = m[2]!.split(/,\s*/).map((n) => n.replace(/\/$/, ''));
    stack.length = depth;
    for (const name of names) out.push([...stack, name].join('/'));
    stack.push(names[0]!);
  }
  return out;
}

/** Every .ts file directly in a directory. */
const tsIn = (dir: string): string[] =>
  readdirSync(dir).filter((f) => f.endsWith('.ts') && statSync(join(dir, f)).isFile());

describe('the README layout', () => {
  const named = readmePaths().map((p) => p.replace(/^creature_sweeper\/?/, ''));

  it('names only paths that exist', () => {
    expect(named.filter((p) => p && !existsSync(p))).toEqual([]);
  });

  it('names every top-level folder, everything in src/ and every file in design/', () => {
    const tracked = (dir: string, keep: (f: string) => boolean): string[] =>
      readdirSync(dir)
        .filter((f) => !f.startsWith('.') && keep(f))
        .map((f) => (dir === '.' ? f : `${dir}/${f}`));
    // Generated and never tracked: the dependencies, the build and the itch.io zips.
    const untracked = ['node_modules', 'dist', 'release'];
    const folders = tracked('.', (f) => statSync(f).isDirectory() && !untracked.includes(f));
    const src = tracked('src', (f) => !f.endsWith('.d.ts'));
    // Files only: design/'s folders are generated or untracked (data, the third-party reference).
    const design = tracked('design', (f) => statSync(join('design', f)).isFile());
    const expected = [...folders, ...src, ...design];
    expect(expected.filter((p) => !named.includes(p))).toEqual([]);
  });
});

describe('the architecture map', () => {
  const mapped = new Set(architecturePaths());

  it('names only paths that exist', () => {
    expect([...mapped].filter((p) => !existsSync(p))).toEqual([]);
  });

  it('names every source file in the folders it maps file by file', () => {
    const folders = ['src/engine', 'src/engine/placement', 'src/engine/shape', 'src/ui', 'src/sim'];
    const unmapped = folders.flatMap((dir) =>
      tsIn(dir)
        .map((f) => `${dir}/${f}`)
        .filter((p) => !mapped.has(p)),
    );
    expect(unmapped).toEqual([]);
  });
});
