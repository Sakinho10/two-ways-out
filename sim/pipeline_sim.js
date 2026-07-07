// Node/vm balance simulation for the Family/Lawyer/Media Credibility pipeline.
// Ports the relevant formulas/actions out of index.html so balance changes can
// be validated against target win rates before they're trusted in the real game.
// Run with: node sim/pipeline_sim.js

function clamp(v){ return Math.max(0, Math.min(100, v)); }
function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function statFactor(v){ return 0.6 + (v/100)*0.8; }
function composureFactor(v){ return 1.4 - (v/100)*0.8; }

function rampEfficiency(source, threshold, floor){
  return floor + (1 - floor) * Math.min(1, source / threshold);
}
const FAMILY_THRESHOLD = 30, LAWYER_FLOOR = 0.2;
const LAWYER_THRESHOLD = 40, MEDIA_FLOOR = 0.15;

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
  for(const m of MILESTONES){
    const key = m.stage + m.at;
    if(!S.pipelineMilestones[key] && S[m.stage] >= m.at){
      S.pipelineMilestones[key] = true;
      S.pipelineBonus += m.bonus;
    }
  }
}

const PROFILES = [
  { id:'strategist', name:'The Strategist', stats:{ intellect:85, physique:25, charisma:50, composure:55 } },
  { id:'giant', name:'The Gentle Giant', stats:{ intellect:30, physique:90, charisma:70, composure:65 } },
  { id:'manipulator', name:'The Manipulator', stats:{ intellect:80, physique:50, charisma:65, composure:30 } },
  { id:'everyman', name:'The Everyman', stats:{ intellect:55, physique:55, charisma:55, composure:70 } }
];

function applyDelta(S, d){
  if(d.family) S.family = clamp(S.family + d.family);
  if(d.lawyer) S.lawyer = clamp(S.lawyer + d.lawyer);
  if(d.media) S.media = clamp(S.media + d.media);
  if(d.connections) S.connections = clamp(S.connections + d.connections);
  if(d.evidence) S.evidence = clamp(S.evidence + d.evidence);
  if(d.escapePlan) S.escapePlan = clamp(S.escapePlan + d.escapePlan);
  if(d.suspicion){
    let s = d.suspicion;
    if(s > 0 && S.profile){ s = Math.round(s * composureFactor(S.profile.stats.composure)); }
    S.suspicion = clamp(S.suspicion + s);
  }
  checkMilestones(S);
}

const LIBRARY_SUSPICION_THRESHOLD = 5;
const GUARD_CONNECTIONS_THRESHOLD = 5;

