'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const fs=require('node:fs');
const path=require('node:path');
const G=require('./engine.js');

// Exercise public player actions only. No boosted stats, forced wins, or free money.
const requestedYears=Number(process.env.LONG_RUN_YEARS||128);
assert.ok(Number.isSafeInteger(requestedYears)&&requestedYears>0,'LONG_RUN_YEARS must be a positive finite integer');
const YEARS=Math.max(101,requestedYears);
const STRATEGIES=[
  {id:'adaptive',seed:2048,intensity:'normal',restAt:48,scout:6,invest:['recovery','club','track','gym'],reserve:70000,tactic:'steady'},
  {id:'overtraining',seed:8675309,intensity:'hard',restAt:0,scout:4,invest:['track','gym','club','recovery'],reserve:25000,tactic:'aggressive'},
  {id:'frugal',seed:131071,intensity:'easy',restAt:72,scout:2,invest:[],reserve:100000,tactic:'balanced'},
];
function success(result,label){assert.equal(result.ok,true,label+': '+result.message);return result;}
function rosterChecks(state){
  const count=Math.min(state.year,3)*12;
  assert.equal(state.athletes.length,count);
  assert.equal(new Set(state.athletes.map(a=>a.id)).size,count);
  assert.equal(state.totalWeeks,(state.year-1)*48+state.week-1);
  for(const gender of ['boys','girls']){
    for(let grade=1;grade<=Math.min(state.year,3);grade++)assert.equal(state.athletes.filter(a=>a.gender===gender&&a.grade===grade).length,6);
  }
  for(const athlete of state.athletes){
    assert.ok(athlete.grade>=1&&athlete.grade<=3);
    for(const key of G.STAT_KEYS)assert.ok(Number.isFinite(athlete.stats[key])&&athlete.stats[key]>=0&&athlete.stats[key]<=100);
    for(const key of ['energy','morale'])assert.ok(Number.isFinite(athlete[key])&&athlete[key]>=0&&athlete[key]<=100);
    assert.ok(Number.isInteger(athlete.injury)&&athlete.injury>=0&&athlete.injury<=3);
    assert.ok(Object.keys(athlete.best).length<=G.EVENTS.length);
    assert.ok(Object.keys(athlete.officialRecords||{}).length<=G.EVENTS.length*2);
    for(const years of Object.values(athlete.officialRecords||{}))assert.ok(Object.keys(years).length<=4);
  }
  assert.ok(Number.isFinite(state.money)&&state.money>=0);
  assert.ok(state.logs.length<=100&&state.history.length<=60&&state.candidates.length===6&&state.scouted.length<=6);
  assert.ok(state.pendingMeets.length<=1&&state.completedMeets.length<=G.MEETS.length&&state.competedThisWeek.length<=36);
  if(state.career){
    assert.equal(state.career.season.year,state.year);
    assert.ok(state.career.alumni.length<=60&&state.career.seasons.length<=30,'career archives must stay bounded');
    assert.equal(new Set(state.career.seasons.map(s=>s.year)).size,state.career.seasons.length);
    for(const key of ['podiumDivisions','relayPodiums'])assert.equal(new Set(state.career.season.stats[key]).size,state.career.season.stats[key].length,'annual event achievements cannot be counted twice');
    for(const value of Object.values(state.career.lifetime))assert.ok(value===null||Number.isSafeInteger(value)&&value>=0,'lifetime counters must remain safe integers');
  }
}
function entriesFor(state,strategy){
  const entries={},used=new Set(),divisions=G.getMeetEvents(state);
  // Less common jumps go first in alternate years, exercising different event paths.
  const ordered=state.year%2?divisions:[...divisions].reverse();
  for(const division of ordered.filter(d=>!d.teamSize)){
    const available=G.getEligibleAthletes(state,division).filter(a=>!used.has(a.id));
    available.sort((a,b)=>Number(G.getEntryStatus(state,b,division).official)-Number(G.getEntryStatus(state,a,division).official)
      ||(G.getAthleteRating(b,division.id)*(0.8+b.energy*.002))-(G.getAthleteRating(a,division.id)*(0.8+a.energy*.002)));
    const athlete=available[0];if(athlete){entries[division.key]=athlete.id;used.add(athlete.id);}
  }
  for(const division of divisions.filter(d=>d.teamSize)){
    const available=G.getEligibleAthletes(state,division).sort((a,b)=>G.getAthleteRating(b,'relay')-G.getAthleteRating(a,'relay'));
    if(available.length>=4){const team=available.slice(0,4);if(strategy.id==='adaptive')team.sort((a,b)=>a.stats.speed-b.stats.speed);entries[division.key]=team.map(a=>a.id);}
  }
  return entries;
}
function trainingWeek(state,strategy){
  if(state.week===1&&G.chooseSeasonGoal){
    const goal=G.CAREER_GOALS[(state.year-1)%G.CAREER_GOALS.length];
    success(G.chooseSeasonGoal(state,goal.id),'annual goal');
    success(G.setSeasonMode(state,strategy.id==='overtraining'||strategy.id==='adaptive'&&state.year%2===0?'challenge':'normal'),'season difficulty');
  }
  success(G.setIntensity(state,strategy.intensity),'intensity');
  if(state.monthPlanPending){
    for(const athlete of state.athletes){
      const target=G.EVENTS.find(e=>e.id===athlete.event);
      const focus=strategy.id==='frugal'?'balanced':Object.entries(target.weights).sort((a,b)=>b[1]*(105-athlete.stats[b[0]])-a[1]*(105-athlete.stats[a[0]]))[0][0];
      success(G.setFocus(state,athlete.id,focus),'monthly focus');
    }
    success(G.confirmMonthlyPlan(state),'monthly confirmation');
  }
  for(const athlete of state.athletes)success(G.setTraining(state,athlete.id,athlete.injury||athlete.energy<strategy.restAt?'rest':G.getDefaultTraining(athlete.event)),'training');
  const priorities=strategy.id==='overtraining'?['camp','technical','teamwork','mobility','basic','condition']:strategy.id==='adaptive'?['technical','mobility','teamwork','condition','basic','camp']:['condition','teamwork','mobility','technical','basic','camp'];
  const card=priorities.map(id=>state.practiceCards.find(c=>c.id===id)).find(c=>c&&state.money>=c.cost+strategy.reserve)||state.practiceCards.find(c=>c.id==='basic');
  success(G.choosePracticeCard(state,card.id),'practice card');
  for(const id of strategy.invest){const cost=G.getFacilityCost(state,id);if(cost!==null&&state.money>=cost+strategy.reserve)success(G.upgradeFacility(state,id),'facility investment');}
}
function runCampaign(strategy,years){
  let state=G.createGame(strategy.seed);const started=performance.now();
  const metrics={strategy:strategy.id,years,weeks:0,meets:0,entered:0,skipped:0,scouts:0,graduates:0,injuries:0,results:0,indoorStarts:0,maxBytes:0,maxStoredChars:0,validationMs:0};
  const divisionCoverage=new Set(),meetCoverage=new Set(),scoutedIds=new Set();
  function validate(label){const start=performance.now();assert.equal(G.validateSave(state),true,`${strategy.id}: ${label}, year ${state.year}, week ${state.week}`);metrics.validationMs+=performance.now()-start;}
  validate('start');
  while(state.totalWeeks<years*48){
    rosterChecks(state);
    if(G.getCalendar(state).month===10&&state.scouted.length<strategy.scout){
      const candidates=G.getCandidates(state).sort((a,b)=>strategy.id==='adaptive'?b.potential-a.potential:a.cost-b.cost);
      for(const candidate of candidates){
        if(state.scouted.length>=strategy.scout)break;
        if(state.money>=candidate.cost+strategy.reserve){assert.ok(!scoutedIds.has(candidate.id),'a later cohort must never reuse a scouting ID');success(G.scoutAthlete(state,candidate.id),'October scouting');scoutedIds.add(candidate.id);metrics.scouts++;}
      }
    }
    if(state.pendingMeet){
      const id=state.pendingMeet.id,indoor=state.pendingMeet.kind==='indoor',entries=entriesFor(state,strategy);
      const outcome=Object.keys(entries).length?success(G.runMeet(state,entries,strategy.tactic),'meet '+id):success(G.skipMeet(state),'skip '+id);
      metrics.meets++;if(Object.keys(entries).length){metrics.entered++;meetCoverage.add(id);}else metrics.skipped++;
      metrics.results+=outcome.results.length;if(indoor)metrics.indoorStarts+=outcome.results.length;
      for(const r of outcome.results){divisionCoverage.add(r.divisionKey);assert.ok(Number.isFinite(r.value));assert.equal(r.participants.length,G.getMeetField(state,r.divisionKey,id).participants);assert.equal(r.fieldSize,r.participants.length);}
      validate('meet '+id);
      continue;
    }
    trainingWeek(state,strategy);
    const previousYear=state.year,oldRoster=state.athletes.map(a=>({id:a.id,grade:a.grade})),committed=state.scouted.map(a=>a.id);
    const outcome=success(G.advanceWeek(state),'advance');metrics.weeks++;metrics.injuries+=outcome.report.changes.filter(c=>c.injury>0).length;
    if(state.year!==previousYear){
      const graduates=oldRoster.filter(a=>a.grade===3);metrics.graduates+=graduates.length;
      assert.equal(state.year,previousYear+1);assert.equal(state.week,1);assert.equal(state.athletes.length,Math.min(state.year,3)*12);
      for(const a of graduates)assert.ok(!state.athletes.some(b=>b.id===a.id));
      for(const a of oldRoster.filter(a=>a.grade<3))assert.equal(state.athletes.find(b=>b.id===a.id)?.grade,a.grade+1);
      for(const id of committed)assert.equal(state.athletes.find(a=>a.id===id)?.grade,1,'scouted athlete must join next April');
      assert.equal(state.scouted.length,0);assert.equal(state.recruitedIds.length,0);
      if(state.career){
        assert.equal(state.career.lifetime.completedSeasons,previousYear);
        assert.equal(state.career.lifetime.graduates,metrics.graduates);
        assert.equal(state.career.seasons.length,Math.min(previousYear,30));
        assert.equal(state.career.alumni.length,Math.min(metrics.graduates,60));
      }
      validate('year rollover');
      const serialized=JSON.stringify(state);metrics.maxBytes=Math.max(metrics.maxBytes,Buffer.byteLength(serialized));metrics.maxStoredChars=Math.max(metrics.maxStoredChars,serialized.length);
      // Resume from an actual export every year, not just the in-memory object.
      state=JSON.parse(serialized);assert.equal(G.validateSave(state),true,'export/reload must retain a valid playable state');
    }
  }
  rosterChecks(state);validate('final');
  assert.equal(state.year,years+1);assert.equal(state.week,1);assert.equal(metrics.meets,years*G.MEETS.length);
  assert.equal(metrics.graduates,Math.max(0,years-2)*12);assert.ok(metrics.scouts>years,'scouting actually exercised for over a century');
  for(const gender of ['boys','girls'])for(const event of G.EVENTS.filter(e=>!e.indoor&&(!e.gender||e.gender===gender)))assert.ok(divisionCoverage.has(gender+':'+event.id),'every outdoor gendered event must be exercised');
  assert.ok(metrics.maxBytes<20*1024*1024,'cloud save must fit the documented 20 MiB limit');
  if(strategy.id==='adaptive')assert.ok(metrics.indoorStarts>0,'adaptive strategy must reach indoor competition naturally');assert.ok(state.nextAthleteId>1500);assert.ok(state.history.length===60);
  metrics.seconds=Number(((performance.now()-started)/1000).toFixed(2));metrics.validationMs=Math.round(metrics.validationMs);metrics.finalMoney=state.money;metrics.medals=state.medals;metrics.meetCoverage=[...meetCoverage];metrics.divisionCoverage=[...divisionCoverage];metrics.facilities=state.facilities;
  if(state.career)metrics.career={lifetime:state.career.lifetime,schoolRecords:state.career.schoolRecords.length,alumni:state.career.alumni.length,seasons:state.career.seasons.length};
  return {state,metrics};
}
for(const strategy of STRATEGIES)test(`${strategy.id}: ${YEARS} complete school years preserve cohorts, saves, scouting and competitions`,t=>{
  const {state,metrics}=runCampaign(strategy,YEARS);t.diagnostic(JSON.stringify(metrics));
  if(process.env.LONG_RUN_ARTIFACT_DIR){fs.mkdirSync(process.env.LONG_RUN_ARTIFACT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.LONG_RUN_ARTIFACT_DIR,strategy.id+'.json'),JSON.stringify(state));}
});

