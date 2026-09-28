/**
 * The Gameplay section: the dials that change the rules, and the live line saying whether a
 * clear will record at these settings (decision 0014). Beside them, the settings about play that
 * are presentation all the same: the chord and the tutor.
 */

import {
  DEFAULT_GAMEPLAY,
  MAX_SWEEP_BUDGET,
  MAX_TIME_LIMIT,
  MIN_SWEEP_BUDGET,
  MIN_TIME_ATTACK_RATIO,
  type SweepMode,
  easierThanDefault,
  isAtLeastAsHard,
  isDefaultGameplay,
} from '../../engine/settings.js';
import { el } from '../dom.js';
import { MAX_TUTOR_GRADE, MIN_TUTOR_GRADE, type TutorStyle } from '../presentation.js';
import type { ScreenContext } from './context.js';
import { gameplayPresetsRow } from './presets.js';
import { gallery, ratio, row, section, slider, toggle } from './widgets.js';

type RatioKey =
  | 'hpRatio'
  | 'hpRegenRatio'
  | 'enemyDamageRatio'
  | 'manaRegenRatio'
  | 'manaRewardRatio'
  | 'spellPriceRatio'
  | 'startManaRatio';

const MIN_CHARGE_CLICKS = 1;
const MAX_CHARGE_CLICKS = 50;

/** The time limit's slider moves in half minutes, and the setting is kept in seconds. */
const LIMIT_STEP = 30;

/**
 * Tints a gameplay slider by how far it sits from the tuned default: toward white as it gets
 * easier, reaching pure white at the easiest end, and toward black as it gets harder, reaching
 * pure black at the hardest. At the default it wears the accent like any other slider.
 */
function shadeByDifficulty(
  control: HTMLElement,
  tuned: number,
  easyEnd: number,
  hardEnd: number,
): HTMLElement {
  const input = control.querySelector('input')!;
  const paint = (): void => {
    const v = Number(input.value);
    const easier = (v - tuned) / (easyEnd - tuned);
    const harder = (v - tuned) / (hardEnd - tuned);
    const [toward, share] = easier > 0 ? ['white', easier] : ['black', Math.max(0, harder)];
    control.style.setProperty(
      '--difficulty-ink',
      `color-mix(in srgb, var(--tint), ${toward} ${Math.round(Math.min(1, share) * 100)}%)`,
    );
  };
  input.addEventListener('input', paint);
  paint();
  return control;
}

/** What every row of the section shares: the store, the section and the status line's refresh. */
interface Play {
  ctx: ScreenContext;
  host: HTMLElement;
  refreshStatus: () => void;
}

export function gameplaySection(ctx: ScreenContext): void {
  const host = section(
    ctx.host,
    'Gameplay',
    'These change the rules. Harder than tuned records normally; easier, and nothing records.',
  );
  const { status, refreshStatus } = recordStatus(ctx);
  const play: Play = { ctx, host, refreshStatus };

  gameplayPresetsRow(ctx, host);
  dialRows(play);
  row(
    host,
    'Sweep',
    sweepControl(play),
    'Charged mode banks one charge per cell you open by hand; cells a sweep opens do not count. ' +
      'A budget is so many sweeps a board.',
  );
  row(
    host,
    'Chord on a number',
    toggle(ctx.p.chord, (v) => ctx.settings.setPresentation({ chord: v })),
    'Clicking an open number sweeps its ring alone, at the same price as a sweep of the whole ' +
      'board. Never opens more than Sweep would, so it changes no record.',
  );
  row(
    host,
    'Hide the counters',
    toggle(ctx.settings.gameplay.countersHidden, (v) => {
      ctx.settings.setGameplay({ countersHidden: v });
      refreshStatus();
    }),
    'The LV buttons stop saying how many of each tier are left. Harder, so it records. The ' +
      'tutor still counts.',
  );
  timeRows(play);
  tutorRows(ctx, host);

  refreshStatus();
  host.append(status);
}

