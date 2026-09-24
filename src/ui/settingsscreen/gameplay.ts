/**
 * The Gameplay section: the seven dials that change the rules, and the live line saying whether
 * a clear will record at these settings (decision 0014).
 */

import {
  type SweepMode,
  easierThanDefault,
  isAtLeastAsHard,
  isDefaultGameplay,
} from '../../engine/settings.js';
import { el } from '../dom.js';
import type { ScreenContext } from './context.js';
import { ratio, row, section, slider, toggle } from './widgets.js';

type RatioKey =
  'hpRatio' | 'hpRegenRatio' | 'enemyDamageRatio' | 'manaRegenRatio' | 'manaRewardRatio';

export function gameplaySection(ctx: ScreenContext): void {
  const { settings } = ctx;
  const play = section(
    ctx.host,
    'Gameplay',
    'These change the rules. Settings that make the game HARDER record normally; ' +
      'any setting easier than the tuned game means a clear is not written down at all.',
  );

  const g = () => settings.gameplay;

  const status = el('p', 'settings-status');
  const refreshStatus = (): void => {
    const s = g();
    const easier = easierThanDefault(s);
    if (isDefaultGameplay(s)) {
      status.textContent = 'Tuned game — everything records.';
      status.className = 'settings-status ok';
    } else if (isAtLeastAsHard(s)) {
      status.textContent = 'Harder than tuned — clears, unlocks and best times all record.';
      status.className = 'settings-status ok';
    } else {
      status.textContent =
        `Nothing will record: ${easier.join(', ')} ` +
        `${easier.length === 1 ? 'is' : 'are'} easier than the tuned game. ` +
        'No clear, no unlock, no best time.';
      status.className = 'settings-status warn';
    }
  };

  const gameplayRow = (label: string, key: RatioKey, max: number, hint: string): void => {
    row(
      play,
      label,
      slider(0, max, 0.05, g()[key], ratio, (v) => {
        settings.setGameplay({ [key]: Math.round(v * 100) / 100 });
        refreshStatus();
      }),
      hint,
    );
  };

  gameplayRow(
    'Player HP',
    'hpRatio',
    3,
    'Scales the board’s HP pool. Never below 1 — a board entered at 0 HP is not a board.',
  );
  gameplayRow(
    'Full run HP regen',
    'hpRegenRatio',
    1,
    'Fraction of the pool healed after each cleared board of a Full Run, rounded down. ' +
      'Nothing heals inside a board: HP is a guess budget, not a combat resource. Default ×0.50.',
  );
  gameplayRow(
    'Creature damage',
    'enemyDamageRatio',
    3,
    'Scales what a creature’s retaliation costs. A fight at or below your level is free at any setting.',
  );
  gameplayRow(
    'Mana regen',
    'manaRegenRatio',
    3,
    'Scales the exploration trickle — mana earned per empty cell you uncover yourself. ×0 switches it off.',
  );
  gameplayRow(
    'Mana per creature',
    'manaRewardRatio',
    3,
    'Scales the mana a defeated creature pays. Its EXP is never scaled — the level gates are exact totals.',
  );

  const sweepBox = el('div', 'settings-stack');
  const chargeRow = el('div', 'settings-subrow');
  const drawCharge = (): void => {
    chargeRow.hidden = g().sweep !== 'charge';
  };
  const sweepSelect = el('select', 'settings-select');
  for (const [value, label] of [
    ['on', 'On — always available'],
    ['charge', 'Charged — banked by opening cells'],
    ['off', 'Off — open everything by hand'],
  ]) {
    const option = el('option', undefined, label);
    option.value = value!;
    sweepSelect.append(option);
  }
  sweepSelect.value = g().sweep;
  sweepSelect.addEventListener('change', () => {
    settings.setGameplay({ sweep: sweepSelect.value as SweepMode });
    drawCharge();
    refreshStatus();
  });
  sweepBox.append(sweepSelect);
  chargeRow.append(el('span', 'settings-sub-name', 'Cells per sweep'));
  chargeRow.append(
    slider(
      1,
      50,
      1,
      g().sweepChargeClicks,
      (v) => `${Math.round(v)} cells`,
      (v) => {
        settings.setGameplay({ sweepChargeClicks: Math.round(v) });
        refreshStatus();
      },
    ),
  );
  sweepBox.append(chargeRow);
  drawCharge();
  row(
    play,
    'Sweep',
    sweepBox,
    'Charged mode banks one charge per cell you open by hand. Cells a sweep opens never charge it, ' +
      'or a sweep would pay for the next one.',
  );

  row(
    play,
    'Time attack',
    toggle(g().timeAttack, (v) => {
      settings.setGameplay({ timeAttack: v });
      refreshStatus();
    }),
    'Replaying a board you have a best time on counts DOWN from it, and reaching zero loses the board. ' +
      'A board with no best time has nothing to race, and plays normally.',
  );

  refreshStatus();
  play.append(status);
}
