/**
 * What the stage shows of an action, beside its sound: a shake when a fight cost HP, the rim lit
 * red for that or green for fights that cost nothing, and a glow on a level-up. The look is in
 * styles.css; this decides which from the action's events, and restarts the animations.
 */

import type { GameEvent } from '../../engine/types.js';

export function flashStage(stage: HTMLElement, events: GameEvent[]): void {
  // One rim per action, however many fights it resolved (a sweep can fight several): red if
  // any of them cost HP, green otherwise.
  const battles = events.filter((ev) => ev.type === 'battle');
  const hurt = battles.some((ev) => ev.damage > 0);
  if (hurt) restart(stage, 'shake');
  if (battles.length > 0) {
    // Only one rim class is ever on the stage: with both, the later CSS rule would win and the
    // other colour could never play.
    stage.classList.remove('fight-clean', 'fight-hurt');
    restart(stage, hurt ? 'fight-hurt' : 'fight-clean');
  }
  if (events.some((ev) => ev.type === 'levelUp')) restart(stage, 'levelup');
}

/** Take a class off and put it back with a reflow between, so its animation plays again. */
function restart(stage: HTMLElement, cls: string): void {
  stage.classList.remove(cls);
  void stage.offsetWidth;
  stage.classList.add(cls);
}
