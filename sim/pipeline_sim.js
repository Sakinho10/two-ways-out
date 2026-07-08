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
  checkMoveUnlocks(S);
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
  },

  // Milestone-unlocked moves — mirrors index.html.
  reviewTestimony(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const e = Math.round(rand(7,12)*mult*intFactor);
    const law = Math.round(rand(2,4)*mult*intFactor);
    applyDelta(S, {evidence:e, lawyer:law});
  },
  pressStatement(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    const e = Math.round(rand(9,15)*mult*chaFactor);
    const med = Math.round(rand(3,5)*mult*chaFactor);
    const s = rand(6,10);
    applyDelta(S, {evidence:e, media:med, suspicion:s});
  },
  testBlindSpot(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    if(Math.random() < 0.7){
      const p = Math.round(rand(10,16)*mult*phyFactor);
      applyDelta(S, {escapePlan:p});
    } else {
      applyDelta(S, {suspicion: rand(10,16)});
    }
  },

  // Profile-signature moves — mirrors index.html.
  crossReferenceFiles(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const e = Math.round(rand(6,10)*mult*intFactor);
    const law = Math.round(rand(1,2)*mult*intFactor);
    applyDelta(S, {evidence:e, lawyer:law});
  },
  leanOnInmate(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    const c = Math.round(rand(6,10)*mult*phyFactor);
    applyDelta(S, {connections:c});
    if(Math.random() < 0.3){
      const p = Math.round(rand(3,6)*mult*phyFactor);
      applyDelta(S, {escapePlan:p});
    }
  },
  playGuardsAgainstEachOther(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    const stages = ['family','lawyer','media'];
    const nextThreshold = v => { for(const t of [25,60,90]){ if(v<t) return t; } return 100; };
    let target = stages[0], bestProp = -Infinity;
    for(const st of stages){
      const v = S[st];
      const t = nextThreshold(v);
      const prop = (t - v) / t;
      if(prop > bestProp){ bestProp = prop; target = st; }
    }
    const amt = Math.round(rand(4,8)*mult*chaFactor);
    const s = rand(3,6);
    applyDelta(S, { [target]: amt, suspicion: s });
  },
  keepEveryoneTalking(S, mult){
    const e = Math.round(rand(3,5)*mult);
    const p = Math.round(rand(3,5)*mult);
    const s = -rand(1,2);
    applyDelta(S, {evidence:e, escapePlan:p, suspicion:s});
  },

  // Scenario-flavored moves — mirrors index.html.
  workTheThinFile(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const e = Math.round(rand(10,16)*mult*intFactor);
    applyDelta(S, {evidence:e});
  },
  revisitTheTimeline(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const e = Math.round(rand(6,10)*mult*intFactor);
    const fam = Math.round(rand(3,6)*mult*intFactor);
    applyDelta(S, {evidence:e, family:fam});
  },
  pushBackOnTheNarrative(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const e = Math.round(rand(7,11)*mult*intFactor);
    const s = rand(5,9);
    applyDelta(S, {evidence:e, suspicion:s});
  },
  controlTheStory(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    const e = Math.round(rand(10,15)*mult*chaFactor);
    const med = Math.round(rand(4,6)*mult*chaFactor);
    const s = rand(7,11);
    applyDelta(S, {evidence:e, media:med, suspicion:s});
  }
};

// ---------------------------------------------------------------------
// Daily move pool — mirrors index.html. Base 6 always available;
// milestone moves join permanently once unlocked; exactly one
// profile-signature and one scenario-flavored move is available at a
// time. Rest is always offered separately, never part of the draw.
// ---------------------------------------------------------------------
const ACTION_SIDE = {
  library:'just', guard:'just', letters:'just',
  crew:'esc', scout:'esc', bribe:'esc',
  rest:'neutral',
  reviewTestimony:'just', pressStatement:'just', testBlindSpot:'esc',
  crossReferenceFiles:'just', leanOnInmate:'esc', playGuardsAgainstEachOther:'just', keepEveryoneTalking:'neutral',
  workTheThinFile:'just', revisitTheTimeline:'just', pushBackOnTheNarrative:'just', controlTheStory:'just'
};

