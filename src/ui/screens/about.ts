/**
 * Who made the game and what it is made of: its version, the original it remixes, its copyright
 * and licence, and where its source is (decision 0069). It carries the notices the GPL asks an
 * interactive program to show: the copyright, that there is no warranty, that the game may be
 * shared under the licence, and where to read it. Every link opens a tab of its own: on itch.io
 * the game runs in a frame, and the pages it links to will not load inside one.
 */

import { el } from '../dom.js';
import { VERSION } from '../version.js';

/** The repository: the source, the licence, and where bugs and ideas go. */
const SOURCE_URL = 'https://github.com/Skizmo229/Creature-Sweeper';
const LICENCE_URL = `${SOURCE_URL}/blob/main/LICENSE`;
const ORIGINAL_URL = 'https://hojamaka.com/games/mamono_sweeper/';
/** Shipped beside index.html in every build (`public/`), so it resolves on itch.io and in dev. */
const FONT_LICENCES = './FONT-LICENSES.txt';

/** A link that leaves the game in a tab of its own. */
function link(href: string, text: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function buildAbout(onClose: () => void): { overlay: HTMLElement; focus: HTMLElement } {
  const overlay = el('div', 'overlay win');
  const card = el('div', 'overlay-card about');
  card.append(el('h2', undefined, 'CREATURE SWEEPER'));
  card.append(el('p', 'overlay-stats', `Version ${VERSION}`));

  const say = (...parts: (string | Node)[]): void => {
    const p = el('p', 'overlay-note');
    p.append(...parts);
    card.append(p);
  };
  say(
    'A remix of ',
    link(ORIGINAL_URL, 'mamono sweeper'),
    ' by Hojamaka Games. They did not make or endorse Creature Sweeper, but do play their games.',
  );
  say('Copyright © 2026 Skizmo229 and contributors.');
  say(
    'Free software: you may share and change it under the ',
    link(LICENCE_URL, 'GNU General Public License'),
    ', version 3 or later. It comes with no warranty.',
  );
  say('Source, bug reports and ideas: ', link(SOURCE_URL, 'github.com/Skizmo229/Creature-Sweeper'));
  say('Fonts: SIL Open Font License (', link(FONT_LICENCES, 'notices'), ').');

  const row = el('div', 'overlay-actions');
  const close = el('button', 'primary', 'Close');
  close.addEventListener('click', onClose);
  row.append(close);
  card.append(row);
  overlay.append(card);
  return { overlay, focus: close };
}
