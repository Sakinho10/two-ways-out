// Node simulation harness for the Family/Lawyer/Media Credibility pipeline
// AND the Difficulty Scenario system layered on top of it. Ports the
// balance-relevant functions from index.html (stat factors, the pipeline,
// actions, odds formulas, milestone checks, scenario modifiers) so a
// rework of either system can be validated (win rates per profile x
// scenario) before it ships in the real game. Run with:
//   node sim/pipeline_sim.js

function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function clamp(v){ return Math.max(0, Math.min(100, v)); }

function statFactor(v){ return 0.6 + (v/100)*0.8; }
function composureFactor(v){ return 1.4 - (v/100)*0.8; }

const PROFILES = [
  { id:'strategist', name:'The Strategist', stats:{ intellect:85, physique:25, charisma:50, composure:55 } },
  { id:'giant', name:'The Gentle Giant', stats:{ intellect:30, physique:90, charisma:70, composure:65 } },
  { id:'manipulator', name:'The Manipulator', stats:{ intellect:80, physique:50, charisma:65, composure:30 } },
  { id:'everyman', name:'The Everyman', stats:{ intellect:55, physique:55, charisma:55, composure:70 } }
];

function rampEfficiency(source, threshold, floor){
  return floor + (1 - floor) * Math.min(1, source / threshold);
}

// Mirrors the SCENARIOS array in index.html — see that file for the
// narrative teaser text and full rationale per knob. Normal is the
// existing tuned baseline; every value is neutral/1.0 for that tier.
const SCENARIOS = [
  {
    id:'easy', name:'Easy (Robbery)',
    security:{ suspicionMult:0.6, escapePlanMult:1.15, escalationPenaltyMult:0.6, guardHostileChance:0, guardThresholdDelta:2 },
    scrutiny:{ familyThreshold:20, lawyerFloor:0.35, lawyerThreshold:30, mediaFloor:0.3, pipelineBonusMult:1.2, pipelineBonusCap:Infinity, tabloidEvent:false },
    family:{ start:20, growthMult:1.15, cap:100 }
  },
  {
    id:'normal', name:"Normal (Wife's Murder)",
    security:{ suspicionMult:1, escapePlanMult:1, escalationPenaltyMult:1, guardHostileChance:0, guardThresholdDelta:0 },
    scrutiny:{ familyThreshold:30, lawyerFloor:0.2, lawyerThreshold:40, mediaFloor:0.15, pipelineBonusMult:1, pipelineBonusCap:Infinity, tabloidEvent:false },
    family:{ start:15, growthMult:1, cap:100 }
  },
  {
    id:'hard', name:'Hard (Cop Killer)',
    security:{ suspicionMult:1.3, escapePlanMult:0.85, escalationPenaltyMult:1.4, guardHostileChance:0.25, guardThresholdDelta:-2 },
    scrutiny:{ familyThreshold:40, lawyerFloor:0.12, lawyerThreshold:55, mediaFloor:0.08, pipelineBonusMult:0.75, pipelineBonusCap:Infinity, tabloidEvent:false },
    family:{ start:15, growthMult:0.75, cap:100 }
  },
  {
    id:'veryhard', name:'Very Hard (Senator)',
    security:{ suspicionMult:1.22, escapePlanMult:0.82, escalationPenaltyMult:1.3, guardHostileChance:0.35, guardThresholdDelta:-3 },
    scrutiny:{ familyThreshold:45, lawyerFloor:0.12, lawyerThreshold:65, mediaFloor:0.07, pipelineBonusMult:0.6, pipelineBonusCap:7, tabloidEvent:true },
    family:{ start:15, growthMult:0.85, cap:60 }
  }
];

