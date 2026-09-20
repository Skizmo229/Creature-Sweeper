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

/** Written by `design/ladders.py`; the single source of truth for tuning. */
export const LADDERS_PATH = resolve(HERE, '..', 'design', 'data', 'ladders.json');

let cached: Ladders | null = null;

export function loadLadders(): Ladders {
  if (!cached) cached = JSON.parse(readFileSync(LADDERS_PATH, 'utf8')) as Ladders;
  return cached;
}
