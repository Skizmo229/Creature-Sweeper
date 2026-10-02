/**
 * The game screen's furniture: the HUD, the stage, the LV palette with the pencil and Sweep
 * controls, the spell row and the hint line. Built once per board; `hud.ts` fills it in on every
 * refresh. Every control reports through `GameScreenActions`, so this file decides nothing.
 */

import { findType } from '../../engine/config.js';
import type { Game } from '../../engine/game.js';
import type { FullRun } from '../../engine/run.js';
import { SPELLS, type SpellId, spellKey } from '../../engine/spells.js';
import { offersBeatenNumbers } from '../board/paint.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import { type TierPalette, tierColor, tierGilded } from '../tiercolors.js';
import { themeFor } from '../looks.js';

/** What the game screen's controls report to. */
export interface GameScreenActions {
  openSettings(): void;
  /** Leave the board, asking first whether to pause or abandon a game with anything in it. */
  leave(): void;
  /** Pause: the board waits on the board list, its clock stopped (decision 0057). */
  pause(): void;
  pickTier(tier: number): void;
  /** The tier-0 pencil: switches to pencil mode and arms tier 0. */
  pencilEmpty(): void;
  toggleNotes(): void;
  /** Show the number under every beaten creature, or their creatures again (decision 0067). */
  toggleBeatenNumbers(): void;
  sweep(useMarks: boolean): void;
  /** PATROL's Wait: the creatures take a step and nothing else happens. */
  wait(): void;
  /** The tutor: point at the next provable move, and why. */
  hint(): void;
  /** The field guide, at what the tutor is saying. */
  guide(): void;
  /** On a lesson board: go on to the next step. */
  next(): void;
  pickSpell(id: SpellId): void;
  cancelSpell(): void;
}

/**
 * The HUD's readouts, each a span `hud.ts` fills in, with `hud-` and its key as a class so each
 * can reserve its own width. Mana only on a ladder with spells, the run's place only in a run.
 */
export interface HudReadouts {
  hp: HTMLElement;
  lv: HTMLElement;
  ex: HTMLElement;
  ne: HTMLElement;
  mp: HTMLElement | null;
  run: HTMLElement | null;
  t: HTMLElement;
}

/** What the game screen is built from besides the game and its controls' actions. */
export interface GameScreenOptions {
  /** Whether the tutor is offered: without it, the board has no Hint button. */
  readonly tutor: boolean;
  /** The colour of each tier, which its LV button wears. */
  readonly tierColors: TierPalette;
  /** A school lesson's title, shown in place of the board's label; null on a ladder's board. */
  readonly lessonTitle: string | null;
}

/** The elements the refresh writes into. */
export interface GameScreenElements {
  root: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  hud: HudReadouts;
  counters: HTMLButtonElement[];
  emptyNoteBtn: HTMLButtonElement;
  notesBtn: HTMLButtonElement;
  /** The Beaten toggle; null on a board with no beaten creature's number to show. */
  numbersBtn: HTMLButtonElement | null;
  sweepSafeBtn: HTMLButtonElement | null;
  sweepMarkBtn: HTMLButtonElement | null;
  /** PATROL's Wait, which also shows how many moves the board has seen. */
  waitBtn: HTMLButtonElement | null;
  /** The tutor's button; null where the setting has switched the tutor off. */
  hintBtn: HTMLButtonElement | null;
  spellBtns: HTMLButtonElement[];
  hint: HTMLParagraphElement;
  /** Shown at the end of the hint line while the tutor speaks: the guide's entry for it. */
  more: HTMLButtonElement;
  /** Shown at the end of a lesson's line when its step waits to be told to go on. */
  next: HTMLButtonElement;
}

/**
 * The game screen for `game`, board `boardIndex` of ladder `typeId` (in `run`, if one), with every
 * control reporting to `a`. The caller puts it on the page and draws the board on its canvas.
 */
export function buildGameScreen(
  game: Game,
  typeId: string,
  boardIndex: number,
  run: FullRun | null,
  a: GameScreenActions,
  o: GameScreenOptions,
): GameScreenElements {
  const { lessonTitle } = o;
  const type = findType(ladders, typeId);
  const wrap = el('div', 'screen game');
  // The board wears the chosen palette; the screen around it keeps the ladder's own accent, so
  // the menus stay recognisable however the board is painted.
  wrap.style.setProperty('--tint', themeFor(typeId).accent);

  const { hudEl, hud } = buildHud(game, run, a, lessonTitle === null);
  wrap.append(
    hudEl,
    lessonTitle
      ? el('div', 'board-label', lessonTitle)
      : boardLabel(type.name, game, boardIndex, run),
  );

  const stage = el('div', 'stage');
  const canvas = el('canvas');
  stage.append(canvas);
  wrap.append(stage);

  const { palette, ...controls } = buildPalette(game, a, o);
  wrap.append(palette);
  const { row, spellBtns } = buildSpellRow(game, a);
  if (row) wrap.append(row);

  const hint = el('p', 'hint');
  wrap.append(hint);
  const more = el('button', 'hint-more', 'more [G]');
  more.title = 'Open the field guide at this trick.';
  more.addEventListener('click', a.guide);
  const next = el('button', 'primary small lesson-next', 'Next [Enter]');
  next.addEventListener('click', a.next);

  return { root: wrap, stage, canvas, hud, ...controls, spellBtns, hint, more, next };
}