const MILESTONES = [
  { stage:'family', at:25, bonus:0.5 },
  { stage:'family', at:60, bonus:1 },
  { stage:'family', at:90, bonus:1.5 },
  { stage:'lawyer',  at:25, bonus:0.75 },
  { stage:'lawyer',  at:60, bonus:1.5 },
  { stage:'lawyer',  at:90, bonus:2.25 },
  { stage:'media',   at:25, bonus:0.5 },
  { stage:'media',   at:60, bonus:1 },
  { stage:'media',   at:90, bonus:1.5 }
];

function checkMilestones(S){
  const scrutiny = S.scenario && S.scenario.scrutiny;
  const bonusMult = scrutiny ? scrutiny.pipelineBonusMult : 1;
  const bonusCap = scrutiny && scrutiny.pipelineBonusCap != null ? scrutiny.pipelineBonusCap : Infinity;
  for(const m of MILESTONES){
    const key = m.stage + m.at;
    if(!S.pipelineMilestones[key] && S[m.stage] >= m.at){
      S.pipelineMilestones[key] = true;
      S.pipelineBonus = Math.min(bonusCap, S.pipelineBonus + m.bonus*bonusMult);
    }
  }
}

function applyDelta(S, d){
  if(d.family){
    let f = d.family;
    if(f > 0 && S.scenario) f = Math.round(f * S.scenario.family.growthMult);
    const cap = S.scenario ? S.scenario.family.cap : 100;
    S.family = Math.max(0, Math.min(cap, S.family + f));
  }
  if(d.lawyer) S.lawyer = clamp(S.lawyer + d.lawyer);
  if(d.media) S.media = clamp(S.media + d.media);
  if(d.connections) S.connections = clamp(S.connections + d.connections);
  if(d.evidence) S.evidence = clamp(S.evidence + d.evidence);
  if(d.escapePlan){
    let p = d.escapePlan;
    if(p > 0 && S.scenario) p = Math.round(p * S.scenario.security.escapePlanMult);
    S.escapePlan = clamp(S.escapePlan + p);
  }
  if(d.suspicion){
    let s = d.suspicion;
    if(s > 0){
      if(S.profile) s *= composureFactor(S.profile.stats.composure);
      if(S.scenario) s *= S.scenario.security.suspicionMult;
      s = Math.round(s);
    }
    S.suspicion = clamp(S.suspicion + s);
  }
  checkMilestones(S);
}

const LIBRARY_SUSPICION_THRESHOLD = 5;
const GUARD_CONNECTIONS_THRESHOLD = 5;

