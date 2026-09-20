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
  MIN_MAX_ZOOM,
  OFF,
  HIGHLIGHT_NAMES,
  type HighlightStyle,
  type Settings,
} from './settings.js';
import {
  FONTS,
  PALETTE_IDS,
  PIP_NAMES,
  PIP_SHAPES,
  SFX_NAMES,
  VICTORY_NAMES,
  type FontId,
  type PipShape,
  type SfxPackId,
  type TypeTheme,
  type VictoryId,
  identityFor,
  themeFor,
} from './theme.js';
import { BoardView, type BoardDisplay } from './boardview.js';
import {
  PREVIEW_SEED,
  clearedBoard,
  hexSampleBoard,
  sampleBoard,
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
      chip.append(el('span', 'chip-label', c.label));
      chip.addEventListener('click', () => {
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
   * A slider with its value spelled out beside it.
   *
   * `input` rather than `change`, so the number under the thumb tracks the
   * drag — a ratio slider whose readout only lands on mouse-up is a slider you
   * have to aim blind.
   */
  const slider = (
    min: number, max: number, step: number, current: number,
    format: (v: number) => string,
    onSet: (value: number) => void,
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
    font: settings.fontStack(typeId),
    highlight: settings.highlightStyle(typeId),
    strikeDefeated: p.strikeDefeated,
    ...over,
  });

  /** One thumbnail of the standard example board. */
  const chipBoard = (theme: TypeTheme, over: Partial<BoardDisplay> = {}) => () =>
    renderPreview(sampleBoard(), theme, display(over), { cell: CHIP_CELL }).canvas;

  const look = section('Presentation',
    'None of this touches a rule, so none of it affects whether a board counts. ' +
    'Every example below is a real board drawn by the game’s own renderer.');

  // --- creature icons
  wideRow(look, 'Creature icons',
    'The shape of a creature’s pips. Pip colour stays global — a tier 4 is the same colour ' +
    'everywhere — and a creature is only ever visible once you have beaten it, which is why ' +
    'the examples show defeated ones.',
    gallery(
      [
        {
          value: DEFAULT,
          label: `Game type default — ${PIP_NAMES[themeFor(typeId).pip]}`,
          example: chipBoard({ ...currentTheme, pip: themeFor(typeId).pip }),
        },
        ...PIP_SHAPES.map((shape): Choice => ({
          value: shape,
          label: PIP_NAMES[shape],
          example: chipBoard({ ...currentTheme, pip: shape }),
        })),
      ],
      p.icons,
      (v) => pick({ icons: v as PipShape | typeof DEFAULT }),
    ));

  // --- board palette
  wideRow(look, 'Board palette',
    'Borrow another ladder’s colours for the board. The menus keep this ladder’s own accent, ' +
    'so the game stays navigable however far the board is repainted.',
    gallery(
      [
        {
          value: DEFAULT,
          label: `Game type default — ${typeName(typeId)}`,
          example: chipBoard({ ...themeFor(typeId), pip: currentPip }),
        },
        ...PALETTE_IDS.map((id): Choice => ({
          value: id,
          label: typeName(id),
          example: chipBoard({ ...themeFor(id), pip: currentPip }),
        })),
      ],
      p.palette,
      (v) => pick({ palette: v }),
    ));

  // --- font
  wideRow(look, 'Font',
    'Board numbers, marks and the interface. System stacks only, so nothing arrives late and ' +
    'reflows the board.',
    gallery(
      [
        {
          value: DEFAULT,
          label: `Game type default — ${FONTS[ident.font].name}`,
          example: chipBoard(currentTheme, { font: FONTS[ident.font].stack }),
        },
        ...(Object.keys(FONTS) as FontId[]).map((id): Choice => ({
          value: id,
          label: FONTS[id].name,
          example: chipBoard(currentTheme, { font: FONTS[id].stack }),
        })),
      ],
      p.font,
      (v) => pick({ font: v as FontId | typeof DEFAULT }),
    ));

  // --- cursor highlight
  //
  // Drawn on a HEX board, and that is not decoration. On a square board "true
  // neighbours" and "flat 3x3 block" light the same eight cells, so a square
  // example would show two identical pictures for two different settings.
  const hexChip = (highlight: HighlightStyle | null) => () =>
    renderPreview(hexSampleBoard(), currentTheme, display({ highlight }),
      { cell: CHIP_CELL, pin: { x: 2, y: 1 } }).canvas;

  wideRow(look, '3×3 cursor highlight',
    'What the cell under the cursor lights up. Shown here on a hex board, because that is where ' +
    'the first two differ: the default follows real adjacency, so it lights six cells on hex and ' +
    'jumps across a wrapped edge, where the flat block is always the same eight squares.',
    gallery(
      [
        {
          value: DEFAULT,
          label: 'Game type default — true neighbours',
          example: hexChip('neighbours'),
        },
        ...(Object.keys(HIGHLIGHT_NAMES) as HighlightStyle[]).map((id): Choice => ({
          value: id,
          label: HIGHLIGHT_NAMES[id],
          example: hexChip(id),
        })),
        { value: OFF, label: 'Off — no highlight', example: hexChip(null) },
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
