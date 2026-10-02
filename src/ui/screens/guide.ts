/**
 * The field guide (docs/teaching-plan.md, section 6): the catalogue of tricks in the game, for
 * reading. An overlay that scrolls inside itself, one section per grade, with the words from
 * `guide/entries.ts` and every diagram drawn as a real board by the real renderer, the tutor's
 * own lesson laid over it. Opened for a ladder, it leads with how to play that one
 * (`guide/ladders.ts`) and marks the tricks that belong to it. The overlay rules in docs/ui.md
 * apply: fixed, modal, closed by Escape.
 */

import type { LadderType } from '../../engine/config.js';
import { damageIfSurvived } from '../../engine/combat.js';
import type { Cell } from '../../engine/types.js';
import { type Diagram, diagramPicture, pressDiagram } from '../../sim/diagrams.js';
import type { TrickId } from '../../sim/tricks.js';
import type { Lesson } from '../../sim/tutor.js';
import { type BoardDisplay, BoardView } from '../board/view.js';
import { type OverlayCard, el } from '../dom.js';
import type { TypeTheme } from '../looktypes.js';
import {
  type Block,
  DAMAGE_TABLE,
  GUIDE,
  GUIDE_INTRO,
  type GuideEntry,
  laddersFor,
  ownEntries,
} from '../guide/entries.js';
import { notesFor } from '../guide/ladders.js';

/** Where the guide opens: at a trick's entry, or at the top of a section, by its title. */
export type GuideTarget = { trick: TrickId } | { section: string };

/** What the guide is drawn with: the ladders, the look of its diagrams, and its way out. */
export interface GuideOptions {
  ladders: readonly LadderType[];
  theme: TypeTheme;
  display: BoardDisplay;
  /** The diagrams' cell size, in CSS pixels. */
  cell: number;
  /** The ladder whose own notes lead the guide, when it was opened for one. */
  ladder?: LadderType | undefined;
  close(): void;
}

/** The guide's overlay, and `show`, which scrolls it to a target once it is on the page. */
export function buildGuide(o: GuideOptions): {
  overlay: HTMLElement;
  focus: HTMLElement;
  show(target?: GuideTarget): void;
} {
  const overlay = el('div', 'overlay guide');
  const card = el('div', 'overlay-card guide-card');
  const head = el('div', 'guide-head');
  head.append(el('h2', undefined, 'FIELD GUIDE'));
  const close = el('button', 'ghost', 'Close');
  close.addEventListener('click', o.close);
  head.append(close);
  const body = el('div', 'guide-body');
  card.append(head, body);

  const own = el('section', 'guide-section');
  if (o.ladder) body.append(own);
  const contents = el('nav', 'guide-contents');
  const places = new Map<string, HTMLElement>();
  const mine: Array<readonly [string, HTMLElement]> = [];
  body.append(contents);
  for (const words of GUIDE_INTRO) body.append(el('p', 'guide-intro', words));

  for (const section of GUIDE) {
    const part = el('section', 'guide-section');
    part.append(el('h3', undefined, section.title));
    places.set(`section:${section.title}`, part);
    const jump = el('button', 'ghost', section.title);
    jump.addEventListener('click', () => part.scrollIntoView?.({ block: 'start' }));
    contents.append(jump);
    for (const words of section.intro ?? []) part.append(el('p', undefined, words));
    for (const entry of section.entries) {
      const article = drawEntry(entry, section.grade, o);
      if (entry.trick) places.set(`trick:${entry.trick}`, article);
      if (o.ladder && ownEntries(o.ladder).includes(entry)) {
        article.classList.add('guide-own');
        mine.push([entry.heading ?? '', article]);
      }
      part.append(article);
    }
    body.append(part);
  }
  if (o.ladder) drawLadder(own, o.ladder, mine);
  overlay.append(card);

  const show = (target?: GuideTarget): void => {
    const key = !target
      ? null
      : 'trick' in target
        ? `trick:${target.trick}`
        : `section:${target.section}`;
    const place = key ? places.get(key) : null;
    if (!place) return;
    place.classList.add('guide-here');
    place.scrollIntoView?.({ block: 'start' });
  };
  return { overlay, focus: close, show };
}

/**
 * How to play one ladder: the catalogue's notes on it, or its own blurb where the catalogue has
 * none, and a way to each trick that belongs to it alone, which are marked where they stand.
 */
function drawLadder(
  part: HTMLElement,
  ladder: LadderType,
  tricks: ReadonlyArray<readonly [string, HTMLElement]>,
): void {
  part.append(el('h3', undefined, `How to play ${ladder.name}`));
  const notes = notesFor(ladder);
  for (const note of notes) {
    part.append(el('h4', undefined, note.heading));
    part.append(el('p', undefined, note.body));
  }
  if (!notes.length) part.append(el('p', undefined, ladder.blurb));
  if (!tricks.length) return;
  part.append(el('p', 'guide-on', 'Its own tricks, marked in its colour below:'));
  const row = el('nav', 'guide-contents');
  for (const [name, article] of tricks) {
    const jump = el('button', 'ghost', name);
    jump.addEventListener('click', () => article.scrollIntoView?.({ block: 'start' }));
    row.append(jump);
  }
  part.append(row);
}

