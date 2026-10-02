// @vitest-environment happy-dom
/**
 * The game's version, which lives in package.json alone and is shown under the title on the list
 * of game types (decision 0068), and the About card, which carries the version, the GPL's notices
 * and the way to the source (decision 0069).
 */

import './setup.js';
import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { version } from '../../package.json';
import { key, mountApp } from './driver.js';

const card = (): HTMLElement | null => document.querySelector('.overlay-card.about');
const links = (): HTMLAnchorElement[] => [...(card()?.querySelectorAll('a') ?? [])];
const openAbout = (): void =>
  [...document.querySelectorAll<HTMLButtonElement>('.tools button')]
    .find((b) => b.textContent === 'About')!
    .click();

beforeEach(() => {
  mountApp();
});

describe('the version', () => {
  it('is package.json’s, under the title on the list of game types', () => {
    const lines = [...document.querySelectorAll('.title-bar .sub')].map((p) => p.textContent);
    expect(lines).toContain(`Version ${version}`);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('the About card', () => {
  it('opens from the list of game types with the version, the copyright and the licence', () => {
    openAbout();
    const text = card()!.textContent!;
    expect(text).toContain(`Version ${version}`);
    expect(text).toContain('Copyright © 2026 Skizmo229 and contributors.');
    // The GPL's notices for an interactive program: that it may be shared, and no warranty.
    expect(text).toContain('you may share and change it');
    expect(text).toContain('version 3 or later');
    expect(text).toContain('no warranty');
    // Names the game Hojamaka Games had no part in, which "it" after "mamono sweeper" did not.
    expect(text).toContain('They did not make or endorse Creature Sweeper');
  });

  it('links to the source, the licence, the original and the font notices, each in a new tab', () => {
    openAbout();
    expect(links().map((a) => a.getAttribute('href'))).toEqual([
      'https://hojamaka.com/games/mamono_sweeper/',
      'https://github.com/Skizmo229/Creature-Sweeper/blob/main/LICENSE',
      'https://github.com/Skizmo229/Creature-Sweeper',
      './FONT-LICENSES.txt',
    ]);
    for (const a of links()) {
      expect(a.target, a.href).toBe('_blank');
      expect(a.rel.split(' '), a.href).toContain('noopener');
    }
    // The font notices are linked beside index.html, where public/ puts them in every build.
    expect(existsSync('public/FONT-LICENSES.txt')).toBe(true);
  });

  it('closes with its button and with Escape', () => {
    openAbout();
    card()!.querySelector<HTMLButtonElement>('button')!.click();
    expect(card()).toBeNull();
    openAbout();
    key('Escape');
    expect(card()).toBeNull();
  });
});
