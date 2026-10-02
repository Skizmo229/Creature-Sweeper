// @vitest-environment happy-dom
/**
 * Paused games on screen (decision 0057): a board or a run paused and taken up again exactly where
 * it stood, the clock, the tutor's count and the dials with it; the slot kept with every move and
 * emptied when the game ends, so a pause is never a checkpoint; and a game an update has changed
 * refused rather than handed back as a different board.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Game } from '../../src/engine/game.js';
import { DIGEST_VERSION, boardDigest } from '../../src/engine/replay.js';
import { autoplayTierOrder } from '../../src/sim/autoplay.js';
import { ladders } from '../../src/ui/ladders.js';
import { type Slot, pausedGames } from '../../src/ui/paused.js';
import { type AppDriver, key, mountApp } from './driver.js';

const text = (selector: string): string =>
  document.querySelector<HTMLElement>(selector)?.textContent ?? '';
const onGame = (): boolean => document.querySelector('.screen.game') !== null;
const button = (label: string): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;
/** The board list's tiles, the tuned boards first, then the run and the scaling tile. */
const tiles = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.board-card')];

/** Everything the player can see of a board, for comparing one with its resumed self. */
const seen = (game: Game): string =>
  JSON.stringify({
    cells: game.grid.flat().map((c) => [c.open, c.mark, c.notes, c.alive]),
    standing: [game.hp, game.level, game.ex, game.mana, game.status],
  });

let app: AppDriver;

/**
 * Open the lowest free cell through the board's own click, which is how every move reaches the
 * keeper: a free kill or empty ground within reach. False when there is none left.
 */
function freeMove(): boolean {
  const game = app.current!;
  const cell = game.grid
    .flat()
    .filter((c) => c.present && !c.open && c.mark === 0 && c.tier <= game.level && game.inReach(c))
    .sort((a, b) => a.tier - b.tier)[0];
  if (!cell) return false;
  app.actions.onCellPrimary(cell.x, cell.y);
  return true;
}

function freeMoves(n: number): void {
  for (let i = 0; i < n && app.current!.status === 'playing' && freeMove(); i++);
}

beforeEach(() => {
  app = mountApp();
  app.progress.setUnlockAll(true);
});

