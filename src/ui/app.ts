/**
 * The router: which screen is showing, the state that crosses screens (the ladder, the board,
 * the game, a run in progress), the single keyboard listener, and the actions a screen's
 * controls report. Each screen's furniture is built in `screens/` and `game/`; the engine owns
 * every rule.
 */

import { boardConfig, boardRow, maxBoard } from '../engine/config.js';
import { Game } from '../engine/game.js';
import { randomSeed } from '../engine/rng.js';
import { FullRun } from '../engine/run.js';
import { isAtLeastAsHard } from '../engine/settings.js';
import type { GameEvent } from '../engine/types.js';
import { BoardView, type BoardDisplay } from './board/view.js';
import { BoardClock } from './game/clock.js';
import { gatePalette, syncClock, syncGameScreen } from './game/hud.js';
import { EntryMode } from './game/mode.js';
import { BoardActions } from './game/actions.js';
import { flashStage } from './game/flash.js';
import { buildBoardOutcome, buildRunOutcome } from './game/outcome.js';
import { type GameScreenElements, buildGameScreen } from './game/screen.js';
import { soundFor } from './game/sound.js';
import { ladders } from './ladders.js';
import { buildMuteButton, syncMuteButton } from './mute.js';
import { type AskOptions, buildAsk } from './overlays/ask.js';
import { Progress } from './progress.js';
import { buildSaveBackup } from './screens/backup.js';
import { buildBoardList } from './screens/boards.js';
import { buildHowTo } from './screens/howto.js';
import { buildLadderList } from './screens/ladders.js';
import { Settings } from './settings.js';
import { buildSettingsScreen } from './settingsscreen/screen.js';
import { Sfx } from './sfx.js';
import { playVictory } from './victory/play.js';

export class App {
  private readonly root: HTMLElement;
  private readonly progress = Progress.load();
  readonly settings = Settings.load();
  private readonly sfx = new Sfx();

  private game: Game | null = null;
  private view: BoardView | null = null;
  private els: GameScreenElements | null = null;
  private typeId = 'easy';
  private boardIndex = 1;
  private seed = 0;
  /**
   * The Full Run in progress, if this is one. `game` is always the board on screen; `run` owns
   * the HP pool and decides what happens when that board ends.
   */
  private run: FullRun | null = null;

  /** What a click on the board does right now. */
  private readonly mode = new EntryMode();
  /** What the player's input does on a board (game/actions.ts). */
  private readonly actions = new BoardActions({
    game: () => this.game,
    view: () => this.view,
    mode: this.mode,
    sfx: this.sfx,
    apply: (events) => this.apply(events),
    refresh: () => this.refresh(),
    leaveGame: () => this.leaveGame(),
  });
  private readonly clock = new BoardClock();
  /** Where the settings screen goes back to while it is showing; Escape takes the same route. */
  private settingsBack: (() => void) | null = null;
  /** The open modal overlay (a question, the how-to, the save backup), if any. */
  private askOverlay: HTMLElement | null = null;
  /** Stops a running board-clear effect; a screen rebuild must call it. */
  private stopVictory: (() => void) | null = null;
  /** The blow that ended a lost board, kept for the overlay. */
  private fatalBattle: { tier: number; damage: number } | null = null;
  private muteBtn: HTMLElement | null = null;

  // ------------------------------------------------------------ dev handles

