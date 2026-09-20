/**
 * The settings screen's example boards.
 *
 * These are presentation, so nothing here can break a run — but they are the
 * only thing a player has to judge a setting by, and an example that silently
 * stops showing what it claims to show is worse than no example, because
 * nothing tells them. The promises below are the ones the settings screen
 * makes in words, held to in code.
 *
 * Imported headlessly on purpose. `preview.ts` builds boards and renders
 * nothing — `renderPreview` lives in `settingsscreen.ts` for exactly this
 * reason — so the examples can be inspected in Node like the engine's own,
 * under a tsconfig that has no DOM library at all.
 */

import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import {
  PREVIEW_SEED,
  clearedBoard,
  hexSampleBoard,
  sampleBoard,
  zoomSampleBoard,
} from '../src/ui/preview.js';
import type { Game } from '../src/engine/game.js';

const tiersOn = (game: Game): Set<number> =>
  new Set(game.grid.flat().filter((c) => c.present && c.tier > 0).map((c) => c.tier));

const creatures = (game: Game) => game.grid.flat().filter((c) => c.present && c.tier > 0);

/** Every tier count the real ladders actually deal, across all 461 boards. */
const LADDER_TIER_COUNTS: number[] = [...new Set(
  loadLadders().flatMap((t) => [...t.boards, ...t.extended].map((b) => b.tiers)),
)].sort((a, b) => a - b);

describe('the board-clear example', () => {
  it('carries one of every tier the real board uses, and none above', () => {
    // The effects animate the creatures themselves, so the preview is really
    // previewing the glyphs. Missing a tier shows a subset of the art and
    // calls it the art; showing a tier too many previews a creature that
    // cannot turn up where the player is. NORMAL deals five, so the example
    // shows five.
    for (const tiers of LADDER_TIER_COUNTS) {
      for (const seed of [PREVIEW_SEED, 1, 99, 0xc0ffee]) {
        const board = clearedBoard(seed, tiers);
        expect(board.config.tiers).toBe(tiers);
        expect([...tiersOn(board)].sort((a, b) => a - b))
          .toEqual(Array.from({ length: tiers }, (_, i) => i + 1));
      }
    }
  });

  it('covers every tier count the ladders actually deal', () => {
    // If a ladder ever grows past what the example can build, this is the
    // alarm — the preview would silently start showing the wrong board.
    expect(LADDER_TIER_COUNTS.length).toBeGreaterThan(1);
    for (const tiers of LADDER_TIER_COUNTS) {
      expect(clearedBoard(PREVIEW_SEED, tiers).config.tiers).toBe(tiers);
    }
  });

  it('asks for at least one of every tier, so "one of each" is not luck', () => {
    // The generator deals exactly the quantities it is given, so the guarantee
    // above is a property of the config rather than of the seed. This is the
    // line that would have to change for the test above to start failing.
    for (const tiers of LADDER_TIER_COUNTS) {
      const quantity = clearedBoard(PREVIEW_SEED, tiers).config.quantity;
      expect(quantity).toHaveLength(tiers);
      for (const count of quantity) expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  it('gets more crowded as the tier count rises, the way a real ladder does', () => {
    // The slice is doing double duty: more tiers means more creatures, which
    // is what keeps the example about as dense as the board it stands for.
    const total = (tiers: number) =>
      clearedBoard(PREVIEW_SEED, tiers).config.quantity.reduce((a, b) => a + b, 0);
    expect(total(9)).toBeGreaterThan(total(5));
  });

  it('is genuinely finished, not a board dressed up as one', () => {
    // The effect fires over a won board in play, so it is shown over one here.
    const board = clearedBoard(7, 5);
    expect(board.status).toBe('won');
    expect(board.creaturesLeft()).toBe(0);
    expect(board.grid.flat().filter((c) => c.present && !c.open)).toHaveLength(0);
    expect(creatures(board).every((c) => !c.alive)).toBe(true);
  });

  it('gives a different layout per seed, and the same one twice', () => {
    // Test deals a new board on every press; the screen must not reshuffle on
    // an unrelated rebuild. Both need the seed to be the only thing deciding.
    const layout = (seed: number) =>
      clearedBoard(seed, 5).grid.flat().map((c) => c.tier).join(',');
    expect(layout(101)).toBe(layout(101));
    expect(layout(101)).not.toBe(layout(102));
  });
});

describe('the gallery examples', () => {
  it('shows creatures at all, or the icon gallery is showing nothing', () => {
    // A creature glyph is only visible once it has been beaten, so an example
    // with no defeated creature on it would be an icon picker with no icons.
    const open = creatures(sampleBoard()).filter((c) => c.open);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((c) => !c.alive)).toBe(true);
  });

  it('leaves covered ground as well, so the palette has both to show', () => {
    // Tile colour and floor colour are different settings on the same tile.
    const board = sampleBoard();
    expect(board.grid.flat().some((c) => c.present && c.open)).toBe(true);
    expect(board.grid.flat().some((c) => c.present && !c.open)).toBe(true);
  });

  it('is the same board every time it is asked for', () => {
    // Every tile in a gallery draws the same board, so the only thing that
    // differs between them is the setting. Memoised, so this is identity.
    expect(sampleBoard()).toBe(sampleBoard());
    expect(hexSampleBoard()).toBe(hexSampleBoard());
  });

  it('draws the cursor-highlight example on a hex board', () => {
    // It has to be hex. On a square board "true neighbours" and "flat 3x3
    // block" light the same eight cells, so the gallery would show two
    // identical pictures for two different settings.
    expect(hexSampleBoard().config.topology).toBe('hex');
    // And it must still be playing, or the highlight is not drawn at all.
    expect(hexSampleBoard().status).toBe('playing');
  });

  it('shows a creature and a number on the zoom example', () => {
    // The zoom example is two cells at the exact size being chosen; one of
    // them has to be a creature or the setting is judged on a blank tile.
    const board = zoomSampleBoard();
    expect(creatures(board)).toHaveLength(1);
    expect(board.grid.flat().every((c) => c.open)).toBe(true);
  });
});
