'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./engine.js');
const copy = value => JSON.parse(JSON.stringify(value));
function ready(seed = 101) { const state = G.createGame(seed); G.confirmMonthlyPlan(state); return state; }
function advance(state) { if (state.pendingMeet) return G.skipMeet(state); if (state.monthPlanPending) G.confirmMonthlyPlan(state); return G.advanceWeek(state); }

test('nine event-relevant capabilities and ability ranks expose legacy derivations without modifying saves', () => {
  const state = ready(), athlete = state.athletes[0];
  assert.equal(G.STAT_KEYS.length, 9);
  assert.deepEqual(Object.keys(athlete.stats).sort(), [...G.STAT_KEYS].sort());
  const old = copy(athlete); delete old.stats.acceleration; delete old.stats.speedEndurance;
  const snapshot = copy(old);
  assert.equal(G.getStat(old, 'acceleration'), Number((old.stats.speed*.5+old.stats.power*.3+old.stats.agility*.2).toFixed(1)));
  assert.equal(G.getStat(old, 'speedEndurance'), Number((old.stats.speed*.55+old.stats.stamina*.45).toFixed(1)));
  assert.ok(G.predictResult(old,'100m') > 0);
  assert.deepEqual(old,snapshot);
  for (const [value,rank] of [[0,'G'],[19,'G'],[20,'F'],[39,'F'],[40,'E'],[50,'D'],[60,'C'],[70,'B'],[80,'A'],[90,'S'],[100,'S']]) assert.equal(G.getAbilityRank(value),rank);
  for (const event of G.EVENTS) assert.ok(Math.abs(Object.values(event.weights).reduce((a,b)=>a+b,0)-1)<1e-9);
  const before100=G.predictResult(athlete,'100m'), before400=G.predictResult(athlete,'400m');
  athlete.stats.acceleration+=20;
  assert.ok(G.predictResult(athlete,'100m')<before100);
  athlete.stats.speedEndurance+=20;
  assert.ok(G.predictResult(athlete,'400m')<before400);
});

test('a seven-day journey is pure, preserves a 2/3/2 route and rejects malformed edits before mutation', () => {
  const state = ready(), before=copy(state), one=G.getWeekJourney(state);
  assert.deepEqual(G.getWeekJourney(state),one); assert.deepEqual(state,before);
  assert.deepEqual(one.days.map(d=>d.day),[1,2,3,4,5,6,7]);
  assert.deepEqual(one.days.map(d=>d.blockId),['speed','speed','skill','skill','skill','recovery','recovery']);
  assert.equal(one.event.choices.length,3);
  for(const route of [null,[],['speed'],['speed','skill','bogus'],['speed','skill','recovery','load']]) {
    assert.equal(G.setWeekRoute(state,route).ok,false); assert.deepEqual(state,before);
  }
  assert.equal(G.setWeekRoute(state,['mobility','load','recovery']).ok,true);
  assert.equal(G.getWeekJourney(state).forecast.note.includes('10%'),true);
  assert.equal(G.validateSave(state),true);
});

test('ordered blocks create visible training and recovery differences instead of cosmetic route changes', () => {
  const linked=ready(302), separate=copy(linked);
  G.setWeekRoute(linked,['load','skill','recovery']); G.setWeekRoute(separate,['recovery','skill','load']);
  assert.match(G.getWeekJourney(linked).forecast.note,/定着/);
  assert.doesNotMatch(G.getWeekJourney(separate).forecast.note,/定着/);
  const first=G.advanceWeek(linked), second=G.advanceWeek(separate);
  assert.equal(first.ok,true);assert.equal(second.ok,true);
  assert.ok(linked.athletes[0].stats.technique>separate.athletes[0].stats.technique);
  assert.ok(linked.athletes[0].energy>separate.athletes[0].energy);
  assert.equal(linked.week,2);assert.equal(separate.week,2);
});