const BASE_MOVE_IDS = ['library','guard','letters','crew','scout','bribe'];
const MILESTONE_MOVE_IDS = ['reviewTestimony','pressStatement','testBlindSpot'];
const MOVE_UNLOCK_CONDITIONS = {
  reviewTestimony: (S) => S.lawyer >= 25,
  pressStatement: (S) => S.media >= 25,
  testBlindSpot: (S) => S.escapePlan >= 40
};
const PROFILE_SIGNATURE_MOVE = {
  strategist:'crossReferenceFiles', giant:'leanOnInmate',
  manipulator:'playGuardsAgainstEachOther', everyman:'keepEveryoneTalking'
};
const SCENARIO_SIGNATURE_MOVE = {
  easy:'workTheThinFile', normal:'revisitTheTimeline',
  hard:'pushBackOnTheNarrative', veryhard:'controlTheStory'
};

function checkMoveUnlocks(S){
  for(const id of MILESTONE_MOVE_IDS){
    if(!S.unlockedMoveIds.includes(id) && MOVE_UNLOCK_CONDITIONS[id](S)){
      S.unlockedMoveIds.push(id);
    }
  }
}

function getAvailableMovePool(S){
  const ids = [...BASE_MOVE_IDS];
  for(const id of MILESTONE_MOVE_IDS){
    if(S.unlockedMoveIds.includes(id)) ids.push(id);
  }
  if(S.profile && PROFILE_SIGNATURE_MOVE[S.profile.id]) ids.push(PROFILE_SIGNATURE_MOVE[S.profile.id]);
  if(S.scenario && SCENARIO_SIGNATURE_MOVE[S.scenario.id]) ids.push(SCENARIO_SIGNATURE_MOVE[S.scenario.id]);
  return ids;
}

// One guaranteed Justice-side, one guaranteed Escape-side, one wildcard
// from whatever's left — only called when a new day actually starts.
function drawTodayMoves(S){
  const pool = getAvailableMovePool(S);
  const justicePool = pool.filter(id => ACTION_SIDE[id] === 'just');
  const escapePool = pool.filter(id => ACTION_SIDE[id] === 'esc');
  const slot1 = pick(justicePool);
  const slot2 = pick(escapePool);
  const used = new Set([slot1, slot2]);
  const remainingPool = pool.filter(id => !used.has(id));
  const slot3 = pick(remainingPool);
  S.todayMoves = [slot1, slot2, slot3];
}

const JUSTICE_MAX_ATTEMPTS = 3;
const JUSTICE_COOLDOWN_DAYS = 25;
const ESCAPE_ESCALATION_PENALTY = 8;

// Mirrors CYCLE_DAYS/APPEALS_ALLOWED/checkTrialDeadline() in index.html.
const CYCLE_DAYS = { easy: 35, normal: 38, hard: 42, veryhard: 48 };
const APPEALS_ALLOWED = { easy: 1, normal: 2, hard: 3, veryhard: 3 };

function checkTrialDeadline(S){
  if(S.over) return;
  if(S.day < S.trialDeadline) return;
  const scenarioId = S.scenario.id;
  if(S.appealsUsed < APPEALS_ALLOWED[scenarioId]){
    S.appealsUsed += 1;
    S.trialDeadline += CYCLE_DAYS[scenarioId];
  } else {
    S.over = true;
    S.ending = 'sentence-stands';
  }
}

// Mirrors underpreparedMult() / JUSTICE_FAIL_EXTRA_DAYS_BASE in index.html —
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
  const S = {
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
    escapeAttemptsUsed: 0,
    justiceAttemptsUsed: 0,
    appealsUsed: 0,
    trialDeadline: CYCLE_DAYS[scenario.id],
    unlockedMoveIds: [],
    todayMoves: []
  };
  drawTodayMoves(S); // day 1's offered moves
  return S;
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
  checkTrialDeadline(S);
  if(!S.over) drawTodayMoves(S); // a new day started — redraw the 3 offered moves
}

function tryPresentCase(S){
  if(S.justiceAttemptsLeft <= 0) return;
  S.day += 1; // attempting IS the day's action
  const chance = computeJusticeChance(S);
  S.justiceAttemptsLeft -= 1;
  if(S.justiceAttemptsLeft === 0) S.justiceCooldownUntil = S.day + JUSTICE_COOLDOWN_DAYS;
  const roll = rand(1,100);
  if(roll <= chance){
    S.over = true; S.ending = 'justice-win';
  } else {
    const mult = underpreparedMult(chance);
    const credibilityFactor = rampEfficiency(S.lawyer, S.scenario.scrutiny.lawyerThreshold, 0.55);
    const attemptDiscount = Math.max(0.6, 1 - 0.15 * S.justiceAttemptsUsed);
    const extraDays = Math.round(JUSTICE_FAIL_EXTRA_DAYS_BASE * credibilityFactor * attemptDiscount);
    S.justiceAttemptsUsed += 1;
    S.day += extraDays;
    applyDelta(S, {suspicion:Math.round(10*mult), evidence:-Math.round(10*mult)});
  }
  checkTrialDeadline(S);
  if(!S.over) drawTodayMoves(S); // a new day started — redraw the 3 offered moves
}