  /** The board on screen, for the console and the tests. */
  get current(): Game | null {
    return this.game;
  }
  get cellSize(): number {
    return this.view?.cellSize ?? 0;
  }
  play(typeId: string, board: number, seed?: number): void {
    this.startBoard(typeId, board, seed ?? randomSeed());
  }
  get currentRun(): FullRun | null {
    return this.run;
  }
  runFull(typeId: string, seed?: number): void {
    this.startFullRun(typeId, seed ?? randomSeed());
  }
  /** Repaint after the game was driven from outside. */
  sync(): void {
    this.refresh();
  }

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.view?.fit());
    // A settings change has to reach the board the player came from, not just the next one.
    this.settings.onChange(() => this.applyPresentation());
    this.muteBtn = buildMuteButton(() => {
      this.settings.setPresentation({ muted: !this.settings.presentation.muted });
      this.syncMuteButton();
    });
    this.applyPresentation();
    this.showTypes();
  }

  // ----------------------------------------------------------- presentation

  private syncMuteButton(): void {
    if (this.muteBtn) syncMuteButton(this.muteBtn, this.settings.presentation.muted);
  }

  /**
   * Push the presentation settings at everything already on screen. The interface's font is a CSS
   * variable so the menus follow it; the board is re-themed directly because nothing cascades into
   * a canvas. The speaker is repainted from here too, because "Reset presentation" clears `muted`.
   */
  private applyPresentation(): void {
    this.wearFont();
    const title = this.settings.titleFont();
    document.documentElement.style.setProperty('--title-font', title.stack);
    document.documentElement.style.setProperty('--title-ex-fix', String(title.exHeightFix ?? 1));
    // A percentage, so it multiplies the browser's own text size rather than replacing it.
    document.documentElement.style.fontSize = `${this.settings.presentation.textSize * 100}%`;
    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    const { customPitches, soundCheck, sfxVolume } = this.settings.presentation;
    this.sfx.setPitches(customPitches ? soundCheck.pitches : {});
    this.sfx.setVolume(sfxVolume);
    this.view?.setDisplay(this.settings.themeFor(this.typeId), this.boardDisplay());
    this.syncMuteButton();
  }

  /** Dress the interface in its face on the current ladder, with its x-height correction. */
  private wearFont(): void {
    const face = this.settings.interfaceFont(this.typeId);
    document.documentElement.style.setProperty('--font', face.stack);
    document.documentElement.style.setProperty('--ex-fix', String(face.exHeightFix ?? 1));
  }

  /** The renderer's slice of the presentation settings. */
  private boardDisplay(): BoardDisplay {
    const p = this.settings.presentation;
    return {
      maxCell: p.maxZoom,
      font: this.settings.boardFont(this.typeId),
      highlight: this.settings.highlightStyle(this.typeId),
      strikeDefeated: p.strikeDefeated,
    };
  }

  /**
   * Whether a clear on these settings goes in the record books. Presentation never counts
   * against it; only the gameplay dials do, and only in one direction (decision 0014).
   */
  private get recordsCount(): boolean {
    return isAtLeastAsHard(this.settings.gameplay);
  }

  private typeName(): string {
    return ladders.find((t) => t.id === this.typeId)?.name ?? this.typeId;
  }

  // ---------------------------------------------------------------- screens

  /** Every screen begins here: nothing from the last one may survive. */
  private clearScreen(): void {
    this.clock.stop();
    this.endVictory();
    this.closeAsk();
    this.root.replaceChildren();
    this.view = null;
    this.els = null;
    this.settingsBack = null;
  }

  /**
   * The one key listener. A question is modal on every screen: Escape answers "no" and nothing
   * else gets through. Otherwise the board's keys reach it only while it is on screen, never under
   * the settings screen or after the player has left it, and on the settings screen Escape is Back.
   */
  private onKey(e: KeyboardEvent): void {
    if (this.askOverlay) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeAsk();
      }
      return;
    }
    if (this.els) {
      this.actions.onKey(e);
      return;
    }
    if (e.key === 'Escape' && this.settingsBack) {
      e.preventDefault();
      this.settingsBack();
    }
  }

  private showTypes(): void {
    this.clearScreen();
    this.root.append(
      buildLadderList({
        progress: this.progress,
        settings: this.settings,
        recordsCount: this.recordsCount,
        pickType: (id) => this.showBoards(id),
        howTo: () => this.showHowTo(),
        openSettings: () => this.showSettings(() => this.showTypes()),
        backup: () => this.showSaveBackup(),
        resetProgress: () =>
          this.ask({
            title: 'ERASE PROGRESS?',
            body: 'Every unlock, clear time and full run on this device. This cannot be undone.',
            confirmLabel: 'Erase everything',
            cancelLabel: 'Cancel',
            onConfirm: () => {
              this.progress.reset();
              this.showTypes();
            },
          }),
        setUnlockAll: (on) => {
          this.progress.setUnlockAll(on);
          this.showTypes();
        },
      }),
    );
    // Opens itself exactly once, on a save that has never seen it: a player arriving for the
    // first time has one unlocked ladder and no idea what the game is. Marked seen when shown,
    // so a reload cannot reopen it.
    if (!this.progress.seenHowTo) {
      this.progress.markHowToSeen();
      this.showHowTo();
    }
  }

  private showBoards(typeId: string): void {
    this.clearScreen();
    // "Game type default" and the fonts follow the ladder you are looking at, so the type has to
    // be current before anything is drawn.
    this.typeId = typeId;
    this.applyPresentation();
    this.root.append(
      buildBoardList(typeId, {
        progress: this.progress,
        back: () => this.showTypes(),
        startBoard: (id, n) => this.startBoard(id, n),
        startRun: (id) => this.startFullRun(id),
      }),
    );
  }

  /**
   * The settings screen, over whatever the player was doing. `back` is a closure because the
   * screen is reachable from three places and has to return to the exact one it came from.
   */
  private showSettings(back: () => void): void {
    this.clearScreen();
    this.settingsBack = back;
    this.root.append(
      buildSettingsScreen({
        settings: this.settings,
        typeId: this.typeId,
        tiers: this.previewTiers(),
        onBack: back,
        onPreview: (event) => this.sfx.play(event),
        onAudition: (pack, event, ratio, volume) => {
          if (!this.settings.presentation.muted) this.sfx.audition(pack, event, ratio, volume);
        },
      }),
    );
  }

  /**
   * How many creature tiers the settings screen's example board should carry: the board being
   * played, or the last one looked at. The only answer that is right on BLIND, whose tier count
   * climbs across its own ladder.
   */
  private previewTiers(): number {
    if (this.game) return this.game.config.tiers;
    return boardRow(ladders, this.typeId, this.boardIndex)?.tiers ?? 5;
  }

  // --------------------------------------------------------------- overlays

  /** Show a modal over the current screen; every rebuild closes it (decision 0017). */
  private openModal(overlay: HTMLElement, focus?: HTMLElement): boolean {
    this.closeAsk();
    const screen = this.root.querySelector('.screen');
    if (!screen) return false;
    screen.append(overlay);
    this.askOverlay = overlay;
    focus?.focus();
    return true;
  }

  private closeAsk(): void {
    this.askOverlay?.remove();
    this.askOverlay = null;
  }

  /** Ask before doing something irreversible, in the page rather than in a browser dialog. */
  private ask(opts: AskOptions): void {
    const { overlay, focus } = buildAsk(opts, () => this.closeAsk());
    if (!this.openModal(overlay, focus)) opts.onConfirm();
  }

  private showHowTo(onClose?: () => void): void {
    const { overlay, focus } = buildHowTo(() => {
      this.closeAsk();
      onClose?.();
    });
    if (!this.openModal(overlay, focus)) onClose?.();
  }

  private showSaveBackup(draft = '', error = ''): void {
    this.openModal(
      buildSaveBackup(draft, error, {
        ask: (opts) => this.ask(opts),
        close: () => this.closeAsk(),
        reopen: (d, e) => this.showSaveBackup(d, e),
      }),
    );
  }

  // ------------------------------------------------------------ the board

  private startBoard(typeId: string, board: number, seed = randomSeed()): void {
    this.run = null;
    this.typeId = typeId;
    this.boardIndex = board;
    this.seed = seed;
    this.resetBoardState();

    const cfg = boardConfig(ladders, typeId, board);
    // `Game.create` applies the board's opening rule, so by the time it returns the automatic
    // first click has been made and the clock is already the player's problem.
    this.game = Game.create(cfg, seed, { settings: this.settings.gameplay });
    this.clock.begin();
    this.clock.arm(
      this.progress.boardRecord(typeId, board).bestTime,
      this.settings.gameplay.timeAttack,
    );
    this.buildGameScreen();
    this.startClock();
  }

  /**
   * Begin a Full Run. The clock is started once here and never restarted, because a run's time
   * is the run's; it starts on board 1's opening, as a single board's does.
   */
  private startFullRun(typeId: string, seed = randomSeed()): void {
    this.typeId = typeId;
    this.seed = seed;
    this.run = FullRun.start(ladders, typeId, seed, { settings: this.settings.gameplay });
    this.boardIndex = this.run.boardIndex;
    this.resetBoardState();

    // `FullRun.start` has already built board 1 and dealt its opening.
    this.clock.begin();
    this.game = this.run.game;
    // A run races the run's own best, not board 1's.
    this.clock.arm(this.progress.runRecord(typeId).bestTime, this.settings.gameplay.timeAttack);
    this.buildGameScreen();
    this.startClock();
  }

  /**
   * Take the heal and move to the next board of a run. The screen is rebuilt because the
   * board's size, tiers and spells can all differ; the clock is deliberately NOT reset.
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

  /** Per-board input state. Never touches the clock; a run outlives a board. */
  private resetBoardState(): void {
    this.mode.reset();
    this.fatalBattle = null;
  }

  private buildGameScreen(): void {
    const game = this.game!;
    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    this.wearFont();
    this.clearScreen();

    const els = buildGameScreen(game, this.typeId, this.boardIndex, this.run, {
      // Returns to this same board: the screen is rebuilt from `game`, which is untouched. The
      // clock keeps running, as it does whenever the player walks away from a board.
      openSettings: () =>
        this.showSettings(() => {
          this.buildGameScreen();
          this.startClock();
        }),
      leave: () => this.leaveGame(),
      pickTier: (tier) => this.actions.pickTier(tier),
      pencilEmpty: () => {
        this.mode.notesMode = true;
        this.actions.pickTier(0);
      },
      toggleNotes: () => this.actions.toggleNotesMode(),
      sweep: (useMarks) => this.actions.doSweep(useMarks),
      wait: () => this.actions.doWait(),
      pickSpell: (id) => this.actions.pickSpell(id),
      cancelSpell: () => {
        this.mode.cancelSpell();
        this.refresh();
      },
    });
    this.els = els;
    this.root.append(els.root);

    this.view = new BoardView(els.canvas, {
      onOpen: (x, y) => this.actions.onCellPrimary(x, y),
      onCycleMark: (x, y) => this.actions.cycleMark(x, y),
      // The hover ring is drawn by the view; the palette answers for the cell.
      onHover: () => this.gatePalette(),
      lands: (cell) => this.actions.clickLands(cell),
    });
    this.view.setGame(game, this.settings.themeFor(this.typeId), this.boardDisplay());
    this.refresh();
  }

  // ---------------------------------------------------------------- actions

  /**
   * Back out to board select. A run cannot be resumed, so leaving one asks first; a single board
   * is replayable at will and needs no guard.
   */
  private leaveGame(): void {
    if (this.run && this.run.status === 'playing') {
      const run = this.run;
      this.ask({
        title: 'ABANDON RUN?',
        body:
          `${this.typeName()} full run, board ${this.boardIndex} of ${run.boardCount}, ` +
          `HP ${run.hp}/${run.maxHp}. A run cannot be resumed.`,
        confirmLabel: 'Abandon run',
        cancelLabel: 'Keep playing',
        onConfirm: () => {
          // An abandoned run is neither won nor lost, but it did reach a board.
          this.progress.recordRun(this.typeId, {
            completed: false,
            reachedBoard: this.boardIndex,
            hp: run.hp,
            seconds: this.clock.elapsedSeconds(),
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

  private gatePalette(): void {
    if (this.els) gatePalette(this.els, this.game, this.mode, this.view?.hoveredCell ?? null);
  }

  private apply(events: GameEvent[]): void {
    const game = this.game!;

    if (this.els) flashStage(this.els.stage, events, this.settings.presentation.fightRim);
    if (this.sfx.enabled) {
      const sound = soundFor(events);
      if (sound) this.sfx.play(sound);
    }

    // Keep the blow that ended it, before the events go out of scope. The last costly fight in
    // the batch is the fatal one: a click resolves at most one fight, and a sweep stops the
    // moment HP runs out.
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

  private refresh(): void {
    const game = this.game;
    if (!game || !this.els) return;
    syncGameScreen(this.els, {
      game,
      run: this.run,
      boardIndex: this.boardIndex,
      mode: this.mode,
      hovered: this.view?.hoveredCell ?? null,
    });
    this.view?.render();
    this.updateClock();
  }

  // ------------------------------------------------------------------ clock

  private updateClock(): void {
    const left = this.clock.remainingSeconds();
    if (this.els) syncClock(this.els, this.clock.elapsedSeconds(), left);
    // The engine owns no clock, so "the countdown ran out" is a fact only this loop can know,
    // and `forfeit` is how it hands that back to the rules.
    if (left === 0 && !this.clock.timeExpired && this.game?.status === 'playing') {
      this.clock.timeExpired = true;
      this.apply(this.game.forfeit());
    }
  }

  private startClock(): void {
    this.clock.start(() => this.updateClock());
  }

  /** Cancel a board-clear effect still in flight; a screen rebuild must call this. */
  private endVictory(): void {
    this.stopVictory?.();
    this.stopVictory = null;
  }

  // ----------------------------------------------------------------- result

  private finish(): void {
    if (this.run) {
      this.finishRunBoard();
      return;
    }
    const game = this.game!;
    this.clock.freeze();
    const seconds = this.clock.frozenSeconds!;
    const won = game.status === 'won';
    const perfect = won && game.hp === game.maxHp;
    const type = ladders.find((t) => t.id === this.typeId)!;
    const recorded = this.recordsCount;
    // Read before the clear is written down, after which every clear would look like a repeat.
    const firstClear = won && !this.progress.boardRecord(this.typeId, this.boardIndex).cleared;
    let unlocked: number | null = null;
    // A board cleared on settings easier than the tuned ones is not written down at all.
    if (won && recorded) {
      const result = this.progress.recordClear(ladders, this.typeId, this.boardIndex, {
        perfect,
        seconds,
      });
      unlocked = result.unlockedBoard;
    }
    this.sfx.play(won ? 'win' : 'lose');

    const overlay = buildBoardOutcome({
      game,
      typeId: this.typeId,
      typeName: type.name,
      boardIndex: this.boardIndex,
      seed: this.seed,
      won,
      perfect,
      // The wait is for watching the clear effect, so with the effect off there is none.
      held: firstClear && this.settings.victoryEffect(this.typeId) !== null,
      timeExpired: this.clock.timeExpired,
      seconds,
      fatal: this.fatalBattle,
      recorded,
      unlocked,
      ladderLength: type.boards.length,
      lastBoard: maxBoard(ladders, this.typeId),
      gameplay: this.settings.gameplay,
      onNext: () => {
        const to = this.boardIndex + 1;
        if (to > type.boards.length) this.progress.setScalingBoard(this.typeId, to);
        this.startBoard(this.typeId, to);
      },
      onReplay: () => this.startBoard(this.typeId, this.boardIndex),
      onSame: () => this.startBoard(this.typeId, this.boardIndex, this.seed),
      onList: () => this.showBoards(this.typeId),
    });
    this.root.querySelector('.screen')?.append(overlay);
    this.view?.render();
    if (won) this.celebrate();
  }

  private finishRunBoard(): void {
    const run = this.run!;
    const game = this.game!;
    const type = ladders.find((t) => t.id === this.typeId)!;
    const midRun = game.status === 'won' && !run.isLastBoard;

    if (!midRun) {
      this.clock.freeze();
      if (this.recordsCount) {
        this.progress.recordRun(this.typeId, {
          completed: run.status === 'won',
          reachedBoard: this.boardIndex,
          hp: game.hp,
          seconds: this.clock.frozenSeconds!,
        });
      }
    }
    this.sfx.play(game.status === 'lost' ? 'lose' : 'win');

    const overlay = buildRunOutcome({
      game,
      run,
      typeName: type.name,
      boardIndex: this.boardIndex,
      seconds: this.clock.elapsedSeconds(),
      recorded: this.recordsCount,
      gameplay: this.settings.gameplay,
      onContinue: () => this.advanceRun(),
      onNewRun: () => this.startFullRun(this.typeId),
      onSameRun: () => this.startFullRun(this.typeId, run.seed),
      onAbandon: () => this.leaveGame(),
      onList: () => {
        this.run = null;
        this.showBoards(this.typeId);
      },
    });
    this.root.querySelector('.screen')?.append(overlay);
    this.view?.render();
    if (game.status === 'won') this.celebrate();
  }

  /**
   * Fire the board-clear effect over the stage, not the overlay: the effect belongs to the board
   * that was just cleared. Drawn on its own layer so the board's renderer stays turn-based.
   */
  private celebrate(): void {
    const effect = this.settings.victoryEffect(this.typeId);
    if (!effect) return;
    const stage = this.els?.stage;
    if (!stage) return;
    this.endVictory();
    this.stopVictory = playVictory(
      stage,
      effect,
      this.settings.themeFor(this.typeId),
      this.view?.victorySource(),
    );
  }
}
