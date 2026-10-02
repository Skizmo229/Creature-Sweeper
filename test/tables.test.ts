/**
 * What the measurements in `src/sim/cli` share to read their command lines (`src/sim/tables.ts`):
 * a seed count is a whole number from 1, and anything else stops the command with its usage
 * line instead of printing a table of averages over nothing.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedCount } from '../src/sim/tables.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TSX = createRequire(import.meta.url).resolve('tsx/cli');

describe('a seed count', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is the number named, or the default when none is', () => {
    expect(seedCount('3', 40, 'npm run sim:spells -- [seeds]')).toBe(3);
    expect(seedCount(undefined, 40, 'npm run sim:spells -- [seeds]')).toBe(40);
  });

  it('stops the command with its usage line when it is not a whole number from 1', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${String(code)}`);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const arg of ['0', '-2', '1.5', 'arcane', '']) {
      expect(() => seedCount(arg, 40, 'npm run sim:spells -- [seeds]'), arg).toThrow('exit 2');
    }
    expect(exit).toHaveBeenCalledTimes(5);
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining('npm run sim:spells'));
  });

  it('of 0 gets the spell measurement its usage line, not a table of NaN', () => {
    const env = { ...process.env };
    delete env['CS_LADDERS'];
    const result = spawnSync(process.execPath, [TSX, 'src/sim/cli/spellvalue.ts', '0', 'arcane'], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
    });
    expect(result.stdout).not.toContain('NaN');
    expect(result.stderr).toContain('usage: npm run sim:spells');
    expect(result.status).toBe(2);
  });
});
