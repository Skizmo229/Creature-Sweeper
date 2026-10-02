/**
 * The Presentation section's settings whose only possible example is themselves: the sound pack,
 * the glow and the motion after a fight, and the board-clear effect, with when it plays, what
 * holds the clear card and its speed. Each is played, not pictured, which is only possible because
 * these tiles update in place rather than rebuilding the screen (decision 0025).
 */

import { randomSeed } from '../../engine/rng.js';
import type { GameEvent } from '../../engine/types.js';
import { el } from '../dom.js';
import { flashStage } from '../game/flash.js';
import { PREVIEW_SEED, clearedBoard } from '../preview.js';
import {
  type CardHold,
  DEFAULT,
  DEFAULT_EFFECT_SPEED,
  type FightRim,
  MAX_EFFECT_SPEED,
  MIN_EFFECT_SPEED,
  type Motion,
  OFF,
  type VictoryWhen,
} from '../presentation.js';
import { SFX_NAMES, VICTORY_NAMES } from '../theme.js';
import type { SfxPackId, VictoryId } from '../looktypes.js';
import { playVictory } from '../victory/play.js';
import { type ScreenContext, typeName } from './context.js';
import { renderPreview } from './render.js';
import { openSoundCheck } from './soundcheck.js';
import { type Choice, gallery, ratio, slider, wideRow } from './widgets.js';

/**
 * The board-clear demo currently running, if any. Module-level because a screen rebuild throws
 * away the element the effect is drawing into, and an orphaned frame loop on a detached canvas is
 * exactly the leak `endVictory` exists to prevent on the game screen.
 */
let stopDemo: (() => void) | null = null;

/**
 * The layout the clear-effect demo is showing. Module-level so it outlives a rebuild: a demo
 * board that reshuffled itself every time an unrelated setting moved would be noise, so it
 * changes only when the player presses Test.
 */
let demoSeed = PREVIEW_SEED;

/** Stop any running demo; every screen build calls this first. */
export function stopSettingsDemo(): void {
  stopDemo?.();
  stopDemo = null;
}

/** The sound pack: a tile per pack, each played as it is picked, and the sound check's button. */
export function soundRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, ident } = ctx;
  const check = el('button', 'ghost small soundcheck-open', 'Sound check');
  check.setAttribute('aria-haspopup', 'dialog');
  check.addEventListener('click', () => openSoundCheck(ctx));
  const stack = el('div', 'settings-stack');
  stack.append(
    gallery(
      [
        { value: DEFAULT, label: `Game type default — ${SFX_NAMES[ident.sfx]}` },
        ...(Object.keys(SFX_NAMES) as SfxPackId[]).map((id): Choice => ({
          value: id,
          label: SFX_NAMES[id],
        })),
        { value: OFF, label: 'Off — silent' },
      ],
      p.sfx,
      (v) => {
        ctx.set({ sfx: v as SfxPackId | typeof DEFAULT | typeof OFF });
        // The store has already re-pointed the mixer, so this plays the pack just chosen.
        ctx.onPreview('levelup');
      },
      true,
    ),
    check,
  );
  wideRow(
    host,
    'Sound effects',
    'Picking a pack plays it. Sound check plays any sound from any pack and assigns keys.',
    stack,
  );
}

/** A fight for the glow's example, costing `damage` HP. */
const fought = (damage: number): GameEvent => ({
  type: 'battle',
  x: 0,
  y: 0,
  tier: 3,
  damage,
  defeated: true,
});

/**
 * The example board sits in a stage of its own, and the buttons act out a clean fight, a level-up
 * and a hit through `flashStage`, the game's own code, under whichever options are chosen here
 * and in the Motion row below, so the difference between the options is something to try rather
 * than to read about.
 */
export function fightRimRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings, currentTheme } = ctx;
  const demo = el('div', 'rim-demo');
  demo.append(ctx.chipBoard(currentTheme)());

  const acts = el('div', 'rim-demo-acts');
  const act = (label: string, events: GameEvent[]): void => {
    const btn = el('button', 'ghost small', label);
    btn.addEventListener('click', () =>
      flashStage(demo, events, settings.presentationFor(ctx.typeId)),
    );
    acts.append(btn);
  };
  act('Clean fight', [fought(0)]);
  act('Level-up', [fought(0), { type: 'levelUp', level: 2 }]);
  act('Hit', [fought(3)]);

  const stack = el('div', 'settings-stack');
  stack.append(
    gallery(
      [
        { value: 'every', label: 'Every fight: green, blue for a level-up, red for a hit' },
        { value: 'levelups', label: 'Level-ups and damage only' },
        { value: 'hits', label: 'Damage only' },
        { value: OFF, label: 'Off' },
      ],
      p.fightRim,
      (v) => ctx.set({ fightRim: v as FightRim }),
      true,
    ),
    demo,
    acts,
  );
  wideRow(
    host,
    'Glow after a fight',
    'The board’s edge lights up after a fight: green for free, blue for a level-up, red for HP ' +
      'lost, red over blue for both. The buttons play each kind.',
    stack,
  );
}

