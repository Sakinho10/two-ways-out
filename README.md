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

## Suspicion & Heat (v2)

The original single `suspicion` stat rose roughly +2/day *regardless of
what the player did*, then hit a flat 3-event pool once it crossed a
threshold. That made cautious play pointless (the number climbed either
way) and made the stat feel inert once maxed out. v2 splits it into two
independent, per-track stats — `S.suspicion` (Escape) and `S.heat`
(Justice) — each driven **only** by a per-action footprint on the days
that track's actions are taken, never an ambient tax:

```
suspicion_delta = footprint(action) × trialProximityMult × repMult × biasMult   [Escape-track action days]
suspicion_delta = -3                                                            [any day with no Escape-track action]
heat_delta      = footprint(action) × trialProximityMult × repMult              [Heat-track action days]
heat_delta      = -2                                                            [any day with no Heat-track action]
```

Taking an action on the *other* track (or Rest) counts as "no action" for
decay purposes — quiet play now actually reads as quiet.

- **Footprints** — `FOOTPRINT_SUSPICION`/`FOOTPRINT_HEAT` in `index.html`.
  Suspicion: scout 2, mapRoutines 2, cultivateRoutine 3, crew 4,
  leanOnInmate 5, forgeRapport 5, testBlindSpot 6, stashTools 7, bribe 7,
  disguiseWork 8, breachTest 10. Heat: pressStatement 6,
  pushBackOnDepartment 7, steerCoverage 8, publicRally 8, whistleblowerLeak
  9 (Very Hard only). Most Justice moves (library, letters, reviewTestimony,
  studyCaseFile, etc.) generate zero Heat by design — only the handful of
  moves that put you in front of the public or the department do.
- **`trialProximityMult()`** — >50% of the current trial cycle remaining =
  1.0×, 25–50% = 1.25×, 10–25% = 1.5×, <10% = 1.8×. Same footprint costs
  more the closer the trial date gets.
- **`repetitionMult()`** — reuses `S.actionStreak` (the existing
  back-to-back-repeat counter) but in the *opposite* direction from the
  reward-decay `mult`: `min(1.6, 1 + 0.15×(streak-1))`. Repeating a move
  gets less profitable *and* more noticeable at once.
- **`suspicionBiasMult()`** — once Suspicion has already crossed 70
  through the player's own play, further Escape-track footprint lands
  ~1.15× harder. Only ever triggers for a player who got there themselves;
  a quiet player never crosses 70 in the first place.
- **Pattern detection** — `PATTERNS` in `index.html`: a small combo table,
  not a subsystem. If a defined set of Escape-track actions all land
  within a rolling day window, it fires a flat bonus + distinct log line
  even if each action individually stayed under a tier threshold (e.g.
  `scout+bribe+leanOnInmate` within 4 days → "Preparing a Breakout", +12).
- **Tier ladders** — `SUSPICION_TIERS`/`HEAT_TIERS` replace the old flat
  3-event pool. Six bands each (0-19 through 95-100), rolled once per day
  independently per track; each band's event pool gets worse (search
  frequency, Escape Plan/Evidence/Lawyer/Media setbacks, day-cost
  sanctions) climbing the ladder. The top band (95-100) gets a
  near-guaranteed severe event specifically on a day the matching track's
  action is taken.
