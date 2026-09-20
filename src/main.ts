import { App } from './ui/app.js';

const root = document.getElementById('app');
if (!root) throw new Error('#app missing from index.html');

const app = new App(root);

// Dev-only handle for poking at a running game from the console, and for
// driving the UI in tests. Stripped from production builds.
if (import.meta.env.DEV) {
  (globalThis as unknown as { cs: unknown }).cs = app;
}
