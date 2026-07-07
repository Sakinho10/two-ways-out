# two-ways-out

Prison strategy game — single-file HTML/JS

## The two paths

Every day you play toward one of two endings: **Justice** (present your case to
the parole board) or **Escape** (go over the wall). Evidence and Escape Plan are
the visible gauges that drive those odds; Connections and Suspicion sit
alongside them as secondary pressures.

## The Credibility pipeline

Justice odds also draw on a hidden three-stage pipeline — **Family → Lawyer →
Media** — collectively called Credibility. None of the three numbers are shown
in the UI; they surface only through log lines as they cross narrative
milestones (9 total: 3 tiers × 3 stages), each of which permanently adds a
small bonus into the justice-odds formula.

The stages are soft-gated, not hard-gated: Lawyer gains something even at
Family 0 (a floor efficiency), ramping up to full effect once Family clears a
threshold. Media works the same way off Lawyer. Family itself is never gated.
This means no path is ever fully dead, but investing in Family early pays off
in how effectively Lawyer and Media gains land later.

## Known gaps

| Item | Status |
|---|---|
| Trust rework (flat stat → Family/Lawyer/Media pipeline) | Done |

## Difficulty / balance mechanics

A parole hearing needs at minimum a few weeks of basic court scheduling — this
is a small realism floor, not the mechanism that makes Justice slow. Which
path is actually faster depends on the player's profile: a high-Intellect
build (the Strategist) finds Justice their fast path, while a low-Intellect,
high-Physique build (the Gentle Giant) finds the two paths roughly even, or
Escape faster.

Hard gates on attempting either ending (old evidence/escape-plan minimums) are
removed entirely — the player can attempt either at any time. The odds
(see `computeJusticeChance`/`computeEscapeChance` in `index.html`) carry the
weight of "are you actually ready," not a blocked button.

Justice is a capped number of hearings with a slow-refilling cooldown, mirroring
how parole/appeal systems work in practice. Escape has unlimited attempts, but
each failure makes the next one harder (guards learn your patterns), with no
floor — a player who just keeps ramming the wall can trend toward genuinely
hopeless odds.

## Simulation harness

This project's working rule: **simulate before trusting a balance change**.
`sim/pipeline_sim.js` is a Node port of the relevant formulas, actions, and the
Credibility milestone system, run against greedy justice/escape bots across
all four profiles. Run it with:

```
node sim/pipeline_sim.js
```

It reports Justice and Escape win rates per profile so a balance change (new
bonus values, a reworked formula, a new milestone) can be checked against
expected win-rate ranges before it ships — not just accepted on the strength
of "the math looks right."