function advanceWithoutCompetition(state){
  if(state.pendingMeet)return success(G.skipMeet(state),'boundary meet');
  if(state.monthPlanPending)success(G.confirmMonthlyPlan(state),'boundary monthly plan');
  return success(G.advanceWeek(state),'boundary week');
}
function oldFormatAtYear(year){
  const state=G.createGame(20261008);
  while(state.year<3)advanceWithoutCompetition(state);
  const offset=year-state.year;
  state.year=year;state.totalWeeks=(year-1)*48;
  for(const athlete of [...state.athletes,...state.candidates])athlete.birthYear+=offset;
  // Recreate an existing v2 save from before career tracking was introduced.
  delete state.career;
  return state;
}
test('a playable legacy club crosses year 10000 without becoming an invalid save',()=>{
  const state=oldFormatAtYear(10000);assert.equal(G.validateSave(state),true);
  while(state.year===10000)advanceWithoutCompetition(state);
  assert.equal(state.year,10001);assert.equal(state.week,1);assert.equal(state.athletes.length,36);
  assert.equal(state.totalWeeks,480000);assert.equal(G.validateSave(state),true);
  assert.equal(G.validateSave(JSON.stringify(state)),true);
  assert.equal(G.getCalendar(state).calendarYear,G.START_YEAR+10000);
});
test('week and athlete counters can cross the former one-billion validation limit',()=>{
  const state=oldFormatAtYear(20833335);state.nextAthleteId=1000000001;
  assert.ok(state.totalWeeks>1e9);assert.equal(G.validateSave(state),true);
  const year=state.year;while(state.year===year)advanceWithoutCompetition(state);
  assert.ok(state.athletes.some(a=>Number(a.id.slice(8))>1e9));assert.ok(state.totalWeeks>1e9);
  assert.equal(G.validateSave(state),true);assert.equal(G.validateSave(JSON.stringify(state)),true);
});
test('large treasuries and medal totals remain safe through real weekly and meet rewards',()=>{
  const state=G.createGame(17);state.money=1e12;state.medals.gold=1e9;
  assert.equal(G.validateSave(state),true);while(state.week<5)advanceWithoutCompetition(state);
  const runner=state.athletes.find(a=>a.gender==='boys');for(const key of G.STAT_KEYS)runner.stats[key]=100;runner.energy=100;runner.morale=100;runner.injury=0;
  success(G.runMeet(state,{'boys:100m':runner.id},'steady'),'large-counter meet');
  assert.ok(state.money>1e12);assert.equal(state.medals.gold,1000000001);assert.equal(G.validateSave(state),true);
  state.money=Number.MAX_SAFE_INTEGER-1;state.medals.gold=Number.MAX_SAFE_INTEGER;
  while(state.week<7)advanceWithoutCompetition(state);
  success(G.runMeet(state,{'boys:100m':runner.id},'steady'),'safe-integer cap meet');
  assert.ok(Number.isSafeInteger(state.money));assert.ok(state.money<=Number.MAX_SAFE_INTEGER);assert.equal(state.medals.gold,Number.MAX_SAFE_INTEGER);assert.equal(G.validateSave(state),true);
});

module.exports={runCampaign,STRATEGIES};
