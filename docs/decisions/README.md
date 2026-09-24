# Decisions

One short record per decision that a reader of the code might otherwise re-litigate or reverse
without knowing why it was made. This is where the *history* of the codebase lives, so that the
code itself can say what it does and, in a paragraph, why; anything longer or older points here.

Numbered in the order they were written, never renumbered. A decision that is later reversed gets
a new record saying so, and the old one gets a line at the top pointing at it.

Format, kept deliberately small:

```
# NNNN. Title, as a claim

Date. Status: adopted | superseded by NNNN.

## Context
What was true, what was being asked for, and what was measured.

## Decision
What was decided, in a sentence or two.

## Consequences
What it costs, what it protects, and what to check if it is ever changed.
```

The load-bearing rules of the game (the tuning identity, the zero-damage guarantee, EXP must
always be collected, numbers are sums) are not decisions and do not live here; they are in
`docs/invariants.md`.
