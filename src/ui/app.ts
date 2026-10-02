/**
 * The router: which screen is showing, the state that crosses screens (the ladder, the board,
 * the game, a run in progress), the single keyboard listener, and the actions a screen's
 * controls report. Each screen's furniture is built in `screens/` and `game/`; the engine owns
 * every rule.
 */

import { boardConfig, boardRow } from '../engine/config.js';
import { Game } from '../engine/game.js';
import { randomSeed } from '../engine/rng.js';
import { FullRun } from '../engine/run.js';
import { isAtLeastAsHard } from '../engine/settings.js';
import type { GameEvent } from '../engine/types.js';
import { BoardView } from './board/view.js';
import { boardDisplayFor, dressDocument, wearInterfaceFont } from './dress.js';
import { BoardClock } from './game/clock.js';
import { BoardEnding } from './game/ending.js';
import { BoardKeeper, takeUp } from './game/keeper.js';
import { gatePalette, syncClock, syncGameScreen } from './game/hud.js';
import { EntryMode } from './game/mode.js';
import { BoardActions } from './game/actions.js';
import { BoardRecorder } from './game/recorder.js';
import { flashStage } from './game/flash.js';
import { type GameScreenElements, buildGameScreen } from './game/screen.js';
import { soundFor } from './game/sound.js';
import { ladders } from './ladders.js';
import { buildSpeaker } from './mute.js';
import { CrashWatch } from './overlays/crash.js';
import { Modal } from './overlays/modal.js';
import { type Slot, pausedGames } from './paused.js';
import { Progress } from './progress.js';
import { buildBoardList } from './screens/boards.js';
import { buildLadderList } from './screens/ladders.js';
import { Settings } from './settings.js';
import { buildSettingsScreen } from './settingsscreen/screen.js';
import { Sfx } from './sfx.js';
import { Teaching } from './teaching.js';
import { TelemetryStore } from './telemetrystore.js';

/** The game in the page, built once on its root element by `main.ts`: the router above. */
export class App {
  private readonly root: HTMLElement;
  private readonly progress = Progress.load();
  readonly settings = Settings.load();
  private readonly sfx = new Sfx();
  /** What each board cost the player, on this device (docs/human-tuning-plan.md, 4.8). */
  private readonly telemetry = TelemetryStore.load();

  private game: Game | null = null;
  private view: BoardView | null = null;
  private els: GameScreenElements | null = null;
  private typeId = 'easy';
  private boardIndex = 1;
  private seed = 0;
  /**
   * The Full Run in progress, if this is one. `game` is the board being played, kept under the
   * settings screen and dropped with `run` on leaving; `run` owns the HP pool and the board's end.
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
    settings: this.settings,
    move: (move) => this.recorder.move(move),
    apply: (events) => this.apply(events),
    refresh: () => this.refresh(),
    addSeconds: (seconds) => this.clock.addSeconds(seconds),
    leaveGame: () => this.leaveGame(),
    pause: () => this.pause(),
    explain: () => this.explainBoard(),
    guide: () => this.teaching.guideFromBoard(),
    refuse: (x, y) => this.teaching.refuse(this.game?.cellAt(x, y) ?? null),
    next: () => this.teaching.next(),
  });
  private readonly clock = new BoardClock();
  /** The board on screen kept as a paused game, move by move (decision 0057). */
  private readonly keeper: BoardKeeper;
  /** What the board on screen is costing, tallied move by move (game/recorder.ts). */
  private readonly recorder: BoardRecorder;
  /** Where the settings screen goes back to while it is showing; Escape takes the same route. */
  private settingsBack: (() => void) | null = null;
  /** The modal overlay over the screen: a question, the how-to, the save backup, the guide. */
  private readonly modal: Modal;
  /** The tutor, the rules card and the field guide. */
  private readonly teaching: Teaching;
  /** How a board ends: the record, the overlay and the clear effect (game/ending.ts). */
  private readonly ending: BoardEnding;

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
  sync(): void {
    this.teaching.tutor.dismiss();
    this.refresh();
  }

