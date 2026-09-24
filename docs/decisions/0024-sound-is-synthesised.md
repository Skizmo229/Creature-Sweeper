# 0024. Sound is synthesised, built lazily, one sound per action, and mute is not OFF

2026-09-20. Status: adopted.

## Context
An `AudioContext` created before a gesture stays suspended; building it in the constructor worked
in dev and shipped silent. A single click can produce hundreds of events.

## Decision
The context is built on the first sound and resumed on every call; every entry point swallows its
own failure; the loudest event of an action wins. Muting is a circumstance and the pack is a taste,
so they are separate; the speaker lives on `document.body` and is repainted from
`applyPresentation`.

## Consequences
Sound can never break the game. "Reset presentation" clears `muted` too, which is why the speaker
is repainted from there.
