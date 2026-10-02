/**
 * One ladder's boards: the tuned ten, the Full Run tile (the eleventh, a board card in every
 * structural respect) and the scaling tile (the twelfth: one card with a dial, because a tile per
 * continuation board would bury the ladder it belongs to). A tile with a game paused on it says
 * so, and a click on it takes the game up (decision 0057).
 */

import { boardRow, findType, maxBoard } from '../../engine/config.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import { type PausedGame, pausedGames } from '../paused.js';
import type { Progress } from '../progress.js';
import { themeFor } from '../looks.js';

/** What the board list reads, and where its tiles and buttons go. */
export interface BoardListActions {
  progress: Progress;
  back(): void;
  /** The field guide, led by how to play this ladder. */
  guide(): void;
  startBoard(typeId: string, board: number): void;
  startRun(typeId: string): void;
}

/** The board list of ladder `typeId`: its tuned boards, then the Full Run and scaling tiles. */
export function buildBoardList(typeId: string, a: BoardListActions): HTMLElement {
  const { progress } = a;
  const type = findType(ladders, typeId);
  const theme = themeFor(typeId);

  const wrap = el('div', 'screen');
  wrap.style.setProperty('--tint', theme.accent);

  const head = el('header', 'title-bar');
  const back = el('button', 'ghost', '← Ladders');
  back.addEventListener('click', a.back);
  head.append(back);
  head.append(el('h1', undefined, type.name));
  head.append(el('p', 'sub', type.blurb));
  const how = el('button', 'ghost', `How to play ${type.name}`);
  how.addEventListener('click', a.guide);
  head.append(how);
  wrap.append(head);

  const grid = el('div', 'board-grid');
  for (const board of type.boards) {
    const unlocked = progress.isBoardUnlocked(ladders, typeId, board.n);
    const rec = progress.boardRecord(ladders, typeId, board.n);

    const card = el('button', 'board-card');
    card.disabled = !unlocked;
    if (rec.cleared) card.classList.add('done');
    if (rec.perfect) card.classList.add('perfect');

    card.append(el('span', 'board-n', String(board.n)));
    card.append(el('span', 'board-size', `${board.w}×${board.h}`));
    card.append(el('span', 'board-stat', `${board.monsters} creatures · ${board.density}%`));
    card.append(el('span', 'board-stat', `HP ${board.hp} · ${board.tiers} tiers`));

    const paused = unlocked ? pausedGames.get({ typeId, board: board.n }) : null;
    const badge = el('span', 'board-badge');
    if (!unlocked) badge.textContent = 'Locked';
    else if (paused) showPaused(card, badge, paused);
    else if (rec.bestTime !== null || rec.fewestHints !== undefined) {
      badge.textContent = `${rec.perfect ? '★ ' : ''}best ${bestText(rec)}`;
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

/** A best time, or with none set, the fewest hints a clear took (decision 0065). */
function bestText(rec: { bestTime: number | null; fewestHints?: number }): string {
  if (rec.bestTime !== null) return `${rec.bestTime}s`;
  return `${rec.fewestHints} hint${rec.fewestHints === 1 ? '' : 's'}`;
}

/** A tile with a game paused on it: where the game stands, and that a click carries it on. */
function showPaused(card: HTMLElement, badge: HTMLElement, paused: PausedGame): void {
  card.classList.add('paused');
  const where = paused.legs ? `board ${paused.board} · ` : '';
  badge.textContent = `Paused · ${where}HP ${paused.hp}/${paused.maxHp}`;
  const note = `Paused at ${Math.floor(paused.elapsedMs / 1000)}s. Click to carry on from there.`;
  card.title = card.title ? `${note}\n\n${card.title}` : note;
}

/**
 * The scaling tile. A div rather than a button because it contains buttons, which costs the
 * click-anywhere affordance every other tile has and is why Play is spelled out.
 */
function scalingCard(typeId: string, a: BoardListActions): HTMLElement {
  const { progress } = a;
  const type = findType(ladders, typeId);
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
    const rec = progress.boardRecord(ladders, typeId, board);
    card.classList.toggle('done', rec.cleared);
    card.classList.toggle('perfect', rec.perfect);
    badge.textContent = `Locked — clear ${type.boards.length}`;
    const paused = unlocked && pausedGames.get({ typeId, board }) !== null;
    card.classList.toggle('paused', paused);
    play.textContent = paused ? 'Resume' : rec.cleared ? 'Replay' : 'Play';
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
  const type = findType(ladders, typeId);
  const unlocked = progress.isFullRunUnlocked(ladders, typeId);
  const rec = progress.runRecord(ladders, typeId);
  const pool = type.run_hp;
  const heal = Math.floor(pool / 2);
  const last = type.boards.length;

  const card = el('button', 'board-card run-card');
  card.disabled = !unlocked;
  if (rec.cleared) card.classList.add('done');
  // A run finished without losing a point is the same claim a perfect clear makes.
  if (rec.bestHp === pool) card.classList.add('perfect');

  card.title = unlocked
    ? `All ${last} boards on one pool of ${pool} HP. ` +
      (heal > 0 ? `+${heal} HP after each clear. ` : 'No healing. ') +
      'Level, EXP and mana reset each board; only HP carries. Death ends the run.'
    : `Clear board ${last} to unlock the full run.`;

  card.append(el('span', 'board-n run-n', 'FULL RUN'));
  card.append(el('span', 'board-size', `all ${last} boards`));
  card.append(el('span', 'board-stat', `one pool · HP ${pool}`));
  card.append(
    el('span', 'board-stat', heal > 0 ? `+${heal} healed per board` : 'no healing at all'),
  );

  const paused = unlocked ? pausedGames.get({ typeId, run: true }) : null;
  const badge = el('span', 'board-badge');
  if (!unlocked) badge.textContent = `Locked — clear ${last}`;
  else if (paused) showPaused(card, badge, paused);
  else if (rec.cleared && (rec.bestTime !== null || rec.fewestHints !== undefined)) {
    badge.textContent = `★ best ${bestText(rec)}`;
  } else if (rec.attempts > 0) badge.textContent = `best: board ${rec.bestBoard}`;
  else badge.textContent = 'Not attempted';
  card.append(badge);

  card.addEventListener('click', () => a.startRun(typeId));
  return card;
}
