/**
 * Screens and wiring: ladder select -> board select -> play.
 *
 * The engine owns all rules. This file owns presentation, input routing and
 * persistence, and nothing else.
 */

import { Game } from '../engine/game.js';
import { boardConfig, boardRow, maxBoard } from '../engine/config.js';
import { FullRun } from '../engine/run.js';
import { randomSeed } from '../engine/rng.js';
import type { Cell, GameEvent } from '../engine/types.js';
import { hasNote } from '../engine/notes.js';
import { BoardView, type BoardDisplay } from './boardview.js';
import { ladders } from './ladders.js';
import { Progress } from './progress.js';
import {
  PROGRESS_KEY, SETTINGS_KEY, type SaveBundle, decodeSave, describeSave, encodeSave, localDate,
} from './savefile.js';
import { TIER_GOLD, themeFor, tierColor, tierGilded } from './theme.js';
import { SPELLS, spellKey, spellLabel, type SpellId } from '../engine/spells.js';
import { easierThanDefault, isAtLeastAsHard } from '../engine/settings.js';
import { Settings } from './settings.js';
import { Sfx, type SfxEvent } from './sfx.js';
import { playVictory } from './victory.js';
import { buildSettingsScreen } from './settingsscreen.js';

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The save exactly as stored. Blocked storage reads as no save at all. */
function readStoredSave(): SaveBundle {
  const read = (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  return { progress: read(PROGRESS_KEY), settings: read(SETTINGS_KEY) };
}

/**
 * Replace the stored save, and report whether it actually landed.
 *
 * A save with no settings in it clears them rather than keeping this
 * browser's, so a restore is the exported state and not a mixture of two.
 * Read back afterwards because a blocked store can fail without throwing.
 */
function writeStoredSave(bundle: SaveBundle): boolean {
  try {
    if (bundle.progress === null) localStorage.removeItem(PROGRESS_KEY);
    else localStorage.setItem(PROGRESS_KEY, bundle.progress);
    if (bundle.settings === null) localStorage.removeItem(SETTINGS_KEY);
    else localStorage.setItem(SETTINGS_KEY, bundle.settings);
    return localStorage.getItem(PROGRESS_KEY) === bundle.progress;
  } catch {
    return false;
  }
}

const pad = (n: number, width: number) =>
  String(Math.max(0, Math.floor(n))).padStart(width, '0');

/**
 * The ladder that teaches, and so the only one that explains a death.
 *
 * Named rather than spelled inline because it is a claim about the ladder's
 * ROLE, not about its name: EASY is the entry point every other type is gated
 * behind, so it is the one place a player can still be meeting the rules for
 * the first time. If another ladder ever took that job, this is the one line
 * that would move.
 */
const TEACHING_TYPE = 'easy';

export class App {
  private readonly root: HTMLElement;
  private readonly progress = Progress.load();
  readonly settings = Settings.load();
  private readonly sfx = new Sfx();

  private game: Game | null = null;
  private view: BoardView | null = null;
  private typeId = 'easy';
  private boardIndex = 1;
  private seed = 0;
  /**
   * The Full Run in progress, if this is one.
   *
   * `game` is always the board on screen; `run` is the thing that owns the HP
   * pool and decides what happens when that board ends. Everything else in
   * this file reads `game` exactly as it did before, which is why a run needed
   * no changes to input, rendering or the HUD's arithmetic.
   */
  private run: FullRun | null = null;

  /** Palette selection: -1 is none. 0 is a real choice (empty ground), which
   *  is why "none" cannot be 0 the way it used to be. */
  private markMode = -1;
  /** When on, the LV palette pencils candidates instead of writing marks. */
  private notesMode = false;
  /** True when pencil mode armed the tier itself, so it can hand it back. */
  private tierArmedByPencil = false;
  private notesBtn: HTMLButtonElement | null = null;
  private hint: HTMLParagraphElement | null = null;
  private emptyNoteBtn: HTMLButtonElement | null = null;
  /**
   * When this board's clock started — the moment the board was dealt.
   *
   * NOT the player's first move. Every board hands over an opening before the
   * player touches anything, and that opening is a first click made for you:
   * it is board information, and reading it is the first thing you do. A clock
   * that waited for a move would stop at nothing while you did the work the
   * board just set up, and every time on the ladder would be missing however
   * long the player spent reading it.
   *
   * The two ladders whose opening rule reveals nothing get the same treatment,
   * because "the clock starts when the board appears" is one rule and "the
   * clock starts when the board appears, except here" is two.
   */
  private startedAt: number | null = null;
  private frozenSeconds: number | null = null;
  private rafId = 0;

  private hud: Record<string, HTMLElement> = {};
  private counters: HTMLButtonElement[] = [];
  private sweepSafeBtn: HTMLButtonElement | null = null;
  private sweepMarkBtn: HTMLButtonElement | null = null;
  private spellBtns: HTMLButtonElement[] = [];
  /** A targeted spell waiting for the player to pick a cell. */
  private pendingSpell: SpellId | null = null;
  /** The open confirmation overlay, if one is asking something right now. */
  private askOverlay: HTMLElement | null = null;
  /** Stops a running board-clear effect; a screen rebuild must call it. */
  private stopVictory: (() => void) | null = null;
  /**
   * Seconds this board must be cleared within, or null for an ordinary
   * count-up clock.
   *
   * Set from the board's own best time when Time Attack is on, so it is only
   * ever a target the player has already beaten once. A board with no best
   * time has nothing to race, and the mode quietly does nothing there rather
   * than inventing a limit.
   */
  private timeLimit: number | null = null;
  /** True once the countdown has already ended the board, so the clock's
   *  every-frame check cannot forfeit twice. */
  private timeExpired = false;

  /**
   * The fight that ended the board, kept so the loss overlay can say what
   * killed you.
   *
   * The engine already hands this over — a `battle` event carries the tier and
   * the HP it actually cost — and the UI used to drop it on the floor, which
   * left "GAME OVER" unable to explain itself at the one moment a new player
   * is paying most attention. Null when the board was lost to the clock
   * instead, which has no fight to describe.
   */
  private fatalBattle: { tier: number; damage: number } | null = null;

  /** The always-present speaker. Lives on `document.body`, not on the root. */
  private muteBtn: HTMLElement | null = null;

  /** Dev handle: the live game, for console poking and UI tests. */
  get current(): Game | null {
    return this.game;
  }

  /** Dev handle: rendered cell size in CSS pixels. */
  get cellSize(): number | null {
    return this.view?.cellSize ?? null;
  }

  /** Dev handle: jump straight to a board. */
  play(typeId: string, board: number, seed?: number): void {
    this.startBoard(typeId, board, seed ?? randomSeed());
  }

  /** Dev handle: the Full Run in progress, if any. */
  get currentRun(): FullRun | null {
    return this.run;
  }

  /** Dev handle: start a Full Run, ignoring the unlock. */
  runFull(typeId: string, seed?: number): void {
    this.startFullRun(typeId, seed ?? randomSeed());
  }

  /** Dev handle: re-render after the game was driven directly. */
  sync(): void {
    this.refresh();
    if (this.game && this.game.status !== 'playing') this.finish();
  }

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.view?.fit());
    // A settings change has to reach the board the player came from, not just
    // the next one they start.
    this.settings.onChange(() => this.applyPresentation());
    this.buildMuteButton();
    this.applyPresentation();
    this.showTypes();
  }

  /**
   * The speaker in the corner: one switch for every sound in the game.
   *
   * Built once and parented to `document.body` rather than to the app root,
   * because every screen begins with `root.replaceChildren()` — anything
   * inside it is rebuilt on each navigation, and "always there" has to mean
   * surviving that rather than being re-added in four places and forgotten in
   * the fifth.
   *
   * Drawn as inline SVG, which is not a style choice. The font is a player
   * setting, and a speaker CHARACTER is exactly the bug the settings gear
   * already shipped once: it renders as tofu under any stack that lacks the
   * glyph. An SVG path has no such dependency and is the same picture under
   * all five.
   */
  private buildMuteButton(): void {
    const btn = el('button', 'mute-toggle');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      this.settings.setPresentation({ muted: !this.settings.presentation.muted });
      this.syncMuteButton();
    });
    document.body.append(btn);
    this.muteBtn = btn;
    this.syncMuteButton();
  }

  /** Repaint the speaker for the current state, and say so for screen readers. */
  private syncMuteButton(): void {
    const btn = this.muteBtn;
    if (!btn) return;
    const muted = this.settings.presentation.muted;
    // The cone is common to both; muted adds the cross, unmuted the waves. A
    // label as well as a title, because an icon-only control is unreadable to
    // anything that cannot see it.
    const cone = 'M4 9.5h3.2L11.5 6v12L7.2 14.5H4z';
    btn.innerHTML =
      `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
      `<path d="${cone}" />` +
      (muted
        ? `<path class="mute-slash" d="M15 9.5l5 5M20 9.5l-5 5" />`
        : `<path class="mute-wave" d="M14.5 9a4.5 4.5 0 010 6M17.5 6.8a8 8 0 010 10.4" />`) +
      `</svg>`;
    btn.classList.toggle('is-muted', muted);
    const label = muted ? 'Sound off — click to turn sound on'
                        : 'Sound on — click to turn sound off';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(muted));
  }

  /**
   * Push the presentation settings at everything already on screen.
   *
   * Called on every change and once at startup. The font is a CSS variable so
   * the menus follow it too; the board is re-themed directly because it is a
   * canvas and nothing cascades into it.
   */
  private applyPresentation(): void {
    document.documentElement.style.setProperty('--font', this.settings.font(this.typeId).stack);
    document.documentElement.style.setProperty('--title-font', this.settings.titleFont().stack);
    // A percentage, so it multiplies the browser's own text size rather than
    // replacing it: a player who already reads at a larger default keeps it.
    document.documentElement.style.fontSize = `${this.settings.presentation.textSize * 100}%`;
    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    this.view?.setDisplay(this.settings.themeFor(this.typeId), this.boardDisplay());
    // From here rather than only from the button's own handler: "Reset
    // presentation" in the settings screen clears `muted` too, and a speaker
    // still showing a cross over a game that had started making noise again
    // would be the control lying about the thing it controls.
    this.syncMuteButton();
  }

  /** The renderer's slice of the presentation settings. */
  private boardDisplay(): BoardDisplay {
    const p = this.settings.presentation;
    return {
      maxCell: p.maxZoom,
      font: this.settings.font(this.typeId),
      highlight: this.settings.highlightStyle(this.typeId),
      strikeDefeated: p.strikeDefeated,
      hoverDefeated: p.hoverDefeated,
    };
  }

  /**
   * Whether a clear on these settings goes in the record books.
   *
   * Presentation never counts against it — repainting the board cannot make it
   * easier. Only the gameplay dials do, and only in one direction: a player
   * who makes the game harder keeps everything, a player who makes it easier
   * keeps nothing. See `isAtLeastAsHard`.
   */
  private get recordsCount(): boolean {
    return isAtLeastAsHard(this.settings.gameplay);
  }

  // -------------------------------------------------------------- screen: types

  private showTypes(): void {
    this.stopClock();
    this.endVictory();
    this.closeAsk();
    this.root.replaceChildren();
    const wrap = el('div', 'screen');

    // One count for the whole screen: every locked type measures itself
    // against the same number, and it cannot change while the list is drawn.
    const cleared = this.progress.boardsCleared();

    const head = el('header', 'title-bar');
    head.append(el('h1', 'game-title', 'Creature Sweeper'));
    head.append(el('p', 'sub', 'Prototype — Milestone 2'));
    // Boards cleared is a currency now, so it is shown whether or not
    // anything is currently waiting on it.
    head.append(el('p', 'sub boards-cleared',
      `${cleared} board${cleared === 1 ? '' : 's'} cleared`));
    // A player who left a dial easier than default a week ago should not have
    // to open Settings to find out why nothing is unlocking.
    if (!this.recordsCount) {
      const easier = easierThanDefault(this.settings.gameplay);
      const warn = el('p', 'sub settings-warn',
        `Nothing is being recorded: ${easier.join(', ')} ` +
        `${easier.length === 1 ? 'is' : 'are'} set easier than the tuned game.`);
      head.append(warn);
    }
    wrap.append(head);

    const list = el('div', 'type-list');
    for (const type of ladders) {
      const unlocked = this.progress.isTypeUnlocked(ladders, type.id);
      const rec = this.progress.typeRecord(type.id);
      const theme = themeFor(type.id);

      const card = el('button', 'type-card');
      card.disabled = !unlocked;
      card.style.setProperty('--tint', theme.accent);

      card.append(el('span', 'type-name', type.name));
      const meta = el('span', 'type-meta');
      if (!unlocked) {
        // Both gates, and the count one shows progress. "Locked" with no
        // number is a dead end; "41 / 45 boards" is a thing to go and do.
        const needs: string[] = [];
        if (type.requires.length) {
          needs.push(`clear ${type.requires
            .map((r) => ladders.find((t) => t.id === r)?.name ?? r)
            .join(' + ')}`);
        }
        if (type.requires_boards > cleared) {
          needs.push(`${cleared} / ${type.requires_boards} boards cleared`);
        }
        const runs = this.progress.fullRunsCompleted();
        if (type.requires_runs > runs) {
          needs.push(`${runs} / ${type.requires_runs} Full Runs completed, each on a different type`);
        }
        meta.textContent = `Locked — ${needs.join(' · ')}`;
      } else if (rec.cleared) {
        const run = this.progress.runRecord(type.id);
        meta.textContent = `Cleared · board ${rec.highestBoard} of ${type.boards.length}` +
          (run.cleared ? ' · ★ full run' : ' · full run open');
      } else {
        meta.textContent = `Board ${rec.highestBoard} of ${type.boards.length}`;
      }
      card.append(meta);
      card.append(el('span', 'type-axis', type.axis));
      card.addEventListener('click', () => this.showBoards(type.id));
      list.append(card);
    }
    wrap.append(list);

    const tools = el('div', 'tools');
    const unlockAll = el('label', 'toggle');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = this.progress.unlockAll;
    box.addEventListener('change', () => {
      this.progress.setUnlockAll(box.checked);
      this.showTypes();
    });
    unlockAll.append(box, el('span', undefined, 'Unlock everything (prototype)'));
    tools.append(unlockAll);

    const howto = el('button', 'ghost', 'How to play');
    howto.addEventListener('click', () => this.showHowTo());
    tools.append(howto);

    const settings = el('button', 'ghost', 'Settings');
    settings.addEventListener('click', () => this.showSettings(() => this.showTypes()));
    tools.append(settings);

    const backup = el('button', 'ghost', 'Back up / restore save');
    backup.addEventListener('click', () => this.showSaveBackup());
    tools.append(backup);

    const reset = el('button', 'ghost', 'Reset progress');
    // Same defect as Abandon had: a suppressed `confirm` returns false, so
    // this button quietly stopped working wherever dialogs are blocked.
    reset.addEventListener('click', () => {
      this.ask({
        title: 'ERASE PROGRESS?',
        body: 'Every unlock, clear time and full run on this device. This cannot be undone.',
        confirmLabel: 'Erase everything',
        cancelLabel: 'Cancel',
        onConfirm: () => {
          this.progress.reset();
          this.showTypes();
        },
      });
    });
    tools.append(reset);
    wrap.append(tools);

    this.root.append(wrap);

    // Opens itself exactly once, on a save that has never seen it. A player
    // arriving here for the first time has one unlocked ladder and no idea
    // what the game is, so there is nothing else for them to be doing; after
    // that it is a button like any other. Marked seen when shown rather than
    // when dismissed, so a reload cannot reopen it.
    if (!this.progress.seenHowTo) {
      this.progress.markHowToSeen();
      this.showHowTo();
    }
  }

  // ------------------------------------------------------------- screen: boards

  private showBoards(typeId: string): void {
    this.stopClock();
    this.endVictory();
    this.closeAsk();
    // "Game type default" and the board font follow the ladder you are
    // looking at, so the type has to be current before anything is drawn.
    this.typeId = typeId;
    this.applyPresentation();
    this.typeId = typeId;
    this.root.replaceChildren();
    const type = ladders.find((t) => t.id === typeId)!;
    const theme = themeFor(typeId);

    const wrap = el('div', 'screen');
    wrap.style.setProperty('--tint', theme.accent);

    const head = el('header', 'title-bar');
    const back = el('button', 'ghost', '← Ladders');
    back.addEventListener('click', () => this.showTypes());
    head.append(back);
    head.append(el('h1', undefined, type.name));
    head.append(el('p', 'sub', type.blurb));
    wrap.append(head);

    const grid = el('div', 'board-grid');
    for (const board of type.boards) {
      const unlocked = this.progress.isBoardUnlocked(ladders, typeId, board.n);
      const rec = this.progress.boardRecord(typeId, board.n);

      const card = el('button', 'board-card');
      card.disabled = !unlocked;
      if (rec.cleared) card.classList.add('done');
      if (rec.perfect) card.classList.add('perfect');

      card.append(el('span', 'board-n', String(board.n)));
      card.append(el('span', 'board-size', `${board.w}×${board.h}`));
      card.append(el('span', 'board-stat', `${board.monsters} creatures · ${board.density}%`));
      card.append(el('span', 'board-stat', `HP ${board.hp} · ${board.tiers} tiers`));

      const badge = el('span', 'board-badge');
      if (!unlocked) badge.textContent = 'Locked';
      else if (rec.bestTime !== null) {
        badge.textContent = `${rec.perfect ? '★ ' : ''}best ${rec.bestTime}s`;
      } else badge.textContent = 'Not cleared';
      card.append(badge);

      card.addEventListener('click', () => this.startBoard(typeId, board.n));
      grid.append(card);
    }
    grid.append(this.fullRunCard(typeId));
    grid.append(this.scalingCard(typeId));
    wrap.append(grid);
    this.root.append(wrap);
  }

  /**
   * The scaling tile — the twelfth cell, and the way past board 10.
   *
   * The continuation is the ladder's own schedules carried on and clamped, so
   * it is not a list of ten more named boards; it is one board with a dial on
   * it. A tile per board would run to thirty-four cells on EASY and bury the
   * ladder it belongs to, so the number is picked here instead and the stats
   * under it redraw to match.
   *
   * It is a div rather than a button because it contains buttons. That costs
   * the click-anywhere affordance every other tile has, which is why Play is
   * spelled out rather than implied.
   */
  private scalingCard(typeId: string): HTMLElement {
    const type = ladders.find((t) => t.id === typeId)!;
    const first = type.boards.length + 1;
    const last = maxBoard(ladders, typeId);
    const unlocked = this.progress.isScalingUnlocked(ladders, typeId);
    let board = this.progress.scalingBoard(typeId, first, last);

    const card = el('div', 'board-card scale-card');
    if (!unlocked) card.classList.add('locked');

    card.append(el('span', 'board-n scale-n', 'SCALING'));

    const picker = el('div', 'scale-pick');
    const down = el('button', 'scale-arrow', '◀');
    const num = el('span', 'scale-num');
    const up = el('button', 'scale-arrow', '▶');
    picker.append(down, num, up);
    card.append(picker);

    const size = el('span', 'board-size');
    const stat1 = el('span', 'board-stat');
    const stat2 = el('span', 'board-stat');
    card.append(size, stat1, stat2);

    const badge = el('span', 'board-badge');
    const play = el('button', 'primary small scale-go', 'Play');
    card.append(unlocked ? play : badge);

    const draw = () => {
      const row = boardRow(ladders, typeId, board)!;
      num.textContent = String(board);
      size.textContent = `${row.w}×${row.h}`;
      stat1.textContent = `${row.monsters} creatures · ${row.density}%`;
      stat2.textContent = `HP ${row.hp} · ${row.tiers} tiers`;
      // An arrow that cannot move says so, rather than going quiet — the top
      // of a continuation is a real place and the player should be able to
      // see that they have reached it.
      down.disabled = !unlocked || board <= first;
      up.disabled = !unlocked || board >= last;
      const rec = this.progress.boardRecord(typeId, board);
      card.classList.toggle('done', rec.cleared);
      card.classList.toggle('perfect', rec.perfect);
      badge.textContent = `Locked — clear ${type.boards.length}`;
      play.textContent = rec.cleared ? 'Replay' : 'Play';
      card.title = unlocked
        ? `Boards ${first} to ${last}: the ladder's own schedules carried past ` +
          `board ${type.boards.length} and clamped where they stop changing. ` +
          `Board ${board} of ${last}.`
        : `Clear board ${type.boards.length} to unlock the scaling boards.`;
    };

    const step = (by: number) => {
      board = Math.min(last, Math.max(first, board + by));
      this.progress.setScalingBoard(typeId, board);
      draw();
    };
    down.addEventListener('click', () => step(-1));
    up.addEventListener('click', () => step(1));
    play.addEventListener('click', () => this.startBoard(typeId, board));

    draw();
    return card;
  }

  /**
   * The Full Run entry — the eleventh tile of the ladder's own grid.
   *
   * It is a board card in every structural respect: same class, same size,
   * same place in the flow, so it lands immediately after board 10 and the
   * grid keeps room for whatever follows it. Reading as one more step at the
   * end of the ladder is the point — it is what you do *after* those ten
   * boards, not a separate feature parked underneath them.
   *
   * The rules that used to be spelled out in a wide panel now live in the
   * tooltip, the way Sweep and the spells explain themselves. They are still
   * said in full on the first board-clear overlay, which is before any of
   * them can surprise anyone.
   */
  private fullRunCard(typeId: string): HTMLElement {
    const type = ladders.find((t) => t.id === typeId)!;
    const unlocked = this.progress.isFullRunUnlocked(ladders, typeId);
    const rec = this.progress.runRecord(typeId);
    const pool = type.run_hp;
    const heal = Math.floor(pool / 2);
    const last = type.boards.length;

    const card = el('button', 'board-card run-card');
    card.disabled = !unlocked;
    if (rec.cleared) card.classList.add('done');
    // A run finished without losing a point is the same claim a perfect board
    // clear makes, so it gets the same mark.
    if (rec.bestHp === pool) card.classList.add('perfect');

    card.title = unlocked
      ? `All ${last} boards back to back on one pool of ${pool} HP. ` +
        (heal > 0
          ? `Heal +${heal} — half the pool — after each board you clear. `
          : `A pool of ${pool} heals back nothing: one mistake ends the run. `) +
        'Level, EXP and mana reset on every board; only HP carries. ' +
        'Dying at any point ends the whole run.'
      : `Clear board ${last} to unlock the full run.`;

    card.append(el('span', 'board-n run-n', 'FULL RUN'));
    card.append(el('span', 'board-size', `all ${last} boards`));
    card.append(el('span', 'board-stat', `one pool · HP ${pool}`));
    card.append(el('span', 'board-stat', heal > 0
      ? `+${heal} healed per board`
      : 'no healing at all'));

    const badge = el('span', 'board-badge');
    if (!unlocked) badge.textContent = `Locked — clear ${last}`;
    else if (rec.cleared && rec.bestTime !== null) badge.textContent = `★ best ${rec.bestTime}s`;
    else if (rec.attempts > 0) badge.textContent = `best: board ${rec.bestBoard}`;
    else badge.textContent = 'Not attempted';
    card.append(badge);

    card.addEventListener('click', () => this.startFullRun(typeId));
    return card;
  }

  // --------------------------------------------------------------- screen: game

  private startBoard(typeId: string, board: number, seed = randomSeed()): void {
    this.run = null;
    this.typeId = typeId;
    this.boardIndex = board;
    this.seed = seed;
    this.resetBoardState();
    this.frozenSeconds = null;

    const cfg = boardConfig(ladders, typeId, board);
    // `Game.create` applies the board's opening rule, so by the time it
    // returns the automatic first click has been made and the clock is
    // already the player's problem.
    this.game = Game.create(cfg, seed, { settings: this.settings.gameplay });
    this.startedAt = performance.now();
    this.armTimeAttack(this.progress.boardRecord(typeId, board).bestTime);
    this.buildGameScreen();
    this.startClock();
  }

  /**
   * Begin a Full Run: all ten boards on one HP pool.
   *
   * The clock is started once here and never restarted, because a run's time
   * is the run's, not the sum of ten boards a player may have walked away
   * from in between. It starts on board 1's opening, for the same reason a
   * single board's does — see `startedAt`.
   */
  private startFullRun(typeId: string, seed = randomSeed()): void {
    this.typeId = typeId;
    this.seed = seed;
    this.run = FullRun.start(ladders, typeId, seed, { settings: this.settings.gameplay });
    this.boardIndex = this.run.boardIndex;
    this.resetBoardState();
    this.frozenSeconds = null;

    // `FullRun.start` has already built board 1 and dealt its opening.
    this.startedAt = performance.now();
    this.game = this.run.game;
    // A run races the run's own best, not board 1's — the clock is the run's
    // and it is started once, so the target has to be too.
    this.armTimeAttack(this.progress.runRecord(typeId).bestTime);
    this.buildGameScreen();
    this.startClock();
  }

  /**
   * Set the countdown for this board, if Time Attack has something to race.
   *
   * Deliberately the player's OWN previous best and nothing else. An invented
   * limit would be a difficulty setting wearing a stopwatch; a personal best
   * is a time this player has already proved is achievable on this board, so
   * the mode is always exactly as hard as they last made it.
   */
  private armTimeAttack(best: number | null): void {
    this.timeExpired = false;
    this.timeLimit = this.settings.gameplay.timeAttack && best !== null && best > 0
      ? best
      : null;
  }

  /**
   * Take the heal and move to the next board of a run.
   *
   * The whole screen is rebuilt because the board's size, tier count and
   * spell loadout can all differ from the last one. What deliberately is NOT
   * reset is the clock: it has been running since the first click of board 1.
   */
  private advanceRun(): void {
    const run = this.run;
    if (!run || !run.boardWon || run.isLastBoard) return;
    run.advance();
    this.boardIndex = run.boardIndex;
    this.game = run.game;
    this.resetBoardState();
    this.buildGameScreen();
    this.startClock();
  }

  /** Per-board input state. Never touches the clock — a run outlives a board. */
  private resetBoardState(): void {
    this.markMode = -1;
    this.notesMode = false;
    this.tierArmedByPencil = false;
    this.pendingSpell = null;
    this.fatalBattle = null;
  }

  private buildGameScreen(): void {
    const game = this.game!;
    // The board wears the chosen palette; the screen around it keeps the
    // ladder's own accent, so the menus stay recognisable however the board
    // is painted.
    const theme = this.settings.themeFor(this.typeId);
    const type = ladders.find((t) => t.id === this.typeId)!;

    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    document.documentElement.style.setProperty('--font', this.settings.font(this.typeId).stack);
    this.endVictory();
    this.closeAsk();
    this.root.replaceChildren();
    const wrap = el('div', 'screen game');
    wrap.style.setProperty('--tint', themeFor(this.typeId).accent);

    // --- HUD, in the original's notation
    const hud = el('div', 'hud');
    const mk = (key: string, cls = '') => {
      // The key rides along as a class so each readout can reserve its own
      // width: they lost their zero padding when the labels became words, and
      // "EXP 0" growing into "EXP 1234" shoves everything to its right along.
      const span = el('span', `hud-item hud-${key} ${cls}`.trim());
      this.hud[key] = span;
      hud.append(span);
      return span;
    };
    mk('hp'); mk('lv'); mk('ex'); mk('ne');
    if (game.spells.length) mk('mp', 'mana');
    // In a run, how far down the ladder you are is the single most important
    // number on screen, because it is the one thing HP alone cannot tell you.
    if (this.run) mk('run', 'run');
    mk('t', 'right');
    // Spelled out rather than a gear glyph: the font is a player setting, and
    // U+2699 is missing from several of the stacks on offer — it rendered as
    // tofu the moment the board was put in anything but the mono default.
    const gear = el('button', 'ghost small', 'Settings');
    gear.title = 'Settings — the board is waiting exactly where you left it.';
    // Returns to this same board rather than to a menu: the screen is rebuilt
    // from `game`, which is untouched, so leaving settings resumes the board
    // exactly as it was. The clock is the one thing that keeps running, which
    // is correct — walking away from a board does not pause it anywhere else
    // either.
    gear.addEventListener('click', () => this.showSettings(() => {
      this.buildGameScreen();
      this.startClock();
    }));
    hud.append(gear);
    const back = el('button', 'ghost small', this.run ? 'Abandon' : 'Back');
    back.addEventListener('click', () => this.leaveGame());
    hud.append(back);
    wrap.append(hud);

    const size = `${game.config.width}×${game.config.height}`;
    const creatures = game.config.quantity.reduce((a, b) => a + b, 0);
    const label = el('div', 'board-label', this.run
      ? `${type.name} FULL RUN — board ${this.boardIndex} of ${this.run.boardCount} · ` +
        `${size} · ${creatures} creatures · ` +
        `pool ${this.run.maxHp}, +${this.run.healPerBoard} between boards`
      : `${type.name} — board ${this.boardIndex} · ${size} · ${creatures} creatures`);
    if (this.run) label.classList.add('run');
    wrap.append(label);

    // --- board
    const stage = el('div', 'stage');
    const canvas = el('canvas');
    stage.append(canvas);
    wrap.append(stage);

    // --- mark palette doubles as the per-tier counter
    const palette = el('div', 'palette');
    this.counters = [];
    for (let tier = 1; tier <= game.config.tiers; tier++) {
      const btn = el('button', 'counter');
      btn.dataset.tier = String(tier);
      btn.addEventListener('click', () => this.pickTier(tier));
      this.counters.push(btn);
      palette.append(btn);
    }
    // Tier 0 is a candidate only the pencil can hold — a mark of "empty" would
    // be a claim the guard has no use for, while "this might just be ground" is
    // a real hypothesis on a board where most cells are.
    //
    // Not on a Sudoku board, though: its opening reveals every empty cell
    // before the first move, so no covered cell there can be tier 0. The
    // candidate is simply never true and the button is hidden — see `refresh`.
    const emptyBtn = el('button', 'counter note-empty', '0\nempty');
    emptyBtn.title = 'Pencil "might be empty ground" — tier 0, no creature at all.';
    emptyBtn.addEventListener('click', () => {
      this.notesMode = true;
      this.pickTier(0);
    });
    this.emptyNoteBtn = emptyBtn;
    palette.append(emptyBtn);

    // Labelled with the mode it is IN, not the mode it switches to. "Notes"
    // said neither, so it read as a feature that did nothing — the button was
    // a modifier on the LV palette and never said so.
    const notes = el('button', 'ghost small', 'Entry: Mark');
    notes.addEventListener('click', () => this.toggleNotesMode());
    this.notesBtn = notes;
    palette.append(notes);

    // A ladder without Sweep gets no buttons for it, rather than two dark ones:
    // EASY is where the numbers are learned, and a control that can never be
    // pressed there would only raise the question of what it is for.
    this.sweepSafeBtn = null;
    this.sweepMarkBtn = null;
    if (game.hasSweep) {
      const safe = el('button', 'sweep', 'Sweep');
      safe.title = 'Open only what is proven safe at your level. Can never cost HP.';
      safe.addEventListener('click', () => this.doSweep(false));
      this.sweepSafeBtn = safe;
      palette.append(safe);

      const assist = el('button', 'sweep assist', 'Sweep + marks');
      assist.title = 'Also trust your marks as correct tier claims. ' +
        'Reaches further, but a wrong mark can cost HP.';
      assist.addEventListener('click', () => this.doSweep(true));
      this.sweepMarkBtn = assist;
      palette.append(assist);
    }
    wrap.append(palette);

    if (game.spells.length) {
      const row = el('div', 'palette spells');
      this.spellBtns = [];
      for (const id of game.spells) {
        const spell = SPELLS[id];
        const btn = el('button', 'spell');
        btn.dataset.spell = id;
        btn.title = `${spell.blurb} (${game.spellCost(id)} mana, or press ${spellKey(id).toUpperCase()})`;
        // WORKOUT's Exercise plays by different rules, and the tooltip is
        // where every other spell explains itself.
        if (id === 'exercise' && game.config.workout) {
          const w = game.config.workout;
          btn.title = `Fight your next battle 1 level higher, for ${w.expMultiplier}x EXP if you win. ` +
            `Costs ${w.base} and ${w.step} more each cast; each level-up takes ${w.relief} off ` +
            `(never below ${w.base}). Resets every board. Press ${spellKey(id).toUpperCase()}.`;
        }
        btn.addEventListener('click', () => this.pickSpell(id));
        this.spellBtns.push(btn);
        row.append(btn);
      }
      const cancel = el('button', 'ghost small', 'Cancel (Esc)');
      cancel.addEventListener('click', () => { this.pendingSpell = null; this.refresh(); });
      row.append(cancel);
      wrap.append(row);
    } else {
      this.spellBtns = [];
    }

    const hint = el('p', 'hint');
    this.hint = hint;
    wrap.append(hint);

    this.root.append(wrap);

    this.view = new BoardView(canvas, {
      onOpen: (x, y) => this.onCellPrimary(x, y),
      onCycleMark: (x, y) => this.cycleMark(x, y),
      // The hover ring is drawn by the view; the palette answers for the cell.
      onHover: () => this.gatePalette(),
      lands: (cell) => this.clickLands(cell),
    });
    this.view.setGame(game, theme, this.boardDisplay());
    this.refresh();
  }

  // -------------------------------------------------------------------- actions

  private onCellPrimary(x: number, y: number): void {
    const game = this.game;
    if (!game || game.status !== 'playing') return;
    // A pending spell claims the click before anything else does.
    if (this.pendingSpell) {
      const id = this.pendingSpell;
      this.pendingSpell = null;
      this.apply(game.cast(id, x, y));
      return;
    }
    if (this.markMode >= 0) {
      this.apply(this.notesMode
        ? game.toggleNote(x, y, this.markMode)
        : game.setMark(x, y, this.markMode));
      return;
    }
    // In pencil mode a click annotates or does nothing — never opens. Falling
    // through here once meant turning the pencil on and then clicking a cell
    // fought whatever was under it, which is the opposite of what the mode
    // promises and can end a run.
    if (this.notesMode) return;
    this.apply(game.open(x, y));
  }

  /**
   * Untargeted spells fire immediately; targeted ones arm and wait for a cell,
   * so a misclick costs nothing. Picking the armed spell again disarms it.
   */
  private pickSpell(id: SpellId): void {
    const game = this.game;
    if (!game || game.status !== 'playing' || !game.canCast(id)) return;
    if (!SPELLS[id].targeted) {
      this.pendingSpell = null;
      this.apply(game.cast(id));
      return;
    }
    this.pendingSpell = this.pendingSpell === id ? null : id;
    this.markMode = -1;   // the two targeting modes are mutually exclusive
    this.refresh();
  }

  private cycleMark(x: number, y: number): void {
    const game = this.game;
    if (!game || game.status !== 'playing') return;
    const cell = game.cellAt(x, y);
    if (!cell || cell.open) return;
    const next = cell.mark >= game.config.tiers ? 0 : cell.mark + 1;
    this.apply(game.setMark(x, y, next === 0 ? cell.mark : next));
  }

  /**
   * Ask before doing something irreversible, in the page rather than in a
   * browser dialog.
   *
   * `window.confirm` is not dependable: an embedded webview can suppress it
   * outright, and a browser will after the player ticks "prevent additional
   * dialogs". A suppressed dialog returns FALSE, which every caller reads as
   * "cancel" — so the button it guards does not fail loudly, it silently stops
   * working. That is exactly what happened to Abandon. The overlay below is
   * the same one the win and loss screens use, so it cannot be suppressed and
   * it looks like the rest of the game.
   */
  private ask(opts: {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
  }): void {
    this.closeAsk();
    const overlay = el('div', 'overlay lose');
    const card = el('div', 'overlay-card');
    card.append(el('h2', undefined, opts.title));
    card.append(el('p', 'overlay-stats', opts.body));

    const row = el('div', 'overlay-actions');
    const yes = el('button', 'primary', opts.confirmLabel);
    yes.addEventListener('click', () => { this.closeAsk(); opts.onConfirm(); });
    const no = el('button', 'ghost', opts.cancelLabel);
    no.addEventListener('click', () => this.closeAsk());
    row.append(yes, no);
    card.append(row);
    overlay.append(card);

    const screen = this.root.querySelector('.screen');
    if (!screen) { opts.onConfirm(); return; }
    screen.append(overlay);
    this.askOverlay = overlay;
    // Cancel is the safe answer, so it is what Enter and a stray click land
    // on; confirming an irreversible thing should take aim.
    no.focus();
  }

  private closeAsk(): void {
    this.askOverlay?.remove();
    this.askOverlay = null;
  }

  /**
   * Carry the save out of this browser and back in.
   *
   * A save is one browser on one device, and inside itch.io's iframe it is
   * third-party storage, which Safari caps and may clear. So the whole save
   * leaves as a code the player can keep — copied, or downloaded as a file —
   * and comes back by pasting or loading it. Both routes exist because the
   * embed can block either one: the clipboard needs a permission the iframe
   * may lack, and a download needs a sandbox flag it may lack, but the code is
   * always on screen to select by hand.
   *
   * Registered as `askOverlay` so it is modal and closed by every rebuild.
   * Importing replaces the save and reloads the page, which is the only way
   * every store — progress, settings, the live board — picks it up at once.
   */
  private showSaveBackup(draft = '', error = ''): void {
    this.closeAsk();
    const current = readStoredSave();
    const code = encodeSave(current);

    const overlay = el('div', 'overlay win');
    const card = el('div', 'overlay-card backup');
    card.append(el('h2', undefined, 'SAVE BACKUP'));
    card.append(el('p', 'overlay-note',
      'Your save lives in this browser only. Keep a copy of this code to move it to '
      + 'another device, or to get it back if the browser clears its data.'));

    card.append(el('p', 'backup-label', `This browser — ${describeSave(current)}`));
    const out = el('textarea', 'backup-code');
    out.readOnly = true;
    out.value = code;
    out.rows = 4;
    out.addEventListener('focus', () => out.select());
    card.append(out);

    const exportRow = el('div', 'overlay-actions');
    const copy = el('button', 'primary', 'Copy code');
    copy.addEventListener('click', async () => {
      out.select();
      let copied = false;
      try {
        await navigator.clipboard.writeText(code);
        copied = true;
      } catch {
        try { copied = document.execCommand('copy'); } catch { /* fall through */ }
      }
      copy.textContent = copied ? 'Copied' : 'Select the code and copy it';
    });
    const download = el('button', 'ghost', 'Download file');
    download.addEventListener('click', () => {
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url;
      a.download = `creature-sweeper-save-${localDate(new Date())}.txt`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    exportRow.append(copy, download);
    card.append(exportRow);

    card.append(el('p', 'backup-label', 'Restore — paste a code or load a file'));
    const input = el('textarea', 'backup-code');
    input.rows = 4;
    input.placeholder = 'CS1:…';
    input.value = draft;
    card.append(input);
    const err = el('p', 'overlay-note backup-error', error);
    card.append(err);

    const file = el('input');
    file.type = 'file';
    file.accept = '.txt,.json,text/plain,application/json';
    file.hidden = true;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try { input.value = await f.text(); err.textContent = ''; }
      catch { err.textContent = 'That file could not be read.'; }
    });
    card.append(file);

    const importRow = el('div', 'overlay-actions');
    const restore = el('button', 'primary', 'Restore');
    restore.addEventListener('click', () => {
      const result = decodeSave(input.value);
      if (!result.ok) { err.textContent = result.error; return; }
      const from = result.exported ? ` (saved ${localDate(new Date(result.exported))})` : '';
      this.ask({
        title: 'REPLACE SAVE?',
        body: `Restoring: ${describeSave(result.bundle)}${from} `
          + `This replaces the save in this browser: ${describeSave(current)}`,
        confirmLabel: 'Replace my save',
        cancelLabel: 'Cancel',
        onConfirm: () => {
          if (writeStoredSave(result.bundle)) {
            window.location.reload();
          } else {
            this.showSaveBackup(input.value,
              'This browser is blocking saved data, so nothing could be restored.');
          }
        },
      });
    });
    const load = el('button', 'ghost', 'Load file');
    load.addEventListener('click', () => file.click());
    const close = el('button', 'ghost', 'Close');
    close.addEventListener('click', () => this.closeAsk());
    importRow.append(restore, load, close);
    card.append(importRow);

    overlay.append(card);
    const screen = this.root.querySelector('.screen');
    if (!screen) return;
    screen.append(overlay);
    this.askOverlay = overlay;
  }

  /**
   * The rules, stated before the first click.
   *
   * Everything else on the ladder screen describes what each ladder VARIES —
   * "Density, then size", "Size + lock depth" — which is the right label for a
   * designer and says nothing to a player who has not been told the game yet.
   * The hint line under the board has the same shape: it explains which button
   * does what and never what a number means.
   *
   * The sum rule leads because it is the one a Minesweeper player will get
   * wrong. They read a 4 as four creatures, play on it, die, and conclude the
   * board lied to them — so it is stated with the proof that makes it
   * undeniable rather than merely asserted.
   */
  private showHowTo(onClose?: () => void): void {
    this.closeAsk();
    const overlay = el('div', 'overlay win');
    const card = el('div', 'overlay-card howto');
    card.append(el('h2', undefined, 'HOW TO PLAY'));
    card.append(el('p', 'overlay-stats',
      'Minesweeper, except the creatures fight back — and the numbers count differently.'));

    const rule = (heading: string, body: string) => {
      card.append(el('p', 'howto-rule', heading));
      card.append(el('p', 'overlay-note', body));
    };

    rule('A number is a sum, not a count.',
      'It is the tiers of the creatures around it added together. A 9 might be two ' +
      'creatures — a tier 5 beside a tier 4 — or it might be nine tier 1s. That is ' +
      'why a number can be larger than 8 when a cell has only 8 neighbours.');

    rule('Anything at or below your level dies for free.',
      'Your level is the LV in the corner. A creature of that tier or lower falls in ' +
      'one blow and costs nothing, and pays EXP. A stronger one fights back, and the ' +
      'gap is expensive: a tier 5 at LV1 costs 20 HP.');

    rule('HP is a guess budget.',
      'Every board can be cleared without taking a single point of damage — the EXP ' +
      'needed for each level is always already on the board below it. So HP is not a ' +
      'combat resource. You spend it when you guess.');

    card.append(el('p', 'overlay-note',
      'Click to open · right-click, or a LV button, to mark what you think a cell is · ' +
      'S opens what is provably safe.'));

    const row = el('div', 'overlay-actions');
    const go = el('button', 'primary', 'Got it');
    go.addEventListener('click', () => { this.closeAsk(); onClose?.(); });
    row.append(go);
    card.append(row);
    overlay.append(card);

    const screen = this.root.querySelector('.screen');
    if (!screen) { onClose?.(); return; }
    screen.append(overlay);
    this.askOverlay = overlay;
    go.focus();
  }

  /**
   * Back out to board select.
   *
   * A run is the one thing here that cannot be resumed — the HP pool and the
   * boards behind you only exist in memory — so leaving one asks first. A
   * single board needs no such guard: every board is replayable at will.
   */
  private leaveGame(): void {
    if (this.run && this.run.status === 'playing') {
      const run = this.run;
      this.ask({
        title: 'ABANDON RUN?',
        body: `${this.typeName()} full run, board ${this.boardIndex} of ${run.boardCount}, ` +
          `HP ${run.hp}/${run.maxHp}. A run cannot be resumed.`,
        confirmLabel: 'Abandon run',
        cancelLabel: 'Keep playing',
        onConfirm: () => {
          // An abandoned run is neither won nor lost, but it did reach a
          // board, and that is the only number the mode has to show for an
          // attempt.
          this.progress.recordRun(this.typeId, {
            completed: false,
            reachedBoard: this.boardIndex,
            hp: run.hp,
            seconds: this.elapsedSeconds(),
          });
          this.run = null;
          this.showBoards(this.typeId);
        },
      });
      return;
    }
    this.run = null;
    this.showBoards(this.typeId);
  }

  private typeName(): string {
    return ladders.find((t) => t.id === this.typeId)?.name ?? this.typeId;
  }

  private doSweep(useMarks: boolean): void {
    const game = this.game;
    if (!game || game.status !== 'playing') return;
    // The engine refuses a sweep the dial has closed, so the keyboard cannot
    // get past a gate the button is showing.
    if (!game.sweepAvailable) { this.sfx.play('blocked'); return; }
    const events = game.sweep({ useMarks });
    if (events.length > 0) this.sfx.play('sweep');
    this.apply(events);
  }

  private onKey(e: KeyboardEvent): void {
    // A question is modal: Escape answers "no" and nothing else reaches the
    // board. Without this, Escape would fall through to leaveGame and stack a
    // second copy of the very overlay that is asking.
    if (this.askOverlay) {
      if (e.key === 'Escape') { e.preventDefault(); this.closeAsk(); }
      return;
    }

    const game = this.game;
    if (!game) return;

    if (e.key === 'Escape') {
      if (this.pendingSpell) { this.pendingSpell = null; this.refresh(); }
      else if (this.markMode >= 0) { this.markMode = -1; this.refresh(); }
      else this.leaveGame();
      return;
    }
    if (game.status !== 'playing') return;

    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      this.doSweep(e.shiftKey);
      return;
    }
    if (key === 'd') {
      e.preventDefault();
      this.doSweep(true);
      return;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.view?.nudgeZoom(2);
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.view?.nudgeZoom(-2);
      return;
    }
    if (key === 'f') {
      e.preventDefault();
      this.view?.fit();
      return;
    }
    // A spell's own letter casts it, or arms it if it needs a target. Checked
    // after the board's own keys so a spell can never shadow Sweep or zoom.
    const spell = game.spells.find((id) => spellKey(id) === key);
    if (spell) {
      e.preventDefault();
      this.pickSpell(spell);
      return;
    }

    if (key === 'n') {
      e.preventDefault();
      this.toggleNotesMode();
      return;
    }

    // Digits come off e.code, not e.key: Shift+1 is "!" on a US layout and
    // something else again elsewhere, so the key would be unreadable exactly
    // when the pencil needs it.
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) {
      const cell: Cell | null = this.view?.hoveredCell ?? null;
      const tier = Number(digit[1]);
      if (tier > game.config.tiers) return;
      e.preventDefault();
      if (cell) {
        // The Entry mode decides, exactly as it does for a click, and Shift
        // inverts it for this one keystroke. Before, a digit always marked and
        // only Shift pencilled, so in Pencil mode the palette and the keyboard
        // did opposite things — the mode silently did not apply to typing.
        const pencil = this.notesMode !== e.shiftKey;
        this.apply(pencil
          ? game.toggleNote(cell.x, cell.y, tier)
          : game.setMark(cell.x, cell.y, tier));
      } else {
        if (e.shiftKey) this.notesMode = true;
        this.pickTier(tier);
      }
      return;
    }
  }

  /** Select a palette tier, or clear the selection by picking it again. */
  private pickTier(tier: number): void {
    this.markMode = this.markMode === tier ? -1 : tier;
    this.tierArmedByPencil = false;
    this.pendingSpell = null;
    this.refresh();
  }

  /**
   * What a click does right now, said plainly.
   *
   * The palette is modal — a LV button means one thing in Mark and another in
   * Pencil — so a fixed caption can only ever describe one of them, and the
   * player is left to infer the rest.
   */
  private hintText(): string {
    const game = this.game;
    const tier = this.markMode;
    const spell = 'a spell’s bracketed letter casts it · scroll or +/- to zoom, F to reset';

    if (this.pendingSpell) {
      return `${SPELLS[this.pendingSpell].name} is armed — click a cell to cast it, Esc to cancel`;
    }
    if (this.notesMode) {
      const what = tier === 0 ? '“might be empty”' : tier > 0 ? `“might be ${tier}”` : 'a candidate';
      return `PENCIL — click a cell to add or remove ${what} · ` +
        'pick a tier above, or Shift+digit over a cell · ' +
        `N returns to marking · ${spell}`;
    }
    if (tier > 0) {
      return `MARK ${tier} — click a cell to claim it is a ${tier}, click again to clear · ` +
        `a mark above your level locks the cell · N pencils instead · ${spell}`;
    }
    const sweep = game && !game.hasSweep
      ? 'no Sweep on this ladder — every cell is opened by hand'
      : game && game.config.placement === 'sudoku'
        ? 'S opens the clues at or below your level · D also opens your own marks'
        : 'S sweeps what is proven safe · D also trusts your marks';
    // The crawl rule is the first thing a player meets on a DUNGEON board and
    // there is nothing on screen that would explain a click doing nothing, so
    // it is said here rather than left to be inferred from a red cursor. Once
    // the board has sealed the player in the rule has lifted, and saying so is
    // the difference between an escape hatch and a bug.
    if (game && game.config.reach > 0) {
      const crawl = game.sealedIn()
        ? `Walled in — reach lifted until you can move again, so anywhere is open`
        : `Click to open, within ${game.config.reach} of ground you have uncovered ` +
          `(red cursor means out of reach)`;
      return `${crawl} · right-click or a LV button to mark · ${sweep} · ${spell}`;
    }
    return `Click to open · right-click or a LV button to mark · N pencils candidates · ` +
      `${sweep} · ${spell}`;
  }

  /**
   * Whether "might be empty ground" is a hypothesis this board can hold at all.
   *
   * Sudoku opens every empty cell before the first move, so no covered cell
   * there can be tier 0, and the palette hides the control. This is the
   * board-wide half of that fact; the engine holds it per cell in
   * `noteCandidates`, which is what refuses the keyboard and the click alike.
   */
  private canPencilEmpty(): boolean {
    return this.game?.config.placement !== 'sudoku';
  }

  /**
   * Whether a click on this cell would land in the mode the palette is in,
   * which is what the board's cursor colours itself by.
   *
   * Annotation is exempt from the crawl rule — a player may reason about a
   * room before they can enter it — so while a tier is armed reach does not
   * apply. The cursor used to ask about reach regardless, and on a DUNGEON
   * board went red over cells a mark or a pencil would have landed on. What
   * does apply is the refusals annotation has of its own: a given cannot be
   * written over, and the pencil will not take a candidate the placement rule
   * has already ruled out. Open ground stays unremarked, as it always was.
   */
  private clickLands(cell: Cell): boolean {
    const game = this.game;
    if (!game) return true;
    if (this.markMode >= 0) {
      if (cell.open) return true;
      if (cell.given) return false;
      return !this.notesMode || game.canNote(cell, this.markMode);
    }
    return game.inReach(cell);
  }

  /**
   * While pencilling, strike through the palette tiers the hovered cell has
   * already ruled out — the answer `toggleNote` will give, shown before the
   * click instead of after it. A candidate already pencilled is never struck,
   * because taking it off is always allowed. Nothing is struck with nothing
   * hovered: the palette sits off the board, so reaching for it clears the
   * strikes, and the row goes back to meaning every tier.
   */
  private gatePalette(): void {
    const game = this.game;
    const cell = this.view?.hoveredCell ?? null;
    const mask = game && this.notesMode && cell && !cell.open && !cell.given
      ? game.noteCandidates(cell) | cell.notes
      : ~0;
    for (const btn of this.counters) {
      btn.classList.toggle('ruled-out', !hasNote(mask, Number(btn.dataset.tier)));
    }
    this.emptyNoteBtn?.classList.toggle('ruled-out', !hasNote(mask, 0));
  }

  private toggleNotesMode(): void {
    this.notesMode = !this.notesMode;
    // Pencilling needs a tier as well as the mode, and requiring two clicks
    // before anything can happen is what made this look broken. Arm a tier so
    // one click is enough.
    if (this.notesMode && this.markMode < 0) {
      this.markMode = 1;
      this.tierArmedByPencil = true;
    }
    if (!this.notesMode) {
      // Hand back a tier the pencil armed for itself. Keeping it would leave
      // the player in "mark 1" when they only ever asked to pencil, and clicks
      // would silently mark instead of opening.
      if (this.tierArmedByPencil) this.markMode = -1;
      // Tier 0 only means anything to the pencil, so leaving with it selected
      // would arm a mark that setMark treats as "clear".
      if (this.markMode === 0) this.markMode = -1;
    }
    if (!this.notesMode) this.tierArmedByPencil = false;
    this.refresh();
  }

  private apply(events: GameEvent[]): void {
    const game = this.game!;

    if (events.some((ev) => ev.type === 'battle' && ev.damage > 0)) this.flash('shake');
    if (events.some((ev) => ev.type === 'levelUp')) this.flash('levelup');
    this.sound(events);

    // Keep the blow that ended it, before the events go out of scope. The last
    // costly fight in the batch is the fatal one: a single click resolves at
    // most one fight, and a sweep stops the moment HP runs out.
    if (game.status === 'lost') {
      const fights = events.filter((ev) => ev.type === 'battle' && ev.damage > 0);
      const last = fights[fights.length - 1];
      if (last && last.type === 'battle') {
        this.fatalBattle = { tier: last.tier, damage: last.damage };
      }
    }

    this.refresh();
    if (game.status !== 'playing') this.finish();
  }

  /**
   * One sound per action, not one per event.
   *
   * A single click can produce a cascade of hundreds of `revealed` cells, a
   * fight, a level-up and a win all in the same array. Playing each would be
   * noise, so the loudest thing that happened wins and everything quieter is
   * dropped — which is also why the list below is ordered by consequence
   * rather than by when the events occurred.
   */
  private sound(events: GameEvent[]): void {
    if (!this.sfx.enabled || events.length === 0) return;
    const has = (t: GameEvent['type']) => events.some((ev) => ev.type === t);

    // Win and loss are handled by `finish`, which also fires the clear effect;
    // sounding them here as well would double them up.
    if (has('won') || has('lost')) return;

    let event: SfxEvent;
    if (has('levelUp')) event = 'levelup';
    else if (events.some((ev) => ev.type === 'battle' && ev.damage > 0)) event = 'battle';
    else if (has('battle')) event = 'kill';
    else if (has('spell') || has('exercised')) event = 'spell';
    else if (has('blocked')) event = 'blocked';
    else if (has('noted')) event = 'note';
    else if (has('marked')) event = 'mark';
    else if (events.some((ev) => ev.type === 'revealed' && ev.cells.length > 1)) event = 'cascade';
    else if (has('revealed')) event = 'open';
    else return;
    this.sfx.play(event);
  }

  private flash(kind: 'shake' | 'levelup'): void {
    const stage = this.root.querySelector('.stage');
    if (!stage) return;
    stage.classList.remove(kind);
    void (stage as HTMLElement).offsetWidth; // restart the animation
    stage.classList.add(kind);
  }

  private refresh(): void {
    const game = this.game;
    if (!game) return;

    // Words rather than the original's four-character codes. EX and NE are
    // only legible once you already know the game, which is the opposite of
    // what a readout is for — and "Next Level" is the one number a new player
    // most needs named, because it is what turns a fight from fatal to free.
    // The zero padding went with them: it existed to hold a fixed width under
    // a terse label, and "Next Level 0007" reads as a part number. Width is
    // held by CSS instead, so the row still cannot jitter as digits change.
    this.hud.hp!.textContent = `HP ${game.hp}`;
    // The number wears its tier's creature colour, which is the one encoding
    // of a tier the whole game shares: at Level 3 the yellow creatures are
    // free, and the 3 is yellow. Tiers past five repeat a hue under a gold
    // halo, so their levels carry the same halo — otherwise Level 6 would be
    // indistinguishable from Level 1 at a glance.
    const levelNum = el('span', 'hud-level-num', String(game.level));
    levelNum.style.color = tierColor(game.level);
    if (tierGilded(game.level)) {
      levelNum.classList.add('gilded');
      levelNum.style.setProperty('--halo', TIER_GOLD);
    }
    this.hud.lv!.replaceChildren('Level ', levelNum);
    // A standing Exercise is a level you are carrying into the next fight, so
    // it is shown on the level itself, in red, until that fight spends it.
    if (game.exerciseCharge > 0) {
      this.hud.lv!.append(el('span', 'hud-buff', ` +${game.exerciseCharge}`));
    }
    this.hud.ex!.textContent = `EXP ${game.ex}`;
    this.hud.ne!.textContent = `Next Level ${game.progression.toNext()}`;
    this.hud.hp!.classList.toggle('low', game.hp <= Math.max(1, game.maxHp * 0.3));
    if (this.hud.run && this.run) {
      this.hud.run.textContent = `RUN${this.boardIndex}/${this.run.boardCount}`;
    }

    for (const btn of this.counters) {
      const tier = Number(btn.dataset.tier);
      btn.textContent = `LV${tier}\n×${pad(game.counterFor(tier), 2)}`;
      btn.classList.toggle('active', this.markMode === tier);
      btn.classList.toggle('done', game.counterFor(tier) <= 0);
    }
    if (this.notesBtn) {
      this.notesBtn.textContent = this.notesMode ? 'Entry: Pencil' : 'Entry: Mark';
      this.notesBtn.title = this.notesMode
        ? 'Clicking a cell pencils the selected tier as a candidate. Press N for marks.'
        : 'Clicking a cell claims the selected tier. Press N to pencil candidates instead.';
      this.notesBtn.classList.toggle('active', this.notesMode);
    }
    // The tier-0 pencil only exists while pencilling, and only on a board that
    // can still be hiding empty ground. Sudoku opens all nine of its empties
    // before the first move, so no covered cell there can be tier 0 and the
    // candidate is never true — offering it is pure clutter.
    if (this.emptyNoteBtn) {
      this.emptyNoteBtn.hidden = !this.notesMode || !this.canPencilEmpty();
      this.emptyNoteBtn.classList.toggle('active', this.notesMode && this.markMode === 0);
    }
    this.gatePalette();
    if (this.hint) this.hint.textContent = this.hintText();

    if (this.hud.mp) {
      this.hud.mp.textContent = `MP ${game.mana}`;
      this.hud.mp.classList.toggle('charged', game.exerciseCharge > 0);
    }
    for (const btn of this.spellBtns) {
      const id = btn.dataset.spell as SpellId;
      const armed = this.pendingSpell === id;
      btn.textContent = `${spellLabel(id)} ${game.spellCost(id)}`;
      btn.disabled = !game.canCast(id);
      btn.classList.toggle('armed', armed);
    }
    const stage = this.root.querySelector('.stage');
    if (stage) stage.classList.toggle('targeting', this.pendingSpell !== null);

    const mode = game.settings.sweep;
    const gated = !game.sweepAvailable;
    const safeCount = mode === 'off' ? 0 : game.safeCells({ useMarks: false }).length;
    const markCount = mode === 'off' ? 0 : game.safeCells({ useMarks: true }).length;
    if (this.sweepSafeBtn) {
      // The meter goes on the button rather than in the HUD, because what the
      // player needs to know is why THIS control is dark.
      this.sweepSafeBtn.textContent = mode === 'off'
        ? 'Sweep off'
        : gated
          ? `Sweep (${game.charge}/${game.chargeNeeded})`
          : safeCount > 0 ? `Sweep ${safeCount}` : 'Sweep';
      this.sweepSafeBtn.disabled = gated || safeCount === 0;
      this.sweepSafeBtn.title = mode === 'off'
        ? 'Sweep is switched off in Settings — every cell is opened by hand.'
        : mode === 'charge'
          ? `Opening cells by hand charges Sweep. ${game.chargeNeeded} per use; ` +
            `${game.charge} banked. Cells a sweep opens do not charge it.`
          : 'Open only what is proven safe at your level. Can never cost HP.';
    }
    if (this.sweepMarkBtn) {
      // Only offered when the marks actually buy something the proof cannot.
      const extra = markCount - safeCount;
      this.sweepMarkBtn.textContent = mode === 'off'
        ? 'Sweep off'
        : extra > 0 ? `Sweep + marks +${extra}` : 'Sweep + marks';
      this.sweepMarkBtn.disabled = gated || extra <= 0;
    }

    this.view?.render();
    this.updateClock();
  }

  // ---------------------------------------------------------------------- clock

  private elapsedSeconds(): number {
    if (this.frozenSeconds !== null) return this.frozenSeconds;
    if (this.startedAt === null) return 0;
    return Math.min(9999, Math.floor((performance.now() - this.startedAt) / 1000));
  }

  /**
   * Seconds left on a Time Attack board, or null when it is not racing one.
   *
   * Floored at 0 rather than going negative, because the frame that reaches 0
   * is the frame that ends the board and the HUD should show what the player
   * was left with rather than how far past it they got.
   */
  private remainingSeconds(): number | null {
    if (this.timeLimit === null) return null;
    return Math.max(0, this.timeLimit - this.elapsedSeconds());
  }

  private updateClock(): void {
    const left = this.remainingSeconds();
    if (this.hud.t) {
      // "LEFT" rather than a minus sign or an arrow: the old `T-0004` carried
      // the only thing distinguishing a countdown from a count-up in a single
      // character, and a glyph is not available here — the font is a player
      // setting, so the word is the portable way to say it.
      this.hud.t.textContent = left === null
        ? `TIME ${this.elapsedSeconds()}`
        : `TIME ${left} LEFT`;
      // Under ten seconds it reads like the HP counter does, for the same
      // reason: it is the number about to end the board.
      this.hud.t.classList.toggle('low', left !== null && left <= 10);
    }
    // The engine owns no clock, so "the countdown ran out" is a fact only this
    // loop can know — and `forfeit` is how it hands that back to the rules
    // rather than writing a status the engine did not agree to.
    if (left === 0 && !this.timeExpired && this.game?.status === 'playing') {
      this.timeExpired = true;
      this.apply(this.game.forfeit());
    }
  }

  private startClock(): void {
    this.stopClock();
    const tick = () => {
      this.updateClock();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopClock(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /** Cancel a board-clear effect still in flight. A screen rebuild must call
   *  this, or the animation keeps a frame loop alive on a detached canvas. */
  private endVictory(): void {
    this.stopVictory?.();
    this.stopVictory = null;
  }

  // --------------------------------------------------------------------- result

  private finish(): void {
    if (this.run) { this.finishRunBoard(); return; }
    const game = this.game!;
    this.frozenSeconds = this.elapsedSeconds();
    this.stopClock();
    const won = game.status === 'won';
    const perfect = won && game.hp === game.maxHp;
    const type = ladders.find((t) => t.id === this.typeId)!;
    const counts = this.recordsCount;

    let unlocked: number | null = null;
    // A board cleared on settings easier than the tuned ones is not written
    // down at all — no clear, no unlock, no time. It was a different board.
    if (won && counts) {
      const result = this.progress.recordClear(ladders, this.typeId, this.boardIndex, {
        perfect, seconds: this.frozenSeconds,
      });
      unlocked = result.unlockedBoard;
    }
    this.sfx.play(won ? 'win' : 'lose');

    const overlay = el('div', `overlay ${won ? 'win' : 'lose'}`);
    const card = el('div', 'overlay-card');
    card.append(el('h2', undefined, won
      ? (perfect ? 'PERFECT CLEAR' : 'CLEAR')
      : this.timeExpired ? 'OUT OF TIME' : 'GAME OVER'));

    const stats = el('p', 'overlay-stats',
      won
        ? `${type.name} board ${this.boardIndex} · ${this.frozenSeconds}s · HP ${game.hp}/${game.maxHp}`
        : this.timeExpired
          ? `Time ran out · ${game.creaturesLeft()} creatures still standing`
          : `${game.creaturesLeft()} creatures still standing · reached LV${game.level}`);
    card.append(stats);

    if (won && perfect) {
      card.append(el('p', 'overlay-note',
        'No damage taken — every board can be cleared this way.'));
    }
    // The same fact, said to the players who need it rather than only to the
    // ones who have already proved they know it. A loss is the moment of most
    // attention in the game and it used to report the score and nothing else,
    // so a player who had misread the rule got no hint that they had.
    //
    // EASY only, and that is the whole of the reason: it calls itself the
    // teaching ladder, and every other type is gated behind clearing it. A
    // player who has reached NORMAL has already been told this and proved it,
    // so repeating it on every death would stop being an explanation and
    // become nagging — the thing the perfect-clear note gets right by firing
    // once in a blue moon. Gated on the type id rather than on a flag in
    // `ladders.json`: that file is tuning data generated by `ladders.py` and
    // flows one way, and which overlay says what is a presentation decision
    // that has no business round-tripping through the ladder generator.
    if (!won && this.fatalBattle && this.typeId === TEACHING_TYPE) {
      const { tier, damage } = this.fatalBattle;
      // "Took your last N" rather than "cost N": a battle event reports HP
      // ACTUALLY lost, so a 20-point blow against 10 HP reports 10 — which
      // read as a contradiction beside the rules card's "a tier 5 at LV1 costs
      // 20 HP". On a fatal blow the HP lost is always exactly what was left,
      // so this says the same number without quoting a price. Deriving the
      // full blow instead would mean a second copy of the damage formula
      // outside the engine, which is how the two drift.
      card.append(el('p', 'overlay-note',
        `A tier ${tier} creature at LV${game.level} took your last ${damage} HP. ` +
        `At LV${tier} it would have cost nothing — ` +
        'every board can be cleared without taking a single point of damage.'));
    }
    // Said on the overlay rather than only in Settings, because this is the
    // moment the absence of a new best time would otherwise look like a bug.
    if (won && !counts) card.append(this.modifiedNote());
    if (unlocked !== null) {
      card.append(el('p', 'overlay-note', `Board ${unlocked} unlocked.`));
    } else if (won && this.boardIndex >= type.boards.length) {
      card.append(el('p', 'overlay-note', `${type.name} cleared.`));
    }

    const row = el('div', 'overlay-actions');
    // The continuation has a next board too. Stopping this at board 10 would
    // send a player back to the grid to click an arrow after every scaling
    // board, which is the one place the ladder's own flow still applies.
    if (won && this.boardIndex < maxBoard(ladders, this.typeId)) {
      const next = el('button', 'primary', 'Next board');
      next.addEventListener('click', () => {
        const to = this.boardIndex + 1;
        if (to > type.boards.length) this.progress.setScalingBoard(this.typeId, to);
        this.startBoard(this.typeId, to);
      });
      row.append(next);
    }
    const again = el('button', won ? '' : 'primary', won ? 'Replay' : 'Try again');
    again.addEventListener('click', () => this.startBoard(this.typeId, this.boardIndex));
    row.append(again);

    const same = el('button', 'ghost', 'Same board again');
    same.title = `Seed ${this.seed}`;
    same.addEventListener('click', () => this.startBoard(this.typeId, this.boardIndex, this.seed));
    row.append(same);

    const list = el('button', 'ghost', 'Board select');
    list.addEventListener('click', () => this.showBoards(this.typeId));
    row.append(list);

    card.append(row);
    overlay.append(card);
    this.root.querySelector('.screen')?.append(overlay);
    this.view?.render();
    if (won) this.celebrate();
  }

  /**
   * Fire the board-clear effect over the stage.
   *
   * Over the STAGE and not the overlay: the effect belongs to the board that
   * was just cleared, and an overlay is a card floating above it. Drawn on its
   * own layer so the board's turn-based renderer stays turn-based.
   */
  private celebrate(): void {
    const effect = this.settings.victoryEffect(this.typeId);
    if (!effect) return;
    const stage = this.root.querySelector('.stage');
    if (!(stage instanceof HTMLElement)) return;
    this.endVictory();
    // The icon effects animate the board's own creatures, so they borrow the
    // glyphs from the view; the ambient ones ignore it.
    this.stopVictory = playVictory(
      stage, effect, this.settings.themeFor(this.typeId), this.view?.victorySource(),
    );
  }

  /** The one-line explanation of why a clear was not written down. */
  private modifiedNote(): HTMLElement {
    const easier = easierThanDefault(this.settings.gameplay);
    return el('p', 'overlay-note modified',
      `Not recorded — ${easier.join(', ')} ${easier.length === 1 ? 'is' : 'are'} ` +
      'set easier than the tuned game. Harder settings record normally.');
  }

  // ----------------------------------------------------------- result: full run

  /**
   * A board of a run ended — which is three different events.
   *
   * A cleared board that is not the last one does not end anything: the run
   * carries on, so nothing is recorded and the clock keeps running. Only a
   * loss or the tenth clear finishes a run, and only those are written down.
   *
   * Individual boards are never recorded from a run. Every board of a run was
   * already cleared on the ladder — a run cannot open otherwise — so there is
   * no progress a run could add, and a board "cleared" at 2 HP carried in from
   * board 6 is not the same claim as clearing it outright.
   */
  private finishRunBoard(): void {
    const run = this.run!;
    const game = this.game!;
    const type = ladders.find((t) => t.id === this.typeId)!;
    const midRun = game.status === 'won' && !run.isLastBoard;

    if (!midRun) {
      this.frozenSeconds = this.elapsedSeconds();
      this.stopClock();
      if (this.recordsCount) {
        this.progress.recordRun(this.typeId, {
          completed: run.status === 'won',
          reachedBoard: this.boardIndex,
          hp: game.hp,
          seconds: this.frozenSeconds,
        });
      }
    }
    this.sfx.play(game.status === 'lost' ? 'lose' : 'win');

    const won = run.status === 'won';
    const overlay = el('div', `overlay ${game.status === 'lost' ? 'lose' : 'win'}`);
    const card = el('div', 'overlay-card');

    if (midRun) {
      const healed = Math.min(run.healPerBoard, run.maxHp - game.hp);
      card.append(el('h2', undefined, `BOARD ${this.boardIndex} CLEAR`));
      card.append(el('p', 'overlay-stats',
        `${type.name} full run · ${this.elapsedSeconds()}s · HP ${game.hp}/${run.maxHp}`));
      // Said explicitly, because the number is the mode: at full HP the heal
      // is zero and a player who is not told that will read it as a bug.
      card.append(el('p', 'overlay-note', healed > 0
        ? `Healed +${healed} — HP ${game.hp + healed}/${run.maxHp} going into board ${this.boardIndex + 1}.`
        : run.healPerBoard === 0
          ? `No heal on a pool of ${run.maxHp}. Every point you lose is gone for the run.`
          : `Already at full HP, so the +${run.healPerBoard} heal is wasted.`));
      card.append(el('p', 'overlay-note',
        'Level, EXP and mana all reset on the next board. Only HP carries.'));
    } else if (won) {
      const perfect = game.hp === run.maxHp;
      card.append(el('h2', undefined, perfect ? 'PERFECT FULL RUN' : 'FULL RUN COMPLETE'));
      card.append(el('p', 'overlay-stats',
        `All ${run.boardCount} boards of ${type.name} · ${this.frozenSeconds}s · ` +
        `HP ${game.hp}/${run.maxHp}`));
      card.append(el('p', 'overlay-note', perfect
        ? 'Ten boards, not a single point of damage.'
        : `${run.damageTaken} HP lost across the ladder.`));
    } else {
      card.append(el('h2', undefined, 'RUN OVER'));
      card.append(el('p', 'overlay-stats',
        `${type.name} full run · board ${this.boardIndex} of ${run.boardCount} · ` +
        `${this.frozenSeconds}s`));
      card.append(el('p', 'overlay-note',
        `${run.legs.length} board${run.legs.length === 1 ? '' : 's'} cleared. ` +
        'The run starts again from board 1.'));
    }

    const row = el('div', 'overlay-actions');
    if (midRun) {
      const next = el('button', 'primary', `Continue → board ${this.boardIndex + 1}`);
      next.addEventListener('click', () => this.advanceRun());
      row.append(next);
    } else {
      const again = el('button', 'primary', 'New run');
      again.addEventListener('click', () => this.startFullRun(this.typeId));
      row.append(again);
      const same = el('button', 'ghost', 'Same run again');
      same.title = `Run seed ${run.seed}`;
      same.addEventListener('click', () => this.startFullRun(this.typeId, run.seed));
      row.append(same);
    }
    const list = el('button', 'ghost', midRun ? 'Abandon run' : 'Board select');
    list.addEventListener('click', () => {
      if (midRun) { this.leaveGame(); return; }
      this.run = null;
      this.showBoards(this.typeId);
    });
    row.append(list);

    if (!this.recordsCount) card.append(this.modifiedNote());

    card.append(row);
    overlay.append(card);
    this.root.querySelector('.screen')?.append(overlay);
    this.view?.render();
    if (game.status === 'won') this.celebrate();
  }

  // ----------------------------------------------------------- screen: settings

  /**
   * The settings screen, over whatever the player was doing.
   *
   * `back` is a closure rather than a screen id because the screen is reachable
   * from three places and has to return to the exact one it came from — from a
   * board that means rebuilding that board, which is safe precisely because
   * the screen is built from `game` and settings never touch it.
   */
  private showSettings(back: () => void): void {
    this.stopClock();
    this.endVictory();
    this.closeAsk();
    this.root.replaceChildren();
    this.root.append(buildSettingsScreen({
      settings: this.settings,
      typeId: this.typeId,
      tiers: this.previewTiers(),
      onBack: back,
      onPreview: (event) => this.sfx.play(event),
    }));
  }

  /**
   * How many creature tiers the settings screen's example board should carry.
   *
   * The board being played, when there is one, because that is the board the
   * preview is standing in for — and it is the only answer that is right on
   * BLIND, whose tier count climbs from 5 to 9 across its own ladder where
   * every other type holds one number for all ten.
   *
   * With no board live it is the last one they looked at, which is the same
   * pair of fields "game type default" already resolves against, so the whole
   * screen describes one place rather than two.
   */
  private previewTiers(): number {
    if (this.game) return this.game.config.tiers;
    return boardRow(ladders, this.typeId, this.boardIndex)?.tiers ?? 5;
  }
}
