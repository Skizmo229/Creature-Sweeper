/**
 * The overlays a board ends with: CLEAR or GAME OVER for a single board, and for a Full Run the
 * board-clear card that carries on, the completed-run card, or RUN OVER. Every button reports
 * through a callback; recording the result is the caller's job and happens before this is built.
 */

import type { Game } from '../../engine/game.js';
import type { FullRun } from '../../engine/run.js';
import type { GameplaySettings } from '../../engine/settings.js';
import { el } from '../dom.js';
import type { CardHold } from '../presentation.js';
import { easierSentence, plural } from '../words.js';

/**
 * The ladder that teaches, and so the only one that explains a death. A claim about the ladder's
 * ROLE rather than its name: EASY is the entry point every other type is gated behind, so it is
 * the one place a player can still be meeting the rules for the first time.
 */
const TEACHING_TYPE = 'easy';

/** The one-line explanation of why a clear was not written down. */
function modifiedNote(gameplay: GameplaySettings): HTMLElement {
  return el('p', 'overlay-note modified', `Not recorded: ${easierSentence(gameplay)}`);
}

/**
 * How many hints a clear took. Said on the card because this is where the missing best time would
 * look like a bug; the tile says what the clear left behind instead (decision 0065).
 */
function hintsNote(hints: number): HTMLElement {
  return el('p', 'overlay-note', `Cleared with ${plural(hints, 'hint')}.`);
}

/** How a single board ended, and where the card's buttons go, for `buildBoardOutcome`. */
export interface BoardOutcome {
  game: Game;
  typeId: string;
  typeName: string;
  boardIndex: number;
  seed: number;
  won: boolean;
  perfect: boolean;
  /**
   * What keeps the card back on a first clear with an effect to watch: the effect's length
   * (`.overlay.held`), a click (`.overlay.held-click`), or nothing.
   */
  hold: CardHold;
  timeExpired: boolean;
  seconds: number;
  /** The blow that ended a lost board, if a fight did. */
  fatal: { tier: number; damage: number } | null;
  /** Whether the result was written down. */
  recorded: boolean;
  /** Times the tutor was asked on this board. A hinted clear sets no best time. */
  hints: number;
  /** The board a clear unlocked, if any. */
  unlocked: number | null;
  /** How many boards the tuned ladder has, and the last board including the continuation. */
  ladderLength: number;
  lastBoard: number;
  gameplay: GameplaySettings;
  onNext(): void;
  onReplay(): void;
  onSame(): void;
  onList(): void;
}

/** A single board's card's heading: a clear, perfect or not, the clock run out, or a loss. */
function boardHeadline(o: BoardOutcome): string {
  if (o.won) return o.perfect ? 'PERFECT CLEAR' : 'CLEAR';
  return o.timeExpired ? 'OUT OF TIME' : 'GAME OVER';
}

/** The line under it: the board, the time and the HP of a clear, or what was left standing. */
function boardStats(o: BoardOutcome): string {
  const { game } = o;
  if (o.won) {
    return `${o.typeName} board ${o.boardIndex} · ${o.seconds}s · HP ${game.hp}/${game.maxHp}`;
  }
  return o.timeExpired
    ? `Time ran out · ${game.creaturesLeft()} creatures still standing`
    : `${game.creaturesLeft()} creatures still standing · reached LV ${game.level}`;
}

/** A button on a card's row of ways on, appended to `row`. */
function actionButton(
  row: HTMLElement,
  cls: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el('button', cls, label);
  button.addEventListener('click', onClick);
  row.append(button);
  return button;
}

/**
 * The card a single board ends with: CLEAR (or PERFECT CLEAR), GAME OVER or OUT OF TIME, what the
 * result was, and the ways on. The caller appends it to the screen.
 */
export function buildBoardOutcome(o: BoardOutcome): HTMLElement {
  const { game, won } = o;
  // A held card waits while the clear effect plays over the board, or until a click (styles.css).
  const held = o.hold === 'effect' ? ' held' : o.hold === 'click' ? ' held-click' : '';
  const overlay = el('div', `overlay ${won ? 'win' : 'lose'}${held}`);
  if (o.hold === 'click') {
    overlay.addEventListener('click', () => overlay.classList.remove('held-click'), {
      once: true,
    });
  }
  const card = el('div', 'overlay-card');
  card.append(el('h2', undefined, boardHeadline(o)));
  card.append(el('p', 'overlay-stats', boardStats(o)));

  if (won && o.perfect) {
    card.append(el('p', 'overlay-note', 'No damage taken'));
  }
  // A loss is the moment of most attention in the game, and on the teaching ladder it says what
  // killed you. "Took your last N" rather than "cost N": a battle event reports HP actually lost,
  // and on a fatal blow that is exactly what was left, so this says the true number without
  // quoting a price or copying the damage formula out of the engine.
  if (!won && o.fatal && o.typeId === TEACHING_TYPE) {
    const { tier, damage } = o.fatal;
    card.append(
      el(
        'p',
        'overlay-note',
        `A tier ${tier} at LV ${game.level} took your last ${damage} HP. ` +
          `At LV ${tier} it would have cost nothing.`,
      ),
    );
  }
  // Said here rather than only in Settings, because this is the moment the absence of a new best
  // time would otherwise look like a bug.
  if (won && !o.recorded) card.append(modifiedNote(o.gameplay));
  if (won && o.recorded && o.hints > 0) card.append(hintsNote(o.hints));
  if (o.unlocked !== null) {
    card.append(el('p', 'overlay-note', `Board ${o.unlocked} unlocked.`));
  } else if (won && o.boardIndex >= o.ladderLength) {
    card.append(el('p', 'overlay-note', `${o.typeName} cleared.`));
  }

  const row = el('div', 'overlay-actions');
  // The continuation has a next board too.
  if (won && o.boardIndex < o.lastBoard) actionButton(row, 'primary', 'Next board', o.onNext);
  actionButton(row, won ? '' : 'primary', won ? 'Replay' : 'Try again', o.onReplay);
  actionButton(row, 'ghost', 'Same board again', o.onSame).title = `Seed ${o.seed}`;
  actionButton(row, 'ghost', 'Board select', o.onList);

  card.append(row);
  overlay.append(card);
  return overlay;
}

