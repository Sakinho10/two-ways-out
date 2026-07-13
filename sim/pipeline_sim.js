// Node simulation harness for the Family/Lawyer/Media Credibility pipeline,
// the Difficulty Scenario system, AND the v2 Suspicion/Heat + expanded move
// pool rework layered on top. Ports the balance-relevant functions from
// index.html (stat factors, the pipeline, actions, odds formulas, milestone
// checks, scenario modifiers, the Suspicion/Heat footprint+tier engine, the
// v2 move pool/unlock system) so a rework of any of it can be validated
// (win rates per profile x scenario) before it ships in the real game. Run
// with:
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
  if(d.trust) S.trust = clamp(S.trust + d.trust);
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
  if(d.heat){
    S.heat = clamp(S.heat + Math.round(d.heat));
  }
  checkMilestones(S);
  checkMoveUnlocks(S);
}

// ---------------------------------------------------------------------
// v2: Suspicion (Escape-track) / Heat (Justice-track) footprint engine —
// mirrors the block of the same name in index.html.
// ---------------------------------------------------------------------
const FOOTPRINT_SUSPICION = {
  scout:2, mapRoutines:2, cultivateRoutine:3, crew:4, leanOnInmate:5,
  forgeRapport:5, testBlindSpot:6, stashTools:7, bribe:7, disguiseWork:8,
  breachTest:10
};
const SUSPICION_DECAY = -3;

const FOOTPRINT_HEAT = {
  pressStatement:6, pushBackOnDepartment:7, steerCoverage:8, publicRally:8,
  whistleblowerLeak:9, controlTheStory:8
};
const HEAT_DECAY = -2;

function trialProximityMult(S){
  if(!S.scenario || !S.trialDeadline) return 1;
  const frac = Math.max(0, S.trialDeadline - S.day) / S.trialDeadline;
  if(frac > 0.5) return 1.0;
  if(frac > 0.25) return 1.25;
  if(frac > 0.10) return 1.5;
  return 1.8;
}

function repetitionMult(S){
  return Math.min(1.6, 1 + 0.15*(S.actionStreak-1));
}

function suspicionBiasMult(S){ return S.suspicion >= 70 ? 1.15 : 1; }

function footprintFor(S, id, base){
  let v = base;
  if(id === 'bribe' && (S.actionCounts.tradeFavor||0) > 0) v = Math.max(1, v - 1);
  return v;
}

function recordRecentAction(S, id){
  S.recentActions.push({day:S.day, id});
  const cutoff = S.day - 10;
  S.recentActions = S.recentActions.filter(e => e.day > cutoff);
}

const PATTERNS = [
  { actions:['scout','bribe','leanOnInmate'], withinDays:4, bonus:12, label:'Preparing a Breakout' },
  { actions:['stashTools','disguiseWork'], withinDays:5, bonus:14, label:'Dry Run Spotted' }
];

function checkPatterns(S){
  for(const p of PATTERNS){
    if(S.firedPatterns[p.label]) continue;
    const windowStart = S.day - p.withinDays + 1;
    const seen = new Set(S.recentActions.filter(e => e.day >= windowStart).map(e => e.id));
    if(p.actions.every(a => seen.has(a))){
      S.firedPatterns[p.label] = true;
      applyDelta(S, {suspicion: p.bonus});
    }
  }
}

function applyDailySuspicionAndHeat(S, actionId){
  const susBase = FOOTPRINT_SUSPICION[actionId];
  if(susBase != null){
    const footprint = footprintFor(S, actionId, susBase);
    let delta = footprint * trialProximityMult(S) * repetitionMult(S) * suspicionBiasMult(S);
    applyDelta(S, {suspicion: Math.round(delta)});
  } else {
    applyDelta(S, {suspicion: SUSPICION_DECAY});
  }

  const heatBase = FOOTPRINT_HEAT[actionId];
  if(heatBase != null){
    let delta = heatBase * trialProximityMult(S) * repetitionMult(S);
    applyDelta(S, {heat: Math.round(delta)});
  } else {
    applyDelta(S, {heat: HEAT_DECAY});
  }

  recordRecentAction(S, actionId);
  checkPatterns(S);
}