- **Chance formulas** — `computeEscapeChance()`'s Suspicion penalty
  dropped from `-0.35×` to `-0.2×` (risk is now also expressed through the
  tier ladder, not just this coefficient), plus a flat `-8` once Suspicion
  hits 80+ (the "Under surveillance" tier's "reduced escape odds").
  `computeJusticeChance()` now subtracts Heat instead of the old shared
  Suspicion term, at a deliberately mild `-0.12×` — Evidence/Lawyer/Media
  remain the primary Justice levers; Heat is friction, not a second gate.

## Expanded move pool (v2)

The move pool grew from ~18 to ~46 entries (drawn 3/day as before — Rest
is always offered on top), organized into tiers with earned-through-play
gates instead of flat numbers for the latest content:

- **Tier 0** (day 1, unchanged): library, guard, letters, crew, scout,
  rest.
- **Tier 1** (day ≥ 3 or a light condition): studyCaseFile, mapRoutines,
  gymTime, infirmaryHelp (Family ≥ 10), cultivateRoutine (scout used ≥ 2),
  therapySession (always available).
- **Tier 2** (mid stat thresholds): pressStatement (Media ≥ 20),
  pushBackOnDepartment (Lawyer ≥ 30), leanOnInmate (Connections ≥ 25),
  testBlindSpot (Escape Plan ≥ 20), forgeRapport (Connections ≥ 20),
  mentorInmate (Trust ≥ 25), quietWorkDetail (Trust ≥ 20), bribe
  (Connections ≥ 15).
- **Tier 3** (earned, *scaled* gates — see below): stashTools,
  disguiseWork (chained off stashTools), blackmailLite, steerCoverage
  (Media/pressStatement-gated; the "control your own story" move — kept a
  distinct id from the existing Very Hard scenario-signature move also
  called `controlTheStory`, which is untouched), publicRally,
  whistleblowerLeak (Very Hard only).
- **Tier 4** (late-game): breachTest (Escape Plan ≥ 50), familyVisitDay
  (Family ≥ 30, recurring every ~10 days — appears in the draw like a
  milestone, not player-triggered on demand).
- **Profile signature chains** (2-3 per profile, exclusive to that
  profile): Strategist scheduleAhead → crossReferenceFiles (re-gated to
  Evidence ≥ 15, was the old always-on signature) → contingencyPlan (day ≥
  10); Gentle Giant standOver → protectWeaker (Trust ≥ 15) → laborCrew (day
  ≥ 8, also unlocks quietWorkDetail earlier for this profile); Manipulator
  spreadRumor → tradeFavor (Connections ≥ 15, discounts bribe's footprint
  by 1 once used); Everyman blendIn → overheardTip (day ≥ 5) →
  nobodySuspectsMe (Suspicion or Heat ≥ 30, halves the repeat-move penalty
  for 5 days). The original one-per-profile always-on signatures
  (`leanOnInmate`, `playGuardsAgainstEachOther`, `keepEveryoneTalking`) are
  kept under their existing ids, just demoted to general Tier 2-ish
  content rather than deleted.
- **`Trust`** — a new hidden 0-100 stat (parallel to Connections but
  reputation- rather than transaction-based), gating several Tier 2/3/
  profile moves. Built by gymTime, infirmaryHelp, mentorInmate,
  quietWorkDetail, protectWeaker, laborCrew.

**Scaling** — Tier 3 gates use `scaleFactor = scenarioDays /
CYCLE_DAYS.veryhard` (Very Hard = 1.0, the full un-discounted gate; Easy ≈
0.73) so the same relative fraction of a stat cap is reachable at every
difficulty rather than a flat number that's trivial on Very Hard and
unreachable on Easy. (The original task brief for this cited
`scenarioDays/42` with Very Hard as "the baseline," but `CYCLE_DAYS.veryhard`
is actually 48, not 42 — Hard is 42. That number came from an approximated
simulation outside the real codebase, flagged as unverified; this uses the
real `CYCLE_DAYS` value instead, re-validated against `sim/pipeline_sim.js`
— see "v2 verification" below.) Connections-based Tier 3 gates
(`stashTools`, `blackmailLite`) also apply a 0.85× `giantDiscount` for the
Gentle Giant profile, whose build leans on Connections/Physique rather
than the credibility pipeline.

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

- **Efficiency** compares `S.day` against a per-scenario par (12/16/17/17
  for easy/normal/hard/veryhard), capped at 100. Retuned down from the
  original 20/25/28/32 once the dynamic move pool shipped — well-played
  runs finish faster than the old fixed 6-move system assumed, so the old
  par let most wins cap efficiency at 100 regardless of how well they were
  actually played.
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

**This table is the pre-v2 baseline**, kept in the harness (`BASELINE_WIN_RATES`)
purely as the reference point for Report 1's shift-detection below. It no
longer describes current behavior — see "v2 verification" immediately
below for what actually shipped and why the numbers moved.

## v2 verification

The Suspicion/Heat rework and the scaled Tier 3 move-unlock gates were
first validated with an approximated simulation *outside* this codebase
(a simplified stat-gain model, not the real `applyDelta`/`rampEfficiency`
pipeline). Two things that approximation could not conclusively verify
were re-checked here, against `sim/pipeline_sim.js`'s real bot/formula
port, across all 16 profile × scenario combos:

1. **Justice Tier 3 reachability** (`checkTier3JusticeReachability()`) —
   whether `steerCoverage`/`publicRally` (the renamed/re-gated
   `controlTheStory`-equivalent and `publicRally`) actually unlock before
   a justice-greedy bot's run ends. **Result: reachable in most combos
   (1-12% of runs unlock at least one), but the Strategist profile —
   and occasionally Manipulator — lands at 0% in several combos**, varying
   run to run at N=150. Root cause (see finding below): a
   Strategist-piloted bot wins so fast, so early, that Media never has
   time to accumulate — it's not that the gate itself is unreachable,
   it's that optimal Justice play doesn't linger long enough to reach it.
   This is the same underlying issue as the win-rate finding below, not a
   separate bug.
2. **Quiet/patient Escape win rate** (`checkQuietEscapeViability()`) — a
   bot that only takes Escape-track actions while Suspicion stays under
   45 (well below the "Watched" tier) and otherwise rests, checking
   whether it can still reach the existing Escape Plan ≥ 70 attempt
   threshold at a healthy rate. **Result: passes cleanly — 41-91% win
   rate across all 16 combos**, comfortably clear of a 20% floor. The
   lowered `-0.2×` Suspicion penalty and the new decay-when-quiet
   mechanic do what they were meant to: a genuinely cautious Escape
   build stays winnable, not just "not impossible."
3. **Very Hard / Strategist / Escape regression check** — this was
   already a known-fragile combo (~0% in the pre-v2 baseline). Post-v2 it
   sits at **~16-17%**, an improvement, not a regression — consistent
   with the lowered Suspicion penalty on `computeEscapeChance()`.

**A finding beyond the two required checks:** Report 1 (win% shift vs. the
baseline table above) flags large positive swings on Justice across
almost every combo — several profiles jump from the baseline's 1-49% up
toward 95-100%. This traces to a real, structural consequence of
decoupling the two stats rather than a bug in either formula: the old
shared `suspicion` stat rose +2/day *regardless of action*, which meant
long Justice-focused games got monotonically riskier just from calendar
time passing, independent of what the player actually did. That was
exactly the "broken, rises regardless of play style" behavior this rework
set out to remove — but it was also incidentally doing double duty as
Justice's main difficulty brake. Heat, by design (`Evidence/Lawyer/Media
remain the primary levers; Heat is friction, not a second gate` — see
"Suspicion & Heat" above), only rises from 5 specific public-facing moves
and decays otherwise, so a Justice build that never touches those moves
now faces almost no downward pressure on `computeJusticeChance()` at all,
and Evidence itself was never scenario-throttled (only Family/Lawyer-ramp/
pipelineBonus are). Raising the justice-bot's attempt-confidence threshold
in the harness (a test-only change, not a game-formula change) didn't
meaningfully change this — Evidence simply accumulates fast enough,
independent of difficulty, that most Justice wins land within the first
15-20 days regardless of scenario.

This is flagged, not silently patched: fixing it properly means either
scenario-throttling raw Evidence gain (a change to the Credibility
pipeline, out of scope for this move-pool/Suspicion PR) or giving Justice
attempts their own repeat-escalation mechanic the way Escape already has
(`ESCAPE_ESCALATION_PENALTY`) — both are real design decisions, not
one-line tuning, and belong in a dedicated balance-focused follow-up
rather than bundled into this rework. `sim/pipeline_sim.js`'s existing
convention is report-only (flag deviations, let a human retune); this
finding follows that same convention.

## v2 follow-up: loud-play Heat trap (fixed)

Playtesting surfaced a distinct, more severe bug on top of the general
finding above: a player following the natural "always take the
highest-Evidence move" strategy saw their Justice chance *collapse* to
single digits by end of game, rather than just staying high like the
finding above describes. Two systems were independently draining the same
stat: the `95-100` Heat tier's event applied `evidence:-rand(14,22)`
directly, stacking with the unrelated `maybeEvidenceChallenge()` mechanic
(which already attacks Evidence once it crosses 30) — so building up
Evidence, the exact stat Justice is won on, got punished twice over once
Heat capped out. Repeated Heat-generating moves reached that Heat tier
fast in the first place because `pressStatement` was the *only* early
Heat move available (`pushBackOnDepartment` didn't unlock until Lawyer
30), so a loud player had no second option to break up the `repMult`
escalation from repeating the same move.

Three fixes, all mirrored into `sim/pipeline_sim.js`:

1. The `95-100` Heat tier ("Story has turned") no longer touches Evidence
   — redirected to Lawyer/Media friction, same shape as the `80-94` tier.
   Evidence is now only ever touched by `maybeEvidenceChallenge()` and the
   lighter `40-59`/`60-79` Heat tier pokes, never compounded.
2. `pushBackOnDepartment`'s gate dropped from `Lawyer >= 30` to `Lawyer >=
   18`, giving loud Justice play a second Heat move to alternate with
   earlier, breaking up the single-move repetition streak that drove Heat
   to its ceiling.
3. `controlTheStory` (the Very Hard scenario-signature move) was a
   pre-Heat-split leftover — it still hardcoded `applyDelta({...,
   suspicion:s})`, adding to the wrong (Escape-track) stat, and since its
   id wasn't in `FOOTPRINT_HEAT` it was also *undone* by the automatic
   Heat decay every time it ran. Migrated to the Heat system: footprint 8
   (matching `steerCoverage`/`publicRally`), no longer touches
   `S.suspicion` at all. Its `id` is unchanged (still referenced by
   `SCENARIO_SIGNATURE_MOVE.veryhard` and any existing save/leaderboard
   data).

Verified with a new harness check, `checkLoudJusticeChance()` — a bot that
picks whichever offered Justice move *looks* biggest by its own nominal
Evidence range (ignoring Heat entirely, `EVIDENCE_RANK`), run for 30 days
with no attempts, reporting `computeJusticeChance()` at the end, against
all 16 profile × scenario combos, alongside a "paced" variant that backs
off Heat moves above Heat 45 for comparison:

```
node sim/pipeline_sim.js
```

Result: loud play's end-of-game chance now ranges **~63-95%** across every
combo (worst case Very Hard/Gentle Giant), never collapsing — comfortably
above the ~50% floor this fix targeted, and close to the paced variant's
numbers in every combo, confirming loud play is no longer *self-defeating*,
just occasionally a bit less efficient than pacing would be. This is a
narrower, distinct fix from the "Justice win rate generally inflated"
finding above (still open) — that finding is about the *ceiling* being
too high across the board; this one was about a *trap* that could put the
floor at zero for an intuitive playstyle. Fixing the trap doesn't fix the
ceiling.

## v2 follow-up: scenario-throttle Evidence gain (partial — ceiling not closed)

Direct attempt at the *ceiling* finding from "v2 verification" above: Escape
already throttles its main stat per scenario (`security.escapePlanMult`);
Evidence had no equivalent, despite being Justice's primary lever now that
Heat is deliberately mild. Added `scrutiny.evidenceMult` (easy 1.1, normal
1.0, hard 0.75, veryhard 0.65) and applied it in `applyDelta()`'s
`d.evidence` branch the same way `escapePlanMult` is applied to
`d.escapePlan` — scaling positive gains only, never the losses from
`maybeEvidenceChallenge()` or the Heat tier events. Mirrored into
`sim/pipeline_sim.js`.

**Result: the fix measurably moves two combos but does not close the gap.**
400-run Justice win% before -> after:

| Scenario | Profile | Before | After |
|---|---|---|---|
| Easy | Strategist | 99.8% | 99.5% |
| Easy | Gentle Giant | 95.5% | 96.8% |
| Easy | Manipulator | 100.0% | 100.0% |
| Easy | Everyman | 98.5% | 99.3% |
| Normal | Strategist | 100.0% | 100.0% |
| Normal | Gentle Giant | 99.3% | 98.5% |
| Normal | Manipulator | 100.0% | 100.0% |
| Normal | Everyman | 100.0% | 99.8% |
| Hard | Strategist | 100.0% | 100.0% |
| Hard | Gentle Giant | 99.0% | 97.8% |
| Hard | Manipulator | 100.0% | 100.0% |
| Hard | Everyman | 100.0% | 99.8% |
| Very Hard | Strategist | 100.0% | 99.5% |
| Very Hard | Gentle Giant | 96.5% | 87.5% |
| Very Hard | Manipulator | 100.0% | 99.0% |
| Very Hard | Everyman | 99.3% | 93.8% |

Easy/Normal barely move, as intended (`evidenceMult` is 1.0 at Normal by
construction, and only mildly above 1 at Easy). But Hard doesn't move in any
combo — every profile stays at 97.8-100%. Very Hard moves meaningfully for
two profiles (Gentle Giant -9pp, Everyman -5.5pp) and barely for the other
two (Strategist/Manipulator, both still ≥99%). None of this reaches the
stated goal of pulling Hard/Very Hard out of the 95-100% band across the
board.

**Root cause, updated:** `escapePlanMult` works on Escape because Escape
failures compound — `ESCAPE_ESCALATION_PENALTY`, scaled by
`security.escalationPenaltyMult`, permanently stacks against every future
attempt, so a slower `escapePlan` growth rate interacts with an escalating
wall. `computeJusticeChance()` has no equivalent term for
`justiceAttemptsUsed` — retries cost a few days and a temporary Evidence dip,
nothing more — and the trial-deadline day budget (168-192 days at Hard/Very
Hard) is generous relative to the ~18-33 days these runs actually take. A
25-35% slower Evidence gain rate only delays hitting `computeJusticeChance()`'s
95% cap by a few days; it doesn't lower the win rate achieved within budget.
This confirms the fork the original finding already flagged: throttling raw
Evidence gain and giving Justice attempts their own repeat-escalation
mechanic (mirroring Escape's) are both needed, not either/or — this PR ships
only the first half.

**Checks 2 and 3 re-verified, neither regressed:**

- Loud-play Heat trap (`checkLoudJusticeChance()`, 100 runs/combo): range
  was ~63-95% pre-fix, now **~62-95%** post-fix (worst case still Very
  Hard/Gentle Giant, 64.3% -> 62.3%). Still comfortably clear of the ~50%
  floor — slower Evidence growth on Hard/Very Hard does not reopen the trap.
- Strategist Justice Tier 3 reachability (`checkTier3JusticeReachability()`,
  150 runs/combo): Strategist was already at 0% (FLAG) for Normal/Hard/Very
  Hard pre-fix; post-fix it's 0%/2%/3% respectively (Easy went from 1% to
  0%). All single-digit and within run-to-run noise at N=150 — no
  qualitative change either direction. Slower Evidence accumulation didn't
  meaningfully extend how long a Strategist-piloted bot lingers before
  winning.

Verify with:

```
node sim/pipeline_sim.js
```

## v2 follow-up: per-scenario Justice chance ceiling (still open — real root cause identified)

Direct attempt at the ceiling finding, per the fork the previous follow-up already
flagged: instead of continuing to throttle the *inputs* that feed
`computeJusticeChance()` (Evidence growth, already throttled by
`evidenceMult`), this caps the *output* itself. Added `scrutiny.justiceChanceCeiling`
per scenario (easy 95, normal 95, hard 72, veryhard 58 — unchanged at
Easy/Normal, well below the old flat 95 at Hard/Very Hard) and replaced the
hardcoded `95` in `computeJusticeChance()`'s clamp with it. Mirrored into
`sim/pipeline_sim.js`. `CYCLE_DAYS`/`APPEALS_ALLOWED` are untouched, per the
explicit brief for this fix.

**Result: the ceiling works correctly in isolation but does not close the
win-rate gap.** 400-run Justice win% before → after:

| Scenario | Profile | Before | After |
|---|---|---|---|
| Easy | Strategist | 99.5% | 99.3% |
| Easy | Gentle Giant | 96.8% | 95.5% |
| Easy | Manipulator | 100.0% | 100.0% |
| Easy | Everyman | 99.3% | 99.3% |
| Normal | Strategist | 100.0% | 100.0% |
| Normal | Gentle Giant | 98.5% | 99.0% |
| Normal | Manipulator | 100.0% | 100.0% |
| Normal | Everyman | 99.8% | 99.8% |
| Hard | Strategist | 100.0% | 100.0% |
| Hard | Gentle Giant | 97.8% | 98.0% |
| Hard | Manipulator | 100.0% | 99.5% |
| Hard | Everyman | 99.8% | 99.3% |
| Very Hard | Strategist | 99.5% | 99.5% |
| Very Hard | Gentle Giant | 87.5% | 87.3% |
| Very Hard | Manipulator | 99.0% | 97.5% |
| Very Hard | Everyman | 93.8% | 95.8% |

Easy/Normal are flat, as intended (`justiceChanceCeiling` is unchanged there).
But Hard and Very Hard are also flat, within simulation noise, despite a
ceiling dropped from 95 to 72/58 — the required verification target ("Hard
and Very Hard now land meaningfully below 95%") **is not met.**

**Root cause, precisely identified:** the ceiling bounds a single attempt's
chance correctly — confirmed directly via `checkLoudJusticeChance()`, where
end-of-game chance on Very Hard clamps at exactly `58.0` for every profile,
never above it. But the win-rate table's bot (and an equally impatient human
player) doesn't attempt near the ceiling at all. It fires as soon as chance
crosses `JUSTICE_BOT_ATTEMPT_THRESHOLD` (45), and a direct measurement of
chance *at the moment of first attempt* comes out to **~45-53% on every
single scenario, Easy through Very Hard** — the 72/58 ceiling never even
enters the picture for a first attempt, because the bot's own impatience
caps it first. `JUSTICE_MAX_ATTEMPTS` (3) plus cooldown-based attempt
regeneration then let a persistent bot re-roll: three independent tries at
~50% each compound to `1-0.5³ ≈ 87.5%`, matching the observed range almost
exactly. A distribution of `S.justiceAttemptsUsed` at win (prior *failed*
attempts, 300 runs/combo) confirms only **~44-53% of wins are first-attempt**
on Hard/Very Hard — the rest come from 1-5 retries. Unlike Escape's
`ESCAPE_ESCALATION_PENALTY`, a failed Justice attempt costs days and a
temporary Evidence dip but adds to `suspicion`, not `heat` — the only stat
`computeJusticeChance()` actually subtracts — so nothing suppresses the next
attempt's odds either.

This means the *ceiling* fix and the *evidence-throttle* fix before it have
both, independently, correctly done what they set out to do — and neither
closes the gap, because neither touches the actual dominant mechanism:
uncapped, unpenalized attempt regeneration. This was flagged as an option in
the original root-cause finding and set aside here on the stated premise
that "most Justice wins land on first attempt" — that premise does not hold
under measurement (only ~44-53% do on Hard/Very Hard); an escalation-style
mechanic mirroring Escape's, or a scenario-scaled reduction in
`JUSTICE_MAX_ATTEMPTS`/regeneration, is the real next step and was kept out
of scope for this PR per its own brief. Following this project's convention
(report deviations, don't silently patch), that gap is documented here
rather than smoothed over.

**Checks 2-4, run against the ceiling exactly as shipped:**

- **Loud-play Heat trap** (`checkLoudJusticeChance()`, 100 runs/combo): no
  collapse — range is **57.3-95.0%** end-of-game chance across all 16
  combos, comfortably above the 50% floor. A lower achievable ceiling
  stacking with Heat friction was flagged as a new interaction worth
  re-checking, not assuming — it does not reopen the trap; Very Hard chance
  simply saturates at the 58 ceiling regardless of play style (loud and
  paced both land at 58.0 for 3 of 4 profiles).
- **Strategist Justice Tier 3 reachability** (`checkTier3JusticeReachability()`,
  150 runs/combo): Strategist hit 0% (FLAG) for Normal and Hard this run,
  matching the pre-existing 0%/2%/3%-range noise already on record from the
  prior follow-up at this same N=150 — not a new regression. A lower ceiling
  means more failed attempts before winning (see the attempt distribution
  above), which if anything gives Media slightly more days to accumulate;
  it did not measurably change Tier 3 reachability in either direction.
- **Patient/cautious Justice viability under the real day budget** (new
  check, `checkQuietJusticeViability()`, 150 runs/combo): a bot that never
  touches a Heat-generating move and only attempts once its chance is
  within 10 points of the scenario's own ceiling, run under the real
  `trialDeadline`/appeals mechanics (not an artificial day cap). **14 of 16
  combos pass cleanly, most at 95-100% win rate.** Two flag low: Gentle
  Giant/Easy (17-27% across reruns, 73-83% running out of the day budget)
  and, less severely, Gentle Giant/Normal (67-73%, still clears the 20%
  floor). Both reproduce identically on Easy/Normal, where
  `justiceChanceCeiling` is unchanged at 95 — confirming this is **not**
  day-budget pressure introduced by this fix, but a pre-existing property
  of Gentle Giant's low Intellect stat (weak Evidence-to-chance conversion)
  combined with this check's own strict bar (near-ceiling confidence *and*
  zero Heat). The fix itself introduces no new day-budget pressure on any
  combo where the ceiling actually changed (Hard/Very Hard all clear
  93-100%).

**`confidenceLabel()` left unchanged, deliberately.** Its bands are
absolute (`airtight` ≥80, `solid` ≥62, …) and shared by both
`computeJusticeChance()` and `computeEscapeChance()`. With the new
ceiling, `airtight` is now unreachable for Justice on Hard (cap 72) and
both `solid` and `airtight` are unreachable on Very Hard (cap 58) — the
best a Very Hard case can ever read is `decent`. That reads as correct
rather than broken: a case against killing a senator shouldn't ever feel
airtight, and the four bands below `airtight` still give full granularity
within Very Hard's reachable range. Rebanding per-scenario would also mean
diverging the label scale from Escape's (unaffected by this fix, no
ceiling change), which would make the same label mean different things on
the two paths shown side by side on the same screen — a worse outcome than
a label the player learns tops out lower on the harder cases.

Verify with:

```
node sim/pipeline_sim.js
```

## v2 follow-up: Justice attempt escalation penalty (meaningful progress, not fully closed)

Direct attempt at the real root cause the previous follow-up precisely
identified: uncapped, unpenalized attempt regeneration. A failed Justice
attempt already cost days (`JUSTICE_FAIL_EXTRA_DAYS_BASE`) and a temporary
Evidence dip, but added to `suspicion`, not `heat` — the only stat
`computeJusticeChance()` actually subtracts — so nothing suppressed the
next attempt's odds. `JUSTICE_MAX_ATTEMPTS` (3) plus cooldown-based
regeneration then let ~3 independent tries at ~50% each compound back to
~87%+ regardless of any single-attempt ceiling.

Added `JUSTICE_ESCALATION_PENALTY = 15` and a `S.justiceAttemptsUsed *
JUSTICE_ESCALATION_PENALTY` term subtracted directly in
`computeJusticeChance()`, mirroring the `S.escapeAttemptsUsed *
ESCAPE_ESCALATION_PENALTY` term `computeEscapeChance()` already had.
Mirrored into `sim/pipeline_sim.js`. Also updated the parole-board denial
text in `tryPresentCase()`'s fail branch to say the board will be "less
receptive next time" — a repeat hearing is now genuinely harder, not just
slower, matching how Escape's fail text already signals this.
`CYCLE_DAYS`/`APPEALS_ALLOWED`/`justiceChanceCeiling` untouched, per this
fix's scope.

**Result: real movement, especially for Gentle Giant/Everyman, but
Strategist/Manipulator still land ≥90% on Hard/Very Hard.** 400-run Justice
win% before → after:

| Scenario | Profile | Before | After |
|---|---|---|---|
| Easy | Strategist | 99.8% | 95.0% |
| Easy | Gentle Giant | 96.5% | 83.5% |
| Easy | Manipulator | 98.8% | 97.0% |
| Easy | Everyman | 97.5% | 91.5% |
| Normal | Strategist | 100.0% | 98.0% |
| Normal | Gentle Giant | 99.0% | 84.3% |
| Normal | Manipulator | 100.0% | 95.3% |
| Normal | Everyman | 100.0% | 93.0% |
| Hard | Strategist | 100.0% | 96.5% |
| Hard | Gentle Giant | 97.5% | 79.5% |
| Hard | Manipulator | 99.0% | 94.3% |
| Hard | Everyman | 100.0% | 89.0% |
| Very Hard | Strategist | 98.8% | 95.0% |
| Very Hard | Gentle Giant | 86.5% | 64.0% |
| Very Hard | Manipulator | 97.3% | 90.5% |
| Very Hard | Everyman | 96.3% | 79.5% |

The Hard/Very Hard range widens substantially (was 86.5-100%, now
64.0-96.5%) and the bottom end drops well clear of the old band — Gentle
Giant falls 15-22pp on Hard/Very Hard, Everyman 7-11pp. But Strategist and
Manipulator only move 3-8pp on Hard/Very Hard and stay at 89.0-96.5%,
still inside the "inflated" band the task set out to fix. Honestly
reported per this project's convention rather than tuned further: a flat
15-point penalty is not, by itself, sufficient for the two
high-Intellect profiles.

**Why Strategist/Manipulator resist this more than Gentle Giant/Everyman:**
`computeJusticeChance()`'s Intellect factor makes their Evidence-to-chance
conversion fast enough that they typically clear the ceiling-adjacent
attempt threshold within 1-2 retries regardless of a flat -15/attempt
term — the penalty shaves points off an already-high number, it doesn't
change how many retries are available. Gentle Giant/Everyman convert
Evidence to chance more slowly, so the same flat penalty compounds against
more retries before they clear the bar, producing a much bigger effect.

**Second, clearly-labeled experiment: scenario-scaled `JUSTICE_MAX_ATTEMPTS`
(tried, reverted — no measurable benefit).** Per the task's own suggested
secondary lever, `JUSTICE_MAX_ATTEMPTS` was temporarily changed from a flat
`3` to `{ easy: 3, normal: 3, hard: 2, veryhard: 2 }`, mirroring how
`APPEALS_ALLOWED` already scales down on harder scenarios, and run
alongside the escalation penalty. Result: no detectable improvement.
Hard/Very Hard win% with both changes combined (e.g. Very Hard Strategist
93.8%, Very Hard Manipulator falls within the same 88-91% band already seen
run-to-run) sat inside the noise band already produced by the escalation
penalty alone across repeated 400-run samples (Very Hard Strategist alone
ranged 90.3-95.0% run-to-run with no other change). **Root cause of why it
doesn't help:** `JUSTICE_BOT_MAX_DAYS` (120) comfortably exceeds
`JUSTICE_COOLDOWN_DAYS` (25) several times over, so capping *burst*
attempts at 2 instead of 3 doesn't cap *lifetime* attempts available within
the bot's day budget — cooldown regeneration just lets it wait out the
gap and come back for more, pacing retries rather than actually limiting
them. This is a real, structural reason a scenario-scaled attempt cap
doesn't compound the same way `APPEALS_ALLOWED` does for the trial
deadline (which has no equivalent regeneration). Reverted rather than
shipped, since it adds a second lever and code path for no measured
benefit — following the same "report, don't silently ship what doesn't
help" convention as the primary result above.

**Attempt-distribution check** (the same measurement that originally
diagnosed this problem, now added to the harness as
`checkJusticeAttemptDistribution()`, 300 runs/combo) — first-attempt share
of wins, Hard/Very Hard, before → after:

| Scenario | Profile | Before firstAttempt% | After firstAttempt% |
|---|---|---|---|
| Hard | Strategist | 50% | 48% |
| Hard | Gentle Giant | 49% | 61% |
| Hard | Manipulator | 53% | 52% |
| Hard | Everyman | 49% | 58% |
| Very Hard | Strategist | 42% | 51% |
| Very Hard | Gentle Giant | 54% | 69% |
| Very Hard | Manipulator | 51% | 58% |
| Very Hard | Everyman | 54% | 59% |

Average first-attempt share across these 8 combos rises from ~50% to
~57% — a genuine, measurable reduction in how much of the win rate comes
from compounding retries, confirming the fix is doing what it targets even
where the headline win% didn't drop below 90%. The reduction concentrates
in Gentle Giant/Everyman (matching the win-rate table above); Strategist's
Hard first-attempt share is flat (50%→48%) — consistent with the
"resists more" explanation above, since a profile that reliably clears the
bar on attempt 1 or 2 regardless of the penalty won't show a first-attempt
shift even as its headline win% dips slightly. The distribution's upper
tail also thins post-fix (Very Hard Strategist's 5-attempt bucket, present
pre-fix, is gone; its 4-attempt bucket drops to a single win in 300 runs)
— fewer wins now depend on grinding out 4-5 retries.

**Checks 3-5, re-verified against the shipped escalation penalty:**

- **Loud-play Heat trap** (`checkLoudJusticeChance()`, 100 runs/combo):
  trivially unaffected, as expected — this bot never calls
  `tryPresentCase()`, so `S.justiceAttemptsUsed` stays 0 throughout and the
  new escalation term is always 0. Worst case (Very Hard/Gentle Giant)
  moves from 56.0-57.1% end-of-game chance across before/after runs,
  comfortably within existing run-to-run noise and clear of the 50% floor.
- **Strategist Justice Tier 3 reachability**
  (`checkTier3JusticeReachability()`, 150 runs/combo): before this fix,
  Strategist read 1%/0% (Easy), 1%/1% (Normal), 0%/0% FLAG (Hard), 4%/5%
  (Very Hard); after, 0%/1% (Easy), 0%/0% FLAG (Normal), 4%/3% (Hard),
  7%/5% (Very Hard). The flagged scenario shifts from Hard to Normal
  between runs — the same single-digit, run-to-run noise already on record
  from the prior follow-up at this N — not a regression. More failed
  attempts before a win (this fix's whole point) does mean marginally more
  days for Media to accumulate, but it did not measurably change Tier 3
  reachability outside the pre-existing near-zero band.
- **Patient/cautious Justice viability** (`checkQuietJusticeViability()`,
  150 runs/combo): Gentle Giant/Easy and Gentle Giant/Normal, the two
  combos flagged in the prior follow-up, move from 26%/73% (this run's
  clean pre-fix baseline) to 18%/74% — both sit inside the 17-27% /
  67-73% noise range already documented for these combos, confirming they
  are unchanged by this fix. Expected: the quiet-Justice bot only attempts
  once within `QUIET_JUSTICE_CHANCE_MARGIN` of the scenario's ceiling, so a
  near-ceiling-confidence quiet build essentially never fails-and-retries
  the way this fix targets.

Verify with:

```
node sim/pipeline_sim.js
```

## Known Gaps

| Item | Status |
|---|---|
| Flat single stat conflated three different relationships (family, legal, public) into one meaningless number | Done — replaced with the hidden Family/Lawyer/Media Credibility pipeline described above |
| No difficulty selection — every case was the same premise/stakes | Done — four-tier Difficulty Scenario system described above, selected before profile |
| Save system only knows `S.profile`, not `S.scenario` | Partial — `S.scenario` now round-trips through `localStorage` alongside `S.profile`; still no versioned migration |
| No day/attempt-cost mechanics — Justice was gated by a flat day floor, and neither ending's fail penalty scaled with confidence or repeat attempts | Done — `MIN_JUSTICE_DAY` removed, attempts spend their own day, and fail penalties scale via `underpreparedMult()` plus scaled fail day-costs, described above |
| No grading/ranking on the ending screen | Done — `computeGrade()` produces a letter grade, raw score, generated comment, and Elite badge, described above |
| Single Suspicion stat rose regardless of play style and went inert past a flat 3-event pool; move pool felt repetitive across playthroughs | Done (v2) — split into Suspicion (Escape)/Heat (Justice), each footprint-driven and decaying, plus a tier ladder and ~28 new moves across earned-through-play gates — see "Suspicion & Heat" and "Expanded move pool" above |
| v2: Justice win rate is now inflated (often 95-100%) across most profile x scenario combos, and Strategist rarely lingers long enough to reach Justice Tier 3 content | Still open, partially narrowed (three follow-ups so far) — `evidenceMult`, `justiceChanceCeiling`, and now `JUSTICE_ESCALATION_PENALTY` (see "v2 follow-up: Justice attempt escalation penalty" above) are all shipped. The escalation penalty measurably narrows the gap — Gentle Giant/Everyman drop 7-22pp on Hard/Very Hard, and first-attempt win share rises from ~50% to ~57% on average, confirming less of the win rate now comes from compounding retries — but Strategist/Manipulator still land at 89-97% on Hard/Very Hard, because their fast Evidence-to-chance conversion clears the bar within 1-2 retries regardless of a flat per-attempt penalty. A scenario-scaled `JUSTICE_MAX_ATTEMPTS` was tried as a second lever and reverted: it gave no measurable benefit, because `JUSTICE_BOT_MAX_DAYS` comfortably exceeds `JUSTICE_COOLDOWN_DAYS` several times over, so capping burst attempts doesn't cap lifetime attempts available within the day budget. Closing the remaining Strategist/Manipulator gap likely needs a per-profile or Intellect-scaled escalation term, not a flat one — kept out of scope here |
| v2: loud/naive Justice play (always taking the highest-apparent-Evidence move) could collapse to single-digit win chance by end of game — two systems (top Heat tier + `maybeEvidenceChallenge()`) independently drained Evidence at once, and `controlTheStory` still wrote to the wrong (Escape-track) stat | Done (v2 follow-up) — see "v2 follow-up: loud-play Heat trap" above |
