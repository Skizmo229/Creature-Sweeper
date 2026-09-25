/**
 * The overlays a board ends with: CLEAR or GAME OVER for a single board, and for a Full Run the
 * board-clear card that carries on, the completed-run card, or RUN OVER. Every button reports
 * through a callback; recording the result is the caller's job and happens before this is built.
 */

import type { Game } from '../../engine/game.js';
import type { FullRun } from '../../engine/run.js';
import { type GameplaySettings, easierThanDefault } from '../../engine/settings.js';
import { el } from '../dom.js';

/**
 * The ladder that teaches, and so the only one that explains a death. A claim about the ladder's
 * ROLE rather than its name: EASY is the entry point every other type is gated behind, so it is
 * the one place a player can still be meeting the rules for the first time.
 */
const TEACHING_TYPE = 'easy';

/** The one-line explanation of why a clear was not written down. */
function modifiedNote(gameplay: GameplaySettings): HTMLElement {
  const easier = easierThanDefault(gameplay);
  return el(
    'p',
    'overlay-note modified',
    `Not recorded — ${easier.join(', ')} ${easier.length === 1 ? 'is' : 'are'} ` +
      'set easier than the tuned game. Harder settings record normally.',
  );
}

export interface BoardOutcome {
  game: Game;
  typeId: string;
  typeName: string;
  boardIndex: number;
  seed: number;
  won: boolean;
  perfect: boolean;
  /** Keep the card back while the clear effect plays (`.overlay.held`): a first clear, effect on. */
  held: boolean;
  timeExpired: boolean;
  seconds: number;
  /** The blow that ended a lost board, if a fight did. */
  fatal: { tier: number; damage: number } | null;
  /** Whether the result was written down. */
  recorded: boolean;
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

export function buildBoardOutcome(o: BoardOutcome): HTMLElement {
  const { game, won } = o;
  // A held card waits while the clear effect plays over the board (styles.css).
  const overlay = el('div', `overlay ${won ? 'win' : 'lose'}${o.held ? ' held' : ''}`);
  const card = el('div', 'overlay-card');
  card.append(
    el(
      'h2',
      undefined,
      won ? (o.perfect ? 'PERFECT CLEAR' : 'CLEAR') : o.timeExpired ? 'OUT OF TIME' : 'GAME OVER',
    ),
  );

  card.append(
    el(
      'p',
      'overlay-stats',
      won
        ? `${o.typeName} board ${o.boardIndex} · ${o.seconds}s · HP ${game.hp}/${game.maxHp}`
        : o.timeExpired
          ? `Time ran out · ${game.creaturesLeft()} creatures still standing`
          : `${game.creaturesLeft()} creatures still standing · reached LV ${game.level}`,
    ),
  );

  if (won && o.perfect) {
    card.append(el('p', 'overlay-note', 'No damage taken — every board can be cleared this way.'));
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
        `A tier ${tier} creature at LV ${game.level} took your last ${damage} HP. ` +
          `At LV ${tier} it would have cost nothing — ` +
          'every board can be cleared without taking a single point of damage.',
      ),
    );
  }
  // Said here rather than only in Settings, because this is the moment the absence of a new best
  // time would otherwise look like a bug.
  if (won && !o.recorded) card.append(modifiedNote(o.gameplay));
  if (o.unlocked !== null) {
    card.append(el('p', 'overlay-note', `Board ${o.unlocked} unlocked.`));
  } else if (won && o.boardIndex >= o.ladderLength) {
    card.append(el('p', 'overlay-note', `${o.typeName} cleared.`));
  }

  const row = el('div', 'overlay-actions');
  // The continuation has a next board too.
  if (won && o.boardIndex < o.lastBoard) {
    const next = el('button', 'primary', 'Next board');
    next.addEventListener('click', o.onNext);
    row.append(next);
  }
  const again = el('button', won ? '' : 'primary', won ? 'Replay' : 'Try again');
  again.addEventListener('click', o.onReplay);
  row.append(again);

  const same = el('button', 'ghost', 'Same board again');
  same.title = `Seed ${o.seed}`;
  same.addEventListener('click', o.onSame);
  row.append(same);

  const list = el('button', 'ghost', 'Board select');
  list.addEventListener('click', o.onList);
  row.append(list);

  card.append(row);
  overlay.append(card);
  return overlay;
}

export interface RunOutcome {
  game: Game;
  run: FullRun;
  typeName: string;
  boardIndex: number;
  seconds: number;
  recorded: boolean;
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

  if (midRun) {
    const healed = Math.min(run.healPerBoard, run.maxHp - game.hp);
    card.append(el('h2', undefined, `BOARD ${o.boardIndex} CLEAR`));
    card.append(
      el(
        'p',
        'overlay-stats',
        `${o.typeName} full run · ${o.seconds}s · HP ${game.hp}/${run.maxHp}`,
      ),
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
    card.append(
      el('p', 'overlay-note', 'Level, EXP and mana all reset on the next board. Only HP carries.'),
    );
  } else if (won) {
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
  } else {
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
        `${run.legs.length} board${run.legs.length === 1 ? '' : 's'} cleared. ` +
          'The run starts again from board 1.',
      ),
    );
  }

  const row = el('div', 'overlay-actions');
  if (midRun) {
    const next = el('button', 'primary', `Continue → board ${o.boardIndex + 1}`);
    next.addEventListener('click', o.onContinue);
    row.append(next);
  } else {
    const again = el('button', 'primary', 'New run');
    again.addEventListener('click', o.onNewRun);
    row.append(again);
    const same = el('button', 'ghost', 'Same run again');
    same.title = `Run seed ${run.seed}`;
    same.addEventListener('click', o.onSameRun);
    row.append(same);
  }
  const list = el('button', 'ghost', midRun ? 'Abandon run' : 'Board select');
  list.addEventListener('click', midRun ? o.onAbandon : o.onList);
  row.append(list);

  if (!o.recorded) card.append(modifiedNote(o.gameplay));

  card.append(row);
  overlay.append(card);
  return overlay;
}
