/**
 * The rules, stated before the first click. Everything else on the ladder screen describes what
 * each ladder VARIES, which is the right label for a designer and says nothing to a player who
 * has not been told the game yet. The sum rule leads because it is the one a Minesweeper player
 * gets wrong: they read a 4 as four creatures, play on it, die, and conclude the board lied.
 * Three rules, a line each; the lessons and the guide have the rest.
 */

import { type OverlayCard, el } from '../dom.js';

/** The rules card, with its ways to the school and the field guide; `focus` is Got it. */
export function buildHowTo(
  onDone: () => void,
  onGuide: () => void,
  onSchool: () => void,
): OverlayCard {
  const overlay = el('div', 'overlay win');
  const card = el('div', 'overlay-card howto');
  card.append(el('h2', undefined, 'HOW TO PLAY'));
  card.append(
    el(
      'p',
      'overlay-stats',
      'Minesweeper, except the creatures fight back and the numbers add up.',
    ),
  );

  const rule = (heading: string, body: string) => {
    card.append(el('p', 'howto-rule', heading));
    card.append(el('p', 'overlay-note', body));
  };

  rule(
    'A number is a sum, not a count.',
    'It adds up the tiers of the creatures around it. A 9 might be a 5 and a 4, or three 3s.',
  );

  rule(
    'Anything at or below your level dies for free.',
    'Your level is the LV number at the top, in the colour of the strongest tier it beats. ' +
      'Stronger creatures fight back, and two tiers over is a cliff: a tier 5 at LV 1 costs 20 HP.',
  );

  rule(
    'HP is a guess budget.',
    'Every board can be cleared without taking damage; the EXP each level needs is already on ' +
      'the board below it. You spend HP only when you guess.',
  );

  card.append(
    el(
      'p',
      'overlay-note',
      'Click to open · right-click, or a LV button, to mark · ' +
        'S opens what is provably safe on a ladder with Sweep.',
    ),
  );

  const row = el('div', 'overlay-actions');
  const go = el('button', 'primary', 'Got it');
  go.addEventListener('click', onDone);
  // Everything past these three rules is in the lessons and the guide, which the card offers and
  // does not require.
  const school = el('button', 'ghost', 'Take the lessons');
  school.addEventListener('click', onSchool);
  const guide = el('button', 'ghost', 'Field guide');
  guide.addEventListener('click', onGuide);
  row.append(go, school, guide);
  card.append(row);
  overlay.append(card);
  return { overlay, focus: go };
}