const ACTIONS = {
  library(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const e = Math.round(rand(4,8)*mult*intFactor), fam = Math.round(rand(2,5)*mult*intFactor);
    const lawyerEff = rampEfficiency(S.family, S.scenario.scrutiny.familyThreshold, S.scenario.scrutiny.lawyerFloor);
    const law = Math.round(rand(1,3)*mult*intFactor*lawyerEff);
    applyDelta(S, {evidence:e, family:fam, lawyer:law});
    const overuse = S.actionCounts.library - LIBRARY_SUSPICION_THRESHOLD;
    if(overuse > 0) applyDelta(S, {suspicion: overuse*3});
  },
  guard(S, mult){
    const sec = S.scenario.security;
    const chaFactor = statFactor(S.profile.stats.charisma);
    if(sec.guardHostileChance > 0 && Math.random() < sec.guardHostileChance){
      applyDelta(S, {suspicion: rand(5,10)});
      return;
    }
    const fam = Math.round(rand(5,9)*mult*chaFactor);
    applyDelta(S, {family:fam});
    if(Math.random() < 0.4){
      const e = Math.round(rand(3,7)*mult*chaFactor);
      applyDelta(S, {evidence:e});
    }
    if(Math.random() < 0.15){
      const mediaEff = rampEfficiency(S.lawyer, S.scenario.scrutiny.lawyerThreshold, S.scenario.scrutiny.mediaFloor);
      const med = Math.round(rand(1,3)*mult*chaFactor*mediaEff);
      if(med > 0) applyDelta(S, {media:med});
    }
    const threshold = GUARD_CONNECTIONS_THRESHOLD + sec.guardThresholdDelta;
    const overuse = S.actionCounts.guard - threshold;
    if(overuse > 0) applyDelta(S, {connections: -(overuse*2)});
  },
  letters(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const failChance = 0.35 - (S.profile.stats.intellect/100)*0.15;
    const normalFam = Math.round(rand(3,6)*mult*intFactor);
    if(Math.random() < failChance){
      const fam = Math.max(1, Math.round(normalFam*0.4));
      applyDelta(S, {family:fam});
      return;
    }
    const e = Math.round(rand(6,11)*mult*intFactor);
    const lawyerEff = rampEfficiency(S.family, S.scenario.scrutiny.familyThreshold, S.scenario.scrutiny.lawyerFloor);
    const law = Math.round(rand(1,3)*mult*intFactor*lawyerEff);
    applyDelta(S, {evidence:e, family:normalFam, lawyer:law});
  },
  crew(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    const c = Math.round(rand(5,9)*mult*chaFactor), p = Math.round(rand(3,6)*mult*chaFactor), s = rand(4,8);
    applyDelta(S, {connections:c, escapePlan:p, suspicion:s});
  },
  scout(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const p = Math.round(rand(5,9)*mult*intFactor), s = rand(1,4);
    applyDelta(S, {escapePlan:p, suspicion:s});
  },
  bribe(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    if(S.connections < 12){
      applyDelta(S, {suspicion:6});
      return;
    }
    const p = Math.round(rand(10,16)*mult*phyFactor), s = rand(8,14);
    applyDelta(S, {connections:-12, escapePlan:p, suspicion:s});
  },
  rest(S){
    const s = rand(4,9);
    applyDelta(S, {suspicion:-s});
  }
};

const JUSTICE_MAX_ATTEMPTS = 3;
const JUSTICE_COOLDOWN_DAYS = 25;
const ESCAPE_ESCALATION_PENALTY = 8;

// Mirrors underpreparedMult()/JUSTICE_FAIL_EXTRA_DAYS_BASE in index.html —
// see that file for the rationale.
function underpreparedMult(chance){
  return Math.max(1, Math.min(2.5, 1 + (40 - chance) / 40 * 1.5));
}
const JUSTICE_FAIL_EXTRA_DAYS_BASE = 12;

function computeJusticeChance(S){
  const intFactor = (S.profile.stats.intellect - 50) * 0.006;
  const raw = 3 + S.evidence * (0.85 + intFactor) + S.pipelineBonus - S.suspicion * 0.3;
  return Math.max(1, Math.min(95, raw));
}
function computeEscapeChance(S){
  const physFactor = (S.profile.stats.physique - 50) * 0.006;
  const escalationMult = S.scenario ? S.scenario.security.escalationPenaltyMult : 1;
  const escalation = S.escapeAttemptsUsed * ESCAPE_ESCALATION_PENALTY * escalationMult;
  const raw = 3 + S.escapePlan * (0.85 + physFactor) - S.suspicion * 0.35 - escalation;
  return Math.max(1, Math.min(95, raw));
}

function maybeRegenJusticeAttempt(S){
  if(S.justiceAttemptsLeft < JUSTICE_MAX_ATTEMPTS && S.justiceCooldownUntil > 0 && S.day >= S.justiceCooldownUntil){
    S.justiceAttemptsLeft += 1;
    S.justiceCooldownUntil = S.justiceAttemptsLeft < JUSTICE_MAX_ATTEMPTS ? S.day + JUSTICE_COOLDOWN_DAYS : 0;
  }
}

