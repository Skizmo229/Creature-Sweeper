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
import { BoardView } from './board/view.js';
import { boardDisplayFor, dressDocument, wearInterfaceFont } from './dress.js';
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
import { Modal } from './overlays/modal.js';
import { Progress } from './progress.js';
import { buildBoardList } from './screens/boards.js';
import { buildLadderList } from './screens/ladders.js';
import { Settings } from './settings.js';
import { buildSettingsScreen } from './settingsscreen/screen.js';
import { Sfx } from './sfx.js';
import { Teaching } from './teaching.js';
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
    explain: () => this.explainBoard(),
    guide: () => this.teaching.guideFromBoard(),
    refuse: (x, y) => this.teaching.refuse(this.game?.cellAt(x, y) ?? null),
    next: () => this.teaching.next(),
  });
  private readonly clock = new BoardClock();
  /** Where the settings screen goes back to while it is showing; Escape takes the same route. */
  private settingsBack: (() => void) | null = null;
  /** The modal overlay over the screen: a question, the how-to, the save backup, the guide. */
  private readonly modal: Modal;
  /** The tutor, the rules card and the field guide. */
  private readonly teaching: Teaching;
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
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.view?.fit());
    // A settings change has to reach the board the player came from, not just the next one.
    this.settings.onChange(() => this.applyPresentation());
    this.muteBtn = buildMuteButton(() => {
      this.settings.setPresentation({ muted: !this.settings.presentation.muted });
      if (this.muteBtn) syncMuteButton(this.muteBtn, this.settings.presentation.muted);
    });
    this.applyPresentation();
    this.showTypes();
  }

  // ----------------------------------------------------------- presentation

  /**
   * Push the presentation settings at everything already on screen (`dress.ts`). The speaker is
   * repainted from here too, because "Reset presentation" clears `muted`.
   */
  private applyPresentation(): void {
    dressDocument(this.settings, this.typeId);
    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    const { customPitches, soundCheck, sfxVolume } = this.settings.presentation;
    this.sfx.setPitches(customPitches ? soundCheck.pitches : {});
    this.sfx.setVolume(sfxVolume);
    this.view?.setDisplay(
      this.settings.themeFor(this.typeId),
      boardDisplayFor(this.settings, this.typeId),
    );
    if (this.muteBtn) syncMuteButton(this.muteBtn, this.settings.presentation.muted);
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
        resetProgress: () =>
          this.modal.eraseProgress(() => {
            this.progress.reset();
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

  private startBoard(typeId: string, board: number, seed = randomSeed()): void {
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
    this.teaching.leaveLesson();
    this.typeId = typeId;
    this.seed = seed;
    this.run = FullRun.start(ladders, typeId, seed, { settings: this.settings.gameplay });
    this.boardIndex = this.run.boardIndex;
    this.resetBoardState();
    this.teaching.tutor.resetRun();

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

  /** A school lesson's board, which `teaching` has begun: no records, and no best time. */
  private startLesson(game: Game): void {
    this.run = null;
    this.resetBoardState();
    this.game = game;
    this.clock.begin();
    this.buildGameScreen();
    this.startClock();
  }

  /** Per-board input state. Never touches the clock; a run outlives a board. */
  private resetBoardState(): void {
    this.mode.reset();
    this.fatalBattle = null;
    this.teaching.tutor.resetBoard();
  }

  private buildGameScreen(): void {
    const game = this.game!;
    this.sfx.setPack(this.settings.sfxPack(this.typeId));
    wearInterfaceFont(this.settings, this.typeId);
    this.clearScreen();

    const lesson = this.teaching.lessonTitle();
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
        explain: () => this.explainBoard(),
        tutor: this.settings.presentation.tutor,
        guide: () => this.teaching.guideFromBoard(),
        next: () => this.teaching.next(),
        pickSpell: (id) => this.actions.pickSpell(id),
        cancelSpell: () => {
          this.mode.cancelSpell();
          this.refresh();
        },
      },
      lesson,
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
   * Back out to board select. A run cannot be resumed, so leaving one asks first; a single board
   * is replayable at will and needs no guard.
   */
  private leaveGame(): void {
    if (this.teaching.lesson) return this.teaching.school();
    if (this.run && this.run.status === 'playing') {
      const run = this.run;
      this.modal.ask({
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
    this.teaching.tutor.dismiss();

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
    });
    this.view?.setLesson(this.teaching.pointer());
    this.view?.render();
    this.updateClock();
  }

  // ------------------------------------------------------------------ tutor

  /** The tutor's press: a hint, pointed at the board and said in the hint line. It opens nothing. */
  private explainBoard(): void {
    if (this.game && this.els?.whyBtn) {
      this.teaching.tutor.press(this.game, this.view?.hoveredCell ?? null);
    }
    this.refresh();
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
        hinted: this.teaching.tutor.hints > 0,
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
      hints: this.teaching.tutor.hints,
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
          hinted: this.teaching.tutor.runHints > 0,
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
