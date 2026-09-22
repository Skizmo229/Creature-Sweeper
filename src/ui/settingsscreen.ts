/**
 * The settings screen.
 *
 * Built as a detached element and handed back, rather than reaching into the
 * app: it needs the settings store, the ladder the player came from and a way
 * home, and nothing else. That keeps it testable and keeps `app.ts` from
 * growing a third of its length in form-building.
 *
 * THINGS WORTH KEEPING.
 *
 * **Every visual setting shows its options rather than naming them.** A
 * dropdown reading "Gems" or "DUNGEON" asks the player to imagine the result
 * and then go and check; a row of little boards showing the actual result asks
 * nothing. The examples are real `Game`s drawn by the real `BoardView` — see
 * `preview.ts` for why an approximation was not an option — and every tile in
 * a gallery draws the *same* board, so the only thing that differs between
 * them is the setting itself.
 *
 * **Every "game type default" option says what it resolves to.** "Game type
 * default" on its own is a promise with no content. Naming the answer, and now
 * drawing it too, is what makes the deferral legible.
 *
 * **The record status line is live.** Whether a clear will be written down is
 * a consequence of these dials, and one the player only discovers at the end
 * of a board is discovered too late.
 *
 * Picking any visual option rebuilds the screen. It has to: the galleries are
 * drawn in terms of each other — the icon examples wear the chosen palette,
 * the palette examples wear the chosen icon — so changing one setting changes
 * what every other gallery should be showing. Scroll position is carried over
 * so the rebuild is invisible.
 */

import {
  type SweepMode,
  easierThanDefault,
  isAtLeastAsHard,
  isDefaultGameplay,
} from '../engine/settings.js';
import {
  DEFAULT,
  MAX_MAX_ZOOM,
  MAX_TEXT_SIZE,
  MIN_MAX_ZOOM,
  MIN_TEXT_SIZE,
  OFF,
  HIGHLIGHT_NAMES,
  // HOVER_DEFEATED_NAMES,   // the disabled hover row, below
  type HighlightStyle,
  // type HoverDefeated,     // the disabled hover row, below
  type Settings,
} from './settings.js';
import {
  PALETTE_IDS,
  PIP_NAMES,
  PIP_SHAPES,
  SFX_NAMES,
  VICTORY_NAMES,
  type PipShape,
  type SfxPackId,
  type TypeTheme,
  type VictoryId,
  identityFor,
  themeFor,
  tierColor,
} from './theme.js';
import { FONTS, FONT_IDS, type FontId, LEGIBLE_FONT, TYPE_FONTS } from './typefaces.js';
import { BoardView, type BoardDisplay } from './boardview.js';
import {
  PREVIEW_SEED,
  clearedBoard,
  HIGHLIGHT_PIN,
  highlightSampleBoard,
  sampleBoard,
  // topDefeatedCell,         // the disabled hover row, below
  zoomSampleBoard,
} from './preview.js';
import type { Game } from '../engine/game.js';
import { randomSeed } from '../engine/rng.js';
import { playVictory } from './victory.js';
import { ladders } from './ladders.js';
import type { SfxEvent } from './sfx.js';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Cell size for a gallery thumbnail. Below about 24 the pip shapes stop
 *  being tellable apart, which would defeat the point of the icon gallery. */
const CHIP_CELL = 26;
/** Cell size for the cleared board the clear effect is demonstrated on. The
 *  icon effects animate the creatures themselves, so they need room to move. */
const DEMO_CELL = 22;

/**
 * The board-clear demo currently running, if any.
 *
 * Module-level because a screen rebuild throws away the element the effect is
 * drawing into, and an orphaned `requestAnimationFrame` loop on a detached
 * canvas is exactly the leak `endVictory` exists to prevent on the game
 * screen.
 */
let stopDemo: (() => void) | null = null;

/**
 * The layout the clear-effect demo is currently showing.
 *
 * Module-level so it OUTLIVES a rebuild. Picking a palette or a font rebuilds
 * the whole screen, and a demo board that reshuffled itself every time an
 * unrelated setting moved would be noise; this way the board only changes when
 * the player asks it to, by pressing Test.
 */
let demoSeed = PREVIEW_SEED;

interface PreviewOptions {
  /** Cell size in CSS pixels. */
  cell: number;
  /** A cell to hold highlighted, for the cursor-highlight examples. */
  pin?: { x: number; y: number };
}

