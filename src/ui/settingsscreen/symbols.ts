/**
 * The custom creature icon: every symbol in Dingbats and Wingdings 1 to 3, in a window over the
 * settings screen, each set laid out as its own code chart, sixteen to a row. Pointing at a
 * symbol, or moving the focus onto one, shows it on the standard example board; clicking one
 * chooses it, and "Use this symbol" or a double click saves it as the icon.
 */

import { el } from '../dom.js';
import type { GlyphPip, Pip } from '../looks.js';
import {
  type PipSymbol,
  SYMBOL_COUNT,
  SYMBOL_SETS,
  type SymbolSet,
  findSymbol,
  isGlyphPip,
} from '../pipsymbols.js';
import type { ScreenContext } from './context.js';
import { settingsWindow } from './widgets.js';

/** A code chart's width, as the fonts' own charts are laid out. */
const CHART_COLUMNS = 16;
/** The first position a Wingdings font draws in: 0x20, the space, left blank here. */
const FIRST_WINGDINGS_ROW = 0x20;
/** Where the Dingbats block begins, so each symbol sits at its offset into the block. */
const DINGBATS_START = 0x2700;

/** The set the window last showed, so it reopens where the player left it. */
let lastSet = SYMBOL_SETS[0]!.id;

/** A symbol's place in its set's chart. */
function position(symbol: PipSymbol): number {
  return symbol.code === null
    ? parseInt(symbol.pip.slice(2), 16) - DINGBATS_START
    : symbol.code - FIRST_WINGDINGS_ROW;
}

/** Where a symbol comes from: its font and position, and its code point. */
function whereFrom(set: SymbolSet, symbol: PipSymbol): string {
  const code = symbol.code === null ? '' : ` · 0x${symbol.code.toString(16).toUpperCase()}`;
  return `${set.name}${code} · ${symbol.pip}`;
}

/** Every position in the chart, a symbol or a gap, so each lands in its own column. */
function chartCells(set: SymbolSet): (PipSymbol | null)[] {
  const cells: (PipSymbol | null)[] = [];
  for (const s of set.symbols) cells[position(s)] = s;
  const rows = Math.ceil(cells.length / CHART_COLUMNS);
  return Array.from({ length: rows * CHART_COLUMNS }, (_, i) => cells[i] ?? null);
}

/**
 * The arrow keys move through the chart, a row or a column at a time, passing over the gaps. One
 * listener on the chart rather than one per symbol.
 */
function chartKeys(chart: HTMLElement, cellsNow: () => (HTMLElement | null)[]): void {
  const steps: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -CHART_COLUMNS,
    ArrowDown: CHART_COLUMNS,
  };
  chart.addEventListener('keydown', (e) => {
    const step = steps[e.key];
    const cells = cellsNow();
    const from = cells.indexOf(document.activeElement as HTMLElement);
    if (step === undefined || from < 0) return;
    e.preventDefault();
    for (let i = from + step; i >= 0 && i < cells.length; i += step) {
      const next = cells[i];
      if (next) {
        next.focus();
        return;
      }
    }
  });
}

type Located = { set: SymbolSet; symbol: PipSymbol };

interface ExamplePanel {
  panel: HTMLElement;
  /** Show a symbol on the example board, or the chosen one again. */
  show(at: Located | null): void;
  /** The "Use this symbol" button is live only once there is a symbol to use. */
  canUse(yes: boolean): void;
}

/**
 * The chosen or pointed-at symbol on the standard example board, its name and where it comes
 * from, and the button that saves it. The board is drawn once per frame at most, however fast the
 * pointer crosses the chart.
 */
