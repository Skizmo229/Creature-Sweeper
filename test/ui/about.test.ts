// @vitest-environment happy-dom
/**
 * The game's version, which lives in package.json alone and is shown under the title on the list
 * of game types (decision 0068).
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { version } from '../../package.json';
import { App } from '../../src/ui/app.js';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  new App(document.getElementById('app')!);
});

describe('the version', () => {
  it('is package.json’s, under the title on the list of game types', () => {
    const lines = [...document.querySelectorAll('.title-bar .sub')].map((p) => p.textContent);
    expect(lines).toContain(`Version ${version}`);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
