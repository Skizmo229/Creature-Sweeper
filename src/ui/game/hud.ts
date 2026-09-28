/**
 * Filling the game screen in from the game: the readouts (words, not the original's four-letter
 * codes, and the level number in its tier's colour), the palette counters and their modes, the
 * Sweep buttons with their charge meter, the spell buttons, and the hint.
 */

import type { Game } from '../../engine/game.js';
import { hasNote } from '../../engine/notes.js';
import { placementRule } from '../../engine/placement/registry.js';
import type { FullRun } from '../../engine/run.js';
import { type SpellId, spellLabel } from '../../engine/spells.js';
import type { Cell } from '../../engine/types.js';
import { el } from '../dom.js';
import type { ClockStyle } from '../presentation.js';
import { type TierPalette, tierColor, tierGilded } from '../tiercolors.js';
import { hintText } from './hint.js';
import type { EntryMode } from './mode.js';
import type { GameScreenElements } from './screen.js';
import type { LessonLine } from '../teaching.js';

const pad = (n: number, width: number) => String(Math.max(0, Math.floor(n))).padStart(width, '0');

/** Whether "might be empty ground" is a hypothesis this board can hold at all. */
function canPencilEmpty(game: Game | null): boolean {
  return !game || placementRule(game.config.placement).coveredCanBeEmpty;
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

/** The Beaten toggle, labelled with what beaten creatures show now, as Entry is (decision 0067). */
function syncBeatenToggle(btn: HTMLButtonElement, on: boolean): void {
  btn.textContent = on ? 'Beaten: Number' : 'Beaten: Creature';
  btn.title = on
    ? 'Every beaten creature shows the number under it. U shows the creatures again.'
    : 'Beaten creatures show the creature; hover one for its number. U shows every number.';
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', String(on));
}

export interface HudState {
  game: Game;
  run: FullRun | null;
  boardIndex: number;
  mode: EntryMode;
  hovered: Cell | null;
  /** What the tutor is saying, in place of the hint line, while a lesson is showing. */
  tutor: string | null;
  /** On a lesson board, what the lesson says there instead of the hint. */
  lesson: LessonLine | null;
  /** The colour of each tier, which the level number wears. */
  tierColors: TierPalette;
  /** Whether every beaten creature shows its number: what the Beaten toggle says. */
  beatenNumbers: boolean;
  /** Whether the hint line says what a click does; the tutor and a lesson speak there anyway. */
  hintLine: boolean;
}

/** Everything on the screen that reads the game, brought up to date. */
export function syncGameScreen(els: GameScreenElements, s: HudState): void {
  const { game, mode } = s;

  els.hud.hp!.textContent = `HP ${game.hp}`;
  // The level number wears its tier's creature colour, the one encoding of a tier the whole game
  // shares; tiers past five carry the halo their pips do, or Level 6 reads as Level 1.
  const levelNum = el('span', 'hud-level-num', String(game.level));
  levelNum.style.color = tierColor(s.tierColors, game.level);
  if (tierGilded(game.level)) {
    levelNum.classList.add('gilded');
    levelNum.style.setProperty('--halo', s.tierColors.halo);
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
    ? 'Clicks pencil the selected tier as a candidate. N switches to marks.'
    : 'Clicks mark the selected tier. N switches to the pencil.';
  els.notesBtn.classList.toggle('active', mode.notesMode);
  if (els.numbersBtn) syncBeatenToggle(els.numbersBtn, s.beatenNumbers);
  // The tier-0 pencil only exists while pencilling, and only on a board that can still be
  // hiding empty ground.
  els.emptyNoteBtn.hidden = !mode.notesMode || !canPencilEmpty(game);
  els.emptyNoteBtn.classList.toggle('active', mode.notesMode && mode.markMode === 0);
  gatePalette(els, game, mode, s.hovered);
  // The tutor speaks where the hint does, and in the ink rather than the hint's grey: it is the
  // thing the player just asked for.
  els.hint.textContent = s.tutor ?? s.lesson?.say ?? hintText(game, mode);
  els.hint.hidden = !s.hintLine && s.tutor === null && s.lesson === null;
  els.hint.classList.toggle('tutoring', s.tutor !== null);
  els.hint.classList.toggle('teaching', s.tutor === null && s.lesson !== null);
  if (s.tutor !== null) els.hint.append(' ', els.more);
  else if (s.lesson) {
    if (s.lesson.refused) els.hint.prepend(el('span', 'refused', `${s.lesson.refused} `));
    if (s.lesson.next) els.hint.append(' ', els.next);
  }
  if (els.whyBtn) els.whyBtn.disabled = game.status !== 'playing';

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
        ? 'Sweep is off in Settings.'
        : sweepMode === 'charge'
          ? `Cells opened by hand charge Sweep: ${game.chargeNeeded} per use, ` +
            `${game.charge} banked.`
          : 'Opens what is proven safe. Never costs HP.';
  }
  // The move count is what a player times a creature's walk by: every creature was on its route's
  // corner at move 0 and walks one cell a move.
  if (els.waitBtn) els.waitBtn.textContent = `[W]ait · move ${game.moves}`;
  if (els.sweepMarkBtn) {
    // Only offered when the marks actually buy something the proof cannot.
    const extra = markCount - safeCount;
    els.sweepMarkBtn.textContent =
      sweepMode === 'off' ? 'Sweep off' : extra > 0 ? `Sweep + marks +${extra}` : 'Sweep + marks';
    els.sweepMarkBtn.disabled = gated || extra <= 0;
  }
}

/** A count of seconds as the clock setting shows it: the seconds, or minutes and seconds. */
export function clockText(seconds: number, style: ClockStyle): string {
  if (style !== 'minutes') return String(seconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The clock readout, in the style the player chose, or hidden. "LEFT" rather than a glyph,
 * because the font is a player setting.
 */
export function syncClock(
  els: GameScreenElements,
  elapsed: number,
  left: number | null,
  style: ClockStyle,
): void {
  const t = els.hud.t;
  if (!t) return;
  t.hidden = style === 'hidden';
  t.textContent =
    left === null ? `TIME ${clockText(elapsed, style)}` : `TIME ${clockText(left, style)} LEFT`;
  // Under ten seconds it reads like the HP counter does: it is the number about to end the board.
  t.classList.toggle('low', left !== null && left <= 10);
}