/** The seven ratio dials, each shaded by how far it stands from the tuned game. */
function dialRows({ ctx, host, refreshStatus }: Play): void {
  const { settings } = ctx;
  const dial = (label: string, key: RatioKey, max: number, hint: string): void => {
    // Creature damage and spell prices are easier turned down; every other dial is easier up.
    const easyEnd = key === 'enemyDamageRatio' || key === 'spellPriceRatio' ? 0 : max;
    const hardEnd = max - easyEnd;
    row(
      host,
      label,
      shadeByDifficulty(
        slider(
          0,
          max,
          0.05,
          settings.gameplay[key],
          ratio,
          (v) => {
            settings.setGameplay({ [key]: Math.round(v * 100) / 100 });
            refreshStatus();
          },
          undefined,
          DEFAULT_GAMEPLAY[key],
        ),
        DEFAULT_GAMEPLAY[key],
        easyEnd,
        hardEnd,
      ),
      hint,
    );
  };
  dial('Player HP', 'hpRatio', 3, 'Scales the board’s HP pool, never below 1.');
  dial(
    'Full run HP regen',
    'hpRegenRatio',
    1,
    'Share of the pool healed after each Full Run board, rounded down. Nothing heals inside a ' +
      'board. Default ×0.50.',
  );
  dial(
    'Creature damage',
    'enemyDamageRatio',
    3,
    'Scales what a creature’s retaliation costs. A fight at or below your level stays free.',
  );
  dial(
    'Mana regen',
    'manaRegenRatio',
    3,
    'Scales the mana earned per empty cell you uncover. ×0 switches it off.',
  );
  dial(
    'Mana per creature',
    'manaRewardRatio',
    3,
    'Scales the mana a defeated creature pays. EXP is never scaled.',
  );
  dial(
    'Spell prices',
    'spellPriceRatio',
    3,
    'Scales what every spell costs, WORKOUT’s own price included. ×0 makes them free.',
  );
  dial(
    'Starting mana',
    'startManaRatio',
    3,
    'Scales the mana a board opens with: one Reveal exactly on the magic ladders.',
  );
}

/** The line that says whether a clear will record at these settings, and its refresh. */
function recordStatus(ctx: ScreenContext): {
  status: HTMLElement;
  refreshStatus: () => void;
} {
  const g = () => ctx.settings.gameplay;
  const status = el('p', 'settings-status');
  const refreshStatus = (): void => {
    const s = g();
    const easier = easierThanDefault(s);
    if (isDefaultGameplay(s)) {
      status.textContent = 'Tuned game — everything records.';
      status.className = 'settings-status ok';
    } else if (isAtLeastAsHard(s)) {
      status.textContent = 'Harder than tuned: everything records.';
      status.className = 'settings-status ok';
    } else {
      status.textContent =
        `Nothing will record: ${easier.join(', ')} ` +
        `${easier.length === 1 ? 'is' : 'are'} easier than the tuned game.`;
      status.className = 'settings-status warn';
    }
  };
  return { status, refreshStatus };
}

/** A sub-row under a control: a name and a slider, shown only while `shown` says so. */
function subRow(
  name: string,
  control: HTMLElement,
  shown: () => boolean,
): { line: HTMLElement; sync: () => void } {
  const line = el('div', 'settings-subrow');
  line.append(el('span', 'settings-sub-name', name), control);
  const sync = (): void => {
    line.hidden = !shown();
  };
  sync();
  return { line, sync };
}

/**
 * Sweep's mode, the cells-per-charge slider shown only while it is charged, and the sweeps per
 * board shown only while it is a budget.
 */
function sweepControl({ ctx, refreshStatus }: Play): HTMLElement {
  const { settings } = ctx;
  const g = () => settings.gameplay;
  const box = el('div', 'settings-stack');
  const select = el('select', 'settings-select');
  for (const [value, label] of [
    ['on', 'On — always available'],
    ['charge', 'Charged — banked by opening cells'],
    ['budget', 'Budget — so many sweeps a board'],
    ['off', 'Off — open everything by hand'],
  ]) {
    const option = el('option', undefined, label);
    option.value = value!;
    select.append(option);
  }
  select.value = g().sweep;
  const charge = subRow(
    'Cells per sweep',
    shadeByDifficulty(
      slider(
        MIN_CHARGE_CLICKS,
        MAX_CHARGE_CLICKS,
        1,
        g().sweepChargeClicks,
        (v) => `${Math.round(v)} cells`,
        (v) => {
          settings.setGameplay({ sweepChargeClicks: Math.round(v) });
          refreshStatus();
        },
        undefined,
        DEFAULT_GAMEPLAY.sweepChargeClicks,
      ),
      DEFAULT_GAMEPLAY.sweepChargeClicks,
      MIN_CHARGE_CLICKS,
      MAX_CHARGE_CLICKS,
    ),
    () => g().sweep === 'charge',
  );
  const budget = subRow(
    'Sweeps per board',
    slider(
      MIN_SWEEP_BUDGET,
      MAX_SWEEP_BUDGET,
      1,
      g().sweepBudget,
      (v) => `${Math.round(v)} sweep${Math.round(v) === 1 ? '' : 's'}`,
      (v) => settings.setGameplay({ sweepBudget: Math.round(v) }),
      undefined,
      DEFAULT_GAMEPLAY.sweepBudget,
    ),
    () => g().sweep === 'budget',
  );
  select.addEventListener('change', () => {
    settings.setGameplay({ sweep: select.value as SweepMode });
    charge.sync();
    budget.sync();
    refreshStatus();
  });
  box.append(select, charge.line, budget.line);
  return box;
}

