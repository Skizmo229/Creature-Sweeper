import { defineConfig } from 'vite';

export default defineConfig({
  // ladders.json lives in design/, outside src/, and is imported by the UI.
  server: { fs: { allow: ['.'] } },
  build: { target: 'es2022', outDir: 'dist' },
});
