/**
 * The sound check: every sound in the game, one button per pack and event, in a window over the
 * settings screen. Keys can be assigned to sounds, and play them only while the window is open;
 * nowhere else in the game listens for them.
 *
 * It lives inside the screen's element, like the picker, so a rebuild or leaving the screen takes
 * it away. Its keys are caught at the window before they reach the app, where a key on the
 * settings screen can mean leaving it.
 */

import { el } from '../dom.js';
import type { SfxPackId } from '../looks.js';
import type { SfxEvent } from '../sfx.js';
import { SFX_EVENT_NAMES, SFX_NAMES } from '../theme.js';
import type { ScreenContext } from './context.js';

interface Sound {
  pack: SfxPackId;
  event: SfxEvent;
}

/**
 * Key to sound. Module-level so the keys outlive a rebuild of the screen and a closed window for
 * the rest of the session; they are a testing aid, not a setting, so they are never saved.
 */
const keys = new Map<string, Sound>();

/** Keys that keep their own job in the window: Escape closes it, Tab moves the focus. */
const RESERVED = new Set(['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/** A letter is the same key with or without Shift. */
const keyId = (e: KeyboardEvent): string => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

const keyName = (id: string): string =>
  id === ' ' ? 'Space' : id.length === 1 ? id.toUpperCase() : id;

const same = (a: Sound, b: Sound): boolean => a.pack === b.pack && a.event === b.event;

/**
 * Assigning is two steps, a sound and then a key, and the state says which one the window is
 * waiting for. Escape backs out of either without closing the window.
 */
type Assign = { step: 'idle' } | { step: 'sound' } | { step: 'key'; sound: Sound };

/** The line beside the buttons: what the window is waiting for, or why it is silent. */
function statusText(assign: Assign, muted: boolean): string {
  if (assign.step === 'sound') return 'Click the sound to assign.';
  if (assign.step === 'key') {
    const pack = SFX_NAMES[assign.sound.pack].split(' — ')[0];
    return `Press a key for ${pack} · ${SFX_EVENT_NAMES[assign.sound.event]}.`;
  }
  if (muted) return 'Sound is muted: the speaker in the corner turns it back on.';
  return keys.size > 0 ? 'Press an assigned key to play its sound.' : '';
}

/** The window and its title bar, in the picker's clothes. */
function shell(): { overlay: HTMLElement; card: HTMLElement; close: HTMLElement } {
  const overlay = el('div', 'overlay picker');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Sound check');
  const card = el('div', 'overlay-card picker-card');
  const head = el('div', 'picker-head');
  const close = el('button', 'ghost small', 'Close (Esc)');
  head.append(el('h2', undefined, 'Sound check'), close);
  card.append(head);
  return { overlay, card, close };
}

export function openSoundCheck(ctx: ScreenContext): void {
  const { overlay, card, close } = shell();

  const tools = el('div', 'soundcheck-tools');
  const assignBtn = el('button', 'primary small', 'Assign key');
  const clearBtn = el('button', 'ghost small', 'Clear keys');
  const status = el('span', 'soundcheck-status');
  status.setAttribute('aria-live', 'polite');
  tools.append(assignBtn, clearBtn, status);

  let assign: Assign = { step: 'idle' };
  const buttons: { sound: Sound; btn: HTMLButtonElement; badge: HTMLElement }[] = [];

  const grid = el('div', 'soundcheck');
  for (const pack of Object.keys(SFX_NAMES) as SfxPackId[]) {
    grid.append(el('h3', 'soundcheck-pack', SFX_NAMES[pack]));
    const packGrid = el('div', 'soundcheck-grid');
    for (const event of Object.keys(SFX_EVENT_NAMES) as SfxEvent[]) {
      const sound = { pack, event };
      const btn = el('button', 'soundcheck-sound');
      const badge = el('span', 'soundcheck-key');
      btn.append(el('span', undefined, SFX_EVENT_NAMES[event]), badge);
      btn.addEventListener('click', () => {
        ctx.onAudition(pack, event);
        if (assign.step === 'sound') {
          assign = { step: 'key', sound };
          sync();
        }
      });
      buttons.push({ sound, btn, badge });
      packGrid.append(btn);
    }
    grid.append(packGrid);
  }

  const sync = (): void => {
    for (const { sound, btn, badge } of buttons) {
      const bound = [...keys].filter(([, s]) => same(s, sound)).map(([k]) => keyName(k));
      badge.textContent = bound.join(' ');
      btn.classList.toggle('picking', assign.step === 'key' && same(assign.sound, sound));
    }
    grid.classList.toggle('choosing', assign.step === 'sound');
    assignBtn.textContent = assign.step === 'idle' ? 'Assign key' : 'Cancel';
    clearBtn.disabled = keys.size === 0;
    status.textContent = statusText(assign, ctx.p.muted);
  };

  const dismiss = (): void => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (!overlay.isConnected) {
      window.removeEventListener('keydown', onKey, true);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Immediate as well, or the app's own listener on the window still sees it.
      e.stopImmediatePropagation();
      if (assign.step === 'idle') dismiss();
      else {
        assign = { step: 'idle' };
        sync();
      }
      return;
    }
    // Browser and system shortcuts are left alone, and so is anything reserved.
    if (e.ctrlKey || e.metaKey || e.altKey || RESERVED.has(e.key)) return;
    const id = keyId(e);
    if (assign.step === 'key') {
      e.preventDefault();
      e.stopImmediatePropagation();
      keys.set(id, assign.sound);
      assign = { step: 'idle' };
      sync();
      return;
    }
    const sound = keys.get(id);
    if (!sound) return;
    // Taken from the focused button too: Space or Enter on a button would otherwise click it.
    e.preventDefault();
    e.stopImmediatePropagation();
    // A held key repeats, and a sound check is one sound per press.
    if (!e.repeat) ctx.onAudition(sound.pack, sound.event);
  };

  assignBtn.addEventListener('click', () => {
    assign = assign.step === 'idle' ? { step: 'sound' } : { step: 'idle' };
    sync();
  });
  clearBtn.addEventListener('click', () => {
    keys.clear();
    sync();
  });
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  window.addEventListener('keydown', onKey, true);

  sync();
  card.append(tools, grid);
  overlay.append(card);
  ctx.host.append(overlay);
  close.focus();
}