test('coaching decisions trade team growth for fatigue and individual attention without extra weeks', () => {
  const push=ready(123), care=copy(push), neutral=copy(push), target=push.athletes[0].id;
  for(const state of [push,care,neutral]) { state.athletes.forEach(a=>{a.energy=65;});G.setWeekRoute(state,['load','speed','skill']); }
  const a=G.advanceWeek(push,{decision:'push',athleteId:target}), b=G.advanceWeek(care,{decision:'care',athleteId:target}), c=G.advanceWeek(neutral,{decision:'balanced',athleteId:target});
  for(const result of [a,b,c]) { assert.equal(result.ok,true);assert.equal(result.report.coachedAthleteId,target);assert.equal(result.report.changes.find(c=>c.athleteId===target).coached,true);assert.equal(result.report.highlights.length,3);assert.equal(result.report.before.length,12);assert.equal(result.report.after.length,12); }
  const key=push.athletes[0].focus;
  assert.ok(push.athletes[0].stats[key]>neutral.athletes[0].stats[key]);
  assert.ok(neutral.athletes[0].stats[key]>care.athletes[0].stats[key]);
  assert.ok(push.athletes[0].energy<neutral.athletes[0].energy);assert.ok(neutral.athletes[0].energy<care.athletes[0].energy);
  assert.equal(push.totalWeeks,1);assert.equal(push.week,2);assert.equal(G.validateSave(JSON.stringify(push)),true);
});

test('invalid coaching choices or targets cannot partially train, consume RNG or advance the calendar', () => {
  const state=ready();state.athletes[1].injury=1;const before=copy(state);
  for(const options of [null,[],{decision:'bogus'},{athleteId:'missing'},{athleteId:state.athletes[1].id},{athleteId:null}]) {
    assert.equal(G.advanceWeek(state,options).ok,false);assert.deepEqual(state,before);
  }
  for(const a of state.athletes)a.injury=2;
  assert.equal(G.advanceWeek(state).ok,true,'A team entirely in rehabilitation can always finish a practice week');
});

test('legacy seven-capability players, prospects and alumni migrate together on a successful week', () => {
  const state=ready(77);while(state.year<4)assert.equal(advance(state).ok,true);
  for(const a of [...state.athletes,...state.candidates,...state.career.alumni]) {delete a.stats.acceleration;delete a.stats.speedEndurance;if(['acceleration','speedEndurance'].includes(a.focus))a.focus='speed';}
  state.candidates=state.candidates.filter((a,i)=>i%6<3);delete state.weekRoute;delete state.facilityPlan;
  state.money=345678;
  assert.equal(state.candidates.length,6);assert.equal(G.validateSave(state),true);
  const before=copy(state);G.getWeekJourney(state);G.getFacilityPlan(state);assert.deepEqual(state,before);
  assert.equal(advance(state).ok,true);
  for(const a of [...state.athletes,...state.candidates,...state.career.alumni]) assert.deepEqual(Object.keys(a.stats).sort(),[...G.STAT_KEYS].sort());
  assert.equal(state.money,345678);assert.equal(G.validateSave(state),true);
});

test('school facilities allow two free annual requests plus one earned goal request, and no spending exploit', () => {
  const state=ready(55);state.money=54321;
  assert.deepEqual(G.getFacilityPlan(state),{available:2,used:0,total:2});
  assert.equal(G.getFacilityCost(state,'track'),0);
  assert.equal(G.upgradeFacility(state,'track').ok,true);assert.equal(G.upgradeFacility(state,'recovery').ok,true);
  const exhausted=copy(state);assert.equal(G.upgradeFacility(state,'gym').ok,false);assert.deepEqual(state,exhausted);
  G.chooseSeasonGoal(state,'allRound');while(state.week<5)advance(state);
  for(const a of state.athletes){for(const k of G.STAT_KEYS)a.stats[k]=100;a.energy=100;a.morale=100;a.injury=0;}
  const entries={};for(const a of state.athletes)entries[a.gender+':'+a.event]=a.id;
  assert.equal(G.runMeet(state,entries,'steady').ok,true);
  assert.deepEqual(G.getFacilityPlan(state),{available:1,used:2,total:3});
  assert.equal(G.upgradeFacility(state,'gym').ok,true);assert.equal(G.upgradeFacility(state,'club').ok,false);
  assert.equal(state.money,54321);assert.equal(G.validateSave(state),true);
  while(state.year<2)advance(state);
  assert.deepEqual(G.getFacilityPlan(state),{available:2,used:0,total:2});assert.equal(state.facilities.track,2);
  state.facilities.track=5;const maxed=copy(state);assert.equal(G.upgradeFacility(state,'track').ok,false);assert.deepEqual(state,maxed);
});