/** Time Attack, how far below the best it races, and the fixed limit per board. */
function timeRows({ ctx, host, refreshStatus }: Play): void {
  const { settings } = ctx;
  const g = () => settings.gameplay;
  const box = el('div', 'settings-stack');
  box.append(
    toggle(g().timeAttack, (v) => {
      settings.setGameplay({ timeAttack: v });
      race.sync();
      refreshStatus();
    }),
  );
  const race = subRow(
    'Race the best ×',
    slider(
      MIN_TIME_ATTACK_RATIO,
      1,
      0.05,
      g().timeAttackRatio,
      ratio,
      (v) => settings.setGameplay({ timeAttackRatio: Math.round(v * 100) / 100 }),
      undefined,
      DEFAULT_GAMEPLAY.timeAttackRatio,
    ),
    () => g().timeAttack,
  );
  box.append(race.line);
  row(
    host,
    'Time attack',
    box,
    'Replaying a board with a best time counts down from it, or from a share of it, and zero ' +
      'loses the board. Without a best time it plays normally.',
  );
  const minutes = (v: number): string =>
    v === 0 ? 'None' : `${Math.floor(v / 60)}${v % 60 ? '½' : ''} min`;
  row(
    host,
    'Time limit per board',
    slider(
      0,
      MAX_TIME_LIMIT,
      LIMIT_STEP,
      g().timeLimit,
      minutes,
      (v) => settings.setGameplay({ timeLimit: Math.round(v) }),
      undefined,
      DEFAULT_GAMEPLAY.timeLimit,
    ),
    'Every board must be cleared within this, best time or not; a Full Run gets it once for ' +
      'each of its boards. Only ever harder, so it records.',
  );
}

/**
 * The tutor, beside the dials because it is about play, though it is a presentation setting:
 * whether it is offered, how much it says, and the dearest grade it tries.
 */
function tutorRows(ctx: ScreenContext, host: HTMLElement): void {
  const { settings, p } = ctx;
  // It changes no rule and no record, and so never enters the status line.
  row(
    host,
    'Tutor',
    toggle(p.tutor, (v) => settings.setPresentation({ tutor: v })),
    'Offers "[H]int" on every board: it points at the next provable move and says why, and ' +
      'opens nothing. A hinted board clears and unlocks as usual but sets no best time.',
  );
  row(
    host,
    'Hint style',
    gallery(
      [
        { value: 'full', label: 'The lesson: the numbers it read, the cells it proves, and why' },
        { value: 'where', label: 'Where to look: the numbers ringed, nothing concluded' },
      ],
      p.tutorStyle,
      (v) => settings.setPresentation({ tutorStyle: v as TutorStyle }),
      true,
    ),
    'How much a hint says. Either counts as a hint.',
  );
  row(
    host,
    'Tutor grade',
    slider(
      MIN_TUTOR_GRADE,
      MAX_TUTOR_GRADE,
      1,
      p.tutorGrade,
      (v) => (v >= MAX_TUTOR_GRADE ? `Grade ${MAX_TUTOR_GRADE}, everything` : `Grade ${v}`),
      (v) => settings.setPresentation({ tutorGrade: Math.round(v) }),
      undefined,
      MAX_TUTOR_GRADE,
    ),
    'The dearest trick the tutor will use, as the field guide grades them: 0 a glance, 4 ' +
      'counting the board. Capped, it says when nothing cheaper proves a move.',
  );
}