/**
 * Render one example board into a fresh canvas and hand back both.
 *
 * Lives here rather than beside the boards in `preview.ts` so that file stays
 * free of the DOM and can be imported by a headless test — see its header.
 *
 * The view is returned as well as the canvas because two callers need to keep
 * driving it: the zoom example re-renders as its slider moves, and the
 * clear-effect demo re-seats a new board on it and then lends it to the
 * effect.
 */
function renderPreview(
  game: Game, theme: TypeTheme, display: BoardDisplay, opts: PreviewOptions,
): { canvas: HTMLCanvasElement; view: BoardView } {
  const canvas = document.createElement('canvas');
  const view = new BoardView(canvas, {
    onOpen: () => { /* an example is not playable */ },
    onCycleMark: () => { /* nor markable */ },
    onHover: () => { /* nor hovered */ },
  }, { interactive: false, fixedCell: opts.cell });
  view.setGame(game, theme, display);
  if (opts.pin) view.pinHover(opts.pin.x, opts.pin.y);
  return { canvas, view };
}

export interface SettingsScreenOptions {
  settings: Settings;
  /** The ladder the player came from — what "game type default" refers to. */
  typeId: string;
  /**
   * Creature tiers on the board they came from.
   *
   * The clear-effect example carries one of each and none above, so it shows
   * the creatures that can actually turn up where the player is: five on
   * NORMAL, nine on HUGE. Showing the full nine everywhere would preview
   * creatures most ladders never deal.
   */
  tiers: number;
  onBack: () => void;
  /** Play a sound so a pack can be heard while it is being chosen. */
  onPreview: (event: SfxEvent) => void;
}

interface Choice {
  value: string;
  label: string;
  /** The example for this option, if it has a drawn one. */
  example?: () => HTMLElement;
  /**
   * A face to set the label in. The font setting dresses the interface as well
   * as the board, so each font tile's own caption is the interface example.
   */
  labelFont?: string;
  /**
   * Clicking this tile opens something instead of picking its value — the
   * "User choice" tile, which opens the window of every option.
   */
  open?: () => void;
}

function typeName(typeId: string): string {
  return ladders.find((t) => t.id === typeId)?.name ?? typeId.toUpperCase();
}

