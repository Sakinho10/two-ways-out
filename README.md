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

## Attempt mechanics

Presenting a case or attempting an escape **is** the day's action — it
never happens alongside a build action, and it spends its own day the same
way `chooseAction()` does. Justice used to be gated behind a hard
`MIN_JUSTICE_DAY` floor (no hearing before day 21, regardless of
readiness); that floor is gone. Both endings are attemptable from day 1,
gated only by their confidence/chance formula.

Failing an attempt now costs more than the day already spent:

- **Underprepared multiplier** — `underpreparedMult(chance)` scales the
  existing failure penalties (suspicion/evidence for Justice, suspicion/
  escapePlan/connections for Escape) from 1x at a reasonable chance (≥40)
  up to 2.5x as the chance approaches a desperate long-shot. Attempting at
  very low confidence costs noticeably more than a near-miss.
- **Justice fail day-cost** shrinks as Lawyer credibility and hearing
  experience grow — `extraDays = round(12 * credibilityFactor *
  attemptDiscount)`, where `credibilityFactor` ramps off `S.lawyer` and
  `attemptDiscount` gives a modest break for each prior failed hearing
  (floor 0.6x). A well-lawyered case that still gets denied loses less
  calendar time than a first, underprepared filing.
- **Escape fail day-cost** does the opposite — it grows with repeat
  attempts (`rand(10,25) + 5 * priorFailedEscapeAttempts`, capped at 60):
  guards learn your patterns, so getting caught again costs more, not
  less.

`S.justiceAttemptsUsed` and `S.escapeAttemptsUsed` track total *failed*
attempts on each path (not total attempts — a winning attempt doesn't
increment its counter) and persist through save/load. The grading system
below is the reason they exist.

## Grading

Once a run ends, `computeGrade()` turns the final day count, winning path,
and failed-attempt counts into a letter grade, shown on the ending screen
alongside a short generated comment and the raw numeric score.

- **Efficiency** compares `S.day` against a per-scenario par (20/25/28/32
  for easy/normal/hard/veryhard), capped at 100.
- **Path fit** rewards winning via a profile's *weak* path (+15) over its
  *strong* one (-15) — Strategist and Manipulator lean Justice, Gentle
  Giant leans Escape, Everyman has no lean (always 0) and can't earn the
  Elite badge below.
- A flat **Justice bonus** (+10) and a **6-point-per-fail attempt
  penalty** (summed across both paths) round out the raw score, which is
  then scaled by a difficulty multiplier (0.85 easy → 1.3 veryhard) and
  mapped to an eleven-band letter grade (A+ down to F).
- A **difficulty ceiling** clamps the letter down (never up) after it's
  assigned: easy caps at B-, normal at B+, hard at A-; Very Hard has no
  ceiling.
- An **Elite** badge ("THE HARD WAY") can co-occur with any letter: it
  requires Very Hard, winning via the profile's weak path, and zero failed
  attempts on *either* path this game — a genuine first-try, no-dry-runs
  result. It's intentionally rare; see the simulation numbers below.

The comment text is assembled from three parts — an 11-band x 2-path base
string, a profile clause (playing-to-type if the path was the profile's
strength, against-the-grain if it was the weak path), and a scenario
clause — so the same letter grade reads differently for a Strategist who
grinded out Justice on Easy versus a Gentle Giant who barely escaped Very
Hard.

## Simulation harness

`sim/pipeline_sim.js` is a Node port of the balance-relevant game logic
(stat factors, the Credibility pipeline, Difficulty Scenario modifiers,
actions, odds formulas, milestone checks, attempt/fail day-costs, and the
grading formula) used to validate stat-balance and grading changes before
they land in `index.html`. Working rule for this project: **simulate
before relying on a balance change.**

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

It then runs a second pass (300 playthroughs per profile x scenario x path,
32 combinations) that grades every actual win with `computeGrade()` and
prints a letter-grade distribution per combination plus an overall
histogram, used to sanity-check the band boundaries and difficulty ceiling
above before they ship. A handful of combinations report "no wins" — the
same near-0%-win-rate cells from the table below (a physique-weak build
attempting a maximum-security escape, say), which is expected, not a bug.
The Elite badge is intentionally rare: across ~4,100 graded wins in a
typical run, it fires roughly once, since it demands Very Hard, a
first-try win, *and* zero failed attempts on either path in the same
game.

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
| Save system only knows `S.profile`, not `S.scenario` | Partial — `S.scenario` now round-trips through `localStorage` alongside `S.profile`; still no versioned migration |
| No day/attempt-cost mechanics — Justice was gated by a flat day floor, and neither ending's fail penalty scaled with confidence or repeat attempts | Done — `MIN_JUSTICE_DAY` removed, attempts spend their own day, and fail penalties scale via `underpreparedMult()` plus scaled fail day-costs, described above |
| No grading/ranking on the ending screen | Done — `computeGrade()` produces a letter grade, raw score, generated comment, and Elite badge, described above |
