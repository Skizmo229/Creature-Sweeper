/**
 * The game screen's furniture: the HUD, the stage, the LV palette with the pencil and Sweep
 * controls, the spell row and the hint line. Built once per board; `hud.ts` fills it in on every
 * refresh. Every control reports through `GameScreenActions`, so this file decides nothing.
 */

import type { Game } from '../../engine/game.js';
import type { FullRun } from '../../engine/run.js';
import { SPELLS, type SpellId, spellKey } from '../../engine/spells.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import { TIER_GOLD, tierColor, tierGilded } from '../theme.js';
import { themeFor } from '../looks.js';

export interface GameScreenActions {
  openSettings(): void;
  leave(): void;
  pickTier(tier: number): void;
  /** The tier-0 pencil: switches to pencil mode and arms tier 0. */
  pencilEmpty(): void;
  toggleNotes(): void;
  sweep(useMarks: boolean): void;
  /** PATROL's Wait: the creatures take a step and nothing else happens. */
  wait(): void;
  pickSpell(id: SpellId): void;
  cancelSpell(): void;
}

/** The elements the refresh writes into. */
export interface GameScreenElements {
  root: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  hud: Record<string, HTMLElement>;
  counters: HTMLButtonElement[];
  emptyNoteBtn: HTMLButtonElement;
  notesBtn: HTMLButtonElement;
  sweepSafeBtn: HTMLButtonElement | null;
  sweepMarkBtn: HTMLButtonElement | null;
  /** PATROL's Wait, which also shows how many moves the board has seen. */
  waitBtn: HTMLButtonElement | null;
  spellBtns: HTMLButtonElement[];
  hint: HTMLParagraphElement;
}

export function buildGameScreen(
  game: Game,
  typeId: string,
  boardIndex: number,
  run: FullRun | null,
  a: GameScreenActions,
): GameScreenElements {
  const type = ladders.find((t) => t.id === typeId)!;
  const wrap = el('div', 'screen game');
  // The board wears the chosen palette; the screen around it keeps the ladder's own accent, so
  // the menus stay recognisable however the board is painted.
  wrap.style.setProperty('--tint', themeFor(typeId).accent);

  const { hudEl, hud } = buildHud(game, run, a);
  wrap.append(hudEl, boardLabel(type.name, game, boardIndex, run));

  const stage = el('div', 'stage');
  const canvas = el('canvas');
  stage.append(canvas);
  wrap.append(stage);

  const { palette, ...controls } = buildPalette(game, a);
  wrap.append(palette);
  const { row, spellBtns } = buildSpellRow(game, a);
  if (row) wrap.append(row);

  const hint = el('p', 'hint');
  wrap.append(hint);

  return { root: wrap, stage, canvas, hud, ...controls, spellBtns, hint };
}

/** The HUD: the readouts `hud.ts` fills in, and the Settings and Back buttons. */
function buildHud(
  game: Game,
  run: FullRun | null,
  a: GameScreenActions,
): { hudEl: HTMLElement; hud: Record<string, HTMLElement> } {
  const hudEl = el('div', 'hud');
  const hud: Record<string, HTMLElement> = {};
  const mk = (key: string, cls = '') => {
    // The key rides along as a class so each readout can reserve its own width.
    const span = el('span', `hud-item hud-${key} ${cls}`.trim());
    hud[key] = span;
    hudEl.append(span);
    return span;
  };
  mk('hp');
  mk('lv');
  mk('ex');
  mk('ne');
  if (game.spells.length) mk('mp', 'mana');
  // In a run, how far down the ladder you are is the one thing HP alone cannot tell you.
  if (run) mk('run', 'run');
  mk('t', 'right');
  // Spelled out rather than a gear glyph: the font is a player setting (decision 0021).
  const gear = el('button', 'ghost small', 'Settings');
  gear.title = 'Settings — the board is waiting exactly where you left it.';
  gear.addEventListener('click', a.openSettings);
  hudEl.append(gear);
  const back = el('button', 'ghost small', run ? 'Abandon' : 'Back');
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

/** The LV palette, which doubles as the per-tier counter, with the pencil and Sweep. */
function buildPalette(
  game: Game,
  a: GameScreenActions,
): Pick<
  GameScreenElements,
  'counters' | 'emptyNoteBtn' | 'notesBtn' | 'sweepSafeBtn' | 'sweepMarkBtn' | 'waitBtn'
> & { palette: HTMLElement } {
  const palette = el('div', 'palette');
  const counters: HTMLButtonElement[] = [];
  for (let tier = 1; tier <= game.config.tiers; tier++) {
    const btn = el('button', 'counter');
    btn.dataset.tier = String(tier);
    // Its tier's creature colour, as the HUD's level number wears it; tiers past five get the
    // gold their pips are ringed with, as the border.
    btn.style.setProperty('--tier', tierColor(tier));
    if (tierGilded(tier)) {
      btn.classList.add('gilded');
      btn.style.setProperty('--halo', TIER_GOLD);
    }
    btn.addEventListener('click', () => a.pickTier(tier));
    counters.push(btn);
    palette.append(btn);
  }
  // Tier 0 is a candidate only the pencil can hold: "this might just be ground" is a real
  // hypothesis on a board where most cells are. Hidden on SUDOKU, where no covered cell is empty.
  const emptyNoteBtn = el('button', 'counter note-empty', '0\nempty');
  emptyNoteBtn.title = 'Pencil "might be empty ground" — tier 0, no creature at all.';
  emptyNoteBtn.addEventListener('click', a.pencilEmpty);
  palette.append(emptyNoteBtn);

  // Labelled with the mode it is IN, not the mode it switches to (decision 0008).
  const notesBtn = el('button', 'ghost small', 'Entry: Mark');
  notesBtn.addEventListener('click', a.toggleNotes);
  palette.append(notesBtn);

  // A ladder without Sweep gets no buttons for it, rather than two dark ones.
  let sweepSafeBtn: HTMLButtonElement | null = null;
  let sweepMarkBtn: HTMLButtonElement | null = null;
  if (game.hasSweep) {
    sweepSafeBtn = el('button', 'sweep', 'Sweep');
    sweepSafeBtn.title = 'Open only what is proven safe at your level. Can never cost HP.';
    sweepSafeBtn.addEventListener('click', () => a.sweep(false));
    palette.append(sweepSafeBtn);

    // Where a mark is a creature's route rather than a claim, there is nothing for it to trust.
    if (game.marksAreClaims) {
      sweepMarkBtn = el('button', 'sweep assist', 'Sweep + marks');
      sweepMarkBtn.title =
        'Also trust your marks as correct tier claims. ' +
        'Reaches further, but a wrong mark can cost HP.';
      sweepMarkBtn.addEventListener('click', () => a.sweep(true));
      palette.append(sweepMarkBtn);
    }
  }
  let waitBtn: HTMLButtonElement | null = null;
  if (game.patrols) {
    waitBtn = el('button', 'sweep wait', '[W]ait');
    waitBtn.title = 'Let the creatures take a step without doing anything else. Costs nothing.';
    waitBtn.addEventListener('click', a.wait);
    palette.append(waitBtn);
  }
  return { palette, counters, emptyNoteBtn, notesBtn, sweepSafeBtn, sweepMarkBtn, waitBtn };
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
