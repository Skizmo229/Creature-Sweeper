/**
 * One ladder's boards: the tuned ten, the Full Run tile (the eleventh, a board card in every
 * structural respect) and the scaling tile (the twelfth: one card with a dial, because a tile per
 * continuation board would bury the ladder it belongs to).
 */

import { boardRow, maxBoard } from '../../engine/config.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import type { Progress } from '../progress.js';
import { themeFor } from '../theme.js';

export interface BoardListActions {
  progress: Progress;
  back(): void;
  startBoard(typeId: string, board: number): void;
  startRun(typeId: string): void;
}

export function buildBoardList(typeId: string, a: BoardListActions): HTMLElement {
  const { progress } = a;
  const type = ladders.find((t) => t.id === typeId)!;
  const theme = themeFor(typeId);

  const wrap = el('div', 'screen');
  wrap.style.setProperty('--tint', theme.accent);

  const head = el('header', 'title-bar');
  const back = el('button', 'ghost', '← Ladders');
  back.addEventListener('click', a.back);
  head.append(back);
  head.append(el('h1', undefined, type.name));
  head.append(el('p', 'sub', type.blurb));
  wrap.append(head);

  const grid = el('div', 'board-grid');
  for (const board of type.boards) {
    const unlocked = progress.isBoardUnlocked(ladders, typeId, board.n);
    const rec = progress.boardRecord(typeId, board.n);

    const card = el('button', 'board-card');
    card.disabled = !unlocked;
    if (rec.cleared) card.classList.add('done');
    if (rec.perfect) card.classList.add('perfect');

    card.append(el('span', 'board-n', String(board.n)));
    card.append(el('span', 'board-size', `${board.w}×${board.h}`));
    card.append(el('span', 'board-stat', `${board.monsters} creatures · ${board.density}%`));
    card.append(el('span', 'board-stat', `HP ${board.hp} · ${board.tiers} tiers`));

    const badge = el('span', 'board-badge');
    if (!unlocked) badge.textContent = 'Locked';
    else if (rec.bestTime !== null) {
      badge.textContent = `${rec.perfect ? '★ ' : ''}best ${rec.bestTime}s`;
    } else badge.textContent = 'Not cleared';
    card.append(badge);

    card.addEventListener('click', () => a.startBoard(typeId, board.n));
    grid.append(card);
  }
  grid.append(fullRunCard(typeId, a));
  grid.append(scalingCard(typeId, a));
  wrap.append(grid);
  return wrap;
}

/**
 * The scaling tile. A div rather than a button because it contains buttons, which costs the
 * click-anywhere affordance every other tile has and is why Play is spelled out.
 */
function scalingCard(typeId: string, a: BoardListActions): HTMLElement {
  const { progress } = a;
  const type = ladders.find((t) => t.id === typeId)!;
  const first = type.boards.length + 1;
  const last = maxBoard(ladders, typeId);
  const unlocked = progress.isScalingUnlocked(ladders, typeId);
  let board = progress.scalingBoard(typeId, first, last);

  const card = el('div', 'board-card scale-card');
  if (!unlocked) card.classList.add('locked');

  card.append(el('span', 'board-n scale-n', 'SCALING'));

  const picker = el('div', 'scale-pick');
  const down = el('button', 'scale-arrow', '◀');
  const num = el('span', 'scale-num');
  const up = el('button', 'scale-arrow', '▶');
  picker.append(down, num, up);
  card.append(picker);

  const size = el('span', 'board-size');
  const stat1 = el('span', 'board-stat');
  const stat2 = el('span', 'board-stat');
  card.append(size, stat1, stat2);

  const badge = el('span', 'board-badge');
  const play = el('button', 'primary small scale-go', 'Play');
  card.append(unlocked ? play : badge);

  const draw = () => {
    const row = boardRow(ladders, typeId, board)!;
    num.textContent = String(board);
    size.textContent = `${row.w}×${row.h}`;
    stat1.textContent = `${row.monsters} creatures · ${row.density}%`;
    stat2.textContent = `HP ${row.hp} · ${row.tiers} tiers`;
    // An arrow that cannot move says so: the top of a continuation is a real place.
    down.disabled = !unlocked || board <= first;
    up.disabled = !unlocked || board >= last;
    const rec = progress.boardRecord(typeId, board);
    card.classList.toggle('done', rec.cleared);
    card.classList.toggle('perfect', rec.perfect);
    badge.textContent = `Locked — clear ${type.boards.length}`;
    play.textContent = rec.cleared ? 'Replay' : 'Play';
    card.title = unlocked
      ? `Boards ${first} to ${last}: the ladder's own schedules carried past ` +
        `board ${type.boards.length} and clamped where they stop changing. ` +
        `Board ${board} of ${last}.`
      : `Clear board ${type.boards.length} to unlock the scaling boards.`;
  };

  const step = (by: number) => {
    board = Math.min(last, Math.max(first, board + by));
    progress.setScalingBoard(typeId, board);
    draw();
  };
  down.addEventListener('click', () => step(-1));
  up.addEventListener('click', () => step(1));
  play.addEventListener('click', () => a.startBoard(typeId, board));

  draw();
  return card;
}

/** The Full Run tile. Its rules live in the tooltip, and in full on the first clear overlay. */
function fullRunCard(typeId: string, a: BoardListActions): HTMLElement {
  const { progress } = a;
  const type = ladders.find((t) => t.id === typeId)!;
  const unlocked = progress.isFullRunUnlocked(ladders, typeId);
  const rec = progress.runRecord(typeId);
  const pool = type.run_hp;
  const heal = Math.floor(pool / 2);
  const last = type.boards.length;

  const card = el('button', 'board-card run-card');
  card.disabled = !unlocked;
  if (rec.cleared) card.classList.add('done');
  // A run finished without losing a point is the same claim a perfect clear makes.
  if (rec.bestHp === pool) card.classList.add('perfect');

  card.title = unlocked
    ? `All ${last} boards back to back on one pool of ${pool} HP. ` +
      (heal > 0
        ? `Heal +${heal} — half the pool — after each board you clear. `
        : `A pool of ${pool} heals back nothing: one mistake ends the run. `) +
      'Level, EXP and mana reset on every board; only HP carries. ' +
      'Dying at any point ends the whole run.'
    : `Clear board ${last} to unlock the full run.`;

  card.append(el('span', 'board-n run-n', 'FULL RUN'));
  card.append(el('span', 'board-size', `all ${last} boards`));
  card.append(el('span', 'board-stat', `one pool · HP ${pool}`));
  card.append(
    el('span', 'board-stat', heal > 0 ? `+${heal} healed per board` : 'no healing at all'),
  );

  const badge = el('span', 'board-badge');
  if (!unlocked) badge.textContent = `Locked — clear ${last}`;
  else if (rec.cleared && rec.bestTime !== null) badge.textContent = `★ best ${rec.bestTime}s`;
  else if (rec.attempts > 0) badge.textContent = `best: board ${rec.bestBoard}`;
  else badge.textContent = 'Not attempted';
  card.append(badge);

  card.addEventListener('click', () => a.startRun(typeId));
  return card;
}