function maybeEvent(S){
  if(S.scenario && S.scenario.scrutiny.tabloidEvent && rand(1,100) <= 4){
    applyDelta(S, {suspicion: rand(10,18)});
    S.pipelineBonus = Math.max(0, S.pipelineBonus - rand(1,2));
    return;
  }
  const roll = rand(1,100);
  const threshold = S.suspicion;
  if(roll <= threshold * 0.6){
    const events = [
      ()=> applyDelta(S, {suspicion:10, evidence:-3, escapePlan:-3}),
      ()=> applyDelta(S, {suspicion:8, lawyer:-4}),
      ()=> { S.day += rand(3,7); applyDelta(S, {suspicion:15}); }
    ];
    pick(events)();
    return;
  }
  if(roll >= 96){
    const good = [
      ()=> applyDelta(S, {lawyer:6}),
      ()=> applyDelta(S, {escapePlan:6}),
    ];
    pick(good)();
  }
}

function maybeEvidenceChallenge(S){
  if(S.evidence < 30) return;
  const chance = 6 + (S.evidence/100)*14;
  if(rand(1,100) <= chance){
    const loss = rand(6,14);
    applyDelta(S, {evidence:-loss});
  }
}

const CONNECTIONS_GRAPEVINE_THRESHOLD = 15;
const GRAPEVINE_CHANCE = 15;

function maybeGrapevineTip(S){
  if(S.connections < CONNECTIONS_GRAPEVINE_THRESHOLD) return;
  if(rand(1,100) <= GRAPEVINE_CHANCE){
    const e = rand(4,9);
    applyDelta(S, {evidence:e});
  }
}

function newState(profile, scenario){
  return {
    day: 1,
    family: scenario.family.start, lawyer: 0, media: 0,
    pipelineMilestones: {}, pipelineBonus: 0,
    connections: 15, evidence: 5, escapePlan: 5, suspicion: 10,
    over: false, ending: null,
    lastActionId: null, actionStreak: 0,
    profile, scenario,
    actionCounts: { library:0, guard:0, letters:0, crew:0, scout:0, bribe:0, rest:0 },
    justiceAttemptsLeft: JUSTICE_MAX_ATTEMPTS,
    justiceCooldownUntil: 0,
    justiceAttemptsUsed: 0,
    escapeAttemptsUsed: 0
  };
}

function runAction(S, id){
  S.day += 1;
  maybeRegenJusticeAttempt(S);
  applyDelta(S, {suspicion:2}); // ambient drift, same as chooseAction() in index.html
  if(id === S.lastActionId){ S.actionStreak += 1; } else { S.actionStreak = 1; }
  S.lastActionId = id;
  const mult = Math.max(0.5, 1 - 0.12*(S.actionStreak-1));
  S.actionCounts[id] = (S.actionCounts[id] || 0) + 1;
  ACTIONS[id](S, mult);
  maybeGrapevineTip(S);
  maybeEvidenceChallenge(S);
  maybeEvent(S);
}

function tryPresentCase(S){
  if(S.justiceAttemptsLeft <= 0) return;
  const chance = computeJusticeChance(S);
  S.day += 1;
  S.justiceAttemptsLeft -= 1;
  if(S.justiceAttemptsLeft === 0) S.justiceCooldownUntil = S.day + JUSTICE_COOLDOWN_DAYS;
  const roll = rand(1,100);
  if(roll <= chance){
    S.over = true; S.ending = 'justice-win';
  } else {
    const mult = underpreparedMult(chance);
    const priorFails = S.justiceAttemptsUsed;
    S.justiceAttemptsUsed += 1;
    const credibilityFactor = rampEfficiency(S.lawyer, S.scenario.scrutiny.lawyerThreshold, 0.55);
    const attemptDiscount = Math.max(0.6, 1 - 0.15*priorFails);
    const extraDays = Math.round(JUSTICE_FAIL_EXTRA_DAYS_BASE * credibilityFactor * attemptDiscount);
    S.day += extraDays;
    applyDelta(S, {suspicion:Math.round(10*mult), evidence:Math.round(-10*mult)});
  }
}

