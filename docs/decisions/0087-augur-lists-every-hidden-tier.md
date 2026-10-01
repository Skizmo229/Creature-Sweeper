# 0087. Augur lists every hidden tier

2026-09-30. Status: adopted. Supersedes 0062's answer and 0055's price.

## Context
Augur named the strongest creature among a cell's covered neighbours (0055, 0062), and was measured
as worthless: 1 of 67 casts freed a ring. On 30 September 2026 the owner asked for AUGUR to be
tuned, perhaps done over.

A scratch tool asked, at every point where the graded player at grade 4 was stuck on AUGUR's boards
(60 seeds a board, 354 points), what one cast of each candidate answer would free. For each open
number it enumerated the layouts of the cells behind it that its sum and its neighbours' sums
allow, kept those the true answer agrees with, and counted the cells left at or below the level in
all of them. "Best" is the number that would have freed most in hindsight; "aimed" is the number
whose answer, averaged over the layouts, frees most, as a careful player would choose:

| answer | best | aimed |
|---|---|---|
| the strongest (the Augur of 0062) | 92% | 20% |
| the count (Census) | 87% | 17% |
| how many are above your level | 62% | 15% |
| the tiers present, without repeats | 93% | 23% |
| every tier, with repeats | 93% | 25% |
| the count and the strongest (both spells) | 92% | 24% |

So the strongest was never worthless: the 1 in 67 measured a player that cast only where a whole
ring could come free. On a harsher AUGUR (lock 3, then 4 from board 4; boards 4 to 10, 820 points)
the list led by more: 29% aimed against the strongest's 22% and the count's 16%. The owner chose
the list, drawn as a column down the cell's right-hand edge, at 50 mana.

## Decision
Augur's answer is the tier of every creature among the cell's covered neighbours, strongest first,
and never where any of them stands. It is read off the ring as it stands (`augurNow` in
`src/engine/augur.ts`): the answer as cast less each creature opened since, which the board already
shows, so a beaten creature leaves the list and nothing new is told. Sweep's proof is unchanged in
kind (the strongest at or below your level frees the ring). The graded player's `augur-cap` trick
also narrows each cell to empty ground or a listed tier, rules out empty ground where the list
fills the ring, and places a tier where exactly as many cells can hold it as the list names; the
readers take the creature count from the list as they do from a Census. The price is 50, what
Census and the old Augur cost together, since it answers what both did and measured as useful.
The board draws the list as a column down the right-hand edge in Augur's cream, shrinking to fit,
and a ring hiding none as a 0 in the corner.

## Consequences
Spells are offered Census, Augur, Reveal, Beacon, Exercise. A game paused on AUGUR after an Augur
was cast fails its check after this change and is refused, because the answer it was shown has
changed; that is what the check is for (0084), and no version is raised since the reading is the
same. The trick keeps its id, `augur-cap`, and is called "The hidden tiers" wherever it is named.
Census is now the cheap half of Augur on AUGUR, worth casting where the count alone settles a ring.
The AUGUR ladder's own schedule is decision 0088.