  constructor(root: HTMLElement) {
    this.root = root;
    this.modal = new Modal(root);
    this.teaching = new Teaching({
      settings: this.settings,
      progress: this.progress,
      modal: this.modal,
      typeId: () => this.typeId,
      show: (screen) => {
        this.clearScreen();
        this.root.append(screen);
      },
      play: (game) => this.startLesson(game),
      refresh: () => this.refresh(),
      ladders: () => this.showTypes(),
    });
    this.ending = new BoardEnding({
      root,
      progress: this.progress,
      settings: this.settings,
      sfx: this.sfx,
      clock: this.clock,
      tutor: this.teaching.tutor,
      game: () => this.game!,
      run: () => this.run,
      typeId: () => this.typeId,
      boardIndex: () => this.boardIndex,
      seed: () => this.seed,
      view: () => this.view,
      stage: () => this.els?.stage ?? null,
      startBoard: (typeId, board, seed) => this.startBoard(typeId, board, seed),
      startFullRun: (typeId, seed) => this.startFullRun(typeId, seed),
      advanceRun: () => this.advanceRun(),
      askToLeave: () => this.leaveGame(false),
      showBoards: (typeId) => this.showBoards(typeId),
    });
    this.keeper = new BoardKeeper({
      game: () => this.game,
      run: () => this.run,
      typeId: () => this.typeId,
      boardIndex: () => this.boardIndex,
      clock: this.clock,
      tutor: this.teaching.tutor,
    });
    this.recorder = new BoardRecorder({
      game: () => this.game,
      typeId: () => this.typeId,
      boardIndex: () => this.boardIndex,
      clock: this.clock,
      tutor: this.teaching.tutor,
      // Written down only while the player keeps statistics; the store itself stays.
      telemetry: {
        record: (...attempt) => {
          if (this.settings.presentation.keepStats) this.telemetry.record(...attempt);
        },
      },
      play: (move) => this.keeper.move(move),
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    new CrashWatch(this.modal, this.clock, () => this.showTypes());
    // The clock is kept with the game, so it is written down as the page goes away.
    window.addEventListener('pagehide', () => this.keeper.save());
    document.addEventListener('visibilitychange', () => this.keeper.save());
    window.addEventListener('resize', () => this.view?.fit());
    // A settings change has to reach the board the player came from, not just the next one.
    this.settings.onChange(() => this.applyPresentation());
    buildSpeaker(this.settings, () => this.sfx.play('levelup'));
    this.applyPresentation();
    this.showTypes();
  }

  // ----------------------------------------------------------- presentation

  /**
   * Push the presentation settings at everything already on screen (`dress.ts`). The speaker
   * repaints itself (`mute.ts`).
   */
  private applyPresentation(): void {
    dressDocument(this.settings, this.typeId);
    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    const { customPitches, soundCheck, sfxVolume } = this.settings.presentation;
    this.sfx.setPitches(customPitches ? soundCheck.pitches : {});
    this.sfx.setVolume(sfxVolume);
    this.sfx.setSilenced(this.settings.presentation.silenced);
    this.view?.setDisplay(
      this.settings.themeFor(this.typeId),
      boardDisplayFor(this.settings, this.typeId),
    );
  }

  /**
   * Whether a clear on the current settings would go in the record books, which the ladder list
   * says. Presentation never counts against it; only the gameplay dials do, and only in one
   * direction (decision 0014).
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
    this.clock.stopTicking();
    this.ending.endVictory();
    this.modal.close();
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
    if (this.modal.onKey(e)) return;
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
    this.game = this.run = null;
    this.root.append(
      buildLadderList({
        progress: this.progress,
        settings: this.settings,
        recordsCount: this.recordsCount,
        pickType: (id) => this.showBoards(id),
        howTo: () => this.teaching.howTo(),
        guide: () => this.teaching.guide(),
        school: () => this.teaching.school(),
        openSettings: () => this.showSettings(() => this.showTypes()),
        backup: () => this.modal.saveBackup(),
        about: () => this.modal.about(),
        resetProgress: () =>
          this.modal.eraseProgress(() => {
            this.progress.reset();
            pausedGames.clearAll();
            this.telemetry.reset();
            this.showTypes();
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
      this.teaching.howTo();
    }
  }

  private showBoards(typeId: string): void {
    this.clearScreen();
    this.game = this.run = null;
    // "Game type default" and the fonts follow the ladder you are looking at, so the type has to
    // be current before anything is drawn.
    this.typeId = typeId;
    this.applyPresentation();
    this.root.append(
      buildBoardList(typeId, {
        progress: this.progress,
        back: () => this.showTypes(),
        guide: () => this.teaching.guide(undefined, typeId),
        startBoard: (id, n) => this.startBoard(id, n),
        startRun: (id) => this.startFullRun(id),
      }),
    );
    this.teaching.opened(typeId);
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

  // ------------------------------------------------------------ the board

  /** Deal a board, or with no seed asked for, take up the game paused on it if there is one. */
  private startBoard(typeId: string, board: number, seed?: number): void {
    if (seed === undefined && this.resume({ typeId, board })) return;
    seed ??= randomSeed();
    this.run = null;
    this.teaching.leaveLesson();
    this.typeId = typeId;
    this.boardIndex = board;
    this.seed = seed;
    this.resetBoardState();

    const cfg = boardConfig(ladders, typeId, board);
    // `Game.create` applies the board's opening rule, so by the time it returns the automatic
    // first click has been made and the clock is already the player's problem.
    this.game = Game.create(cfg, seed, { settings: this.settings.gameplay });
    this.keeper.begin();
    this.recorder.begin();
    this.clock.begin();
    const best = this.progress.boardRecord(ladders, typeId, board).bestTime;
    this.clock.arm(best, this.settings.gameplay);
    this.buildGameScreen();
    this.startTicking();
  }

  /**
   * Begin a Full Run. The clock is started once here and never restarted, because a run's time
   * is the run's; it starts on board 1's opening, as a single board's does.
   */
  private startFullRun(typeId: string, seed?: number): void {
    if (seed === undefined && this.resume({ typeId, run: true })) return;
    seed ??= randomSeed();
    this.teaching.leaveLesson();
    this.typeId = typeId;
    this.seed = seed;
    this.run = FullRun.start(ladders, typeId, seed, { settings: this.settings.gameplay });
    this.boardIndex = this.run.boardIndex;
    this.resetBoardState();
    this.teaching.tutor.resetRun();
    this.keeper.begin();

    // `FullRun.start` has already built board 1 and dealt its opening.
    this.clock.begin();
    this.game = this.run.game;
    this.recorder.begin();
    // A run races the run's own best, not board 1's, and a limit per board over all its boards.
    const best = this.progress.runRecord(ladders, typeId).bestTime;
    this.clock.arm(best, this.settings.gameplay, this.run.boardCount);
    this.buildGameScreen();
    this.startTicking();
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
    this.keeper.nextBoard();
    this.recorder.begin();
    this.buildGameScreen();
    this.startTicking();
  }

  /** A school lesson's board, which `teaching` has begun: no records, no best time, no countdown. */
  private startLesson(game: Game): void {
    this.run = null;
    this.keeper.release();
    this.resetBoardState();
    this.game = game;
    this.clock.begin();
    this.buildGameScreen();
    this.startTicking();
  }

  /**
   * Take up the game paused in a slot, exactly where it stood, the clock included; false when the
   * slot is empty. A run paused on a cleared board goes on to the next, as Continue would have.
   */
  private resume(slot: Slot): boolean {
    const taken = takeUp(slot);
    if (taken === null) return false;
    if (taken === 'changed') {
      this.modal.cannotResume(() =>
        'run' in slot ? this.startFullRun(slot.typeId) : this.startBoard(slot.typeId, slot.board),
      );
      return true;
    }
    const { game, run, moves, paused } = taken;
    this.teaching.leaveLesson();
    this.typeId = slot.typeId;
    this.run = run;
    this.game = game;
    this.seed = paused.seed;
    this.boardIndex = run?.boardIndex ?? paused.board;
    this.resetBoardState();
    this.teaching.tutor.hints = paused.hints;
    this.teaching.tutor.runHints = paused.runHints;
    this.clock.resumeAt(paused.elapsedMs);
    this.clock.timeLimit = paused.timeLimit;
    this.clock.timeExpired = false;
    this.keeper.begin(moves);
    this.keeper.save();
    this.recorder.begin();
    if (run?.boardWon) {
      this.advanceRun();
    } else {
      this.buildGameScreen();
      this.startTicking();
    }
    return true;
  }

  /** Per-board input state. Never touches the clock; a run outlives a board. */
  private resetBoardState(): void {
    this.mode.reset();
    this.ending.resetBoard();
    this.teaching.tutor.resetBoard();
  }

  private buildGameScreen(): void {
    const game = this.game!;
    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    wearInterfaceFont(this.settings, this.typeId);
    this.clearScreen();

    const els = buildGameScreen(
      game,
      this.typeId,
      this.boardIndex,
      this.run,
      {
        // Returns to this same board: the screen is rebuilt from `game`, which is untouched. The
        // clock keeps running, as it does whenever the player walks away from a board.
        openSettings: () =>
          this.showSettings(() => {
            this.buildGameScreen();
            this.startTicking();
          }),
        leave: () => this.leaveGame(),
        pause: () => this.pause(),
        pickTier: (tier) => this.actions.pickTier(tier),
        pencilEmpty: () => this.actions.pencilEmpty(),
        toggleNotes: () => this.actions.toggleNotesMode(),
        toggleBeatenNumbers: () => this.actions.toggleBeatenNumbers(),
        sweep: (useMarks) => this.actions.doSweep(useMarks),
        wait: () => this.actions.doWait(),
        explain: () => this.explainBoard(),
        tutor: this.settings.presentation.tutor,
        tierColors: this.settings.tierColors(this.typeId),
        guide: () => this.teaching.guideFromBoard(),
        next: () => this.teaching.next(),
        pickSpell: (id) => this.actions.pickSpell(id),
        cancelSpell: () => this.actions.cancelSpell(),
      },
      this.teaching.lessonTitle(),
    );
    this.els = els;
    this.root.append(els.root);

    this.view = new BoardView(els.canvas, {
      onOpen: (x, y) => this.actions.onCellPrimary(x, y),
      onCycleMark: (x, y) => this.actions.cycleMark(x, y),
      // The hover ring is drawn by the view; the palette answers for the cell.
      onHover: () => this.gatePalette(),
      lands: (cell) => this.actions.clickLands(cell),
    });
    this.view.setGame(
      game,
      this.settings.themeFor(this.typeId),
      boardDisplayFor(this.settings, this.typeId),
    );
    this.refresh();
  }

  // ---------------------------------------------------------------- actions

  /**
   * Back out to board select. A game with anything in it asks first whether to pause it or
   * abandon it, or pauses at once when Back pauses is on and `back` is how it was asked (the
   * mid-run card's Abandon run is not Back); a board with no move made yet needs no guard.
   */
  private leaveGame(back = true): void {
    if (this.teaching.lesson) return this.teaching.school();
    const playing = this.run ? this.run.status === 'playing' : this.game?.status === 'playing';
    if (!playing || !(this.run || this.keeper.holding)) return this.showBoards(this.typeId);
    if (back && this.settings.presentation.backPauses) return this.pause();
    this.modal.leaveGame({
      boardIndex: this.boardIndex,
      typeName: this.typeName(),
      run: this.run,
      onPause: () => this.pause(),
      onAbandon: () => this.abandon(),
    });
  }

  /** Abandon the board, or the run, on screen: its slot emptied, a run written down as an attempt. */
  private abandon(): void {
    const run = this.run;
    // An abandoned run is neither won nor lost, but it did reach a board.
    if (run) {
      this.progress.recordRun(ladders, this.typeId, {
        completed: false,
        reachedBoard: this.boardIndex,
        hp: run.hp,
        seconds: this.clock.elapsedSeconds(),
      });
    }
    this.recorder.end('abandoned');
    this.keeper.end();
    this.showBoards(this.typeId);
  }

  /** Pause: the game is already kept, so this writes the clock down and leaves it. */
  private pause(): void {
    if (this.teaching.lesson) return;
    this.keeper.save();
    this.keeper.release();
    this.showBoards(this.typeId);
  }

  private gatePalette(): void {
    if (this.els) gatePalette(this.els, this.game, this.mode, this.view?.hoveredCell ?? null);
  }

  private apply(events: GameEvent[]): void {
    const game = this.game!;
    this.teaching.tutor.dismiss();

    if (this.els) flashStage(this.els.stage, events, this.settings.presentationFor(this.typeId));
    if (this.sfx.enabled) {
      const sound = soundFor(events, (e) => this.sfx.plays(e));
      if (sound) this.sfx.play(sound);
    }

    this.ending.noteFatal(game, events);

    this.teaching.moved();
    this.refresh();
    if (this.teaching.lesson) this.teaching.ended();
    else if (game.status !== 'playing') this.finish();
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
      tutor: this.teaching.tutor.text(),
      lesson: this.teaching.lessonLine(),
      tierColors: this.settings.tierColors(this.typeId),
      beatenNumbers: this.settings.presentation.beatenNumbers,
      hintLine: this.settings.presentation.hintLine,
    });
    this.view?.setPointer(this.teaching.pointer());
    this.view?.render();
    this.updateClock();
  }