/** The HUD: the readouts `hud.ts` fills in, and the Settings, Pause and Back buttons. */
function buildHud(
  game: Game,
  run: FullRun | null,
  a: GameScreenActions,
  pausable: boolean,
): { hudEl: HTMLElement; hud: HudReadouts } {
  const hudEl = el('div', 'hud');
  const readout = (key: keyof HudReadouts, cls = ''): HTMLElement => {
    const span = el('span', `hud-item hud-${key} ${cls}`.trim());
    hudEl.append(span);
    return span;
  };
  const hud: HudReadouts = {
    hp: readout('hp'),
    lv: readout('lv'),
    ex: readout('ex'),
    ne: readout('ne'),
    mp: game.spells.length ? readout('mp', 'mana') : null,
    // In a run, how far down the ladder you are is the one thing HP alone cannot tell you.
    run: run ? readout('run', 'run') : null,
    t: readout('t', 'right'),
  };
  // Spelled out rather than a gear glyph: the font is a player setting (decision 0021).
  const gear = el('button', 'ghost small', 'Settings');
  gear.title = 'Settings. The board waits.';
  gear.addEventListener('click', a.openSettings);
  hudEl.append(gear);
  // A lesson is not a game to come back to; it is started again from the school.
  if (pausable) {
    const pause = el('button', 'ghost small', 'Pause');
    pause.title = 'Pause [P]: the clock stops; resume from the board list.';
    pause.addEventListener('click', a.pause);
    hudEl.append(pause);
  }
  const back = el('button', 'ghost small', 'Back');
  back.addEventListener('click', a.leave);
  hudEl.append(back);
  return { hudEl, hud };
}

/** What board this is, and in a run, how far down the ladder and what the pool is. */
function boardLabel(
  typeName: string,
  game: Game,
  boardIndex: number,
  run: FullRun | null,
): HTMLElement {
  const size = `${game.config.width}×${game.config.height}`;
  const creatures = game.config.quantity.reduce((x, y) => x + y, 0);
  const label = el(
    'div',
    'board-label',
    run
      ? `${typeName} FULL RUN — board ${boardIndex} of ${run.boardCount} · ` +
          `${size} · ${creatures} creatures · ` +
          `pool ${run.maxHp}, +${run.healPerBoard} between boards`
      : `${typeName} — board ${boardIndex} · ${size} · ${creatures} creatures`,
  );
  if (run) label.classList.add('run');
  return label;
}

/** The LV palette, which doubles as the per-tier counter, with the pencil, Sweep and the tutor. */
function buildPalette(
  game: Game,
  a: GameScreenActions,
  o: GameScreenOptions,
): ReturnType<typeof buildTierCounters> &
  ReturnType<typeof buildBoardButtons> & { palette: HTMLElement } {
  const palette = el('div', 'palette');
  return {
    palette,
    ...buildTierCounters(palette, game, a, o.tierColors),
    ...buildBoardButtons(palette, game, a, o.tutor),
  };
}

/** A button per tier in its colour, then the empty pencil, each appended to `palette`. */
function buildTierCounters(
  palette: HTMLElement,
  game: Game,
  a: GameScreenActions,
  tierColors: TierPalette,
): Pick<GameScreenElements, 'counters' | 'emptyNoteBtn'> {
  const counters: HTMLButtonElement[] = [];
  for (let tier = 1; tier <= game.config.tiers; tier++) {
    const btn = el('button', 'counter');
    btn.dataset.tier = String(tier);
    // Its tier's creature colour, as the HUD's level number wears it; tiers past five get the
    // halo their pips are ringed with, as the border.
    btn.style.setProperty('--tier', tierColor(tierColors, tier));
    if (tierGilded(tier)) {
      btn.classList.add('gilded');
      btn.style.setProperty('--halo', tierColors.halo);
    }
    btn.addEventListener('click', () => a.pickTier(tier));
    counters.push(btn);
    palette.append(btn);
  }
  // Tier 0 is a candidate only the pencil can hold: "this might just be ground" is a real
  // hypothesis on a board where most cells are. Hidden on SUDOKU, where no covered cell is empty.
  const emptyNoteBtn = el('button', 'counter note-empty', '0\nempty');
  emptyNoteBtn.title = 'Pencil "might be empty ground".';
  emptyNoteBtn.addEventListener('click', a.pencilEmpty);
  palette.append(emptyNoteBtn);
  return { counters, emptyNoteBtn };
}