// Tier ladders — stat-effect-only port of SUSPICION_TIERS/HEAT_TIERS in
// index.html (narrative text dropped, magnitudes preserved).
const SUSPICION_TIERS = [
  { min:0,  max:19 },
  { min:20, max:39, chance:0.12, effects:[ (S,mult)=> applyDelta(S, {escapePlan:-Math.round(3*mult)}) ] },
  { min:40, max:59, chance:0.18, effects:[
    (S,mult)=> applyDelta(S, {escapePlan:-Math.round(6*mult)}),
    (S,mult)=> applyDelta(S, {suspicion:4})
  ]},
  { min:60, max:79, chance:0.24, effects:[
    (S,mult)=> applyDelta(S, {escapePlan:-Math.round(10*mult), connections:-Math.round(4*mult)}),
    (S,mult)=> { S.day += rand(2,4); applyDelta(S, {suspicion:6}); }
  ]},
  { min:80, max:94, chance:0.32, effects:[
    (S,mult)=> { S.day += rand(4,8); applyDelta(S, {escapePlan:-Math.round(16*mult)}); },
    (S,mult)=> applyDelta(S, {escapePlan:-Math.round(12*mult)})
  ]},
  { min:95, max:100, chance:0.55, escapeTrackChance:0.9, effects:[
    (S,mult)=> { S.day += rand(6,12); applyDelta(S, {escapePlan:-Math.round(25*mult), connections:-Math.round(10*mult)}); }
  ]}
];

const HEAT_TIERS = [
  { min:0,  max:19 },
  { min:20, max:39, chance:0.12, effects:[ (S)=> applyDelta(S, {family:-2}) ] },
  { min:40, max:59, chance:0.18, effects:[ (S)=> applyDelta(S, {evidence:-rand(4,8)}) ] },
  { min:60, max:79, chance:0.24, effects:[
    (S)=> applyDelta(S, {evidence:-rand(6,12)}),
    (S)=> applyDelta(S, {lawyer:-5})
  ]},
  { min:80, max:94, chance:0.32, effects:[
    (S)=> applyDelta(S, {lawyer:-8}),
    (S)=> applyDelta(S, {media:-6})
  ]},
  { min:95, max:100, chance:0.55, escapeTrackChance:0.9, effects:[
    (S)=> applyDelta(S, {lawyer:-rand(10,16), media:-rand(6,10)})
  ]}
];

function tierFor(value, tiers){
  return tiers.find(t => value >= t.min && value <= t.max) || tiers[0];
}

