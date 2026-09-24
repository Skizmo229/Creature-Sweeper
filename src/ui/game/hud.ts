/**
 * Filling the game screen in from the game: the readouts (words, not the original's four-letter
 * codes, and the level number in its tier's colour), the palette counters and their modes, the
 * Sweep buttons with their charge meter, the spell buttons, and the hint.
 */

import type { Game } from '../../engine/game.js';
import { hasNote } from '../../engine/notes.js';
import type { FullRun } from '../../engine/run.js';
import { type SpellId, spellLabel } from '../../engine/spells.js';
import type { Cell } from '../../engine/types.js';
import { el } from '../dom.js';
import { TIER_GOLD, tierColor, tierGilded } from '../theme.js';
import { hintText } from './hint.js';
import type { EntryMode } from './mode.js';
import type { GameScreenElements } from './screen.js';

const pad = (n: number, width: number) => String(Math.max(0, Math.floor(n))).padStart(width, '0');

/** Whether "might be empty ground" is a hypothesis this board can hold at all. */
function canPencilEmpty(game: Game | null): boolean {
  return game?.config.placement !== 'sudoku';
}

/**
 * While pencilling, strike through the palette tiers the hovered cell has already ruled out: the
 * answer `toggleNote` will give, shown before the click. A candidate already pencilled is never
 * struck, because taking it off is always allowed. Nothing is struck with nothing hovered.
 */
export function gatePalette(
  els: GameScreenElements,
  game: Game | null,
  mode: EntryMode,
  cell: Cell | null,
): void {
  const mask =
    game && mode.notesMode && cell && !cell.open && !cell.given
      ? game.noteCandidates(cell) | cell.notes
      : ~0;
  for (const btn of els.counters) {
    btn.classList.toggle('ruled-out', !hasNote(mask, Number(btn.dataset.tier)));
  }
  els.emptyNoteBtn.classList.toggle('ruled-out', !hasNote(mask, 0));
}

export interface HudState {
  game: Game;
  run: FullRun | null;
  boardIndex: number;
  mode: EntryMode;
  hovered: Cell | null;
}

/** Everything on the screen that reads the game, brought up to date. */
export function syncGameScreen(els: GameScreenElements, s: HudState): void {
  const { game, mode } = s;

  els.hud.hp!.textContent = `HP ${game.hp}`;
  // The level number wears its tier's creature colour, the one encoding of a tier the whole game
  // shares; tiers past five carry the gold halo their pips do, or Level 6 reads as Level 1.
  const levelNum = el('span', 'hud-level-num', String(game.level));
  levelNum.style.color = tierColor(game.level);
  if (tierGilded(game.level)) {
    levelNum.classList.add('gilded');
    levelNum.style.setProperty('--halo', TIER_GOLD);
  }
  els.hud.lv!.replaceChildren('Level ', levelNum);
  // A standing Exercise is a level carried into the next fight, shown on the level until spent.
  if (game.exerciseCharge > 0) {
    els.hud.lv!.append(el('span', 'hud-buff', ` +${game.exerciseCharge}`));
  }
  els.hud.ex!.textContent = `EXP ${game.ex}`;
  els.hud.ne!.textContent = `Next Level ${game.progression.toNext()}`;
  els.hud.hp!.classList.toggle('low', game.hp <= Math.max(1, game.maxHp * 0.3));
  if (els.hud.run && s.run) {
    els.hud.run.textContent = `RUN${s.boardIndex}/${s.run.boardCount}`;
  }

  for (const btn of els.counters) {
    const tier = Number(btn.dataset.tier);
    btn.textContent = `LV ${tier}\n×${pad(game.counterFor(tier), 2)}`;
    btn.classList.toggle('active', mode.markMode === tier);
    btn.classList.toggle('done', game.counterFor(tier) <= 0);
  }
  els.notesBtn.textContent = mode.notesMode ? 'Entry: Pencil' : 'Entry: Mark';
  els.notesBtn.title = mode.notesMode
    ? 'Clicking a cell pencils the selected tier as a candidate. Press N for marks.'
    : 'Clicking a cell claims the selected tier. Press N to pencil candidates instead.';
  els.notesBtn.classList.toggle('active', mode.notesMode);
  // The tier-0 pencil only exists while pencilling, and only on a board that can still be
  // hiding empty ground.
  els.emptyNoteBtn.hidden = !mode.notesMode || !canPencilEmpty(game);
  els.emptyNoteBtn.classList.toggle('active', mode.notesMode && mode.markMode === 0);
  gatePalette(els, game, mode, s.hovered);
  els.hint.textContent = hintText(game, mode);

  if (els.hud.mp) {
    els.hud.mp.textContent = `MP ${game.mana}`;
    els.hud.mp.classList.toggle('charged', game.exerciseCharge > 0);
  }
  for (const btn of els.spellBtns) {
    const id = btn.dataset.spell as SpellId;
    btn.textContent = `${spellLabel(id)} ${game.spellCost(id)}`;
    btn.disabled = !game.canCast(id);
    btn.classList.toggle('armed', mode.pendingSpell === id);
  }
  els.stage.classList.toggle('targeting', mode.pendingSpell !== null);

  const sweepMode = game.settings.sweep;
  const gated = !game.sweepAvailable;
  const safeCount = sweepMode === 'off' ? 0 : game.safeCells({ useMarks: false }).length;
  const markCount = sweepMode === 'off' ? 0 : game.safeCells({ useMarks: true }).length;
  if (els.sweepSafeBtn) {
    // The meter goes on the button, because what the player needs to know is why THIS control
    // is dark.
    els.sweepSafeBtn.textContent =
      sweepMode === 'off'
        ? 'Sweep off'
        : gated
          ? `Sweep (${game.charge}/${game.chargeNeeded})`
          : safeCount > 0
            ? `Sweep ${safeCount}`
            : 'Sweep';
    els.sweepSafeBtn.disabled = gated || safeCount === 0;
    els.sweepSafeBtn.title =
      sweepMode === 'off'
        ? 'Sweep is switched off in Settings — every cell is opened by hand.'
        : sweepMode === 'charge'
          ? `Opening cells by hand charges Sweep. ${game.chargeNeeded} per use; ` +
            `${game.charge} banked. Cells a sweep opens do not charge it.`
          : 'Open only what is proven safe at your level. Can never cost HP.';
  }
  if (els.sweepMarkBtn) {
    // Only offered when the marks actually buy something the proof cannot.
    const extra = markCount - safeCount;
    els.sweepMarkBtn.textContent =
      sweepMode === 'off' ? 'Sweep off' : extra > 0 ? `Sweep + marks +${extra}` : 'Sweep + marks';
    els.sweepMarkBtn.disabled = gated || extra <= 0;
  }
}

/** The clock readout. "LEFT" rather than a glyph, because the font is a player setting. */
export function syncClock(els: GameScreenElements, elapsed: number, left: number | null): void {
  const t = els.hud.t;
  if (!t) return;
  t.textContent = left === null ? `TIME ${elapsed}` : `TIME ${left} LEFT`;
  // Under ten seconds it reads like the HP counter does: it is the number about to end the board.
  t.classList.toggle('low', left !== null && left <= 10);
}