/**
 * The entry toggle, then where the board has each the Beaten toggle, Sweep and Sweep + marks,
 * PATROL's Wait and the tutor's Hint, each appended to `palette`.
 */
function buildBoardButtons(
  palette: HTMLElement,
  game: Game,
  a: GameScreenActions,
  tutor: boolean,
): Pick<
  GameScreenElements,
  'notesBtn' | 'numbersBtn' | 'sweepSafeBtn' | 'sweepMarkBtn' | 'waitBtn' | 'hintBtn'
> {
  // Labelled with the mode it is IN, not the mode it switches to (decision 0008).
  const notesBtn = el('button', 'ghost small', 'Entry: Mark');
  notesBtn.addEventListener('click', a.toggleNotes);
  palette.append(notesBtn);

  // What hover shows one cell at a time, for the whole board; on a touch screen, the only way to
  // see it. Labelled with what beaten creatures show now, as Entry is (decision 0008).
  let numbersBtn: HTMLButtonElement | null = null;
  if (offersBeatenNumbers(game)) {
    numbersBtn = el('button', 'ghost small', 'Beaten: Creature');
    numbersBtn.addEventListener('click', a.toggleBeatenNumbers);
    palette.append(numbersBtn);
  }

  // A ladder without Sweep gets no buttons for it, rather than two dark ones.
  let sweepSafeBtn: HTMLButtonElement | null = null;
  let sweepMarkBtn: HTMLButtonElement | null = null;
  if (game.hasSweep) {
    sweepSafeBtn = el('button', 'sweep', 'Sweep');
    sweepSafeBtn.title = 'Opens what is proven safe. Never costs HP.';
    sweepSafeBtn.addEventListener('click', () => a.sweep(false));
    palette.append(sweepSafeBtn);

    // Where a mark is a creature's route rather than a claim, there is nothing for it to trust.
    if (game.marksAreClaims) {
      sweepMarkBtn = el('button', 'sweep assist', 'Sweep + marks');
      sweepMarkBtn.title = 'Also trusts your marks. Reaches further; a wrong mark can cost HP.';
      sweepMarkBtn.addEventListener('click', () => a.sweep(true));
      palette.append(sweepMarkBtn);
    }
  }
  let waitBtn: HTMLButtonElement | null = null;
  if (game.patrols) {
    waitBtn = el('button', 'sweep wait', '[W]ait');
    waitBtn.title = 'The creatures take a step. Costs a second.';
    waitBtn.addEventListener('click', a.wait);
    palette.append(waitBtn);
  }
  // The tutor is the opposite of Sweep: it opens nothing and says why a cell could be. On every
  // ladder, EASY included, where there is no Sweep to lean on (docs/teaching-plan.md).
  let hintBtn: HTMLButtonElement | null = null;
  if (tutor) {
    hintBtn = el('button', 'sweep why', '[H]int');
    hintBtn.title =
      'Points at the next provable move and says why. Opens nothing; a hinted board sets no ' +
      'best time.';
    hintBtn.addEventListener('click', a.hint);
    palette.append(hintBtn);
  }
  return { notesBtn, numbersBtn, sweepSafeBtn, sweepMarkBtn, waitBtn, hintBtn };
}

/** The spell row, on a ladder that offers any: one button per spell, and Cancel. */
function buildSpellRow(
  game: Game,
  a: GameScreenActions,
): { row: HTMLElement | null; spellBtns: HTMLButtonElement[] } {
  const spellBtns: HTMLButtonElement[] = [];
  if (!game.spells.length) return { row: null, spellBtns };
  const row = el('div', 'palette spells');
  for (const id of game.spells) {
    const spell = SPELLS[id];
    const btn = el('button', 'spell');
    btn.dataset.spell = id;
    btn.title = `${spell.blurb} (${game.spellCost(id)} mana, or press ${spellKey(id).toUpperCase()})`;
    // WORKOUT's Exercise plays by different rules, and the tooltip is where every other
    // spell explains itself.
    if (id === 'exercise' && game.config.workout) {
      const w = game.config.workout;
      btn.title =
        `Fight your next battle 1 level higher, for ${w.expMultiplier}x EXP if you win. ` +
        `Costs ${w.base} and ${w.step} more each cast; each level-up takes ${w.relief} off ` +
        `(never below ${w.base}). Resets every board. Press ${spellKey(id).toUpperCase()}.`;
    }
    btn.addEventListener('click', () => a.pickSpell(id));
    spellBtns.push(btn);
    row.append(btn);
  }
  const cancel = el('button', 'ghost small', 'Cancel (Esc)');
  cancel.addEventListener('click', a.cancelSpell);
  row.append(cancel);
  return { row, spellBtns };
}
