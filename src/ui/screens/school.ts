/**
 * The school (docs/teaching-plan.md, section 5.4): the lessons as cards, each with the trick it
 * teaches and its grade and whether it has been taken to its end, and the card that closes a
 * lesson. Offered, never required: nothing waits on a lesson (principle 7).
 */

import { el } from '../dom.js';
import type { Progress } from '../progress.js';
import { TRICK_TEXT } from '../../sim/tricktext.js';
import { LESSONS } from '../school/lessons.js';

/** What the school's list reads, and where its cards go. */
export interface SchoolListActions {
  progress: Progress;
  back(): void;
  start(index: number): void;
}

/** The school's screen: a card per lesson, saying what it teaches and whether it was taken. */
export function buildSchoolList(a: SchoolListActions): HTMLElement {
  const wrap = el('div', 'screen');
  const head = el('header', 'title-bar');
  const back = el('button', 'ghost', '← Ladders');
  back.addEventListener('click', a.back);
  head.append(back, el('h1', undefined, 'School'));
  head.append(el('p', 'sub', 'Nine short lessons, one trick each, in any order.'));
  wrap.append(head);

  const grid = el('div', 'board-grid');
  LESSONS.forEach((lesson, i) => {
    const done = a.progress.lessonDone(lesson.id);
    const card = el('button', `board-card${done ? ' done' : ''}`);
    card.append(el('span', 'board-n', String(i + 1)));
    card.append(el('span', 'board-size', lesson.title));
    card.append(
      el(
        'span',
        'board-stat',
        !lesson.trick
          ? 'when nothing is proven'
          : TRICK_TEXT[lesson.trick].name === lesson.title
            ? `grade ${lesson.grade}`
            : `${TRICK_TEXT[lesson.trick].name} · grade ${lesson.grade}`,
      ),
    );
    card.append(el('span', 'board-badge', done ? 'Taken' : 'Not taken'));
    card.addEventListener('click', () => a.start(i));
    grid.append(card);
  });
  wrap.append(grid);
  return wrap;
}

/** The card at a lesson's end: on to the next, or back to the school. */
export function buildLessonDone(
  title: string,
  onNext: (() => void) | null,
  onSchool: () => void,
): { overlay: HTMLElement; focus: HTMLElement } {
  const overlay = el('div', 'overlay win');
  const card = el('div', 'overlay-card');
  card.append(el('h2', undefined, 'LESSON TAKEN'));
  card.append(el('p', 'overlay-stats', title));
  const row = el('div', 'overlay-actions');
  const school = el('button', onNext ? 'ghost' : 'primary', 'School');
  school.addEventListener('click', onSchool);
  if (onNext) {
    const next = el('button', 'primary', 'Next lesson');
    next.addEventListener('click', onNext);
    row.append(next);
  }
  row.append(school);
  card.append(row);
  overlay.append(card);
  return { overlay, focus: row.firstElementChild as HTMLElement };
}