export function buildSettingsScreen(opts: SettingsScreenOptions): HTMLElement {
  const { settings, typeId, tiers, onBack, onPreview } = opts;

  stopDemo?.();
  stopDemo = null;

  const wrap = el('div', 'screen settings-screen');
  wrap.style.setProperty('--tint', themeFor(typeId).accent);

  const head = el('header', 'title-bar');
  const back = el('button', 'ghost', '← Back');
  back.addEventListener('click', onBack);
  head.append(back);
  head.append(el('h1', undefined, 'Settings'));
  head.append(el('p', 'sub',
    `“Game type default” follows whichever ladder you are on — shown here for ${typeName(typeId)}.`));
  wrap.append(head);

  // --------------------------------------------------------------- helpers

  const section = (title: string, blurb?: string): HTMLElement => {
    const box = el('section', 'settings-group');
    box.append(el('h2', 'settings-head', title));
    if (blurb) box.append(el('p', 'settings-blurb', blurb));
    wrap.append(box);
    return box;
  };

  const row = (host: HTMLElement, label: string, control: HTMLElement, hint?: string): void => {
    const line = el('div', 'settings-row');
    const text = el('div', 'settings-label');
    text.append(el('span', 'settings-name', label));
    if (hint) text.append(el('span', 'settings-hint', hint));
    line.append(text, control);
    host.append(line);
  };

  /** A row whose control is a gallery, so it gets the full width. */
  const wideRow = (host: HTMLElement, label: string, hint: string, control: HTMLElement): void => {
    const line = el('div', 'settings-row wide');
    const text = el('div', 'settings-label');
    text.append(el('span', 'settings-name', label));
    text.append(el('span', 'settings-hint', hint));
    line.append(text, control);
    host.append(line);
  };

  /**
   * A row of option tiles, each showing what it does.
   *
   * Picking usually rebuilds the whole screen, because the drawn galleries
   * describe each other — see the file header. `live` is for the two settings
   * nothing else is drawn in terms of: sound and the clear effect. Those
   * update their own tiles in place, which is what lets picking one *play* it
   * on the spot rather than replacing the element mid-demonstration.
   */
  const gallery = (
    choices: Choice[], current: string, onPick: (value: string) => void,
    live = false,
  ): HTMLElement => {
    const box = el('div', 'settings-gallery');
    for (const c of choices) {
      const chip = el('button', 'preview-chip');
      const active = c.value === current;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
      if (c.example) chip.append(c.example());
      const caption = el('span', 'chip-label', c.label);
      if (c.labelFont) caption.style.fontFamily = c.labelFont;
      chip.append(caption);
      if (c.open) chip.setAttribute('aria-haspopup', 'dialog');
      chip.addEventListener('click', () => {
        if (c.open) { c.open(); return; }
        if (live) {
          for (const other of box.children) {
            const on = other === chip;
            other.classList.toggle('active', on);
            other.setAttribute('aria-pressed', String(on));
          }
        }
        onPick(c.value);
      });
      box.append(chip);
    }
    return box;
  };

  /**
   * A window holding every option of one setting, over the settings screen.
   *
   * It lives inside this screen's own element, so the rebuild that follows a
   * pick — or leaving the screen by any route — takes it away with everything
   * else, and no path can strand it. Escape closes it, and is caught before
   * it reaches the app, where Escape on a board-in-progress would mean
   * something else entirely. Its examples are drawn only when it opens, which
   * is also what stopped every pick on this screen redrawing some sixty
   * thumbnails nobody was looking at.
   */
  const openPicker = (
    title: string, options: Choice[], current: string, onPick: (value: string) => void,
  ): void => {
    const overlay = el('div', 'overlay picker');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    const card = el('div', 'overlay-card picker-card');
    const head = el('div', 'picker-head');
    const close = el('button', 'ghost small', 'Close (Esc)');
    head.append(el('h2', undefined, title), close);

    const dismiss = (): void => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (!overlay.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      // Immediate as well: an event dispatched at the window itself would
      // otherwise still reach the app's own listener there.
      e.stopImmediatePropagation();
      dismiss();
    };
    close.addEventListener('click', dismiss);
    // A click on the dimmed backdrop, not on the card, closes it too.
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
    window.addEventListener('keydown', onKey, true);

    card.append(head, gallery(options, current, (v) => { dismiss(); onPick(v); }));
    overlay.append(card);
    wrap.append(overlay);
    (card.querySelector<HTMLElement>('.preview-chip.active') ?? close).focus();
  };

  /**
   * A setting with more options than a row can show: two tiles, the game
   * type's own and the player's own, and every option in a window behind the
   * second. The "user choice" tile wears the option chosen, so both tiles
   * still show what they do; before anything is chosen it says how many
   * there are to choose from.
   */
  const choiceRow = (host: HTMLElement, spec: {
    label: string;
    hint: string;
    /** What the window is titled — "Choose a font". */
    title: string;
    current: string;
    /** The game type default, already naming what it resolves to. */
    fallback: Choice;
    options: Choice[];
    onPick: (value: string) => void;
  }): void => {
    const chosen = spec.current === DEFAULT
      ? undefined
      : spec.options.find((o) => o.value === spec.current);
    const placeholder = (): HTMLElement =>
      el('div', 'picker-placeholder', `${spec.options.length} to choose from`);
    const user: Choice = {
      // Matches `current` only when an option is chosen, so the tile is lit
      // exactly when the player's choice is the one in force.
      value: chosen ? chosen.value : '',
      label: chosen ? `User choice — ${chosen.label}` : 'User choice — pick one',
      example: chosen?.example ?? placeholder,
      ...(chosen?.labelFont ? { labelFont: chosen.labelFont } : {}),
      open: () => openPicker(spec.title, spec.options, spec.current, spec.onPick),
    };
    wideRow(host, spec.label, spec.hint,
      gallery([spec.fallback, user], spec.current, spec.onPick));
  };

  /**
   * A slider with its value spelled out beside it.
   *
   * `input` rather than `change`, so the number under the thumb tracks the
   * drag — a ratio slider whose readout only lands on mouse-up is a slider you
   * have to aim blind. `onCommit`, if given, fires once on release, for a
   * setting too big to apply on every frame of a drag.
   */
  const slider = (
    min: number, max: number, step: number, current: number,
    format: (v: number) => string,
    onSet: (value: number) => void,
    onCommit?: (value: number) => void,
  ): HTMLElement => {
    const box = el('div', 'settings-slider');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(current);
    const read = el('span', 'settings-value', format(current));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      read.textContent = format(v);
      onSet(v);
    });
    if (onCommit) input.addEventListener('change', () => onCommit(Number(input.value)));
    box.append(input, read);
    return box;
  };

  const toggle = (current: boolean, onSet: (v: boolean) => void): HTMLElement => {
    const label = el('label', 'toggle');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = current;
    box.addEventListener('change', () => onSet(box.checked));
    label.append(box, el('span', undefined, 'On'));
    return label;
  };

  const ratio = (v: number) => `×${v.toFixed(2)}`;

  // ---------------------------------------------------------- presentation

  const p = settings.presentation;
  const ident = identityFor(typeId);

  /** This ladder's icon as things currently stand — what a palette tile wears. */
  const currentPip: PipShape = p.icons === DEFAULT ? themeFor(typeId).pip : p.icons;
  /** This ladder's palette as things currently stand — what an icon tile wears. */
  const currentTheme: TypeTheme = settings.themeFor(typeId);

  const display = (over: Partial<BoardDisplay> = {}): BoardDisplay => ({
    maxCell: p.maxZoom,
    font: settings.font(typeId),
    highlight: settings.highlightStyle(typeId),
    strikeDefeated: p.strikeDefeated,
    hoverDefeated: p.hoverDefeated,
    ...over,
  });

  /** One thumbnail of the standard example board. */
  const chipBoard = (theme: TypeTheme, over: Partial<BoardDisplay> = {}) => () =>
    renderPreview(sampleBoard(), theme, display(over), { cell: CHIP_CELL }).canvas;

  const look = section('Presentation',
    'None of this touches a rule, so none of it affects whether a board counts. ' +
    'Every example below is a real board drawn by the game’s own renderer.');

  // --- creature icons
  //
  // This row and the next two show the game type default and the player's own
  // choice, with every option in a window behind the second — see `choiceRow`.
  choiceRow(look, {
    label: 'Creature icons',
    hint: 'The shape of a creature’s pips. Pip colour stays global — a tier 4 is the same ' +
      'colour everywhere — and a creature is only ever visible once you have beaten it, which ' +
      'is why the examples show defeated ones.',
    title: 'Choose creature icons',
    current: p.icons,
    fallback: {
      value: DEFAULT,
      label: `Default — ${PIP_NAMES[themeFor(typeId).pip]}`,
      example: chipBoard({ ...currentTheme, pip: themeFor(typeId).pip }),
    },
    options: PIP_SHAPES.map((shape): Choice => ({
      value: shape,
      label: PIP_NAMES[shape],
      example: chipBoard({ ...currentTheme, pip: shape }),
    })),
    onPick: (v) => pick({ icons: v as PipShape | typeof DEFAULT }),
  });

  // --- board palette
  choiceRow(look, {
    label: 'Board palette',
    hint: 'Borrow another ladder’s colours for the board. The menus keep this ladder’s own ' +
      'accent, so the game stays navigable however far the board is repainted.',
    title: 'Choose a board palette',
    current: p.palette,
    fallback: {
      value: DEFAULT,
      label: `Default — ${typeName(typeId)}`,
      example: chipBoard({ ...themeFor(typeId), pip: currentPip }),
    },
    options: PALETTE_IDS.map((id): Choice => ({
      value: id,
      label: typeName(id),
      example: chipBoard({ ...themeFor(id), pip: currentPip }),
    })),
    onPick: (v) => pick({ palette: v }),
  });

  // --- font
  //
  // Each tile names the ladder the face belongs to, because "Pirata One" alone
  // tells a player nothing about why it is here.
  const fontOwner = (id: FontId): string => {
    if (id === LEGIBLE_FONT) return 'easiest to read';
    const owner = Object.keys(TYPE_FONTS).find((t) => TYPE_FONTS[t] === id);
    return owner ? typeName(owner) : '';
  };
  choiceRow(look, {
    label: 'Font',
    hint: 'Board numbers, marks and the whole interface. Every ladder has a face of its own; ' +
      `${FONTS[LEGIBLE_FONT].name} belongs to none of them — it was designed for readers with ` +
      'low vision, and keeps every digit easy to tell apart. The game’s title keeps its own ' +
      'face unless you choose one.',
    title: 'Choose a font',
    current: p.font,
    fallback: {
      value: DEFAULT,
      label: `Default — ${FONTS[ident.font].name}`,
      example: chipBoard(currentTheme, { font: FONTS[ident.font] }),
      labelFont: FONTS[ident.font].stack,
    },
    options: FONT_IDS.map((id): Choice => ({
      value: id,
      label: [FONTS[id].name, fontOwner(id)].filter(Boolean).join(' — '),
      example: chipBoard(currentTheme, { font: FONTS[id] }),
      labelFont: FONTS[id].stack,
    })),
    onPick: (v) => pick({ font: v as FontId | typeof DEFAULT }),
  });

  // --- text size
  //
  // The whole page is the example, but not DURING a drag: resizing every line
  // on the screen moves the slider out from under the pointer mid-drag. So a
  // copy of the HUD follows the thumb, and the page itself changes once, on
  // release.
  const textDemo = el('div', 'hud text-size-demo');
  // The real HUD's own classes, so each readout reserves the width it does in play.
  for (const [key, item] of [['hp', 'HP 10'], ['lv', 'Level '], ['ex', 'EXP 0'], ['ne', 'Next Level 6']]) {
    textDemo.append(el('span', `hud-item hud-${key}`, item));
  }
  // Level 1, in tier 1's colour, as the real readout draws it.
  const demoLevel = el('span', 'hud-level-num', '1');
  demoLevel.style.color = tierColor(1);
  textDemo.querySelector('.hud-lv')!.append(demoLevel);
  const showTextSize = (size: number): void => {
    // Relative to what the page is already set at, which is what rem means.
    textDemo.style.setProperty('--demo-scale', String(size / p.textSize));
  };
  const textControl = el('div', 'settings-stack');
  textControl.dataset.setting = 'textSize';
  textControl.append(slider(MIN_TEXT_SIZE, MAX_TEXT_SIZE, 0.05, p.textSize,
    (v) => `${Math.round(v * 100)}%`,
    showTextSize,
    (v) => {
      // Rebuilding reflows everything above this row, so hold the row where
      // the player's pointer left it rather than where the scroll offset says.
      const before = textControl.getBoundingClientRect().top;
      pick({ textSize: v });
      const after = document.querySelector('[data-setting="textSize"]')?.getBoundingClientRect().top;
      if (after !== undefined) window.scrollBy(0, after - before);
    }));
  textControl.append(textDemo);

  wideRow(look, 'Text size',
    'The HUD, the menus and this screen. The board is left alone — it is sized by its cells, ' +
    'which the zoom controls.',
    textControl);

  // --- cursor highlight
  //
  // Drawn on the grid of the ladder the player came from: hex on HIVE, square
  // boxes everywhere else. See `highlightSampleBoard`.
  const hex = ladders.find((t) => t.id === typeId)?.topology === 'hex';
  const highlightChip = (highlight: HighlightStyle | null) => () =>
    renderPreview(highlightSampleBoard(hex ? 'hex' : 'square'), currentTheme,
      display({ highlight }), { cell: CHIP_CELL, pin: HIGHLIGHT_PIN }).canvas;

  wideRow(look, '3×3 cursor highlight',
    hex
      ? 'What the cell under the cursor lights up, on this ladder’s hexagons. The default follows ' +
        'real adjacency, so it lights the six cells around it, where the flat block is always ' +
        'the same eight.'
      : 'What the cell under the cursor lights up. On square cells the default and the flat block ' +
        'light the same eight; they part on a hex board, where the default lights six, and across ' +
        'a wrapped edge, which only the default jumps.',
    gallery(
      [
        {
          value: DEFAULT,
          label: 'Game type default — true neighbours',
          example: highlightChip('neighbours'),
        },
        ...(Object.keys(HIGHLIGHT_NAMES) as HighlightStyle[]).map((id): Choice => ({
          value: id,
          label: HIGHLIGHT_NAMES[id],
          example: highlightChip(id),
        })),
        { value: OFF, label: 'Off — no highlight', example: highlightChip(null) },
      ],
      p.highlight,
      (v) => pick({ highlight: v as HighlightStyle | typeof DEFAULT | typeof OFF }),
    ));

  // --- strike through defeated creatures
  wideRow(look, 'Strike out defeated creatures',
    'The diagonal line across a creature you have beaten. With it off, the dimmed glyph carries ' +
    '“dealt with” on its own — which reads more cleanly at small cell sizes, where the stroke ' +
    'crosses the pips.',
    gallery(
      [
        {
          value: 'on',
          label: 'Struck through',
          example: chipBoard(currentTheme, { strikeDefeated: true }),
        },
        {
          value: 'off',
          label: 'Left plain',
          example: chipBoard(currentTheme, { strikeDefeated: false }),
        },
      ],
      p.strikeDefeated ? 'on' : 'off',
      (v) => pick({ strikeDefeated: v === 'on' }),
    ));

  // --- what the cursor does to a beaten creature — DISABLED
  //
  // The cursor over a beaten creature now shows the number underneath it,
  // so this setting has nothing left to decide and the row is hidden. The
  // saved value is kept, and the renderer's half is commented out in
  // `BoardView.drawOpen`; bring both back together.
  //
  // // --- what the cursor does to a beaten creature
  // //
  // // Pinned on the highest-tier defeated creature, because a hover setting
  // // about defeated creatures is invisible pinned anywhere else — and a
  // // thumbnail has no cursor to hover with. The board carries TWO beaten
  // // creatures and only one is pinned, so every tile shows the chosen
  // // treatment beside an untouched one rather than asking the player to
  // // remember what the last tile looked like.
  // const hoverChip = (hoverDefeated: HoverDefeated) => () =>
  //   renderPreview(sampleBoard(), currentTheme, display({ hoverDefeated }),
  //     { cell: CHIP_CELL, pin: topDefeatedCell(sampleBoard()) }).canvas;
  //
  // wideRow(look, 'Hovering a creature you have beaten',
  //   'Its level is already there to be counted off the pips, so showing it as a digit gives ' +
  //   'nothing away — it just saves the counting, which is worth most on the nine-tier ladders. ' +
  //   'The digit wears that level’s own colour, so it can never be mistaken for the cell’s number. ' +
  //   'Restyling the glyph is the thin one for now: every creature is drawn from the same die-face ' +
  //   'pips, so it changes the shape and nothing else until there is real art to swap to.',
  //   gallery(
  //     [
  //       { value: 'none', label: HOVER_DEFEATED_NAMES.none, example: hoverChip('none') },
  //       { value: 'tier', label: HOVER_DEFEATED_NAMES.tier, example: hoverChip('tier') },
  //       // One of these is always the shape the board is ALREADY drawn in, so
  //       // its tile is pixel-identical to "Nothing" — measured, not guessed.
  //       // That is truthful and reads as a broken tile, which is the same trap
  //       // the cursor-highlight gallery once escaped by moving to a hex board
  //       // (it follows the ladder's grid now, and accepts the identical pair on
  //       // square ladders). It cannot be escaped that way here, because these tiles have
  //       // to wear the player's own icon or they are previewing someone else's
  //       // board. So it is named instead, the way "game type default" names
  //       // what it resolves to.
  //       ...PIP_SHAPES.map((id): Choice => ({
  //         value: id,
  //         label: id === currentTheme.pip
  //           ? `Restyle to ${PIP_NAMES[id].toLowerCase()} — already the shape in use`
  //           : `Restyle to ${PIP_NAMES[id].toLowerCase()}`,
  //         example: hoverChip(id),
  //       })),
  //     ],
  //     p.hoverDefeated,
  //     (v) => pick({ hoverDefeated: v as HoverDefeated }),
  //   ));

  // --- maximum zoom
  //
  // The example is drawn at the exact size being chosen, so the slider reads
  // in the units it actually controls rather than in an abstract number.
  const zoomBox = el('div', 'zoom-demo');
  const drawZoom = (cell: number): void => {
    zoomBox.replaceChildren(
      renderPreview(zoomSampleBoard(), currentTheme, display(), { cell }).canvas,
    );
  };
  drawZoom(p.maxZoom);

  const zoomControl = el('div', 'settings-stack');
  zoomControl.append(slider(MIN_MAX_ZOOM, MAX_MAX_ZOOM, 4, p.maxZoom,
    (v) => `${Math.round(v)}px per cell`,
    (v) => {
      const cell = Math.round(v);
      // Redrawn in place rather than rebuilding the screen: this fires on
      // every frame of a drag, and forty thumbnails a frame is not a slider.
      drawZoom(cell);
      settings.setPresentation({ maxZoom: cell });
    }));
  zoomControl.append(zoomBox);

  wideRow(look, 'Maximum zoom in',
    'How far scroll and +/- can magnify a board, shown here at actual size. Zooming out is ' +
    'limited by what fits on screen, never by this — a board too big for the stage always shrinks ' +
    'past it.',
    zoomControl);

  // --- sound
  //
  // The example is the sound itself, so picking one plays it.
  wideRow(look, 'Sound effects',
    'Synthesised rather than sampled — a pack is a table of tones, not a folder of files. ' +
    'Picking one plays it.',
    gallery(
      [
        { value: DEFAULT, label: `Game type default — ${SFX_NAMES[ident.sfx]}` },
        ...(Object.keys(SFX_NAMES) as SfxPackId[]).map((id): Choice =>
          ({ value: id, label: SFX_NAMES[id] })),
        { value: OFF, label: 'Off — silent' },
      ],
      p.sfx,
      (v) => {
        settings.setPresentation({ sfx: v as SfxPackId | typeof DEFAULT | typeof OFF });
        // The store has already re-pointed the mixer, so this plays the pack
        // just chosen — a pack picked from a name alone is picked blind.
        onPreview('levelup');
      },
      true,
    ));

  // --- board clear effect
  //
  // The demo board is kept, rather than rebuilt per play, because half these
  // effects animate its creatures and need to borrow the glyphs off the view
  // that is drawing them.
  const demo = renderPreview(
    clearedBoard(demoSeed, tiers), currentTheme, display(), { cell: DEMO_CELL },
  );
  const demoBox = el('div', 'clear-demo');
  demoBox.append(demo.canvas);

  const testBtn = el('button', 'primary small', 'Test on a new board');

  const syncTest = (): void => {
    const effect = settings.victoryEffect(typeId);
    testBtn.disabled = effect === null;
    testBtn.title = effect === null
      ? 'The clear effect is off, so there is nothing to play.'
      : 'Clear a freshly generated board and play the effect over it.';
  };

  const runDemo = (): void => {
    stopDemo?.();
    stopDemo = null;
    const effect = settings.victoryEffect(typeId);
    if (!effect) return;
    stopDemo = playVictory(demoBox, effect, currentTheme, demo.view.victorySource());
  };

  /**
   * Deal a new board, then play the effect over it.
   *
   * Re-seating the game on the existing view rather than building a new canvas:
   * the board's dimensions do not change, so the element keeps its size and
   * nothing in the page moves — and `victorySource()` reads whatever game the
   * view is holding, so the effect picks up the new creatures for free.
   *
   * Stopping first is not optional. The running effect is holding the old
   * board's glyphs hidden, and swapping the game under it would strand that
   * flag on a board nothing is going to hand it back to.
   */
  const freshDemo = (): void => {
    stopDemo?.();
    stopDemo = null;
    demoSeed = randomSeed();
    demo.view.setGame(clearedBoard(demoSeed, tiers), currentTheme, display());
    runDemo();
  };

  syncTest();
  testBtn.addEventListener('click', freshDemo);

  const demoWrap = el('div', 'settings-stack');
  demoWrap.append(
    gallery(
      [
        { value: DEFAULT, label: `Game type default — ${VICTORY_NAMES[ident.victory]}` },
        ...(Object.keys(VICTORY_NAMES) as VictoryId[]).map((id): Choice =>
          ({ value: id, label: VICTORY_NAMES[id] })),
        { value: OFF, label: 'Off — no effect' },
      ],
      p.victory,
      (v) => {
        settings.setPresentation({ victory: v as VictoryId | typeof DEFAULT | typeof OFF });
        syncTest();
        // An effect is a two-second thing, so the only example it can have is
        // itself. Picking one plays it — over the SAME board, deliberately, so
        // the gallery stays a comparison between effects rather than between
        // effects and layouts. Test is the one that deals a new board.
        runDemo();
      },
      true,
    ),
    demoBox,
    testBtn,
  );

  wideRow(look, 'Board clear effect',
    'Picking one plays it below, over a board that is genuinely finished — every creature on it ' +
    'has been beaten — so you are seeing it over exactly what it runs over in play. The last ' +
    `seven take the board’s own creatures rather than drawing over the top of them, and the ` +
    `example carries one of each of the ${tiers} creature tiers ${typeName(typeId)} uses. ` +
    'Picking replays on the same board so the effects can be compared; Test deals a new one.',
    demoWrap);

  // -------------------------------------------------------------- gameplay

  const play = section('Gameplay',
    'These change the rules. Settings that make the game HARDER record normally; ' +
    'any setting easier than the tuned game means a clear is not written down at all.');

  const g = () => settings.gameplay;

  const status = el('p', 'settings-status');
  const refreshStatus = (): void => {
    const s = g();
    const easier = easierThanDefault(s);
    if (isDefaultGameplay(s)) {
      status.textContent = 'Tuned game — everything records.';
      status.className = 'settings-status ok';
    } else if (isAtLeastAsHard(s)) {
      status.textContent = 'Harder than tuned — clears, unlocks and best times all record.';
      status.className = 'settings-status ok';
    } else {
      status.textContent =
        `Nothing will record: ${easier.join(', ')} ` +
        `${easier.length === 1 ? 'is' : 'are'} easier than the tuned game. ` +
        'No clear, no unlock, no best time.';
      status.className = 'settings-status warn';
    }
  };

  const gameplayRow = (
    label: string, key: 'hpRatio' | 'hpRegenRatio' | 'enemyDamageRatio'
      | 'manaRegenRatio' | 'manaRewardRatio',
    max: number, hint: string,
  ): void => {
    row(play, label,
      slider(0, max, 0.05, g()[key], ratio, (v) => {
        settings.setGameplay({ [key]: Math.round(v * 100) / 100 });
        refreshStatus();
      }),
      hint);
  };

  gameplayRow('Player HP', 'hpRatio', 3,
    'Scales the board’s HP pool. Never below 1 — a board entered at 0 HP is not a board.');
  gameplayRow('Full run HP regen', 'hpRegenRatio', 1,
    'Fraction of the pool healed after each cleared board of a Full Run, rounded down. ' +
    'Nothing heals inside a board: HP is a guess budget, not a combat resource. Default ×0.50.');
  gameplayRow('Creature damage', 'enemyDamageRatio', 3,
    'Scales what a creature’s retaliation costs. A fight at or below your level is free at any setting.');
  gameplayRow('Mana regen', 'manaRegenRatio', 3,
    'Scales the exploration trickle — mana earned per empty cell you uncover yourself. ×0 switches it off.');
  gameplayRow('Mana per creature', 'manaRewardRatio', 3,
    'Scales the mana a defeated creature pays. Its EXP is never scaled — the level gates are exact totals.');

  const sweepBox = el('div', 'settings-stack');
  const chargeRow = el('div', 'settings-subrow');
  const drawCharge = (): void => {
    chargeRow.hidden = g().sweep !== 'charge';
  };
  const sweepSelect = el('select', 'settings-select');
  for (const [value, label] of [
    ['on', 'On — always available'],
    ['charge', 'Charged — banked by opening cells'],
    ['off', 'Off — open everything by hand'],
  ]) {
    const option = el('option', undefined, label);
    option.value = value!;
    sweepSelect.append(option);
  }
  sweepSelect.value = g().sweep;
  sweepSelect.addEventListener('change', () => {
    settings.setGameplay({ sweep: sweepSelect.value as SweepMode });
    drawCharge();
    refreshStatus();
  });
  sweepBox.append(sweepSelect);
  chargeRow.append(el('span', 'settings-sub-name', 'Cells per sweep'));
  chargeRow.append(slider(1, 50, 1, g().sweepChargeClicks,
    (v) => `${Math.round(v)} cells`,
    (v) => { settings.setGameplay({ sweepChargeClicks: Math.round(v) }); refreshStatus(); }));
  sweepBox.append(chargeRow);
  drawCharge();
  row(play, 'Sweep', sweepBox,
    'Charged mode banks one charge per cell you open by hand. Cells a sweep opens never charge it, ' +
    'or a sweep would pay for the next one.');

  row(play, 'Time attack',
    toggle(g().timeAttack, (v) => { settings.setGameplay({ timeAttack: v }); refreshStatus(); }),
    'Replaying a board you have a best time on counts DOWN from it, and reaching zero loses the board. ' +
    'A board with no best time has nothing to race, and plays normally.');

  refreshStatus();
  play.append(status);

  // ----------------------------------------------------------------- tools

  const tools = el('div', 'tools');
  const resetLook = el('button', 'ghost', 'Reset presentation');
  resetLook.addEventListener('click', () => { settings.resetPresentation(); rebuild(); });
  const resetPlay = el('button', 'ghost', 'Reset gameplay');
  resetPlay.addEventListener('click', () => { settings.resetGameplay(); rebuild(); });
  tools.append(resetLook, resetPlay);
  wrap.append(tools);

  /** Save a visual setting and redraw every example against it. */
  function pick(patch: Parameters<Settings['setPresentation']>[0]): void {
    settings.setPresentation(patch);
    rebuild();
  }

  /**
   * Rebuild in place.
   *
   * The galleries are drawn in terms of each other, and a reset moves every
   * control at once, so writing changes back into a form built control by
   * control would need a list of every widget on the screen. Rebuilding from
   * the same store cannot drift from what was saved. Scroll position is
   * carried across, or every pick would throw the player back to the top.
   */
  function rebuild(): void {
    const y = window.scrollY;
    const fresh = buildSettingsScreen(opts);
    wrap.replaceWith(fresh);
    window.scrollTo({ top: y });
  }

  return wrap;
}
