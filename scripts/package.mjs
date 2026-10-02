/**
 * Zip `dist/` for upload to itch.io.
 *
 * itch wants a zip with `index.html` at its ROOT, not inside a folder, or the
 * embed finds nothing to play. Written by hand against Node's zlib so it
 * needs no dependency and behaves the same on Windows, macOS and Linux —
 * `Compress-Archive`, `zip` and `tar -a` each exist on only some of those.
 *
 * Output: release/creature-sweeper-web-<version>-<date>-<commit>.zip (release-name.mjs).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { releasePath } from './release-name.mjs';

const DIST = 'dist';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html not found — run `npm run build` first.');
  process.exit(1);
}

// Guard against the one silent failure: absolute asset paths load nothing on itch.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
if (/(src|href)="\/(?!\/)/.test(html)) {
  console.error(
    "dist/index.html uses absolute asset paths; itch.io needs `base: './'` in vite.config.ts.",
  );
  process.exit(1);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// DOS timestamp for "now"; zip has no better field in the basic format.
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const files = walk(DIST).sort();
const locals = [];
const centrals = [];
let offset = 0;

for (const path of files) {
  const name = Buffer.from(relative(DIST, path).split(sep).join('/'), 'utf8');
  const data = readFileSync(path);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28); // extra field length
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8); // UTF-8 names
  central.writeUInt16LE(8, 10); // deflate
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42); // where its local header starts
  centrals.push(central, name);

  offset += local.length + name.length + packed.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8); // entries on this disk
end.writeUInt16LE(files.length, 10); // entries in all
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16); // where the central directory starts

const out = releasePath('web', 'zip', now);
writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`${out}  (${files.length} files, ${(statSync(out).size / 1024).toFixed(0)} KB)`);
