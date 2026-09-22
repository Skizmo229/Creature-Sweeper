import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths. itch.io serves an HTML game from a per-upload
  // subfolder, so the default absolute `/assets/...` would resolve against the
  // host's root and load nothing — a blank page with no error in the game.
  base: './',
  // ladders.json lives in design/, outside src/, and is imported by the UI.
  server: { fs: { allow: ['.'] } },
  build: { target: 'es2022', outDir: 'dist' },
});
