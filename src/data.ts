/**
 * Node-only access to the generated tuning data.
 *
 * Kept out of `src/engine` on purpose: the engine must stay free of I/O so it
 * runs unchanged in a browser. Anything that touches the filesystem lives here.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Ladders } from './engine/config.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Written by `design/ladders.py`; the single source of truth for tuning.
 *
 * `CS_LADDERS` points a sim at a candidate file instead, so a schedule can be
 * measured before it replaces the real one — which is how a retune should be
 * done, since the file is read once per process and every sim running at the
 * time would otherwise pick up a half-finished edit.
 */
export const LADDERS_PATH = process.env.CS_LADDERS
  ? resolve(process.env.CS_LADDERS)
  : resolve(HERE, '..', 'design', 'data', 'ladders.json');

let cached: Ladders | null = null;

export function loadLadders(): Ladders {
  if (!cached) cached = JSON.parse(readFileSync(LADDERS_PATH, 'utf8')) as Ladders;
  return cached;
}
