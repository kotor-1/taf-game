'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./engine.js');

test('targeted development and pre-meet recovery can win Interhigh through ordinary player actions', () => {
  const state = G.createGame(8);
  let titles = 0, firstTitle = null;
  while (state.year <= 12) {
    if (state.pendingMeet) {
      const entries = {};
      for (const gender of ['boys','girls']) {
        const key = gender + ':100m', division = G.getMeetEvents(state).find(d => d.key === key);
        if (!division) continue;
        const available = G.getEligibleAthletes(state, division).sort((a,b) => Number(G.getEntryStatus(state,b,division).official)-Number(G.getEntryStatus(state,a,division).official) || G.predictResult(a,'100m')-G.predictResult(b,'100m'));
        if (available[0]) entries[key] = available[0].id;
      }
      const result = Object.keys(entries).length ? G.runMeet(state,entries,'aggressive') : G.skipMeet(state);
      assert.equal(result.ok,true);
      for (const race of result.results) if (state.lastMeet.id === 'nationals' && race.medal === 'gold') { titles++; firstTitle ??= state.year; }
      continue;
    }
    if (state.week === 1) { assert.equal(G.validateSave(state),true);G.chooseSeasonGoal(state,'champion'); }
    for (const id of ['recovery','track','club','gym']) while (G.getFacilityPlan(state).available && G.getFacilityCost(state,id) !== null) assert.equal(G.upgradeFacility(state,id).ok,true);
    for (const athlete of state.athletes) {
      G.setTraining(state,athlete.id,athlete.energy<30?'rest':'sprint');
      if (state.monthPlanPending) {
        const weights = G.EVENTS.find(e=>e.id==='100m').weights;
        const marginal = key => weights[key] * (athlete.stats[key]>=95?.18:athlete.stats[key]>=85?.45:athlete.stats[key]>=75?.72:1);
        const focus = Object.keys(weights).sort((a,b)=>marginal(b)-marginal(a))[0];
        G.setFocus(state,athlete.id,focus);
      }
    }
    if (state.monthPlanPending) G.confirmMonthlyPlan(state);
    G.setIntensity(state,'hard'); G.setWeekRoute(state,['load','speed','recovery']);
    // July week 3: sacrifice one week's training to be fresh for Interhigh.
    if (state.week === 15) { for (const a of state.athletes) G.setTraining(state,a.id,'rest');G.setWeekRoute(state,['recovery','recovery','recovery']); }
    if (G.getCalendar(state).month === 10) for (const gender of ['boys','girls']) {
      const prospects = G.getCandidates(state).filter(a=>a.gender===gender).sort((a,b)=>G.getAthleteRating(b,'100m')*b.potential-G.getAthleteRating(a,'100m')*a.potential);
      for (const athlete of prospects) if (state.scouted.filter(a=>a.gender===gender).length<3) assert.equal(G.scoutAthlete(state,athlete.id).ok,true);
    }
    const target = state.athletes.filter(a=>!a.injury&&a.training!=='rest').sort((a,b)=>G.getAthleteRating(b,'100m')-G.getAthleteRating(a,'100m'))[0];
    const averageEnergy = state.athletes.reduce((sum,a)=>sum+a.energy,0)/state.athletes.length;
    assert.equal(G.advanceWeek(state,{decision:averageEnergy<85?'care':'push',...(target?{athleteId:target.id}:{})}).ok,true);
  }
  assert.ok(titles>0,'National victory must be achievable without editing athlete abilities or granting resources');
  assert.ok(firstTitle>1,'A new club must develop beyond its founding season');
  assert.equal(state.money,0);assert.equal(G.validateSave(state),true);
});
