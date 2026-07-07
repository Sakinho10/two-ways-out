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

## Difficulty Scenarios

Before picking a character, the player picks a *case* — four tiers, each a
different wrongful-conviction premise. This isn't a global difficulty
multiplier; each tier shifts Justice and Escape ASYMMETRICALLY, because the
premise itself implies which systems come down harder on you:

**Easy — Robbery** &middot; **Normal — Wife's murder** &middot;
**Hard — Killed a cop** &middot; **Very Hard — Killed a senator**

Normal is the existing tuned baseline from the Credibility rework above;
Easy/Hard/Very Hard are all defined relative to it. Each tier is a plain
object (`SCENARIOS` in `index.html`) with three knobs, the same
centralized-data pattern as `PROFILES`/`ACTIONS`, referenced from
`rampEfficiency()` call sites, `applyDelta()`, `checkMilestones()`,
`computeEscapeChance()`, the guard-favor action, and `maybeEvent()` —
never hardcoded inline in `render()`/`chooseAction()`:

- **Security** throttles the Escape path: a multiplier on any *positive*
  suspicion gain (so it hits Escape harder than Justice, since Escape's
  odds formula subtracts suspicion at a steeper rate), a multiplier on
  Escape Plan growth, and a multiplier on `ESCAPE_ESCALATION_PENALTY` (how
  much harder each failed escape attempt makes the next one). Hard and
  Very Hard also give guards a distinct *hostile* behavior, not just
  worse numbers: the "do a guard a favor" action has a chance to backfire
  outright (suspicion instead of Family), and the point at which repeated
  favors mark you as "a guard's pet" arrives sooner.
- **Scrutiny** throttles the Credibility pipeline's Lawyer and Media
  stages specifically: the `rampEfficiency()` threshold/floor pair those
  two stages ramp against, and a multiplier — capped outright on Very
  Hard — on how much each pipeline milestone adds to `pipelineBonus`.
  Family itself is never gated, matching the pipeline's existing design;
  only what Family can convert into is throttled.
- **Family** sets the starting `family` stat and a multiplier on its
  growth from library/guard/letters. On Hard, starting Family is
  unchanged (support isn't cut off, it's just supervised) — only the
  growth rate drops. On Very Hard, Family additionally gets a soft cap
  well below 100: even a perfect family can't fully fix a national story.

Very Hard also extends `maybeEvent()` with a rare (~4%) independent
"tabloid flare-up" — a suspicion spike plus a `pipelineBonus` hit that can
land regardless of the day's action, for volatility distinct from Hard
rather than just "Hard but bigger numbers."

Changing difficulty (the "Change Difficulty" button, available during
play and on the ending screen) clears both `S.scenario` and `S.profile`
and returns to the very first screen — unlike "Change character," which
only clears the profile and keeps the current case.

## Simulation harness

`sim/pipeline_sim.js` is a Node port of the balance-relevant game logic
(stat factors, the Credibility pipeline, Difficulty Scenario modifiers,
actions, odds formulas, milestone checks) used to validate stat-balance
changes before they land in `index.html`. Working rule for this project:
**simulate before relying on a balance change.**

Run it with:

```
node sim/pipeline_sim.js
```

It runs 400 simulated playthroughs per profile x scenario combination (16
total), for two bot strategies (justice-greedy, escape-greedy), and
reports each combination's win rate for its respective ending. Current
output roughly matches the target shape used to validate the Scenario
system: Easy meaningfully favors whichever path already suits a profile;
Hard/Very Hard compress Justice hardest for low-Intellect profiles (Gentle
Giant) and Escape hardest for low-Composure/high-suspicion profiles
(Manipulator), while every profile keeps at least one clearly winnable
path even at Very Hard.

| Scenario | Profile | Justice win% | Escape win% |
|---|---|---|---|
| Easy | Strategist | ~99% | ~84% |
| Easy | Gentle Giant | ~72% | ~99% |
| Easy | Manipulator | ~98% | ~97% |
| Easy | Everyman | ~97% | ~98% |
| Normal | Strategist | ~84% | ~17% |
| Normal | Gentle Giant | ~21% | ~65% |
| Normal | Manipulator | ~72% | ~17% |
| Normal | Everyman | ~60% | ~56% |
| Hard | Strategist | ~49% | ~0% |
| Hard | Gentle Giant | ~1% | ~27% |
| Hard | Manipulator | ~19% | ~0% |
| Hard | Everyman | ~20% | ~12% |
| Very Hard | Strategist | ~36% | ~0% |
| Very Hard | Gentle Giant | ~1% | ~23% |
| Very Hard | Manipulator | ~10% | ~0% |
| Very Hard | Everyman | ~12% | ~9% |

The near-0% cells (e.g. Strategist/Manipulator's Escape under Hard/Very
Hard) are intentional, not a bug: those are physique-weak builds attempting
a maximum-security escape, which is exactly the path the profile and the
scenario both agree they're worst at. Each profile's *suited* path stays
meaningfully alive at every tier.

## Known Gaps

| Item | Status |
|---|---|
| Flat single stat conflated three different relationships (family, legal, public) into one meaningless number | Done — replaced with the hidden Family/Lawyer/Media Credibility pipeline described above |
| No difficulty selection — every case was the same premise/stakes | Done — four-tier Difficulty Scenario system described above, selected before profile |
| Save system only knows `S.profile`, not `S.scenario` | Partial — `S.scenario` now round-trips through `localStorage` alongside `S.profile`; no versioned migration or grading/ranking table yet (planned for a later pass) |