function tryAttemptEscape(S){
  const chance = computeEscapeChance(S);
  S.day += 1;
  const roll = rand(1,100);
  if(roll <= chance){
    S.over = true; S.ending = 'escape-win';
  } else {
    const mult = underpreparedMult(chance);
    const priorFails = S.escapeAttemptsUsed;
    S.escapeAttemptsUsed += 1;
    const baseDays = rand(10,25);
    const escalationDays = priorFails * 5;
    const totalDays = Math.min(60, baseDays + escalationDays);
    S.day += totalDays;
    applyDelta(S, {suspicion:Math.round(100*mult), escapePlan:Math.round(-40*mult), connections:Math.round(-20*mult)});
  }
}

// ---------- Bots ----------
// justice-greedy: rotates the three Justice-side actions (so diminishing
// returns for repeats don't tank output), cools off when suspicion runs
// dangerously high, and presents the case once the odds clear a threshold.
// escape-greedy: mirrors that pattern on the Escape-side actions, skipping
// bribe when Connections is too low to trigger it (matches how a rational
// player would actually spend the turn).
//
// The thresholds/day-caps below were grid-searched against the target win
// rates in the task spec (see PR description) rather than picked by feel —
// each strategy gets its own day budget because a bot that gives up on
// Justice after ~120 days but keeps grinding Escape for ~900 is what
// actually reproduces both columns of the target table simultaneously; a
// single shared cap could not fit both. These bot budgets/thresholds are
// shared across all four scenarios — only the underlying formulas differ
// per scenario, exactly as they would for a real player.
const JUSTICE_CYCLE = ['library','guard','letters'];
const ESCAPE_CYCLE = ['crew','scout','bribe'];

const JUSTICE_BOT_MAX_DAYS = 120;
const JUSTICE_BOT_ATTEMPT_THRESHOLD = 45;
const JUSTICE_BOT_REST_SUSPICION = 55;

const ESCAPE_BOT_MAX_DAYS = 900;
const ESCAPE_BOT_ATTEMPT_THRESHOLD = 36;
const ESCAPE_BOT_REST_SUSPICION = 65;

function justiceGreedyStep(S, cyclePos){
  maybeRegenJusticeAttempt(S);
  if(S.justiceAttemptsLeft > 0 && computeJusticeChance(S) >= JUSTICE_BOT_ATTEMPT_THRESHOLD){
    tryPresentCase(S);
    return cyclePos;
  }
  if(S.suspicion >= JUSTICE_BOT_REST_SUSPICION){
    runAction(S, 'rest');
    return cyclePos;
  }
  const id = JUSTICE_CYCLE[cyclePos % JUSTICE_CYCLE.length];
  runAction(S, id);
  return cyclePos + 1;
}

function escapeGreedyStep(S, cyclePos){
  if(computeEscapeChance(S) >= ESCAPE_BOT_ATTEMPT_THRESHOLD){
    tryAttemptEscape(S);
    return cyclePos;
  }
  if(S.suspicion >= ESCAPE_BOT_REST_SUSPICION){
    runAction(S, 'rest');
    return cyclePos;
  }
  let id = ESCAPE_CYCLE[cyclePos % ESCAPE_CYCLE.length];
  if(id === 'bribe' && S.connections < 12) id = 'crew';
  runAction(S, id);
  return cyclePos + 1;
}

function simulateOneState(profileId, scenarioId, strategy){
  const profile = PROFILES.find(p=>p.id===profileId);
  const scenario = SCENARIOS.find(s=>s.id===scenarioId);
  const S = newState(profile, scenario);
  let cyclePos = 0;
  const maxDays = strategy === 'justice' ? JUSTICE_BOT_MAX_DAYS : ESCAPE_BOT_MAX_DAYS;
  while(!S.over && S.day < maxDays){
    cyclePos = strategy === 'justice' ? justiceGreedyStep(S, cyclePos) : escapeGreedyStep(S, cyclePos);
  }
  return S;
}

function simulateOne(profileId, scenarioId, strategy){
  return simulateOneState(profileId, scenarioId, strategy).ending || 'timeout';
}