function tryAttemptEscape(S){
  S.day += 1; // attempting IS the day's action
  const chance = computeEscapeChance(S);
  const roll = rand(1,100);
  if(roll <= chance){
    S.over = true; S.ending = 'escape-win';
  } else {
    const mult = underpreparedMult(chance);
    const baseDays = rand(10,25);
    const escalationDays = S.escapeAttemptsUsed * 5;
    const totalDays = Math.min(60, baseDays + escalationDays);
    S.escapeAttemptsUsed += 1;
    S.day += totalDays;
    applyDelta(S, {suspicion:Math.round(100*mult), escapePlan:-Math.round(40*mult), connections:-Math.round(20*mult)});
  }
  checkTrialDeadline(S);
  if(!S.over) drawTodayMoves(S); // a new day started — redraw the 3 offered moves
}

// ---------- Bots ----------
// Both bots now pick from whatever the daily draw actually offers
// (Rest + 3 moves — see drawTodayMoves() above) rather than freely
// cycling a fixed 3-action list: justice-greedy takes a Justice-side move
// whenever one's offered (guaranteed every day by the draw algorithm's
// slot 1), preferring a milestone/signature move over a base move when
// more than one Justice-side option is offered that day; escape-greedy
// mirrors that on the Escape-side (guaranteed by slot 2). Both cool off
// when suspicion runs dangerously high, and attempt their ending once the
// odds clear a threshold.
//
// The thresholds/day-caps below were grid-searched against the target win
// rates in the task spec (see PR description) rather than picked by feel —
// each strategy gets its own day budget because a bot that gives up on
// Justice after ~120 days but keeps grinding Escape for ~900 is what
// actually reproduces both columns of the target table simultaneously; a
// single shared cap could not fit both. These bot budgets/thresholds are
// shared across all four scenarios — only the underlying formulas differ
// per scenario, exactly as they would for a real player.
const JUSTICE_BASE_IDS = new Set(['library','guard','letters']);
const ESCAPE_BASE_IDS = new Set(['crew','scout','bribe']);

const JUSTICE_BOT_MAX_DAYS = 120;
const JUSTICE_BOT_ATTEMPT_THRESHOLD = 45;
const JUSTICE_BOT_REST_SUSPICION = 55;

const ESCAPE_BOT_MAX_DAYS = 900;
const ESCAPE_BOT_ATTEMPT_THRESHOLD = 36;
const ESCAPE_BOT_REST_SUSPICION = 65;

// Prefers a milestone/signature move over a base move when more than one
// candidate of the wanted side is offered that day; ties broken randomly.
function pickPreferred(candidates, baseIdSet){
  const nonBase = candidates.filter(id => !baseIdSet.has(id));
  return pick(nonBase.length > 0 ? nonBase : candidates);
}

function justiceGreedyStep(S){
  maybeRegenJusticeAttempt(S);
  if(S.justiceAttemptsLeft > 0 && computeJusticeChance(S) >= JUSTICE_BOT_ATTEMPT_THRESHOLD){
    tryPresentCase(S);
    return;
  }
  if(S.suspicion >= JUSTICE_BOT_REST_SUSPICION){
    runAction(S, 'rest');
    return;
  }
  const justiceOptions = S.todayMoves.filter(id => ACTION_SIDE[id] === 'just');
  const id = justiceOptions.length > 0 ? pickPreferred(justiceOptions, JUSTICE_BASE_IDS) : 'rest';
  runAction(S, id);
}

function escapeGreedyStep(S){
  if(computeEscapeChance(S) >= ESCAPE_BOT_ATTEMPT_THRESHOLD){
    tryAttemptEscape(S);
    return;
  }
  if(S.suspicion >= ESCAPE_BOT_REST_SUSPICION){
    runAction(S, 'rest');
    return;
  }
  const escapeOptions = S.todayMoves.filter(id => ACTION_SIDE[id] === 'esc');
  const id = escapeOptions.length > 0 ? pickPreferred(escapeOptions, ESCAPE_BASE_IDS) : 'rest';
  runAction(S, id);
}