  // ------------------------------------------------------------------ tutor

  /** The tutor's press: a hint, pointed at the board and said in the hint line. It opens nothing. */
  private explainBoard(): void {
    if (this.game && this.els?.whyBtn) {
      const near = this.view?.hoveredCell ?? null;
      this.teaching.tutor.press(this.game, near, this.settings.presentation);
      this.keeper.save();
    }
    this.refresh();
  }

  // ------------------------------------------------------------------ clock

  private updateClock(): void {
    const left = this.clock.remainingSeconds();
    const style = this.settings.presentation.clock;
    if (this.els) syncClock(this.els, this.clock.elapsedSeconds(), left, style);
    // The engine owns no clock, so "the countdown ran out" is a fact only this loop can know,
    // and `forfeit` is how it hands that back to the rules.
    if (left === 0 && !this.clock.timeExpired && this.game?.status === 'playing') {
      this.clock.timeExpired = true;
      this.apply(this.game.forfeit());
    }
  }

  private startTicking(): void {
    this.clock.startTicking(() => this.updateClock());
  }

  // ----------------------------------------------------------------- result

  /** The board on screen has been won or lost (game/ending.ts). */
  private finish(): void {
    this.recorder.end(this.game!.status === 'won' ? 'cleared' : 'lost');
    // A game that is over is not kept; a run waiting on Continue still is.
    if (this.run?.status !== 'playing') this.keeper.end();
    this.ending.finish();
  }
}
