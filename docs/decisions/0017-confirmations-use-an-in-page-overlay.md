# 0017. Confirmations go through App.ask(), never window.confirm

2026-09-21. Status: adopted.

## Context
An embedded webview can suppress dialogs, and a browser will once the player ticks "prevent
additional dialogs"; `confirm()` then returns false instantly and the button silently dies. Abandon
shipped that way and was dead in the desktop app's preview.

## Decision
Abandon and Reset progress use `App.ask()`, an overlay built like the win and loss screens. While a
question is up, Escape answers it and every other key is swallowed; every screen rebuild calls
`closeAsk()`.

## Consequences
Anything irreversible added later goes through it. A rebuild that forgot `closeAsk()` would leave a
handle on a detached node swallowing keys for the session.