/** One entry: its heading, where it applies, and its blocks. */
function drawEntry(entry: GuideEntry, grade: number | undefined, o: GuideOptions): HTMLElement {
  const article = el('article', 'guide-entry');
  if (entry.heading) {
    const h = el('h4', undefined, entry.heading);
    if (entry.trick && grade !== undefined) h.append(el('span', 'guide-grade', `grade ${grade}`));
    article.append(h);
  }
  if (entry.on) {
    const names = laddersFor(entry, o.ladders).map((t) => t.name);
    article.append(el('p', 'guide-on', `On ${names.join(', ')}.`));
  }
  for (const block of entry.body) article.append(drawBlock(block, o));
  return article;
}

function drawBlock(block: Block, o: GuideOptions): HTMLElement {
  if (typeof block === 'string') return el('p', undefined, block);
  if ('list' in block) {
    const list = el('ul');
    for (const item of block.list) list.append(el('li', undefined, item));
    return list;
  }
  if ('table' in block) return damageTable();
  return drawDiagram(block.diagram, o);
}

/**
 * The cost of a fight above your level, from the engine's own formula, with the costs that kill
 * from the common 10-HP pool marked.
 */
function damageTable(): HTMLElement {
  const table = el('table', 'guide-table');
  const head = el('tr');
  head.append(el('th', undefined, 'tier at level'));
  for (const level of DAMAGE_TABLE.levels) head.append(el('th', undefined, String(level)));
  table.append(head);
  for (const tier of DAMAGE_TABLE.tiers) {
    const row = el('tr');
    row.append(el('th', undefined, `tier ${tier}`));
    for (const level of DAMAGE_TABLE.levels) {
      const cost = damageIfSurvived(level, tier);
      row.append(el('td', cost >= LETHAL ? 'lethal' : undefined, String(cost)));
    }
    table.append(row);
  }
  return table;
}

/** The pool of the common ladders, which the catalogue's table is read against. */
const LETHAL = 10;

/**
 * A diagram as a board: the patch, drawn by a non-interactive `BoardView`, with the tutor's lesson
 * for it laid over, and under it what the tutor says there.
 */
function drawDiagram(d: Diagram, o: GuideOptions): HTMLElement {
  const figure = el('figure', 'guide-figure');
  const canvas = document.createElement('canvas');
  const view = new BoardView(
    canvas,
    { onOpen: ignore, onCycleMark: ignore, onHover: ignore },
    { interactive: false, fixedCell: o.cell },
  );
  const picture = diagramPicture(d);
  view.setGame(picture, o.theme, { ...o.display, highlight: null });
  const { lesson } = pressDiagram(d);
  if (lesson) view.setPointer(within(lesson, picture.config.width));
  figure.append(canvas);
  if (lesson) figure.append(el('figcaption', undefined, `Hint says: ${lesson.caption}`));
  return figure;
}

const ignore = (): void => {};

/** A lesson with only the cells of the patch, which is all the picture has. */
function within(lesson: Lesson, width: number): Lesson {
  const inside = (c: Cell): boolean => c.x < width;
  return {
    ...lesson,
    open: lesson.open.filter(inside),
    mark: lesson.mark.filter(([c]) => inside(c)),
    narrow: lesson.narrow.filter(([c]) => inside(c)),
  };
}

/**
 * A ladder's card, the first time it is opened (docs/teaching-plan.md, section 5.5): the
 * catalogue's note on it and the tricks its rules add, each in the catalogue's words, and a way
 * into the guide led by the same. The hint line's sentence about the ladder's rule is the reminder
 * after it.
 */
export function buildLadderCard(
  ladder: LadderType,
  guide: () => void,
  close: () => void,
): OverlayCard {
  const overlay = el('div', 'overlay win');
  const card = el('div', 'overlay-card howto');
  card.append(el('h2', undefined, `HOW TO PLAY ${ladder.name}`));
  for (const note of notesFor(ladder)) card.append(el('p', 'overlay-note', note.body));
  for (const entry of ownEntries(ladder)) {
    card.append(el('p', 'howto-rule', entry.heading ?? ''));
    const words = entry.body.find((b): b is string => typeof b === 'string');
    if (words) card.append(el('p', 'overlay-note', words));
  }
  const row = el('div', 'overlay-actions');
  const go = el('button', 'primary', 'Got it');
  go.addEventListener('click', close);
  const more = el('button', 'ghost', 'Field guide');
  more.addEventListener('click', guide);
  row.append(go, more);
  card.append(row);
  overlay.append(card);
  return { overlay, focus: go };
}
