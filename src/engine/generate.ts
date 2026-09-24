/**
 * Dealing creatures into a board: the shape, then the placement rule, then the numbers.
 */

import type { BoardConfig, Cell } from './types.js';
import { type Rng, shuffle } from './rng.js';
import { SUDOKU_SIZE, generateSudokuBoard } from './placement/sudoku.js';
import { type Shade, shadeAt, shadeForTier } from './placement/checker.js';
import { choosePairs, isPaired } from './placement/pairs.js';
import { dealTiles, setsIn } from './placement/dominoes.js';
import { choosePacks, dealPacks, isPacked, packsIn } from './placement/packs.js';
import { chooseLines, dealLines } from './placement/congo.js';
import { type Grid, type Mask, computeNumbers, makeCell, neighbours } from './grid.js';
import { buildShape } from './shape.js';

/**
 * Place exactly `quantity[i]` creatures of tier i+1.
 *
 * Uniformly at random among the cells a creature may stand on, which is every
 * present cell on most boards, room floor only in a dungeon, and the squares
 * of the matching colour under the checkerboard rule.
 *
 * The pairing rule is the one placement that chooses its cells before it
 * chooses its tiers: `choosePairs` lays down the dominoes, and the deal that
 * follows is the ordinary shuffle-and-take over exactly those cells. That
 * split is what keeps pairing tier-blind, which is what keeps it clear of C_k.
 */
export function generateGrid(cfg: BoardConfig, rng: Rng): Grid {
  const grid: Grid = [];
  for (let y = 0; y < cfg.height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < cfg.width; x++) row.push(makeCell(x, y));
    grid.push(row);
  }

  if (cfg.placement === 'sudoku') {
    fillSudoku(cfg, grid, rng);
    computeNumbers(grid, cfg.topology, cfg.wrap);
    return grid;
  }

  // Everywhere but the dungeon these are the same mask, so the pool below is
  // "every cell that exists" exactly as it always was.
  let spawnable: Mask | null = null;
  if (cfg.shape !== 'rect') {
    const shape = buildShape(cfg.shape, cfg.shapeParam, cfg.width, cfg.height, rng);
    for (let y = 0; y < cfg.height; y++)
      for (let x = 0; x < cfg.width; x++) {
        grid[y]![x]!.present = shape.present[y]![x]!;
      }
    spawnable = shape.spawnable;
  }

  // One pool per colour under the checkerboard rule, one pool for everything
  // else. A tier is then dealt from the pool its parity belongs to, and the
  // deal itself is the same shuffle-and-take it has always been — the rule
  // narrows where a tier may land, it never changes how many of them there are.
  const checker = cfg.placement === 'checker';
  const pools = new Map<Shade | 'any', number[]>();
  const poolFor = (key: Shade | 'any'): number[] => {
    const found = pools.get(key);
    if (found) return found;
    const made: number[] = [];
    pools.set(key, made);
    return made;
  };

  for (let i = 0; i < cfg.width * cfg.height; i++) {
    const y = Math.floor(i / cfg.width);
    const x = i % cfg.width;
    if (!grid[y]![x]!.present) continue;
    if (spawnable && !spawnable[y]![x]) continue;
    poolFor(checker ? shadeAt(x, y) : 'any').push(i);
  }
  for (const pool of pools.values()) shuffle(pool, rng);

  // The pack rule deals its own tiers, for DOMINOES's reason: one of every tier
  // has to land in each PACK, so the grouping `choosePacks` returns must reach
  // the deal intact, and the ordinary shuffle-and-take below would scatter it.
  if (isPacked(cfg.placement)) {
    const count = packsIn(cfg.tiers, cfg.quantity);
    if (count === null) {
      throw new Error(
        `board ${cfg.typeId}#${cfg.board}: quantity [${cfg.quantity.join(',')}] is not ` +
          `a whole number of packs — a pack is one of each of the ${cfg.tiers} tiers`,
      );
    }
    const flatNeighbours = (flat: number): number[] =>
      neighbours(grid, flat % cfg.width, Math.floor(flat / cfg.width), cfg.topology, cfg.wrap).map(
        (n) => n.y * cfg.width + n.x,
      );
    // A congo line is a pack with a shape and an order, and it comes back
    // leader first so the deal can put the strongest tier at the front.
    const dealt =
      cfg.placement === 'congo'
        ? dealLines(
            chooseLines(
              poolFor('any'),
              flatNeighbours,
              cfg.width,
              cfg.height,
              count,
              cfg.tiers,
              rng,
            ),
            cfg.tiers,
            rng,
          )
        : dealPacks(
            choosePacks(poolFor('any'), flatNeighbours, count, cfg.tiers, rng),
            cfg.tiers,
            rng,
          );
    for (const [flat, tier] of dealt) {
      const cell = grid[Math.floor(flat / cfg.width)]![flat % cfg.width]!;
      cell.tier = tier;
      cell.alive = true;
    }
    computeNumbers(grid, cfg.topology, cfg.wrap);
    return grid;
  }

  // The pairing rule picks WHERE before it picks WHAT: the dominoes are laid
  // down first, and the pool then narrows to exactly the cells they occupy, so
  // the deal below is the same shuffle-and-take it has always been and the
  // rule never learns what a tier is. The second shuffle matters — pairs come
  // back partner-adjacent, so dealing straight off them would put tier 1 on
  // the pairs that happened to be placed first.
  const paired = isPaired(cfg.placement);
  if (paired) {
    const total = cfg.quantity.reduce((a, b) => a + b, 0);
    const flatNeighbours = (flat: number): number[] =>
      neighbours(grid, flat % cfg.width, Math.floor(flat / cfg.width), cfg.topology, cfg.wrap).map(
        (n) => n.y * cfg.width + n.x,
      );
    const chosen = choosePairs(poolFor('any'), flatNeighbours, total, rng);

    // A domino board deals TILES, not tiers, so it must keep the pair order
    // `choosePairs` returned — the two ends of a tile have to land on the two
    // halves of one domino. It writes the tiers itself and skips the ordinary
    // deal below, which would shuffle the pairs apart.
    if (cfg.placement === 'dominoes') {
      const sets = setsIn(cfg.tiers, cfg.quantity);
      if (sets === null) {
        throw new Error(
          `board ${cfg.typeId}#${cfg.board}: quantity [${cfg.quantity.join(',')}] is not ` +
            `a whole number of double-${cfg.tiers} domino sets`,
        );
      }
      for (const [flat, tier] of dealTiles(chosen, cfg.tiers, sets, rng)) {
        const cell = grid[Math.floor(flat / cfg.width)]![flat % cfg.width]!;
        cell.tier = tier;
        cell.alive = true;
      }
      computeNumbers(grid, cfg.topology, cfg.wrap);
      return grid;
    }
    pools.set('any', shuffle(chosen, rng));
  }

  const taken = new Map<Shade | 'any', number>();
  for (let t = 0; t < cfg.quantity.length; t++) {
    const count = cfg.quantity[t]!;
    const tier = t + 1;
    const key: Shade | 'any' = checker ? shadeForTier(tier) : 'any';
    const pool = poolFor(key);
    const at = taken.get(key) ?? 0;
    if (at + count > pool.length) {
      throw new Error(
        `board ${cfg.typeId}#${cfg.board}: tier ${tier} does not fit — ` +
          `${at + count} creatures want ${pool.length} cells` +
          (checker
            ? ` on the ${key} squares, which is every tier of that parity`
            : ` shape "${cfg.shape}" leaves them, and a dungeon keeps its ` +
              `hallways and doorways clear`),
      );
    }
    for (let k = 0; k < count; k++) {
      const idx = pool[at + k]!;
      const cell = grid[Math.floor(idx / cfg.width)]![idx % cfg.width]!;
      cell.tier = tier;
      cell.alive = true;
    }
    taken.set(key, at + count);
  }

  computeNumbers(grid, cfg.topology, cfg.wrap);
  return grid;
}