const ACTIONS = {
  library(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const e = Math.round(rand(4,8)*mult*intFactor);
    const fam = Math.round(rand(2,5)*mult*intFactor);
    const lawyerEff = rampEfficiency(S.family, FAMILY_THRESHOLD, LAWYER_FLOOR);
    const law = Math.round(rand(1,3)*mult*intFactor*lawyerEff);
    applyDelta(S, {evidence:e, family:fam, lawyer:law});
    const overuse = S.actionCounts.library - LIBRARY_SUSPICION_THRESHOLD;
    if(overuse > 0) applyDelta(S, {suspicion: overuse * 3});
  },
  guard(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    const fam = Math.round(rand(5,9)*mult*chaFactor);
    applyDelta(S, {family:fam});
    if(Math.random()<0.4){
      const e = Math.round(rand(3,7)*mult*chaFactor);
      applyDelta(S, {evidence:e});
    }
    if(Math.random()<0.15){
      const mediaEff = rampEfficiency(S.lawyer, LAWYER_THRESHOLD, MEDIA_FLOOR);
      const med = Math.round(rand(1,3)*mult*chaFactor*mediaEff);
      applyDelta(S, {media:med});
    }
    const overuse = S.actionCounts.guard - GUARD_CONNECTIONS_THRESHOLD;
    if(overuse > 0) applyDelta(S, {connections: -(overuse * 2)});
  },
  letters(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const failChance = 0.35 - (S.profile.stats.intellect/100)*0.15;
    const famBase = Math.round(rand(3,6)*mult*intFactor);
    if(Math.random() < failChance){
      const fam = Math.max(1, Math.round(famBase * 0.4));
      applyDelta(S, {family:fam});
      return;
    }
    const e = Math.round(rand(6,11)*mult*intFactor);
    const lawyerEff = rampEfficiency(S.family, FAMILY_THRESHOLD, LAWYER_FLOOR);
    const law = Math.round(rand(1,3)*mult*intFactor*lawyerEff);
    applyDelta(S, {evidence:e, family:famBase, lawyer:law});
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
  rest(S, mult){
    const s = rand(4,9);
    applyDelta(S, {suspicion:-s});
  }
};

const MIN_JUSTICE_DAY = 21;
const JUSTICE_MAX_ATTEMPTS = 3;
const JUSTICE_COOLDOWN_DAYS = 25;
const ESCAPE_ESCALATION_PENALTY = 8;

function computeJusticeChance(S){
  const intFactor = (S.profile.stats.intellect - 50) * 0.006;
  const raw = 3 + S.evidence * (0.85 + intFactor) + S.pipelineBonus - S.suspicion * 0.3;
  return Math.max(1, Math.min(95, raw));
}

function computeEscapeChance(S){
  const physFactor = (S.profile.stats.physique - 50) * 0.006;
  const escalation = S.escapeAttemptsUsed * ESCAPE_ESCALATION_PENALTY;
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
  const roll = rand(1,100);
  const threshold = S.suspicion;
  if(roll <= threshold * 0.6){
    const events = [
      ()=>applyDelta(S, {suspicion:10, evidence:-3, escapePlan:-3}),
      ()=>applyDelta(S, {suspicion:8, lawyer:-4}),
      ()=>{ S.day += rand(3,7); applyDelta(S, {suspicion:15}); }
    ];
    pick(events)();
    return;
  }
  if(roll >= 96){
    const good = [
      ()=>applyDelta(S, {lawyer:6}),
      ()=>applyDelta(S, {escapePlan:6}),
    ];
    pick(good)();
  }
}

function maybeEvidenceChallenge(S){
  if(S.evidence < 30) return;
  const chance = 6 + (S.evidence/100)*14;
  if(rand(1,100) <= chance){
    applyDelta(S, {evidence: -rand(6,14)});
  }
}

const CONNECTIONS_GRAPEVINE_THRESHOLD = 15;
const GRAPEVINE_CHANCE = 15;

function maybeGrapevineTip(S){
  if(S.connections < CONNECTIONS_GRAPEVINE_THRESHOLD) return;
  if(rand(1,100) <= GRAPEVINE_CHANCE){
    applyDelta(S, {evidence: rand(4,9)});
  }
}

function tryAttemptEscape(S){
  const chance = computeEscapeChance(S);
  S.escapeAttemptsUsed += 1;
  const roll = rand(1,100);
  if(roll <= chance){
    S.over = true; S.ending = 'escape-win';
    return;
  }
  S.day += rand(10,25);
  applyDelta(S, {suspicion:100, escapePlan:-40, connections:-20});
}

function tryPresentCase(S){
  if(S.justiceAttemptsLeft <= 0) return;
  const chance = computeJusticeChance(S);
  S.justiceAttemptsLeft -= 1;
  if(S.justiceAttemptsLeft === 0) S.justiceCooldownUntil = S.day + JUSTICE_COOLDOWN_DAYS;
  const roll = rand(1,100);
  if(roll <= chance){
    S.over = true; S.ending = 'justice-win';
    return;
  }
  applyDelta(S, {suspicion:10, evidence:-10});
}

function chooseAction(S, actionId){
  if(S.over) return;
  S.day += 1;
  maybeRegenJusticeAttempt(S);
  applyDelta(S, {suspicion:2});

  if(actionId === S.lastActionId){ S.actionStreak += 1; } else { S.actionStreak = 1; }
  S.lastActionId = actionId;
  const mult = Math.max(0.5, 1 - 0.12*(S.actionStreak-1));

  S.actionCounts[actionId] = (S.actionCounts[actionId] || 0) + 1;

  ACTIONS[actionId](S, mult);
  maybeGrapevineTip(S);
  maybeEvidenceChallenge(S);
  maybeEvent(S);
}

function createState(profile){
  return {
    day: 1,
    family: 15, lawyer: 0, media: 0,
    pipelineMilestones: {}, pipelineBonus: 0,
    connections: 15, evidence: 5, escapePlan: 5, suspicion: 10,
    over: false, ending: null,
    lastActionId: null, actionStreak: 0,
    profile,
    actionCounts: { library:0, guard:0, letters:0, crew:0, scout:0, bribe:0, rest:0 },
    justiceAttemptsLeft: JUSTICE_MAX_ATTEMPTS,
    justiceCooldownUntil: 0,
    escapeAttemptsUsed: 0
  };
}

// --- Bots ---
// justice-greedy: builds Evidence/Family/Lawyer, cools off when suspicion gets hot,
// attempts a hearing once the odds read "decent" (>=40).
// escape-greedy: builds Escape Plan/Connections, cools off similarly, and waits for
// roughly even odds (>=50) before risking an attempt, since a failed attempt is
// brutal (suspicion pinned to 100, -40 Escape Plan, -20 Connections, and every future
// attempt escalates against you further, with no floor on how bad it can get).
// A real player doesn't play forever, so each run is capped at MAX_DAYS — this also
// keeps the "no floor" Escape escalation from letting infinite retries eventually
// guarantee a win for any profile patient enough to keep re-building.
const JUSTICE_ATTEMPT_THRESHOLD = 40;
const ESCAPE_ATTEMPT_THRESHOLD = 50;
const ESCAPE_FORCE_DAY = 100; // don't stall forever waiting on odds a weak-physique build may never reach
const MAX_DAYS = 180;
const SAFETY_ITERATIONS = 5000;

function stepJusticeGreedy(S){
  if(S.day >= MIN_JUSTICE_DAY && S.justiceAttemptsLeft > 0 && computeJusticeChance(S) >= JUSTICE_ATTEMPT_THRESHOLD){
    tryPresentCase(S);
    return;
  }
  if(S.suspicion >= 70){ chooseAction(S, 'rest'); return; }
  const cycle = ['library','guard','letters'];
  chooseAction(S, cycle[S.day % cycle.length]);
}

function stepEscapeGreedy(S){
  const chance = computeEscapeChance(S);
  if(chance >= ESCAPE_ATTEMPT_THRESHOLD || (S.day >= ESCAPE_FORCE_DAY && S.escapeAttemptsUsed === 0)){
    tryAttemptEscape(S);
    return;
  }
  if(S.suspicion >= 65){ chooseAction(S, 'rest'); return; }
  const cycle = ['crew','scout','crew','bribe'];
  chooseAction(S, cycle[S.day % cycle.length]);
}

function simulate(profile, strategy){
  const S = createState(profile);
  let iterations = 0;
  const step = strategy === 'justice' ? stepJusticeGreedy : stepEscapeGreedy;
  while(!S.over && iterations < SAFETY_ITERATIONS && S.day < MAX_DAYS){
    iterations++;
    step(S);
  }
  return S.ending; // 'justice-win' | 'escape-win' | null (timed out)
}

const RUNS = 400;

console.log('Profile'.padEnd(14), 'Justice win%'.padEnd(14), 'Escape win%');
for(const profile of PROFILES){
  let justiceWins = 0;
  for(let i=0;i<RUNS;i++){ if(simulate(profile, 'justice') === 'justice-win') justiceWins++; }
  let escapeWins = 0;
  for(let i=0;i<RUNS;i++){ if(simulate(profile, 'escape') === 'escape-win') escapeWins++; }
  const jPct = (justiceWins/RUNS*100).toFixed(1);
  const ePct = (escapeWins/RUNS*100).toFixed(1);
  console.log(profile.name.padEnd(14), (jPct+'%').padEnd(14), ePct+'%');
}