/** How a board of a Full Run ended, and where the card's buttons go, for `buildRunOutcome`. */
export interface RunOutcome {
  game: Game;
  run: FullRun;
  typeName: string;
  boardIndex: number;
  seconds: number;
  recorded: boolean;
  /** Times the tutor was asked on this board, and over the run. A hinted run sets no best time. */
  hints: number;
  runHints: number;
  gameplay: GameplaySettings;
  onContinue(): void;
  onNewRun(): void;
  onSameRun(): void;
  onAbandon(): void;
  onList(): void;
}

/**
 * A board of a run ended, which is three different events: a cleared board that is not the last
 * carries on (nothing recorded, clock running); the tenth clear completes the run; a loss ends
 * it. Individual boards are never recorded from a run (decision 0015).
 */
export function buildRunOutcome(o: RunOutcome): HTMLElement {
  const { game, run } = o;
  const midRun = game.status === 'won' && !run.isLastBoard;
  const won = run.status === 'won';
  const overlay = el('div', `overlay ${game.status === 'lost' ? 'lose' : 'win'}`);
  const card = el('div', 'overlay-card');

  if (midRun) writeMidRun(card, o);
  else if (won) writeRunComplete(card, o);
  else writeRunOver(card, o);

  const row = el('div', 'overlay-actions');
  if (midRun) {
    actionButton(row, 'primary', `Continue → board ${o.boardIndex + 1}`, o.onContinue);
  } else {
    actionButton(row, 'primary', 'New run', o.onNewRun);
    actionButton(row, 'ghost', 'Same run again', o.onSameRun).title = `Run seed ${run.seed}`;
  }
  const leave = midRun ? o.onAbandon : o.onList;
  actionButton(row, 'ghost', midRun ? 'Abandon run' : 'Board select', leave);

  if (!o.recorded) card.append(modifiedNote(o.gameplay));

  card.append(row);
  overlay.append(card);
  return overlay;
}

/** A cleared board that is not the run's last: the heal, and that only HP carries. */
function writeMidRun(card: HTMLElement, o: RunOutcome): void {
  const { game, run } = o;
  const healed = Math.min(run.healPerBoard, run.maxHp - game.hp);
  card.append(el('h2', undefined, `BOARD ${o.boardIndex} CLEAR`));
  card.append(
    el('p', 'overlay-stats', `${o.typeName} full run · ${o.seconds}s · HP ${game.hp}/${run.maxHp}`),
  );
  // Said explicitly, because the number is the mode: at full HP the heal is zero and a player
  // who is not told that will read it as a bug.
  card.append(
    el(
      'p',
      'overlay-note',
      healed > 0
        ? `Healed +${healed} — HP ${game.hp + healed}/${run.maxHp} going into board ${o.boardIndex + 1}.`
        : run.healPerBoard === 0
          ? `No heal on a pool of ${run.maxHp}. Every point you lose is gone for the run.`
          : `Already at full HP, so the +${run.healPerBoard} heal is wasted.`,
    ),
  );
  if (o.recorded && o.hints > 0) card.append(hintsNote(o.hints));
  card.append(el('p', 'overlay-note', 'Level, EXP and mana reset next board. Only HP carries.'));
}

/** The run's last board cleared: the run complete, perfect or not. */
function writeRunComplete(card: HTMLElement, o: RunOutcome): void {
  const { game, run } = o;
  const perfect = game.hp === run.maxHp;
  card.append(el('h2', undefined, perfect ? 'PERFECT FULL RUN' : 'FULL RUN COMPLETE'));
  card.append(
    el(
      'p',
      'overlay-stats',
      `All ${run.boardCount} boards of ${o.typeName} · ${o.seconds}s · HP ${game.hp}/${run.maxHp}`,
    ),
  );
  card.append(
    el(
      'p',
      'overlay-note',
      perfect
        ? 'Ten boards, not a single point of damage.'
        : `${run.damageTaken} HP lost across the ladder.`,
    ),
  );
  if (o.recorded && o.runHints > 0) card.append(hintsNote(o.runHints));
}

/** A board of the run lost: the run over, and how far it got. */
function writeRunOver(card: HTMLElement, o: RunOutcome): void {
  const { run } = o;
  card.append(el('h2', undefined, 'RUN OVER'));
  card.append(
    el(
      'p',
      'overlay-stats',
      `${o.typeName} full run · board ${o.boardIndex} of ${run.boardCount} · ${o.seconds}s`,
    ),
  );
  card.append(
    el(
      'p',
      'overlay-note',
      `${plural(run.legs.length, 'board')} cleared. Starts again from board 1.`,
    ),
  );
}
