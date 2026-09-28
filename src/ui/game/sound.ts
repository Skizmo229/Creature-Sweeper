/**
 * One sound per action, not one per event. A single click can produce a cascade of hundreds of
 * `revealed` cells, a fight, a level-up and a win in the same array; the loudest thing that
 * happened wins (decision 0024). The list is ordered by consequence, not by when things occurred.
 * Win and loss are sounded by the outcome, which also fires the clear effect, so they are null here.
 * The loudest thing the player has silenced is passed over for the next, so silencing the kill
 * still lets the click of the cell it opened be heard.
 */

import type { GameEvent } from '../../engine/types.js';
import type { SfxEvent } from '../sfx.js';

/** Each sound an action can make, loudest first, and what in the action's events calls for it. */
const BY_CONSEQUENCE: ReadonlyArray<readonly [SfxEvent, (events: GameEvent[]) => boolean]> = [
  ['levelup', (events) => events.some((ev) => ev.type === 'levelUp')],
  ['battle', (events) => events.some((ev) => ev.type === 'battle' && ev.damage > 0)],
  ['kill', (events) => events.some((ev) => ev.type === 'battle')],
  ['spell', (events) => events.some((ev) => ev.type === 'spell' || ev.type === 'exercised')],
  ['blocked', (events) => events.some((ev) => ev.type === 'blocked')],
  ['note', (events) => events.some((ev) => ev.type === 'noted')],
  ['mark', (events) => events.some((ev) => ev.type === 'marked')],
  ['cascade', (events) => events.some((ev) => ev.type === 'revealed' && ev.cells.length > 1)],
  ['open', (events) => events.some((ev) => ev.type === 'revealed')],
];

/** The sound for an action: the loudest its events call for that `plays`, or null for silence. */
export function soundFor(
  events: GameEvent[],
  plays: (event: SfxEvent) => boolean = () => true,
): SfxEvent | null {
  if (events.length === 0) return null;
  if (events.some((ev) => ev.type === 'won' || ev.type === 'lost')) return null;
  for (const [sound, calledFor] of BY_CONSEQUENCE) {
    if (plays(sound) && calledFor(events)) return sound;
  }
  return null;
}
