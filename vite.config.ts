import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths. itch.io serves an HTML game from a per-upload
  // subfolder, so the default absolute `/assets/...` would resolve against the
  // host's root and load nothing — a blank page with no error in the game.
  base: './',
  // ladders.json lives in design/, outside src/, and is imported by the UI.
  server: { fs: { allow: ['.'] } },
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    // .claude/worktrees holds other sessions' checkouts of this repo, each
    // with its own test/, and collecting them ran a second copy of the suite
    // against a second copy of the source — double the time, and a test count
    // that was half somebody else's branch.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