function simulateOneState(profileId, scenarioId, strategy){
  const profile = PROFILES.find(p=>p.id===profileId);
  const scenario = SCENARIOS.find(s=>s.id===scenarioId);
  const S = newState(profile, scenario);
  const maxDays = strategy === 'justice' ? JUSTICE_BOT_MAX_DAYS : ESCAPE_BOT_MAX_DAYS;
  while(!S.over && S.day < maxDays){
    if(strategy === 'justice') justiceGreedyStep(S); else escapeGreedyStep(S);
  }
  return S;
}

function simulateOne(profileId, scenarioId, strategy){
  return simulateOneState(profileId, scenarioId, strategy).ending || 'timeout';
}

// Also tracks S.day for runs that actually won via the strategy's intended
// path, so callers can report average days-to-win alongside win rate.
function runBatch(profileId, scenarioId, strategy, n){
  const wins = { 'justice-win':0, 'escape-win':0, 'sentence-stands':0, 'timeout':0 };
  const wantEnding = strategy === 'justice' ? 'justice-win' : 'escape-win';
  let winDaysSum = 0, winDaysCount = 0;
  for(let i=0;i<n;i++){
    const S = simulateOneState(profileId, scenarioId, strategy);
    const ending = S.ending || 'timeout';
    wins[ending] += 1;
    if(ending === wantEnding){ winDaysSum += S.day; winDaysCount += 1; }
  }
  const avgWinDays = winDaysCount ? winDaysSum / winDaysCount : null;
  return { wins, avgWinDays };
}

// ---------------------------------------------------------------------
// Grading — mirrors computeGrade()/letterForScore() in index.html, so the
// letter-band boundaries and difficulty ceiling can be validated against
// simulated playthroughs before shipping. See index.html for rationale.
// ---------------------------------------------------------------------
const PAR_DAYS = { easy:12, normal:16, hard:17, veryhard:17 };
const DIFFICULTY_MULTIPLIER = { easy:0.85, normal:1.0, hard:1.15, veryhard:1.3 };
const DIFFICULTY_CEILING = { easy:'B-', normal:'B+', hard:'A-', veryhard:null };
const GRADE_ORDER = ['F','D','C-','C','C+','B-','B','B+','A-','A','A+'];
const PATH_LEAN = {
  strategist:  { strong:'justice', weak:'escape' },
  giant:       { strong:'escape',  weak:'justice' },
  manipulator: { strong:'justice', weak:'escape' },
  everyman:    null
};