// ---------- Grading ----------
// Mirrors the grading system in index.html (PAR_DAYS, DIFFICULTY_MULTIPLIER,
// DIFFICULTY_CEILING, PROFILE_PATH_LEAN, scoreToLetter, computeGrade, etc.)
// so the letter-grade distribution can be validated the same way the odds
// formulas above are.
const PAR_DAYS = { easy:20, normal:25, hard:28, veryhard:32 };
const DIFFICULTY_MULTIPLIER = { easy:0.85, normal:1.0, hard:1.15, veryhard:1.3 };
const DIFFICULTY_CEILING = { easy:'B-', normal:'B+', hard:'A-', veryhard:null };
const PROFILE_PATH_LEAN = {
  strategist: { strong:'justice', weak:'escape' },
  giant:      { strong:'escape',  weak:'justice' },
  manipulator:{ strong:'justice', weak:'escape' },
  everyman: null
};
const GRADE_ORDER = ['F','D','C-','C','C+','B-','B','B+','A-','A','A+'];

function scoreToLetter(rawScore){
  if(rawScore >= 140) return 'A+';
  if(rawScore >= 120) return 'A';
  if(rawScore >= 105) return 'A-';
  if(rawScore >= 90)  return 'B+';
  if(rawScore >= 75)  return 'B';
  if(rawScore >= 60)  return 'B-';
  if(rawScore >= 45)  return 'C+';
  if(rawScore >= 30)  return 'C';
  if(rawScore >= 15)  return 'C-';
  if(rawScore >= 0)   return 'D';
  return 'F';
}

function clampGradeToCeiling(letter, ceiling){
  if(!ceiling) return letter;
  return GRADE_ORDER.indexOf(letter) > GRADE_ORDER.indexOf(ceiling) ? ceiling : letter;
}

function computePathFit(profileId, winningPath){
  const lean = PROFILE_PATH_LEAN[profileId];
  if(!lean) return 0;
  if(winningPath === lean.strong) return -15;
  if(winningPath === lean.weak) return 15;
  return 0;
}

function computeElite(profileId, scenarioId, winningPath, justiceAttemptsUsed, escapeAttemptsUsed){
  if(scenarioId !== 'veryhard') return false;
  const lean = PROFILE_PATH_LEAN[profileId];
  if(!lean) return false;
  if(winningPath !== lean.weak) return false;
  return justiceAttemptsUsed === 0 && escapeAttemptsUsed === 0;
}

function computeGrade(S, winningPath){
  const scenarioId = S.scenario.id, profileId = S.profile.id;
  const par = PAR_DAYS[scenarioId];
  const efficiency = Math.min(100, Math.round(100 * par / S.day));
  const pathFit = computePathFit(profileId, winningPath);
  const justiceBonus = winningPath === 'justice' ? 10 : 0;
  const attemptPenalty = 6 * (S.justiceAttemptsUsed + S.escapeAttemptsUsed);
  const difficultyMultiplier = DIFFICULTY_MULTIPLIER[scenarioId];
  const rawScore = (efficiency + pathFit + justiceBonus - attemptPenalty) * difficultyMultiplier;
  const letter = clampGradeToCeiling(scoreToLetter(rawScore), DIFFICULTY_CEILING[scenarioId]);
  const elite = computeElite(profileId, scenarioId, winningPath, S.justiceAttemptsUsed, S.escapeAttemptsUsed);
  return { letter, rawScore, efficiency, pathFit, justiceBonus, attemptPenalty, elite };
}

function runBatch(profileId, scenarioId, strategy, n){
  const wins = { 'justice-win':0, 'escape-win':0, 'timeout':0 };
  for(let i=0;i<n;i++){
    const ending = simulateOne(profileId, scenarioId, strategy);
    wins[ending] += 1;
  }
  return wins;
}

