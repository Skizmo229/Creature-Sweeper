/**
 * The ladder list: every game type, locked or not, with what it takes to unlock it and how far
 * the player has got. Each name wears the face its ladder's screens do, its own unless the player
 * chose one for the interface, so the list previews the ladders (decision 0021). The tools under
 * it reach the how-to, settings, the save backup and the reset.
 */

import { easierThanDefault } from '../../engine/settings.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import type { Progress } from '../progress.js';
import type { Settings } from '../settings.js';
import { themeFor } from '../looks.js';

export interface LadderListActions {
  progress: Progress;
  settings: Settings;
  /** Whether clears at the current dials are being written down. */
  recordsCount: boolean;
  pickType(typeId: string): void;
  howTo(): void;
  openSettings(): void;
  backup(): void;
  /** Asks first; the list is rebuilt on confirmation. */
  resetProgress(): void;
  setUnlockAll(on: boolean): void;
}

export function buildLadderList(a: LadderListActions): HTMLElement {
  const { progress, settings } = a;
  const wrap = el('div', 'screen');

  // One count for the whole screen: every locked type measures itself against the same number.
  const cleared = progress.boardsCleared();

  const head = el('header', 'title-bar');
  head.append(el('h1', 'game-title', 'Creature Sweeper'));
  head.append(el('p', 'sub', 'Prototype — Milestone 3'));
  // Boards cleared is a currency, so it is shown whether or not anything is waiting on it.
  head.append(el('p', 'sub boards-cleared', `${cleared} board${cleared === 1 ? '' : 's'} cleared`));
  // A player who left a dial easier than default a week ago should not have to open Settings
  // to find out why nothing is unlocking.
  if (!a.recordsCount) {
    const easier = easierThanDefault(settings.gameplay);
    head.append(
      el(
        'p',
        'sub settings-warn',
        `Nothing is being recorded: ${easier.join(', ')} ` +
          `${easier.length === 1 ? 'is' : 'are'} set easier than the tuned game.`,
      ),
    );
  }
  wrap.append(head);

  const list = el('div', 'type-list');
  for (const type of ladders) {
    const unlocked = progress.isTypeUnlocked(ladders, type.id);
    const rec = progress.typeRecord(type.id);
    const theme = themeFor(type.id);

    const card = el('button', 'type-card');
    card.disabled = !unlocked;
    card.style.setProperty('--tint', theme.accent);

    const face = settings.interfaceFont(type.id);
    const name = el('span', 'type-name', type.name);
    name.style.fontFamily = face.stack;
    if (face.capHeightFix) name.style.setProperty('--cap-fix', String(face.capHeightFix));
    card.append(name);
    const meta = el('span', 'type-meta');
    if (!unlocked) {
      // Both gates, and the count one shows progress: "41 / 45 boards" is a thing to go and do.
      const needs: string[] = [];
      if (type.requires.length) {
        needs.push(
          `clear ${type.requires.map((r) => ladders.find((t) => t.id === r)?.name ?? r).join(' + ')}`,
        );
      }
      if (type.requires_boards > cleared) {
        needs.push(`${cleared} / ${type.requires_boards} boards cleared`);
      }
      const runs = progress.fullRunsCompleted();
      if (type.requires_runs > runs) {
        needs.push(`${runs} / ${type.requires_runs} Full Runs completed, each on a different type`);
      }
      meta.textContent = `Locked — ${needs.join(' · ')}`;
    } else if (rec.cleared) {
      const run = progress.runRecord(type.id);
      meta.textContent =
        `Cleared · board ${rec.highestBoard} of ${type.boards.length}` +
        (run.cleared ? ' · ★ full run' : ' · full run open');
    } else {
      meta.textContent = `Board ${rec.highestBoard} of ${type.boards.length}`;
    }
    card.append(meta);
    card.append(el('span', 'type-axis', type.axis));
    card.addEventListener('click', () => a.pickType(type.id));
    list.append(card);
  }
  wrap.append(list);

  const tools = el('div', 'tools');
  const unlockAll = el('label', 'toggle');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = progress.unlockAll;
  box.addEventListener('change', () => a.setUnlockAll(box.checked));
  unlockAll.append(box, el('span', undefined, 'Unlock everything (prototype)'));
  tools.append(unlockAll);

  const howto = el('button', 'ghost', 'How to play');
  howto.addEventListener('click', a.howTo);
  tools.append(howto);

  const settingsBtn = el('button', 'ghost', 'Settings');
  settingsBtn.addEventListener('click', a.openSettings);
  tools.append(settingsBtn);

  const backup = el('button', 'ghost', 'Back up / restore save');
  backup.addEventListener('click', a.backup);
  tools.append(backup);

  const reset = el('button', 'ghost', 'Reset progress');
  reset.addEventListener('click', a.resetProgress);
  tools.append(reset);
  wrap.append(tools);

  return wrap;
}