function maybeTierEvent(S, track, actionId){
  const tiers = track === 'suspicion' ? SUSPICION_TIERS : HEAT_TIERS;
  const value = track === 'suspicion' ? S.suspicion : S.heat;
  const tier = tierFor(value, tiers);
  if(!tier.effects || tier.effects.length === 0) return;
  const footprintTable = track === 'suspicion' ? FOOTPRINT_SUSPICION : FOOTPRINT_HEAT;
  const onTrackToday = footprintTable[actionId] != null;
  let chance = tier.chance || 0;
  if(onTrackToday && tier.escapeTrackChance != null) chance = tier.escapeTrackChance;
  if(Math.random() >= chance) return;
  pick(tier.effects)(S, 1);
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
    const c = Math.round(rand(5,9)*mult*chaFactor), p = Math.round(rand(3,6)*mult*chaFactor);
    applyDelta(S, {connections:c, escapePlan:p});
  },
  scout(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    const p = Math.round(rand(5,9)*mult*intFactor);
    applyDelta(S, {escapePlan:p});
  },
  bribe(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    if(S.connections < 12){
      applyDelta(S, {suspicion:6});
      return;
    }
    const p = Math.round(rand(10,16)*mult*phyFactor);
    applyDelta(S, {connections:-12, escapePlan:p});
  },
  rest(S){ /* no-op — decay handled centrally now */ },

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
    applyDelta(S, {evidence:e, media:med});
  },
  testBlindSpot(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    if(Math.random() < 0.7){
      const p = Math.round(rand(10,16)*mult*phyFactor);
      applyDelta(S, {escapePlan:p});
    }
  },

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
    applyDelta(S, {evidence:e, escapePlan:p});
  },

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
    applyDelta(S, {evidence:e, media:med});
  },

  // -------- v2: expanded move pool --------
  studyCaseFile(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {evidence: Math.round(rand(5,9)*mult*intFactor)});
  },
  mapRoutines(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {escapePlan: Math.round(rand(4,7)*mult*intFactor)});
  },
  gymTime(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    applyDelta(S, {trust: Math.round(rand(2,5)*mult*phyFactor)});
  },
  infirmaryHelp(S, mult){
    applyDelta(S, {trust: Math.round(rand(3,6)*mult), family: Math.round(rand(1,3)*mult)});
  },
  cultivateRoutine(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {escapePlan: Math.round(rand(6,10)*mult*intFactor)});
  },
  therapySession(S, mult){
    applyDelta(S, {suspicion:-2, heat:-1});
  },
  pushBackOnDepartment(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {evidence: Math.round(rand(8,13)*mult*intFactor)});
  },
  forgeRapport(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    applyDelta(S, {connections: Math.round(rand(6,10)*mult*chaFactor)});
  },
  mentorInmate(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {trust: Math.round(rand(3,6)*mult), evidence: Math.round(rand(3,6)*mult*intFactor)});
  },
  quietWorkDetail(S, mult){
    applyDelta(S, {trust: Math.round(rand(4,7)*mult)});
  },
  stashTools(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    applyDelta(S, {escapePlan: Math.round(rand(9,14)*mult*phyFactor)});
  },
  disguiseWork(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {escapePlan: Math.round(rand(10,15)*mult*intFactor)});
  },
  blackmailLite(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    applyDelta(S, {connections: Math.round(rand(7,12)*mult*chaFactor)});
    if(Math.random() < 0.35) applyDelta(S, {evidence: Math.round(rand(3,7)*mult*chaFactor)});
  },
  steerCoverage(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    applyDelta(S, {evidence: Math.round(rand(9,14)*mult*chaFactor), media: Math.round(rand(4,7)*mult*chaFactor)});
  },
  publicRally(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    applyDelta(S, {family: Math.round(rand(4,8)*mult*chaFactor), media: Math.round(rand(5,9)*mult*chaFactor)});
  },
  whistleblowerLeak(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {evidence: Math.round(rand(14,22)*mult*intFactor)});
  },
  breachTest(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    if(Math.random() < 0.75){
      applyDelta(S, {escapePlan: Math.round(rand(14,20)*mult*phyFactor)});
    } else {
      applyDelta(S, {escapePlan: -Math.round(6*mult)});
    }
  },
  familyVisitDay(S, mult){
    applyDelta(S, {family: rand(8,14)});
  },
  scheduleAhead(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {evidence: Math.round(rand(5,8)*mult*intFactor)});
  },
  contingencyPlan(S, mult){
    const intFactor = statFactor(S.profile.stats.intellect);
    applyDelta(S, {evidence: Math.round(rand(7,11)*mult*intFactor), lawyer: Math.round(rand(2,4)*mult*intFactor)});
  },
  standOver(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    applyDelta(S, {connections: Math.round(rand(5,8)*mult*phyFactor)});
  },
  protectWeaker(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    applyDelta(S, {trust: Math.round(rand(5,9)*mult*phyFactor)});
    if(Math.random() < 0.3) applyDelta(S, {escapePlan: Math.round(rand(3,6)*mult*phyFactor)});
  },
  laborCrew(S, mult){
    const phyFactor = statFactor(S.profile.stats.physique);
    applyDelta(S, {trust: Math.round(rand(6,10)*mult*phyFactor)});
  },
  spreadRumor(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    applyDelta(S, {evidence: Math.round(rand(4,7)*mult*chaFactor)});
    if(Math.random() < 0.25) applyDelta(S, {media: Math.round(rand(2,4)*mult*chaFactor)});
  },
  tradeFavor(S, mult){
    const chaFactor = statFactor(S.profile.stats.charisma);
    applyDelta(S, {connections: Math.round(rand(6,10)*mult*chaFactor)});
  },
  blendIn(S, mult){
    applyDelta(S, {suspicion:-3, heat:-2});
  },
  overheardTip(S, mult){
    if(Math.random() < 0.5) applyDelta(S, {evidence: Math.round(rand(3,6)*mult)});
    else applyDelta(S, {escapePlan: Math.round(rand(3,6)*mult)});
  },
  nobodySuspectsMe(S, mult){
    S.repetitionReliefUntilDay = S.day + 5;
  }
};

// ---------------------------------------------------------------------
// Daily move pool — v2. Mirrors the same-named block in index.html.
// ---------------------------------------------------------------------
const ACTION_SIDE = {
  library:'just', guard:'just', letters:'just',
  crew:'esc', scout:'esc', bribe:'esc',
  rest:'neutral',
  reviewTestimony:'just', pressStatement:'just', testBlindSpot:'esc',
  crossReferenceFiles:'just', leanOnInmate:'esc', playGuardsAgainstEachOther:'just', keepEveryoneTalking:'neutral',
  workTheThinFile:'just', revisitTheTimeline:'just', pushBackOnTheNarrative:'just', controlTheStory:'just',
  studyCaseFile:'just', mapRoutines:'esc', gymTime:'neutral', infirmaryHelp:'neutral',
  cultivateRoutine:'esc', therapySession:'neutral',
  pushBackOnDepartment:'just', forgeRapport:'esc', mentorInmate:'just', quietWorkDetail:'neutral',
  stashTools:'esc', disguiseWork:'esc', blackmailLite:'esc', steerCoverage:'just', publicRally:'just', whistleblowerLeak:'just',
  breachTest:'esc', familyVisitDay:'neutral',
  scheduleAhead:'just', contingencyPlan:'just', standOver:'esc', protectWeaker:'esc', laborCrew:'neutral',
  spreadRumor:'just', tradeFavor:'esc', blendIn:'neutral', overheardTip:'neutral', nobodySuspectsMe:'neutral'
};

