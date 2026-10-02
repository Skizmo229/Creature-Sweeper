# 0017. Confirmations go through Modal.ask, never window.confirm

2026-09-21. Status: adopted. `App.ask()` moved to `Modal.ask` (`src/ui/overlays/modal.ts`) on 27
September 2026.

## Context
An embedded webview can suppress dialogs, and a browser will once the player ticks "prevent
additional dialogs"; `confirm()` then returns false instantly and the button silently dies. Abandon
shipped that way and was dead in the desktop app's preview.

## Decision
Abandon and Reset progress use `Modal.ask`, an overlay built like the win and loss screens. While
a question is up, Escape answers it and every other key is swallowed; every screen rebuild closes
it (`Modal.close`).

## Consequences
Anything irreversible added later goes through it. A rebuild that forgot to close it would leave a
handle on a detached node swallowing keys for the session.
