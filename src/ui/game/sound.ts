/**
 * One sound per action, not one per event. A single click can produce a cascade of hundreds of
 * `revealed` cells, a fight, a level-up and a win in the same array; the loudest thing that
 * happened wins (decision 0024). The list is ordered by consequence, not by when things occurred.
 * Win and loss are sounded by the outcome, which also fires the clear effect, so they are null here.
 */

import type { GameEvent } from '../../engine/types.js';
import type { SfxEvent } from '../sfx.js';

export function soundFor(events: GameEvent[]): SfxEvent | null {
  if (events.length === 0) return null;
  const has = (t: GameEvent['type']) => events.some((ev) => ev.type === t);
  if (has('won') || has('lost')) return null;
  if (has('levelUp')) return 'levelup';
  if (events.some((ev) => ev.type === 'battle' && ev.damage > 0)) return 'battle';
  if (has('battle')) return 'kill';
  if (has('spell') || has('exercised')) return 'spell';
  if (has('blocked')) return 'blocked';
  if (has('noted')) return 'note';
  if (has('marked')) return 'mark';
  if (events.some((ev) => ev.type === 'revealed' && ev.cells.length > 1)) return 'cascade';
  if (has('revealed')) return 'open';
  return null;
}