function examplePanel(ctx: ScreenContext, onUse: () => void): ExamplePanel {
  const panel = el('div', 'symbol-side');
  const example = el('div', 'symbol-example');
  const name = el('div', 'symbol-name');
  const where = el('div', 'symbol-where');
  const use = el('button', 'primary symbol-use', 'Use this symbol');
  use.addEventListener('click', onUse);
  panel.append(example, name, where, use);

  let shown: string | null = null;
  let frame = 0;
  return {
    panel,
    show(at) {
      const key = at?.symbol.pip ?? '';
      if (key === shown) return;
      shown = key;
      name.textContent = at ? at.symbol.name : 'Point at a symbol to see it on the board';
      where.textContent = at ? whereFrom(at.set, at.symbol) : '';
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        example.replaceChildren(
          at
            ? ctx.chipBoard({ ...ctx.currentTheme, pip: at.symbol.pip })()
            : el('div', 'picker-placeholder', 'No symbol chosen'),
        );
      });
    },
    canUse(yes) {
      use.toggleAttribute('disabled', !yes);
    },
  };
}

function markChosen(btn: Element, on: boolean): void {
  btn.classList.toggle('chosen', on);
  btn.setAttribute('aria-pressed', String(on));
}

export function openSymbolWindow(
  ctx: ScreenContext,
  current: Pip,
  onPick: (pip: GlyphPip) => void,
): void {
  const { card, dismiss } = settingsWindow(ctx.host, 'Custom creature icon', 'symbol-card');
  const found = isGlyphPip(current) ? findSymbol(current) : undefined;
  let chosen: Located | null = found ?? null;
  let setId = found?.set.id ?? lastSet;

  const commit = (): void => {
    if (!chosen) return;
    dismiss();
    onPick(chosen.symbol.pip);
  };
  const side = examplePanel(ctx, commit);
  const tabs = el('div', 'symbol-tabs');
  tabs.setAttribute('role', 'tablist');
  const chart = el('div', 'symbol-chart');
  const body = el('div', 'symbol-body');
  body.append(chart, side.panel);
  card.append(
    el(
      'p',
      'settings-blurb',
      `${SYMBOL_COUNT} symbols: all of Dingbats and Wingdings 1 to 3. On the board each is ` +
        'drawn in its tier’s colour, like any icon.',
    ),
    tabs,
    body,
  );

  let cells: (HTMLElement | null)[] = [];
  const drawChart = (): void => {
    const set = SYMBOL_SETS.find((s) => s.id === setId) ?? SYMBOL_SETS[0]!;
    for (const tab of tabs.children) {
      const on = (tab as HTMLElement).dataset.set === set.id;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    }
    cells = chartCells(set).map((symbol) => {
      if (!symbol) return null;
      const btn = el('button', 'symbol-cell', symbol.char);
      btn.title = `${symbol.name} — ${whereFrom(set, symbol)}`;
      btn.setAttribute('aria-label', symbol.name);
      const here = { set, symbol };
      markChosen(btn, chosen?.symbol.pip === symbol.pip);
      btn.addEventListener('pointerenter', () => side.show(here));
      btn.addEventListener('focus', () => side.show(here));
      btn.addEventListener('click', () => {
        chosen = here;
        for (const other of chart.querySelectorAll('.symbol-cell.chosen')) markChosen(other, false);
        markChosen(btn, true);
        side.canUse(true);
        side.show(here);
      });
      btn.addEventListener('dblclick', commit);
      return btn;
    });
    chart.replaceChildren(...cells.map((c) => c ?? el('span', 'symbol-gap')));
  };
  chartKeys(chart, () => cells);
  chart.addEventListener('pointerleave', () => side.show(chosen));

  for (const set of SYMBOL_SETS) {
    const tab = el('button', 'symbol-tab', `${set.name} (${set.symbols.length})`);
    tab.setAttribute('role', 'tab');
    tab.dataset.set = set.id;
    tab.addEventListener('click', () => {
      setId = set.id;
      lastSet = set.id;
      drawChart();
    });
    tabs.append(tab);
  }

  drawChart();
  side.canUse(chosen !== null);
  side.show(chosen);
  (chart.querySelector<HTMLElement>('.symbol-cell.chosen') ??
    tabs.querySelector<HTMLElement>('.symbol-tab.active'))!.focus();
}
