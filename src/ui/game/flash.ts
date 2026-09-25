/**
 * What the stage shows of an action, beside its sound: a shake when a fight cost HP; the rim lit
 * red for that, blue for a fight that levelled the player up, or green for one that cost nothing;
 * and a glow on a level-up. The look is in styles.css; this decides which from the action's
 * events, and restarts the animations. The rim follows the player's setting; the shake and the
 * glow do not.
 */

import type { GameEvent } from '../../engine/types.js';
import type { FightRim } from '../settings.js';

export function flashStage(stage: HTMLElement, events: GameEvent[], rim: FightRim): void {
  if (events.some((ev) => ev.type === 'battle' && ev.damage > 0)) restart(stage, 'shake');
  flashRim(stage, events, rim);
  if (events.some((ev) => ev.type === 'levelUp')) restart(stage, 'levelup');
}

/**
 * Light the rim for an action's fights, on the stage or on the settings screen's example of it.
 * Only one rim class is ever on the element: with two, the later CSS rule would win and the
 * other colour could never play.
 */
export function flashRim(host: HTMLElement, events: GameEvent[], rim: FightRim): void {
  const outcome = rimFor(events, rim);
  if (!outcome) return;
  host.classList.remove('fight-clean', 'fight-levelup', 'fight-hurt');
  restart(host, `fight-${outcome}`);
}

/**
 * One rim per action, however many fights it resolved (a sweep can fight several): red if any of
 * them cost HP, else blue if the action levelled the player up, else green, which 'levelups'
 * leaves out.
 */
function rimFor(events: GameEvent[], rim: FightRim): 'clean' | 'levelup' | 'hurt' | null {
  const battles = events.filter((ev) => ev.type === 'battle');
  if (rim === 'off' || battles.length === 0) return null;
  if (battles.some((ev) => ev.damage > 0)) return 'hurt';
  if (events.some((ev) => ev.type === 'levelUp')) return 'levelup';
  return rim === 'levelups' ? null : 'clean';
}

/** Take a class off and put it back with a reflow between, so its animation plays again. */
function restart(host: HTMLElement, cls: string): void {
  host.classList.remove(cls);
  void host.offsetWidth;
  host.classList.add(cls);
}