const BASE_MOVE_IDS = ['library','guard','letters','crew','scout'];
const ALWAYS_ON_MOVE_IDS = ['therapySession'];

const CYCLE_DAYS = { easy: 35, normal: 38, hard: 42, veryhard: 48 };
const APPEALS_ALLOWED = { easy: 1, normal: 2, hard: 3, veryhard: 3 };

function scenarioDays(S){ return S.scenario ? CYCLE_DAYS[S.scenario.id] : CYCLE_DAYS.normal; }
function scaleFactor(S){ return scenarioDays(S) / CYCLE_DAYS.veryhard; }
function giantDiscount(S){ return (S.profile && S.profile.id === 'giant') ? 0.85 : 1.0; }

const GENERAL_MOVE_IDS = [
  'reviewTestimony','pressStatement','testBlindSpot','bribe','leanOnInmate',
  'playGuardsAgainstEachOther','keepEveryoneTalking',
  'studyCaseFile','mapRoutines','gymTime','infirmaryHelp','cultivateRoutine',
  'pushBackOnDepartment','forgeRapport','mentorInmate','quietWorkDetail',
  'stashTools','disguiseWork','blackmailLite','steerCoverage','publicRally','whistleblowerLeak',
  'breachTest'
];
const MOVE_UNLOCK_CONDITIONS = {
  reviewTestimony: (S) => S.lawyer >= 25,
  pressStatement: (S) => S.media >= 20,
  testBlindSpot: (S) => S.escapePlan >= 20,
  bribe: (S) => S.connections >= 15,
  leanOnInmate: (S) => S.connections >= 25,
  playGuardsAgainstEachOther: (S) => S.connections >= 10,
  keepEveryoneTalking: (S) => S.day >= 5,
  studyCaseFile: (S) => S.day >= 3,
  mapRoutines: (S) => S.day >= 3,
  gymTime: (S) => S.day >= 3,
  infirmaryHelp: (S) => S.family >= 10,
  cultivateRoutine: (S) => (S.actionCounts.scout||0) >= 2,
  pushBackOnDepartment: (S) => S.lawyer >= 18,
  forgeRapport: (S) => S.connections >= 20,
  mentorInmate: (S) => S.trust >= 25,
  quietWorkDetail: (S) => S.trust >= 20 || (S.profile && S.profile.id === 'giant' && (S.actionCounts.laborCrew||0) >= 1),
  stashTools: (S) => S.connections >= Math.round(40*scaleFactor(S)*giantDiscount(S))
    && (S.actionCounts.bribe||0) >= 1 && S.day >= Math.round(0.35*scenarioDays(S)),
  disguiseWork: (S) => (S.actionCounts.stashTools||0) >= 1,
  blackmailLite: (S) => S.connections >= Math.round(35*scaleFactor(S)*giantDiscount(S)) && S.trust <= 40,
  steerCoverage: (S) => S.media >= Math.round(40*scaleFactor(S)) && (S.actionCounts.pressStatement||0) >= 2,
  publicRally: (S) => S.media >= Math.round(50*scaleFactor(S)) && S.day >= Math.round(0.5*scenarioDays(S)),
  whistleblowerLeak: (S) => S.scenario && S.scenario.id === 'veryhard' && S.evidence >= 50,
  breachTest: (S) => S.escapePlan >= 50
};
const PROFILE_SIGNATURE_CHAINS = {
  strategist: [
    { id:'scheduleAhead', cond: (S) => true },
    { id:'crossReferenceFiles', cond: (S) => S.evidence >= 15 },
    { id:'contingencyPlan', cond: (S) => S.day >= 10 }
  ],
  giant: [
    { id:'standOver', cond: (S) => true },
    { id:'protectWeaker', cond: (S) => S.trust >= 15 },
    { id:'laborCrew', cond: (S) => S.day >= 8 }
  ],
  manipulator: [
    { id:'spreadRumor', cond: (S) => true },
    { id:'tradeFavor', cond: (S) => S.connections >= 15 }
  ],
  everyman: [
    { id:'blendIn', cond: (S) => true },
    { id:'overheardTip', cond: (S) => S.day >= 5 },
    { id:'nobodySuspectsMe', cond: (S) => S.suspicion >= 30 || S.heat >= 30 }
  ]
};
const SCENARIO_SIGNATURE_MOVE = {
  easy:'workTheThinFile', normal:'revisitTheTimeline',
  hard:'pushBackOnTheNarrative', veryhard:'controlTheStory'
};