function letterForScore(rawScore){
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

function computeGrade(S){
  const scenarioId = S.scenario.id;
  const winPath = S.ending === 'justice-win' ? 'justice' : 'escape';
  const par = PAR_DAYS[scenarioId];
  const efficiency = Math.min(100, Math.round(100 * par / S.day));
  const lean = PATH_LEAN[S.profile.id];
  const pathFit = lean ? (winPath === lean.strong ? -15 : 15) : 0;
  const justiceBonus = winPath === 'justice' ? 10 : 0;
  const attemptPenalty = 6 * (S.justiceAttemptsUsed + S.escapeAttemptsUsed);
  const difficultyMultiplier = DIFFICULTY_MULTIPLIER[scenarioId];
  const rawScore = (efficiency + pathFit + justiceBonus - attemptPenalty) * difficultyMultiplier;

  let letter = letterForScore(rawScore);
  const ceiling = DIFFICULTY_CEILING[scenarioId];
  if(ceiling && GRADE_ORDER.indexOf(letter) > GRADE_ORDER.indexOf(ceiling)) letter = ceiling;

  const elite = scenarioId === 'veryhard' && !!lean && winPath === lean.weak &&
    S.justiceAttemptsUsed === 0 && S.escapeAttemptsUsed === 0 && rawScore >= 120;

  return { letter, rawScore, elite };
}

// Grades only the runs that actually won via the strategy's intended path
// (a bot can time out, which isn't a graded ending).
function runGradeBatch(profileId, scenarioId, strategy, n){
  const dist = {}; GRADE_ORDER.forEach(l => dist[l] = 0);
  const wantEnding = strategy === 'justice' ? 'justice-win' : 'escape-win';
  let winCount = 0, eliteCount = 0, scoreSum = 0;
  for(let i=0;i<n;i++){
    const S = simulateOneState(profileId, scenarioId, strategy);
    if(S.ending !== wantEnding) continue;
    const grade = computeGrade(S);
    dist[grade.letter] += 1;
    if(grade.elite) eliteCount += 1;
    scoreSum += grade.rawScore;
    winCount += 1;
  }
  return { dist, winCount, eliteCount, avgScore: winCount ? scoreSum / winCount : null };
}

function printGradeReport(){
  const N = 300;
  console.log(`\nGrade distribution — ${N} playthroughs per profile x scenario x path (graded on actual wins only)...\n`);
  const overall = {}; GRADE_ORDER.forEach(l => overall[l] = 0);
  let overallElite = 0, overallWins = 0;
  for(const scenario of SCENARIOS){
    for(const profile of PROFILES){
      for(const strategy of ['justice','escape']){
        const { dist, winCount, eliteCount, avgScore } = runGradeBatch(profile.id, scenario.id, strategy, N);
        if(winCount === 0){
          console.log(`${scenario.id.padEnd(10)}${profile.name.padEnd(16)}${strategy.padEnd(8)} no wins in ${N} runs`);
          continue;
        }
        const distStr = GRADE_ORDER.slice().reverse().filter(l => dist[l] > 0).map(l => `${l}:${dist[l]}`).join(' ');
        console.log(`${scenario.id.padEnd(10)}${profile.name.padEnd(16)}${strategy.padEnd(8)} wins=${String(winCount).padEnd(5)} avgScore=${avgScore.toFixed(1).padEnd(7)} elite=${eliteCount}  [${distStr}]`);
        for(const l of GRADE_ORDER) overall[l] += dist[l];
        overallElite += eliteCount;
        overallWins += winCount;
      }
    }
    console.log('');
  }
  console.log(`Overall grade histogram across all combos (${overallWins} total graded wins, ${overallElite} Elite):`);
  for(const l of GRADE_ORDER.slice().reverse()){
    const pct = overallWins ? (overall[l] / overallWins * 100).toFixed(1) : '0.0';
    console.log(`  ${l.padEnd(3)} ${String(overall[l]).padStart(5)}  (${pct}%)`);
  }
}

// ---------------------------------------------------------------------
// Validation report for the dynamic/unlockable move pool rework — see
// task description. Report-only: flags deviations for a human to retune,
// never adjusts values itself.
// ---------------------------------------------------------------------

// Last validated win-rate matrix from README.md (pre-dynamic-move-pool),
// used as the baseline for the >~15 percentage-point shift check below.
const BASELINE_WIN_RATES = {
  easy:     { strategist:{justice:99,escape:84}, giant:{justice:72,escape:99}, manipulator:{justice:98,escape:97}, everyman:{justice:97,escape:98} },
  normal:   { strategist:{justice:84,escape:17}, giant:{justice:21,escape:65}, manipulator:{justice:72,escape:17}, everyman:{justice:60,escape:56} },
  hard:     { strategist:{justice:49,escape:0},  giant:{justice:1, escape:27}, manipulator:{justice:19,escape:0},  everyman:{justice:20,escape:12} },
  veryhard: { strategist:{justice:36,escape:0},  giant:{justice:1, escape:23}, manipulator:{justice:10,escape:0},  everyman:{justice:12,escape:9} }
};
const WIN_RATE_SHIFT_FLAG_THRESHOLD = 15; // percentage points

// Total trial-deadline budget (initial cycle + every appeal cycle) per
// scenario — CYCLE_DAYS * (1 + APPEALS_ALLOWED) — given directly in the
// task spec as easy 70 / normal 114 / hard 168 / veryhard 192.
const TRIAL_BUDGET_DAYS = {};
for(const id of Object.keys(CYCLE_DAYS)) TRIAL_BUDGET_DAYS[id] = CYCLE_DAYS[id] * (1 + APPEALS_ALLOWED[id]);

function main(){
  const N = 400;
  console.log(`Simulating ${N} playthroughs per profile x scenario x strategy (justice-greedy, escape-greedy)...\n`);
  console.log(
    'Scenario'.padEnd(11) + 'Profile'.padEnd(16) +
    'Justice win%'.padStart(13) + 'J avgDays'.padStart(11) +
    'Escape win%'.padStart(13) + 'E avgDays'.padStart(11)
  );

  const results = []; // flat list of { scenarioId, profileId, strategy, winPct, avgDays }
  for(const scenario of SCENARIOS){
    for(const profile of PROFILES){
      const j = runBatch(profile.id, scenario.id, 'justice', N);
      const e = runBatch(profile.id, scenario.id, 'escape', N);
      const jWinPct = j.wins['justice-win'] / N * 100;
      const eWinPct = e.wins['escape-win'] / N * 100;
      results.push({ scenarioId: scenario.id, profileId: profile.id, strategy:'justice', winPct: jWinPct, avgDays: j.avgWinDays });
      results.push({ scenarioId: scenario.id, profileId: profile.id, strategy:'escape', winPct: eWinPct, avgDays: e.avgWinDays });
      console.log(
        scenario.id.padEnd(11) + profile.name.padEnd(16) +
        (jWinPct.toFixed(1) + '%').padStart(13) +
        (j.avgWinDays != null ? j.avgWinDays.toFixed(1) : '—').padStart(11) +
        (eWinPct.toFixed(1) + '%').padStart(13) +
        (e.avgWinDays != null ? e.avgWinDays.toFixed(1) : '—').padStart(11)
      );
    }
    console.log('');
  }

  // ---- Report item 1: win-rate shifts vs the last validated matrix ----
  console.log(`\n=== Report 1: win% shift vs last validated matrix (flag threshold: ${WIN_RATE_SHIFT_FLAG_THRESHOLD}pp) ===`);
  let anyWinShiftFlag = false;
  for(const r of results){
    const baseline = BASELINE_WIN_RATES[r.scenarioId][r.profileId][r.strategy];
    const delta = r.winPct - baseline;
    if(Math.abs(delta) > WIN_RATE_SHIFT_FLAG_THRESHOLD){
      anyWinShiftFlag = true;
      console.log(`  FLAG  ${r.scenarioId.padEnd(9)}${r.profileId.padEnd(13)}${r.strategy.padEnd(8)} baseline=${baseline}%  new=${r.winPct.toFixed(1)}%  delta=${delta>=0?'+':''}${delta.toFixed(1)}pp`);
    }
  }
  if(!anyWinShiftFlag) console.log('  none — all 32 combos within ±15pp of the last validated matrix.');

  // ---- Report item 2: avg days-to-win vs trial-deadline total budget ----
  console.log(`\n=== Report 2: avg days-to-win vs trial-deadline total budget ===`);
  for(const r of results){
    if(r.avgDays == null) continue; // no wins recorded for this combo — nothing to compare
    const budget = TRIAL_BUDGET_DAYS[r.scenarioId];
    const pctOfBudget = r.avgDays / budget * 100;
    const flag = pctOfBudget < 35 ? '  FLAG (uses <35% of budget — deadline may be looser than intended)' : '';
    console.log(`  ${r.scenarioId.padEnd(9)}${r.profileId.padEnd(13)}${r.strategy.padEnd(8)} avgDays=${r.avgDays.toFixed(1).padEnd(7)} budget=${budget}  (${pctOfBudget.toFixed(0)}% of budget)${flag}`);
  }

  // ---- Report item 3: strong-path avg days-to-win vs grading par ----
  console.log(`\n=== Report 3: strong-path avg days-to-win vs grading par ===`);
  for(const r of results){
    if(r.avgDays == null) continue;
    const lean = PATH_LEAN[r.profileId];
    if(!lean || lean.strong !== r.strategy) continue; // only strong-path combos; Everyman has no lean
    const par = PAR_DAYS[r.scenarioId];
    const flag = r.avgDays < par ? '  FLAG (beats par on average — efficiency scores may inflate)' : '';
    console.log(`  ${r.scenarioId.padEnd(9)}${r.profileId.padEnd(13)}${r.strategy.padEnd(8)} avgDays=${r.avgDays.toFixed(1).padEnd(7)} par=${par}${flag}`);
  }

  printGradeReport();
}

if(require.main === module) main();

module.exports = {
  PROFILES, SCENARIOS, rampEfficiency, applyDelta, computeJusticeChance, computeEscapeChance,
  newState, runAction, tryPresentCase, tryAttemptEscape, simulateOne, simulateOneState, runBatch,
  computeGrade, runGradeBatch,
  ACTIONS, ACTION_SIDE, getAvailableMovePool, drawTodayMoves, checkMoveUnlocks
};