describe('a paused board', () => {
  const slot: Slot = { typeId: 'normal', board: 3 };

  it('is taken up from its tile exactly where it stood', () => {
    app.play('normal', 3, 7);
    freeMoves(6);
    const before = seen(app.current!);
    key('p');
    expect(onGame()).toBe(false);
    const tile = tiles()[2]!;
    expect(tile.classList.contains('paused')).toBe(true);
    expect(tile.textContent).toContain('Paused · HP');
    app.showTypes();
    expect(document.body.textContent).toContain('1 paused');
    app.showBoards('normal');
    tiles()[2]!.click();
    expect(onGame()).toBe(true);
    expect(app.current!.seed).toBe(7);
    expect(seen(app.current!)).toBe(before);
    // Carries on being kept: the next move is in the slot too.
    const kept = pausedGames.get(slot)!.moves.length;
    freeMoves(1);
    expect(pausedGames.get(slot)!.moves.length).toBe(kept + 1);
  });

  it('keeps the clock, the tutor count and the dials it was dealt with', () => {
    app.settings.setGameplay({ hpRatio: 2 });
    app.play('normal', 3, 7);
    freeMoves(3);
    key('h');
    const maxHp = app.current!.maxHp;
    app.pause();
    app.settings.resetGameplay();
    // As though the board had been played for a minute and a half before the pause.
    pausedGames.put(slot, { ...pausedGames.get(slot)!, elapsedMs: 90_000 }, true);
    app.showBoards('normal');
    tiles()[2]!.click();
    expect(app.current!.settings.hpRatio).toBe(2);
    expect(app.current!.maxHp).toBe(maxHp);
    expect(app.teaching.tutor.hints).toBe(1);
    expect(app.clock.elapsedSeconds()).toBeGreaterThanOrEqual(90);
  });

  it('is not kept until a move is made, and leaving an untouched board asks nothing', () => {
    app.play('normal', 3, 7);
    key('Escape');
    expect(onGame()).toBe(false);
    expect(pausedGames.get(slot)).toBeNull();
  });

  it('asks on leaving whether to pause or abandon, and abandoning empties the slot', () => {
    app.play('normal', 3, 7);
    freeMoves(2);
    key('Escape');
    expect(text('.overlay h2')).toBe('LEAVE BOARD 3?');
    button('Keep playing').click();
    expect(onGame()).toBe(true);
    key('Escape');
    button('Abandon').click();
    expect(onGame()).toBe(false);
    expect(pausedGames.get(slot)).toBeNull();
    expect(tiles()[2]!.classList.contains('paused')).toBe(false);
  });

  it('is gone once the board ends, won or lost, so a pause is never a checkpoint', () => {
    app.play('normal', 3, 7);
    freeMoves(2);
    expect(pausedGames.get(slot)).not.toBeNull();
    autoplayTierOrder(app.current!);
    app.finish();
    expect(pausedGames.get(slot)).toBeNull();

    app.play('normal', 4, 7);
    freeMoves(2);
    const four: Slot = { typeId: 'normal', board: 4 };
    expect(pausedGames.get(four)).not.toBeNull();
    key('p');
    tiles()[3]!.click();
    // Time Attack's way of losing: the same door as any other loss.
    const events = app.current!.forfeit();
    app.apply(events);
    expect(pausedGames.get(four)).toBeNull();
  });

  it('is not written over by a copy another tab has since taken up', () => {
    app.play('normal', 3, 7);
    freeMoves(2);
    const theirs = { ...pausedGames.get(slot)!, token: 'another tab' };
    pausedGames.put(slot, theirs, true);
    freeMoves(2);
    expect(pausedGames.get(slot)).toEqual(theirs);
  });

  it('that an update has changed is refused, and its slot emptied', () => {
    app.play('normal', 3, 7);
    freeMoves(3);
    key('p');
    pausedGames.put(slot, { ...pausedGames.get(slot)!, digest: '00000000' }, true);
    tiles()[2]!.click();
    expect(text('.overlay h2')).toBe('CANNOT RESUME');
    expect(pausedGames.get(slot)).toBeNull();
    button('Start again').click();
    expect(onGame()).toBe(true);
    expect(app.current!.status).toBe('playing');
  });

  it('paused by 0.9.1, before the digest had a version, is taken up by that version', () => {
    app.play('normal', 3, 7);
    freeMoves(4);
    const before = seen(app.current!);
    const digest = boardDigest(app.current!, 1);
    key('p');
    const { digestVersion, ...kept } = pausedGames.get(slot)!;
    expect(digestVersion).toBe(DIGEST_VERSION);
    expect(kept.digest).not.toBe(digest);
    pausedGames.put(slot, { ...kept, digest }, true);
    tiles()[2]!.click();
    expect(onGame()).toBe(true);
    expect(seen(app.current!)).toBe(before);
  });

  it('is never kept on a school lesson, which has no Pause', () => {
    const storedPauses = (): string[] =>
      Object.keys(localStorage).filter((k) => k.includes('.paused.'));
    button('Take the lessons').click();
    tiles()[2]!.click();
    expect(document.querySelector('.hud')!.textContent).not.toContain('Pause');
    app.actions.onCellPrimary(0, 0);
    key('p');
    expect(onGame()).toBe(true);
    expect(storedPauses()).toEqual([]);
    app.play('normal', 3, 7);
    expect(document.querySelector('.hud')!.textContent).toContain('Pause');
  });
});

describe('a paused Full Run', () => {
  const slot: Slot = { typeId: 'easy', run: true };
  const runTile = (): HTMLElement => document.querySelector<HTMLElement>('.run-card')!;

  it('is taken up on the board it reached, with the HP it carried', () => {
    app.runFull('easy', 7);
    while (app.current!.status === 'playing' && freeMove());
    expect(app.current!.status).toBe('won');
    button('Continue → board 2').click();
    freeMoves(3);
    const before = seen(app.current!);
    const hp = app.currentRun!.hp;
    key('Escape');
    expect(text('.overlay h2')).toBe('LEAVE RUN?');
    button('Pause run').click();
    expect(runTile().textContent).toContain(`Paused · board 2 · HP ${hp}/`);
    runTile().click();
    expect(text('.board-label')).toContain('board 2 of 10');
    expect(app.currentRun!.legs).toHaveLength(1);
    expect(seen(app.current!)).toBe(before);
  });

  it('paused on a cleared board goes on to the next when taken up', () => {
    app.runFull('easy', 7);
    while (app.current!.status === 'playing' && freeMove());
    app.pause();
    expect(pausedGames.get(slot)!.board).toBe(1);
    runTile().click();
    expect(text('.board-label')).toContain('board 2 of 10');
    expect(pausedGames.get(slot)!.board).toBe(2);
  });

  it('abandoned is written down as an attempt and emptied', () => {
    app.runFull('easy', 7);
    freeMoves(2);
    key('Escape');
    button('Abandon run').click();
    expect(pausedGames.get(slot)).toBeNull();
    expect(app.progress.runRecord(ladders, 'easy').attempts).toBe(1);
  });

  it('abandoned on dials easier than the tuned game writes no attempt', () => {
    app.settings.setGameplay({ hpRatio: 2 });
    app.runFull('easy', 7);
    freeMoves(2);
    key('Escape');
    button('Abandon run').click();
    expect(pausedGames.get(slot)).toBeNull();
    expect(app.progress.runRecord(ladders, 'easy').attempts).toBe(0);
  });
});
