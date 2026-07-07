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

Difficulty is chosen *before* character selection, as a wrongful-conviction
premise — Robbery, Wife's Murder, Officer Down, or The Senator — not a
generic "Easy/Normal/Hard" slider. Each premise shifts difficulty
**asymmetrically** across the two endings rather than applying one global
multiplier: a tier can make Escape brutal while leaving Justice nearly
untouched, or the reverse, depending on what the story premise actually
implies about the case.

The choice is stored as `S.scenario`, mirroring how `S.profile` is stored,
and drives three hidden levers referenced from the same formulas the
Credibility pipeline and odds functions already use — nothing
scenario-specific is hardcoded inline in `render()` or `chooseAction()`:

- **Security** throttles the Escape path only: `suspicionMult` scales every
  positive suspicion gain, `planMult` scales every positive Escape Plan
  gain, `escalationMult` scales `ESCAPE_ESCALATION_PENALTY` (the odds lost
  per prior failed attempt). Hard and Very Hard also carry `guardHostility`,
  a distinct effect on the *guard* action specifically — not just a flat
  suspicion tax — that lowers the odds a favor lands at all, shrinks the
  effective `GUARD_CONNECTIONS_THRESHOLD` before the yard notices you're
  cozy with staff, and adds a chance the guard reports the approach outright.
  This is what makes Hard/Very Hard guards read as *personally hostile*
  rather than merely stricter.
- **Scrutiny** throttles the Lawyer and Media stages of the Credibility
  pipeline specifically — never Family, which is governed by the Family
  Support lever instead. It raises the effective threshold and lowers the
  effective floor inside `rampEfficiency()`, and discounts the milestone
  bonus that Lawyer/Media stages (not Family) add to `pipelineBonus`. Very
  Hard additionally caps `pipelineBonus` outright (`pipelineBonusCap`), so
  no amount of grinding Lawyer/Media buys back the ceiling — institutional
  and national-scale pressure that doesn't decay the way a single stat
  would.
- **Family Support** sets the starting `family` value and its growth
  multiplier from library/guard/letters actions, plus a hard ceiling
  (`family.cap`). Hard keeps normal starting capital but slows growth
  (visits are monitored/limited); Very Hard slows growth *and* caps the
  ceiling low — even a perfect family can't fully fix a national-scale case.

Very Hard also adds a rare event, `maybeMediaFlareup()`, gated on
`scenario.hasMediaFlareups`: an independent ~5%-per-day chance of a tabloid
cycle that spikes suspicion and dents `pipelineBonus`, regardless of the
day's action or current suspicion level. This is what makes Very Hard read
as *volatile* rather than just "Hard with bigger numbers" — the other three
levers alone would only ever compound smoothly.

### Target shape

Each tier was validated against all 4 character profiles via
`sim/pipeline_sim.js` (see below) before landing, rather than hand-tuned
against feel:

- **Easy** should meaningfully improve whichever path already suits a
  profile, while making the case's low visibility felt on the off-path too.
- **Normal** is the existing tuned baseline this whole system is relative
  to — all three levers are neutral (1.0x / no cap / no growth change).
- **Hard** should compress Justice odds for low-Intellect profiles (a
  Gentle Giant reading case law doesn't change an institution that's
  personally hostile) and compress Escape odds for low-Composure/
  high-suspicion play (a Manipulator who rattles easily runs face-first
  into hostile guards).
- **Very Hard** should be winnable on a profile's suited path, but clearly
  the hardest tier on both paths for every profile — nobody sails through
  a national media case.

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

It runs 400 simulated playthroughs per character profile **per scenario**
(16 combinations total), for two bot strategies (justice-greedy,
escape-greedy), and reports each profile's win rate for its respective
ending in each scenario. Current output:

| Scenario | Profile | Justice win% | Escape win% |
|---|---|---|---|
| Easy | Strategist | ~91% | ~65% |
| Easy | Gentle Giant | ~51% | ~99% |
| Easy | Manipulator | ~81% | ~55% |
| Easy | Everyman | ~90% | ~96% |
| Normal | Strategist | ~82% | ~16% |
| Normal | Gentle Giant | ~23% | ~68% |
| Normal | Manipulator | ~75% | ~15% |
| Normal | Everyman | ~60% | ~58% |
| Hard | Strategist | ~54% | ~0% |
| Hard | Gentle Giant | ~2% | ~22% |
| Hard | Manipulator | ~21% | ~0% |
| Hard | Everyman | ~22% | ~7% |
| Very Hard | Strategist | ~25% | ~0% |
| Very Hard | Gentle Giant | ~2% | ~9% |
| Very Hard | Manipulator | ~16% | ~0% |
| Very Hard | Everyman | ~12% | ~1% |

Normal is the tuned baseline the rest of the table is relative to, and
matches the pre-scenario numbers this table used to report on its own. A
0% for a profile's off-path at Hard/Very Hard reflects the greedy bot never
reaching its attempt-odds threshold within its day budget, not a formula
that's literally zero — `computeEscapeChance()`/`computeJusticeChance()`
both floor at 1%, same as before scenarios existed. It's meant to read as
"a mismatched profile shouldn't bank on this path," not "impossible."

## Known Gaps

| Item | Status |
|---|---|
| Flat single stat conflated three different relationships (family, legal, public) into one meaningless number | Done — replaced with the hidden Family/Lawyer/Media Credibility pipeline described above |
| Difficulty was a single fixed balance with no player-facing choice | Done — replaced with the 4-tier Difficulty Scenario system (Easy/Normal/Hard/Very Hard) described above, selected before character selection |
| Save system only ever stored one profile/run at a time, with no concept of scenario | Partial — `S.scenario` now saves/loads alongside `S.profile` via the existing localStorage key; no versioning or migration for saves created before this change, and no multi-slot save support |
| No grading/ranking of a completed run relative to its scenario+profile difficulty | Not started — explicitly out of scope for the scenario system pass, tracked as follow-up work |