test('free scouting requires selecting three of six candidates of each gender and preserves annual admission sizes', () => {
  const state=ready(42);while(state.week<25)advance(state);
  assert.equal(state.candidates.length,12);assert.equal(state.money,0);
  for(const gender of ['boys','girls']) {
    const candidates=G.getCandidates(state).filter(a=>a.gender===gender);assert.equal(candidates.length,6);
    for(const candidate of candidates.slice(0,3))assert.equal(G.scoutAthlete(state,candidate.id).ok,true);
    const full=copy(state);assert.equal(G.scoutAthlete(state,candidates[3].id).ok,false);assert.deepEqual(state,full);
  }
  const ids=state.scouted.map(a=>a.id);while(state.year<2)advance(state);
  assert.equal(state.athletes.filter(a=>a.grade===1).length,12);
  for(const id of ids)assert.equal(state.athletes.find(a=>a.id===id)?.grade,1);
  assert.equal(state.money,0);assert.equal(G.validateSave(state),true);
});

test('week routes, annual facility requests and partial new abilities are validated on import', () => {
  const state=ready();
  const mutations=[s=>{s.weekRoute=['load'];},s=>{s.weekRoute[0]='bogus';},s=>{s.facilityPlan.used=3;},s=>{s.facilityPlan.used=-1;},s=>{s.facilityPlan.year=2;},s=>{delete s.athletes[0].stats.acceleration;},s=>{s.athletes[0].stats.speedEndurance=NaN;},s=>{s.candidates.push(copy(s.candidates[0]));}];
  for(const mutate of mutations){const broken=copy(state);mutate(broken);assert.equal(G.validateSave(broken),false,mutate.toString());}
});

test('old cost-bearing practice-card snapshots still import and remain usable with zero money', () => {
  const state=ready();state.practiceCards=[
    { id:'basic', name:'基礎を積み重ねる', description:'成長と疲労が標準。地道な反復練習。', growth:1, fatigue:1, cost:0, stats:{} },
    { id:'technical', name:'フォーム研究', description:'技術 +0.35、敏捷性 +0.15。疲労は控えめ。', growth:.95, fatigue:.85, cost:0, stats:{technique:.35,agility:.15} },
    { id:'camp', name:'集中強化練習', description:'成長130%、疲労125%。部費8,000円。', growth:1.30, fatigue:1.25, cost:8000, stats:{power:.20} }
  ];
  assert.equal(state.money,0);assert.equal(G.validateSave(state),true);
  assert.equal(G.choosePracticeCard(state,'camp').ok,true);assert.deepEqual(state.weekRoute,['load','load','load']);
  assert.equal(G.advanceWeek(state).ok,true);assert.equal(state.money,0);
  assert.ok(state.practiceCards.every(c=>c.cost===0&&!c.description.includes('部費')));assert.equal(G.validateSave(state),true);
});

test('corrupted journey outcome arrays are rejected while older reports without journey fields remain valid', () => {
  const state=ready();G.advanceWeek(state);
  for(const mutate of [r=>{r.highlights={};},r=>{r.highlights[0].after=101;},r=>{r.rankUps.push({});},r=>{r.before[0].stats={};},r=>{r.changes[0].afterEnergy=-1;}]) {
    const broken=copy(state);mutate(broken.lastReport);assert.equal(G.validateSave(broken),false);
  }
  const legacy=copy(state);for(const key of ['route','decision','decisionText','coachedAthleteId','rankUps','highlights','before','after'])delete legacy.lastReport[key];
  assert.equal(G.validateSave(legacy),true);
  for(const item of [null,{},'bad',{...legacy.lastReport.changes[0],statGains:null},{...legacy.lastReport.changes[0],name:null},{...legacy.lastReport.changes[0],energyChange:NaN}]) {
    const corrupt=copy(legacy);corrupt.lastReport.changes=[item];assert.equal(G.validateSave(corrupt),false,'Legacy reports must also have safe change records');
  }
});

test('coaching a resting athlete preserves their attention highlight without adding physical training gains', () => {
  const state=ready(2026),athlete=state.athletes[0];G.setTraining(state,athlete.id,'rest');athlete.energy=20;
  const before={...athlete.stats},outcome=G.advanceWeek(state,{decision:'care',athleteId:athlete.id});
  assert.equal(outcome.ok,true);assert.deepEqual(athlete.stats,before);assert.ok(athlete.energy>20);
  assert.equal(outcome.report.changes.find(c=>c.athleteId===athlete.id).coached,true);
  assert.equal(outcome.report.highlights[0].athleteId,athlete.id);assert.equal(outcome.report.highlights[0].coached,true);
  assert.ok(outcome.report.decisionText.startsWith(athlete.name+'へ：'));
  assert.equal(G.validateSave(state),true);
});