/** The stage's own shake and glow, played by the glow row's buttons above under the option chosen. */
export function motionRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p } = ctx;
  wideRow(
    host,
    'Motion after a fight',
    'The board shakes when a fight costs HP and glows inside on a level-up. The buttons above play ' +
      'them. A system set to reduce motion switches both off whatever this says.',
    gallery(
      [
        { value: 'full', label: 'Shake and glow' },
        { value: 'noShake', label: 'Glow only, no shake' },
        { value: 'none', label: 'Neither' },
      ],
      p.motion,
      (v) => ctx.set({ motion: v as Motion }),
      true,
    ),
  );
}

/**
 * When the effect plays, what holds the clear card back, and the effect's pace, in rows above the
 * effect itself; the pace replays the demo, so it is heard as well as read.
 */
function clearEffectOptions(ctx: ScreenContext, host: HTMLElement, replay: () => void): void {
  const { p } = ctx;
  wideRow(
    host,
    'Play the clear effect',
    'On every clear, or only the first time a board is cleared.',
    gallery(
      [
        { value: 'every', label: 'On every clear' },
        { value: 'first', label: 'On a board’s first clear only' },
      ],
      p.victoryWhen,
      (v) => ctx.set({ victoryWhen: v as VictoryWhen }),
      true,
    ),
  );
  wideRow(
    host,
    'Clear card',
    'What holds the card back on a board’s first clear, so the effect plays over the board: the ' +
      'effect’s own length, a click anywhere, or nothing.',
    gallery(
      [
        { value: 'effect', label: 'After the effect' },
        { value: 'click', label: 'Until I click' },
        { value: 'none', label: 'At once' },
      ],
      p.cardHold,
      (v) => ctx.set({ cardHold: v as CardHold }),
      true,
    ),
  );
  wideRow(
    host,
    'Clear effect speed',
    'How fast the effect runs. Picking a speed replays it below.',
    slider(
      MIN_EFFECT_SPEED,
      MAX_EFFECT_SPEED,
      0.05,
      p.effectSpeed,
      ratio,
      (v) => ctx.set({ effectSpeed: Math.round(v * 100) / 100 }),
      replay,
      DEFAULT_EFFECT_SPEED,
    ),
  );
}

/**
 * The demo board is kept rather than rebuilt per play, because half these effects animate its
 * creatures and need to borrow the glyphs off the view that is drawing them. It carries one of
 * every tier the real board uses and none above.
 */
export function clearEffectRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, ident, settings, typeId, tiers, currentTheme } = ctx;
  const demo = renderPreview(clearedBoard(demoSeed, tiers), currentTheme, ctx.display(), {
    cell: ctx.demoCell,
  });
  const demoBox = el('div', 'clear-demo');
  demoBox.append(demo.canvas);

  const testBtn = el('button', 'primary small', 'Test on a new board');

  const syncTest = (): void => {
    const effect = settings.victoryEffect(typeId);
    testBtn.disabled = effect === null;
    testBtn.title =
      effect === null
        ? 'The clear effect is off, so there is nothing to play.'
        : 'Clear a freshly generated board and play the effect over it.';
  };

  const runDemo = (): void => {
    stopSettingsDemo();
    const effect = settings.victoryEffect(typeId);
    if (!effect) return;
    stopDemo = playVictory(
      demoBox,
      effect,
      { ...settings.victoryLook(typeId), theme: currentTheme },
      demo.view.victorySource(),
      settings.presentationFor(typeId).effectSpeed,
    );
  };

  /**
   * Deal a new board, then play the effect over it. Re-seating the game on the existing view keeps
   * the element's size, and `victorySource()` reads whatever game the view holds. Stopping first
   * is not optional: the running effect holds the old board's glyphs hidden, and swapping the
   * game under it would strand that flag.
   */
  const freshDemo = (): void => {
    stopSettingsDemo();
    demoSeed = randomSeed();
    demo.view.setGame(clearedBoard(demoSeed, tiers), currentTheme, ctx.display());
    runDemo();
  };

  syncTest();
  testBtn.addEventListener('click', freshDemo);

  const demoWrap = el('div', 'settings-stack');
  demoWrap.append(
    gallery(
      [
        { value: DEFAULT, label: `Game type default — ${VICTORY_NAMES[ident.victory]}` },
        ...(Object.keys(VICTORY_NAMES) as VictoryId[]).map((id): Choice => ({
          value: id,
          label: VICTORY_NAMES[id],
        })),
        { value: OFF, label: 'Off — no effect' },
      ],
      p.victory,
      (v) => {
        ctx.set({ victory: v as VictoryId | typeof DEFAULT | typeof OFF });
        syncTest();
        // Replays over the SAME board, so the gallery stays a comparison between effects rather
        // than between effects and layouts. Test is the one that deals a new board.
        runDemo();
      },
      true,
    ),
    demoBox,
    testBtn,
  );

  clearEffectOptions(ctx, host, runDemo);
  wideRow(
    host,
    'Board clear effect',
    `Picking one plays it over a finished board with one of each of the ${tiers} tiers ` +
      `${typeName(typeId)} uses. Picking again replays on the same board; Test deals a new one.`,
    demoWrap,
  );
}