function checkMoveUnlocks(S){
  for(const id of GENERAL_MOVE_IDS){
    if(!S.unlockedMoveIds.includes(id) && MOVE_UNLOCK_CONDITIONS[id](S)){
      S.unlockedMoveIds.push(id);
    }
  }
  if(S.profile){
    const chain = PROFILE_SIGNATURE_CHAINS[S.profile.id] || [];
    for(const step of chain){
      if(!S.unlockedMoveIds.includes(step.id) && step.cond(S)){
        S.unlockedMoveIds.push(step.id);
      }
    }
  }
}

function getAvailableMovePool(S){
  const ids = [...BASE_MOVE_IDS, ...ALWAYS_ON_MOVE_IDS];
  for(const id of GENERAL_MOVE_IDS){
    if(S.unlockedMoveIds.includes(id)) ids.push(id);
  }
  if(S.profile){
    const chain = PROFILE_SIGNATURE_CHAINS[S.profile.id] || [];
    for(const step of chain){
      if(S.unlockedMoveIds.includes(step.id)) ids.push(step.id);
    }
  }
  if(S.scenario && SCENARIO_SIGNATURE_MOVE[S.scenario.id]) ids.push(SCENARIO_SIGNATURE_MOVE[S.scenario.id]);
  if(S.family >= 30 && S.scenario && (S.day - (S.lastFamilyVisitDay||0)) >= 10) ids.push('familyVisitDay');
  return ids;
}

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

function underpreparedMult(chance){
  return Math.max(1, Math.min(2.5, 1 + (40 - chance) / 40 * 1.5));
}
const JUSTICE_FAIL_EXTRA_DAYS_BASE = 12;

// Heat replaces Suspicion's old role in the Justice formula now that the
// two stats are split by track (see index.html).
const HEAT_CHANCE_PENALTY = 0.12;
function computeJusticeChance(S){
  const intFactor = (S.profile.stats.intellect - 50) * 0.006;
  const raw = 3 + S.evidence * (0.85 + intFactor) + S.pipelineBonus - S.heat * HEAT_CHANCE_PENALTY;
  return Math.max(1, Math.min(95, raw));
}

const ESCAPE_SUSPICION_PENALTY = 0.2;
const ESCAPE_SURVEILLANCE_PENALTY = 8;
function computeEscapeChance(S){
  const physFactor = (S.profile.stats.physique - 50) * 0.006;
  const escalationMult = S.scenario ? S.scenario.security.escalationPenaltyMult : 1;
  const escalation = S.escapeAttemptsUsed * ESCAPE_ESCALATION_PENALTY * escalationMult;
  const surveillancePenalty = S.suspicion >= 80 ? ESCAPE_SURVEILLANCE_PENALTY : 0;
  const raw = 3 + S.escapePlan * (0.85 + physFactor) - S.suspicion * ESCAPE_SUSPICION_PENALTY - escalation - surveillancePenalty;
  return Math.max(1, Math.min(95, raw));
}

function maybeRegenJusticeAttempt(S){
  if(S.justiceAttemptsLeft < JUSTICE_MAX_ATTEMPTS && S.justiceCooldownUntil > 0 && S.day >= S.justiceCooldownUntil){
    S.justiceAttemptsLeft += 1;
    S.justiceCooldownUntil = S.justiceAttemptsLeft < JUSTICE_MAX_ATTEMPTS ? S.day + JUSTICE_COOLDOWN_DAYS : 0;
  }
}

