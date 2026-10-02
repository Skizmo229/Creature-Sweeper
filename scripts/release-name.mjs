/**
 * Where a packaged build is written: release/creature-sweeper-<kind>-<version>-<date>-<commit>.<ext>,
 * the version being package.json's (decision 0068), so a file says which game it holds and which
 * commit built it. Shared by the itch.io zip and the offline page.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'release';

/** The path for a build of `kind` packaged at `now`, its folder made. */
export function releasePath(kind, ext, now) {
  let commit = 'nogit';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (dirty) commit += '-dirty';
  } catch {
    /* not a git checkout; the date still identifies it */
  }

  // The local date, to agree with the timestamps inside the zip; `toISOString`
  // is the UTC date and names an evening's build after the following day.
  const two = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;

  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

  mkdirSync(OUT_DIR, { recursive: true });
  return join(OUT_DIR, `creature-sweeper-${kind}-${version}-${stamp}-${commit}.${ext}`);
}