/**
 * Lay the tiers out as a Sudoku solution and pin the givens as marks.
 *
 * Givens are placed here rather than by the Game because they are part of the
 * board, not of play: the same seed must produce the same clues. They are
 * truthful marks, which is the same thing Reveal produces, so every rule that
 * already trusts a mark — the guard, mark-assisted Sweep — reads them without
 * knowing where they came from.
 */
function fillSudoku(cfg: BoardConfig, grid: Grid, rng: Rng): void {
  if (cfg.width !== SUDOKU_SIZE || cfg.height !== SUDOKU_SIZE) {
    throw new Error(
      `${cfg.typeId}#${cfg.board}: sudoku placement needs a ` +
        `${SUDOKU_SIZE}x${SUDOKU_SIZE} board, got ${cfg.width}x${cfg.height}`,
    );
  }
  // The gates the generator has to prove a guess-free path through. Thresholds
  // are what decides when a tier becomes openable, so a board generated
  // against the wrong ones would be provably clear for a player who does not
  // exist.
  const board = generateSudokuBoard(rng, cfg.givens, cfg.exp, cfg.startLevel);
  for (let y = 0; y < SUDOKU_SIZE; y++) {
    for (let x = 0; x < SUDOKU_SIZE; x++) {
      const cell = grid[y]![x]!;
      cell.tier = board.grid[y]![x]!;
      cell.alive = cell.tier > 0;
    }
  }
  for (const flat of board.givens) {
    const cell = grid[Math.floor(flat / SUDOKU_SIZE)]![flat % SUDOKU_SIZE]!;
    cell.mark = cell.tier;
    cell.given = true;
  }
}
