/**
 * The three settings whose only possible example is themselves: the sound pack, the glow after a
 * fight and the board-clear effect. Each is played, not pictured, which is only possible because
 * these tiles update in place rather than rebuilding the screen (decision 0025).
 */

import { randomSeed } from '../../engine/rng.js';
import type { GameEvent } from '../../engine/types.js';
import { el } from '../dom.js';
import { flashRim } from '../game/flash.js';
import { PREVIEW_SEED, clearedBoard } from '../preview.js';
import { DEFAULT, type FightRim, MAX_SFX_VOLUME, OFF } from '../settings.js';
import { SFX_NAMES, VICTORY_NAMES } from '../theme.js';
import { type SfxPackId, type VictoryId } from '../looks.js';
import { playVictory } from '../victory/play.js';
import { type ScreenContext, typeName } from './context.js';
import { DEMO_CELL, renderPreview } from './render.js';
import { openSoundCheck } from './soundcheck.js';
import { type Choice, gallery, row, slider, toggle, wideRow } from './widgets.js';

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

export function soundRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, ident, settings } = ctx;
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
        settings.setPresentation({ sfx: v as SfxPackId | typeof DEFAULT | typeof OFF });
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
    'Synthesised rather than sampled — a pack is a table of tones, not a folder of files. ' +
      'Picking one plays it. Sound check plays any sound from any pack, and keys can be ' +
      'assigned to sounds there.',
    stack,
  );
  row(
    host,
    'Sound effects volume',
    slider(
      0,
      MAX_SFX_VOLUME,
      0.05,
      p.sfxVolume,
      (v) => `${Math.round(v * 100)}%`,
      (v) => settings.setPresentation({ sfxVolume: v }),
      // Heard on release rather than a sound per step of the drag.
      () => ctx.onPreview('levelup'),
    ),
    'How loud every sound in play is. Letting go of the slider plays a sound at the new level. ' +
      'The sound check keeps a volume of its own.',
  );
  // Updates only the store, like the sound gallery: nothing on the screen is drawn in terms of it.
  row(
    host,
    'Custom pitches in play',
    toggle(p.customPitches, (v) => settings.setPresentation({ customPitches: v })),
    'Sounds you have retuned in the sound check play at their new pitch during games too. Off, ' +
      'every sound plays at its own pitch, and the sound check keeps your tuning for later.',
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
 * and a hit through `flashRim`, the game's own code, under whichever option is chosen, so the
 * difference between the options is something to try rather than to read about.
 */
export function fightRimRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings, currentTheme } = ctx;
  const demo = el('div', 'rim-demo');
  demo.append(ctx.chipBoard(currentTheme)());

  const acts = el('div', 'rim-demo-acts');
  const act = (label: string, events: GameEvent[]): void => {
    const btn = el('button', 'ghost small', label);
    btn.addEventListener('click', () => flashRim(demo, events, settings.presentation.fightRim));
    acts.append(btn);
  };
  act('Clean fight', [fought(0)]);
  act('Level-up', [fought(0), { type: 'levelUp', level: 2 }]);
  act('Hit', [fought(3)]);

  const stack = el('div', 'settings-stack');
  stack.append(
    gallery(
      [
        { value: 'every', label: 'Every fight — green, or blue for a level-up, or red for a hit' },
        { value: 'levelups', label: 'Level-ups and damage — blue and red only' },
        { value: OFF, label: 'Off — no glow' },
      ],
      p.fightRim,
      (v) => settings.setPresentation({ fightRim: v as FightRim }),
      true,
    ),
    demo,
    acts,
  );
  wideRow(
    host,
    'Glow after a fight',
    'The edge of the board lights up when a fight ends: green when it cost you nothing, blue when ' +
      'it levelled you up, red when it cost HP, and red over blue when it did both. The buttons ' +
      'under the example play each kind of fight with the option chosen.',
    stack,
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
    cell: DEMO_CELL,
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
    stopDemo = playVictory(demoBox, effect, currentTheme, demo.view.victorySource());
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
        settings.setPresentation({ victory: v as VictoryId | typeof DEFAULT | typeof OFF });
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

  wideRow(
    host,
    'Board clear effect',
    'Picking one plays it below, over a board that is genuinely finished — every creature on it ' +
      'has been beaten — so you are seeing it over exactly what it runs over in play. The last ' +
      `seven take the board’s own creatures rather than drawing over the top of them, and the ` +
      `example carries one of each of the ${tiers} creature tiers ${typeName(typeId)} uses. ` +
      'Picking replays on the same board so the effects can be compared; Test deals a new one.',
    demoWrap,
  );
}