function maybeEvent(S, actionId){
  if(S.scenario && S.scenario.scrutiny.tabloidEvent && rand(1,100) <= 4){
    applyDelta(S, {suspicion: rand(10,18)});
    S.pipelineBonus = Math.max(0, S.pipelineBonus - rand(1,2));
    return;
  }
  maybeTierEvent(S, 'suspicion', actionId);
  maybeTierEvent(S, 'heat', actionId);
  const roll = rand(1,100);
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
    connections: 15, evidence: 5, escapePlan: 5, suspicion: 10, heat: 10, trust: 10,
    recentActions: [], firedPatterns: {}, lastFamilyVisitDay: 0, repetitionReliefUntilDay: 0,
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
  checkMoveUnlocks(S); // day-1 profile signature moves (always-true conditions)
  drawTodayMoves(S); // day 1's offered moves
  return S;
}

function runAction(S, id){
  S.day += 1;
  maybeRegenJusticeAttempt(S);
  if(id === S.lastActionId){ S.actionStreak += 1; } else { S.actionStreak = 1; }
  S.lastActionId = id;
  const reliefActive = S.day <= S.repetitionReliefUntilDay;
  const decayRate = reliefActive ? 0.06 : 0.12;
  const decayFloor = reliefActive ? 0.75 : 0.5;
  const mult = Math.max(decayFloor, 1 - decayRate*(S.actionStreak-1));
  S.actionCounts[id] = (S.actionCounts[id] || 0) + 1;
  if(id === 'familyVisitDay') S.lastFamilyVisitDay = S.day;
  ACTIONS[id](S, mult);
  applyDailySuspicionAndHeat(S, id);
  maybeGrapevineTip(S);
  maybeEvidenceChallenge(S);
  maybeEvent(S, id);
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
// when their track's risk stat runs dangerously high, and attempt their
// ending once the odds clear a threshold.
//
// v2: the justice bot now watches Heat instead of Suspicion when deciding
// whether to rest — Suspicion no longer affects the Justice formula at
// all now that the two tracks are split. The escape bot still watches
// Suspicion, unchanged.
const JUSTICE_BASE_IDS = new Set(['library','guard','letters']);
const ESCAPE_BASE_IDS = new Set(['crew','scout','bribe']);

const JUSTICE_BOT_MAX_DAYS = 120;
const JUSTICE_BOT_ATTEMPT_THRESHOLD = 45;
const JUSTICE_BOT_REST_HEAT = 55;

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
  if(S.heat >= JUSTICE_BOT_REST_HEAT){
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
// Validation report — see task description ("v2 Required verification").
// Report-only: flags deviations for a human to retune, never adjusts
// values itself.
// ---------------------------------------------------------------------

// Last validated win-rate matrix from README.md (pre-v2), used as the
// baseline for the >~15 percentage-point shift check below.
const BASELINE_WIN_RATES = {
  easy:     { strategist:{justice:99,escape:84}, giant:{justice:72,escape:99}, manipulator:{justice:98,escape:97}, everyman:{justice:97,escape:98} },
  normal:   { strategist:{justice:84,escape:17}, giant:{justice:21,escape:65}, manipulator:{justice:72,escape:17}, everyman:{justice:60,escape:56} },
  hard:     { strategist:{justice:49,escape:0},  giant:{justice:1, escape:27}, manipulator:{justice:19,escape:0},  everyman:{justice:20,escape:12} },
  veryhard: { strategist:{justice:36,escape:0},  giant:{justice:1, escape:23}, manipulator:{justice:10,escape:0},  everyman:{justice:12,escape:9} }
};
const WIN_RATE_SHIFT_FLAG_THRESHOLD = 15; // percentage points

// Total trial-deadline budget (initial cycle + every appeal cycle) per
// scenario — CYCLE_DAYS * (1 + APPEALS_ALLOWED).
const TRIAL_BUDGET_DAYS = {};
for(const id of Object.keys(CYCLE_DAYS)) TRIAL_BUDGET_DAYS[id] = CYCLE_DAYS[id] * (1 + APPEALS_ALLOWED[id]);

// ---- v2 check 1: Justice-track Tier 3 reachability ----
// Runs a justice-greedy bot and records whether controlTheStory (Tier 3,
// renamed steerCoverage to avoid an id collision with the existing
// veryhard scenario-signature move) and publicRally ever actually unlock
// before the bot's run ends, across all 16 profile x scenario combos.
function checkTier3JusticeReachability(){
  const N = 150;
  console.log(`\n=== v2 check 1: Justice Tier 3 reachability (steerCoverage / publicRally), ${N} runs per combo ===`);
  let anyLow = false;
  for(const scenario of SCENARIOS){
    for(const profile of PROFILES){
      let steerCount = 0, rallyCount = 0;
      for(let i=0;i<N;i++){
        const S = simulateOneState(profile.id, scenario.id, 'justice');
        if(S.unlockedMoveIds.includes('steerCoverage')) steerCount += 1;
        if(S.unlockedMoveIds.includes('publicRally')) rallyCount += 1;
      }
      const steerPct = (steerCount/N*100).toFixed(0), rallyPct = (rallyCount/N*100).toFixed(0);
      const flag = (steerCount === 0 && rallyCount === 0) ? '  FLAG (neither ever reached)' : '';
      if(flag) anyLow = true;
      console.log(`  ${scenario.id.padEnd(9)}${profile.name.padEnd(16)} steerCoverage=${steerPct}%  publicRally=${rallyPct}%${flag}`);
    }
  }
  if(!anyLow) console.log('  none — every combo reaches at least one Justice Tier 3 move at least once.');
}

// ---- v2 check 2: quiet/patient Escape win rate ----
// A "quiet" bot strategy: only takes Escape-track footprint moves when
// Suspicion is comfortably low, otherwise prefers Rest/neutral filler —
// i.e. optimizes for staying under the radar, not just raw Escape Plan
// speed. Checks whether it can still reach Escape Plan >= 70 (the
// existing attempt-worthy threshold referenced in the task) at a healthy
// rate within each scenario's day budget.
const QUIET_ESCAPE_BOT_MAX_DAYS = 900;
const QUIET_SUSPICION_CEILING = 45; // stays well under the "Watched" tier (40-59)
const QUIET_ATTEMPT_ESCAPE_PLAN = 70;

function quietEscapeStep(S){
  if(S.escapePlan >= QUIET_ATTEMPT_ESCAPE_PLAN && computeEscapeChance(S) >= ESCAPE_BOT_ATTEMPT_THRESHOLD){
    tryAttemptEscape(S);
    return;
  }
  if(S.suspicion >= QUIET_SUSPICION_CEILING){
    runAction(S, 'rest');
    return;
  }
  const escapeOptions = S.todayMoves.filter(id => ACTION_SIDE[id] === 'esc');
  if(escapeOptions.length > 0){
    runAction(S, pickPreferred(escapeOptions, ESCAPE_BASE_IDS));
  } else {
    runAction(S, 'rest');
  }
}

function checkQuietEscapeViability(){
  const N = 150;
  console.log(`\n=== v2 check 2: quiet/patient Escape viability (Suspicion held < ${QUIET_SUSPICION_CEILING}), ${N} runs per combo ===`);
  let anyZero = false;
  for(const scenario of SCENARIOS){
    for(const profile of PROFILES){
      let winCount = 0, avgSuspicionAtWinSum = 0;
      for(let i=0;i<N;i++){
        const profileObj = PROFILES.find(p=>p.id===profile.id);
        const scenarioObj = SCENARIOS.find(s=>s.id===scenario.id);
        const S = newState(profileObj, scenarioObj);
        while(!S.over && S.day < QUIET_ESCAPE_BOT_MAX_DAYS){
          quietEscapeStep(S);
        }
        if(S.ending === 'escape-win'){ winCount += 1; avgSuspicionAtWinSum += S.suspicion; }
      }
      const winPct = (winCount/N*100).toFixed(0);
      const avgSusp = winCount ? (avgSuspicionAtWinSum/winCount).toFixed(0) : '—';
      const flag = winCount === 0 ? '  FLAG (0% quiet-play win rate)' : (winCount/N < 0.2 ? '  FLAG (<20% quiet-play win rate)' : '');
      if(flag) anyZero = true;
      console.log(`  ${scenario.id.padEnd(9)}${profile.name.padEnd(16)} winRate=${winPct}%  avgSuspicionAtWin=${avgSusp}${flag}`);
    }
  }
  if(!anyZero) console.log('  none — quiet/patient play clears 20% Escape win rate in every combo.');
}

// ---------------------------------------------------------------------
// v2 follow-up check: loud vs. paced Justice play. Follow-up bug report —
// a player who greedily takes whichever offered Justice move LOOKS like
// the biggest Evidence gain (the natural reading of each move's own
// description, ignoring Heat entirely) used to see repeated Heat moves
// compound via repMult/trialProximityMult into the 95-100 Heat tier fast,
// whose consequence used to also drain Evidence directly — stacking with
// the independent maybeEvidenceChallenge() mechanic on the same stat.
// EVIDENCE_RANK approximates "what a player reading descriptions would
// judge as the biggest Evidence move that day" (nominal average of each
// move's own rand() range) — not the real stat-scaled amount, since a
// player choosing moves doesn't know profile-factor math either.
// ---------------------------------------------------------------------
const EVIDENCE_RANK = {
  library:6, letters:8.5, reviewTestimony:9.5, studyCaseFile:7,
  pushBackOnDepartment:10.5, pressStatement:12, mentorInmate:4.5,
  scheduleAhead:6.5, contingencyPlan:9, spreadRumor:5.5, steerCoverage:11.5,
  whistleblowerLeak:18, controlTheStory:12.5, keepEveryoneTalking:4
};
const LOUD_HEAT_BACKOFF = 45; // "paced" bot backs off Heat moves above this

function loudJusticeStep(S, paced){
  const justiceOptions = S.todayMoves.filter(id => ACTION_SIDE[id] === 'just');
  let candidates = justiceOptions;
  if(paced && S.heat >= LOUD_HEAT_BACKOFF){
    const nonHeat = justiceOptions.filter(id => FOOTPRINT_HEAT[id] == null);
    if(nonHeat.length > 0) candidates = nonHeat;
  }
  if(candidates.length === 0){ runAction(S, 'rest'); return; }
  let best = candidates[0], bestRank = EVIDENCE_RANK[best] || 0;
  for(const id of candidates){
    const rank = EVIDENCE_RANK[id] || 0;
    if(rank > bestRank){ best = id; bestRank = rank; }
  }
  runAction(S, best);
}

const LOUD_JUSTICE_DAYS = 30; // a realistic "most of a game" horizon, no attempts — isolates end-state chance

function checkLoudJusticeChance(){
  const N = 100;
  console.log(`\n=== v2 follow-up check: loud vs. paced Justice play, end-of-game chance after ${LOUD_JUSTICE_DAYS} days, ${N} runs per combo ===`);
  let anyCollapse = false;
  for(const scenario of SCENARIOS){
    for(const profile of PROFILES){
      let loudChanceSum = 0, pacedChanceSum = 0, loudHeatSum = 0, pacedHeatSum = 0;
      for(let i=0;i<N;i++){
        const Sloud = newState(profile, scenario);
        for(let d=0; d<LOUD_JUSTICE_DAYS && !Sloud.over; d++) loudJusticeStep(Sloud, false);
        loudChanceSum += computeJusticeChance(Sloud);
        loudHeatSum += Sloud.heat;

        const Spaced = newState(profile, scenario);
        for(let d=0; d<LOUD_JUSTICE_DAYS && !Spaced.over; d++) loudJusticeStep(Spaced, true);
        pacedChanceSum += computeJusticeChance(Spaced);
        pacedHeatSum += Spaced.heat;
      }
      const loudChance = (loudChanceSum/N).toFixed(1), pacedChance = (pacedChanceSum/N).toFixed(1);
      const loudHeat = (loudHeatSum/N).toFixed(0), pacedHeat = (pacedHeatSum/N).toFixed(0);
      const flag = loudChanceSum/N < 50 ? '  FLAG (loud play collapses below 50% chance)' : '';
      if(flag) anyCollapse = true;
      console.log(`  ${scenario.id.padEnd(9)}${profile.name.padEnd(16)} loud: chance=${loudChance.padStart(5)} heat=${loudHeat.padStart(3)}   paced: chance=${pacedChance.padStart(5)} heat=${pacedHeat.padStart(3)}${flag}`);
    }
  }
  if(!anyCollapse) console.log('  none — loud (naive highest-Evidence) Justice play stays at or above 50% end-of-game chance in every combo.');
}

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

  checkTier3JusticeReachability();
  checkQuietEscapeViability();
  checkLoudJusticeChance();

  // ---- v2 regression check: Very Hard / Strategist / Escape Elite ----
  console.log(`\n=== v2 regression check: Very Hard / Strategist / Escape reachability (known-fragile combo) ===`);
  const vhStratEscape = results.find(r => r.scenarioId==='veryhard' && r.profileId==='strategist' && r.strategy==='escape');
  console.log(`  Very Hard Strategist Escape win% = ${vhStratEscape.winPct.toFixed(1)}% (baseline was ~0%, expected to remain low but should not have regressed further / gone fully unreachable in a way that differs qualitatively from baseline)`);
}

if(require.main === module) main();

module.exports = {
  PROFILES, SCENARIOS, rampEfficiency, applyDelta, computeJusticeChance, computeEscapeChance,
  newState, runAction, tryPresentCase, tryAttemptEscape, simulateOne, simulateOneState, runBatch,
  computeGrade, runGradeBatch,
  ACTIONS, ACTION_SIDE, getAvailableMovePool, drawTodayMoves, checkMoveUnlocks
};
