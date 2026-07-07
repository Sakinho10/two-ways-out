# two-ways-out

Prison strategy game — single-file HTML/JS at `index.html`. Two endings:
present your case to the parole board (Justice) or slip out through a gap
in the schedule (Escape). Everything the player does nudges one of a
handful of hidden and visible stats, which in turn feed the odds shown for
each ending.

## The Credibility pipeline

Building a case on the outside isn't one number going up — it's your
family doing the legwork, a lawyer taking the case seriously, and
eventually the case getting enough outside attention to matter. That's
modeled as three hidden 0-100 stats, collectively called **Credibility**,
that feed each other in sequence:

**Family → Lawyer → Media**

- None of the three are shown in the UI — the player feels their effects
  (log narration, milestone beats, the parole odds moving) without seeing
  a number to grind.
- Family is never gated — it always accumulates directly from player
  actions (library, guard favors, letters).
- Lawyer and Media are *soft-gated* off the stage that feeds them: each
  always produces something even when its feeder stat is at 0 (a floor
  efficiency), ramping up to full efficiency once the feeder crosses a
  threshold. See `rampEfficiency()` in `index.html`.
- Crossing a threshold (25/60/90) on any of the three stages fires a
  one-time narrative beat in the log and permanently adds to
  `pipelineBonus`, which feeds directly into the parole board's odds
  (`computeJusticeChance()`). Nine milestones total, tuned so the maximum
  combined bonus (~+10.5) lands close to the old flat-stat ceiling it
  replaced.

This replaced an earlier flat single stat that conflated all of the above
into one number with one meaning — see the simulation harness below for
how the replacement was validated before shipping.

## Simulation harness

`sim/pipeline_sim.js` is a Node port of the balance-relevant game logic
(stat factors, the Credibility pipeline, actions, odds formulas, milestone
checks) used to validate stat-balance changes before they land in
`index.html`. Working rule for this project: **simulate before relying on
a balance change.**

Run it with:

```
node sim/pipeline_sim.js
```

It runs 400 simulated playthroughs per character profile, for two bot
strategies (justice-greedy, escape-greedy), and reports each profile's win
rate for its respective ending. Current output roughly matches the target
ranges used to validate the Credibility rework:

| Profile | Justice win% | Escape win% |
|---|---|---|
| Strategist | ~80% | ~17% |
| Gentle Giant | ~18% | ~66% |
| Manipulator | ~77% | ~11% |
| Everyman | ~53% | ~54% |

## Known Gaps

| Item | Status |
|---|---|
| Flat single stat conflated three different relationships (family, legal, public) into one meaningless number | Done — replaced with the hidden Family/Lawyer/Media Credibility pipeline described above |