function main(){
  const N = 400;
  console.log(`Simulating ${N} playthroughs per profile x scenario x strategy (justice-greedy, escape-greedy)...\n`);
  console.log('Scenario'.padEnd(14) + 'Profile'.padEnd(16) + 'Justice win%'.padStart(14) + 'Escape win%'.padStart(14));
  for(const scenario of SCENARIOS){
    for(const profile of PROFILES){
      const justiceRuns = runBatch(profile.id, scenario.id, 'justice', N);
      const escapeRuns = runBatch(profile.id, scenario.id, 'escape', N);
      const justiceWinPct = (justiceRuns['justice-win'] / N * 100).toFixed(1);
      const escapeWinPct = (escapeRuns['escape-win'] / N * 100).toFixed(1);
      console.log(scenario.id.padEnd(14) + profile.name.padEnd(16) + (justiceWinPct + '%').padStart(14) + (escapeWinPct + '%').padStart(14));
    }
    console.log('');
  }
}

// Grade-distribution validation: for each of the 16 profile x scenario
// combos, forces a win down each path (justice-greedy bot / escape-greedy
// bot) N times, discards timeouts, and tabulates the resulting letter grade
// for every successful run — same pattern as the win-rate table above, but
// for the grading system layered on top of it.
function runGradeDistribution(){
  const N = 300;
  console.log(`Grade distribution — up to ${N} playthroughs per profile x scenario x path (timeouts discarded)...\n`);
  const overallCounts = {};
  for(const letter of GRADE_ORDER) overallCounts[letter] = 0;
  let overallEliteCount = 0, overallN = 0;

  console.log('Scenario'.padEnd(12) + 'Profile'.padEnd(16) + 'Path'.padEnd(10) + 'N'.padStart(5) + 'AvgScore'.padStart(10) + '  Grade distribution (worst→best)');
  for(const scenario of SCENARIOS){
    for(const profile of PROFILES){
      for(const path of ['justice','escape']){
        const winningEnding = path === 'justice' ? 'justice-win' : 'escape-win';
        const counts = {};
        for(const letter of GRADE_ORDER) counts[letter] = 0;
        let sumScore = 0, wins = 0, eliteCount = 0;
        for(let i=0;i<N;i++){
          const S = simulateOneState(profile.id, scenario.id, path);
          if(S.ending !== winningEnding) continue; // discard timeouts
          const grade = computeGrade(S, path);
          counts[grade.letter] += 1;
          overallCounts[grade.letter] += 1;
          sumScore += grade.rawScore;
          wins += 1;
          overallN += 1;
          if(grade.elite){ eliteCount += 1; overallEliteCount += 1; }
        }
        const avgScore = wins > 0 ? (sumScore/wins).toFixed(1) : 'n/a';
        const distStr = GRADE_ORDER.slice().reverse().map(l => counts[l] > 0 ? `${l}:${counts[l]}` : null).filter(Boolean).join(' ');
        console.log(scenario.id.padEnd(12) + profile.name.padEnd(16) + path.padEnd(10) + String(wins).padStart(5) + String(avgScore).padStart(10) + '  ' + distStr + (eliteCount > 0 ? `  [Elite x${eliteCount}]` : ''));
      }
    }
    console.log('');
  }
  console.log('Overall grade distribution across all combos:');
  for(const letter of GRADE_ORDER.slice().reverse()){
    if(overallCounts[letter] > 0) console.log(`  ${letter}: ${overallCounts[letter]}`);
  }
  console.log(`  Elite badges: ${overallEliteCount} / ${overallN}`);
}

if(require.main === module){ main(); runGradeDistribution(); }

module.exports = {
  PROFILES, SCENARIOS, rampEfficiency, applyDelta, computeJusticeChance, computeEscapeChance,
  newState, runAction, tryPresentCase, tryAttemptEscape, simulateOne, simulateOneState, runBatch,
  computeGrade, scoreToLetter, clampGradeToCeiling, computePathFit, computeElite,
  PAR_DAYS, DIFFICULTY_MULTIPLIER, DIFFICULTY_CEILING, PROFILE_PATH_LEAN, GRADE_ORDER,
  runGradeDistribution
};
