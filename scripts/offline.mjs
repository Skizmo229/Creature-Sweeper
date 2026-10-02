/**
 * Fold `dist/` into one HTML file that plays from disk, for the GitHub release (decision 0089).
 *
 * The itch.io zip plays only from a web server: its script is a module, and a browser will not
 * load a module into a page opened from a file. Here the script, the styles and every font they
 * name are written into the page itself, so a player downloads one file and double-clicks it.
 * The game links one file of its own, the fonts' notices, and a lone page has nothing beside it:
 * their text goes in a comment at the top of the page, and the About card's link goes to the copy
 * on GitHub at this version's tag.
 *
 * Every check refuses a build this was not written for (a second script or stylesheet, a file
 * still named beside the page) rather than writing a page that opens blank.
 *
 * Output: release/creature-sweeper-offline-<version>-<date>-<commit>.html (release-name.mjs).
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { releasePath } from './release-name.mjs';

const DIST = 'dist';
const NOTICES = 'FONT-LICENSES.txt';
const MEDIA_TYPES = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' };

function refuse(message) {
  console.error(message);
  process.exit(1);
}

/** The single match of `pattern` in `text`; none or several is a build this was not written for. */
function single(text, pattern, what) {
  const found = [...text.matchAll(pattern)];
  if (found.length !== 1)
    refuse(`Found ${found.length} ${what}; the offline page needs exactly one.`);
  return found[0];
}

if (!existsSync(join(DIST, 'index.html'))) {
  refuse('dist/index.html not found — run `npm run build` first.');
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const scriptTag = single(html, /<script\b[^>]*\bsrc="\.\/([^"]+)"[^>]*><\/script>/g, 'scripts');
const sheetTag = single(
  html,
  /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\.\/([^"]+)"[^>]*>/g,
  'stylesheets',
);
if (/\b(src|href)="\.\//.test(html.replace(scriptTag[0], '').replace(sheetTag[0], ''))) {
  refuse('dist/index.html names a file beside it other than its script and stylesheet.');
}

// The styles name their fonts beside the stylesheet; each becomes a data: URL.
const sheetPath = join(DIST, sheetTag[1]);
const css = readFileSync(sheetPath, 'utf8').replace(
  /url\((["']?)\.\/([^)"']+)\1\)/g,
  (_, _quote, name) => {
    const type = MEDIA_TYPES[extname(name)];
    if (!type) refuse(`${sheetTag[1]} names ${name}, which the offline page cannot inline.`);
    return `url(data:${type};base64,${readFileSync(join(dirname(sheetPath), name)).toString('base64')})`;
  },
);
if (/url\((?!["']?data:)/.test(css))
  refuse(`${sheetTag[1]} names a file the offline page cannot inline.`);

// The About card's notices link, pointed at this version's copy of the file on GitHub.
const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const noticesLink = `./${NOTICES}`;
let js = readFileSync(join(DIST, scriptTag[1]), 'utf8');
const links = js.split(noticesLink).length - 1;
if (links !== 1) refuse(`Found ${links} links to ${noticesLink} in the script; expected one.`);
js = js.replace(noticesLink, () => `${repo}/blob/v${pkg.version}/public/${NOTICES}`);

// Inside a <script> or <style> element these would end it early or change how it is read.
if (/<\/script|<!--/i.test(js))
  refuse('The script holds `</script` or `<!--` and cannot be inlined.');
if (/<\/style/i.test(css)) refuse('The stylesheet holds `</style` and cannot be inlined.');
const notices = readFileSync(join(DIST, NOTICES), 'utf8');
if (/--!?>/.test(notices)) refuse(`${NOTICES} holds a comment's end and cannot go in one.`);

// Function replacements, because the script is full of `$` that a string replacement would read.
const page = html
  .replace(/^<!doctype html>\r?\n/i, (doctype) => `${doctype}<!--\n${notices}-->\n`)
  .replace(sheetTag[0], () => `<style>${css}</style>`)
  .replace(scriptTag[0], () => `<script type="module">${js}</script>`);
if (!page.includes(`<!--\n${notices}`))
  refuse('dist/index.html does not open with `<!doctype html>`.');

const out = releasePath('offline', 'html', new Date());
writeFileSync(out, page);
console.log(`${out}  (${(statSync(out).size / 1024).toFixed(0)} KB)`);
