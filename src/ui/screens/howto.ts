/**
 * The rules, stated before the first click. Everything else on the ladder screen describes what
 * each ladder VARIES, which is the right label for a designer and says nothing to a player who
 * has not been told the game yet. The sum rule leads because it is the one a Minesweeper player
 * gets wrong: they read a 4 as four creatures, play on it, die, and conclude the board lied.
 */

import { el } from '../dom.js';

export function buildHowTo(onDone: () => void): { overlay: HTMLElement; focus: HTMLElement } {
  const overlay = el('div', 'overlay win');
  const card = el('div', 'overlay-card howto');
  card.append(el('h2', undefined, 'HOW TO PLAY'));
  card.append(
    el(
      'p',
      'overlay-stats',
      'Minesweeper, except the creatures fight back — and the numbers count differently.',
    ),
  );

  const rule = (heading: string, body: string) => {
    card.append(el('p', 'howto-rule', heading));
    card.append(el('p', 'overlay-note', body));
  };

  rule(
    'A number is a sum, not a count.',
    'It is the tiers of the creatures around it added together. A 9 might be two ' +
      'creatures — a tier 5 beside a tier 4 — or three tier 3s. That is ' +
      'why a number can be larger than 8 when a cell has only 8 neighbours.',
  );

  rule(
    'Anything at or below your level dies for free.',
    'Your level is the Level number at the top of the board, drawn in the colour of the ' +
      'strongest creatures it can beat. A creature of that tier or lower falls in ' +
      'one blow and costs nothing, and pays EXP. A stronger one fights back, and the ' +
      'gap is expensive: a tier 5 at LV 1 costs 20 HP.',
  );

  rule(
    'HP is a guess budget.',
    'Every board can be cleared without taking a single point of damage — the EXP ' +
      'needed for each level is always already on the board below it. So HP is not a ' +
      'combat resource. You spend it when you guess.',
  );

  card.append(
    el(
      'p',
      'overlay-note',
      'Click to open · right-click, or a LV button, to mark what you think a cell is · ' +
        'S opens what is provably safe.',
    ),
  );

  const row = el('div', 'overlay-actions');
  const go = el('button', 'primary', 'Got it');
  go.addEventListener('click', onDone);
  row.append(go);
  card.append(row);
  overlay.append(card);
  return { overlay, focus: go };
}
