# 0022. The save backs up as a CS1: base64 code

2026-09-21. Status: adopted.

## Context
The save is `localStorage` inside itch.io's third-party iframe, which Safari caps and may clear.

## Decision
Back up / restore on the ladder list exports progress and settings as a `CS1:` base64 code, not
JSON, because chat apps curl quotes. Import strips the invisible characters apps insert into long
strings and refuses anything that would load as a blank save.

## Consequences
Changing `SaveData` means writing a migration; testers' codes are in the wild. The settings reader
ignores unknown keys, so a retired presentation setting needs none.
