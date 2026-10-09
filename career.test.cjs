'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./engine.js');
const clone = value => JSON.parse(JSON.stringify(value));

function advanceTo(state, week, year = state.year) {
  let turns = 0;
  while (state.week !== week || state.year !== year) {
    if (state.pendingMeet) assert.equal(G.skipMeet(state).ok, true);
    else {
      state.athletes.forEach(a => { a.training = 'rest'; });
      if (state.monthPlanPending) G.confirmMonthlyPlan(state);
      assert.equal(G.advanceWeek(state).ok, true);
    }
    assert.ok(++turns < 5000);
  }
}
function peak(state, rating = 100) {
  for (const a of state.athletes) {
    for (const key of G.STAT_KEYS) a.stats[key] = rating;
    a.energy = 100; a.morale = 100; a.injury = 0;
  }
}
function individualEntries(state) {
  const entries = {}, used = new Set();
  for (const d of G.getMeetEvents(state)) {
    if (d.teamSize) continue;
    const athlete = G.getEligibleAthletes(state, d).find(a => !used.has(a.id));
    if (athlete) { entries[d.key] = athlete.id; used.add(athlete.id); }
  }
  return entries;
}
function boys100(state) { return { 'boys:100m': state.athletes.find(a => a.gender === 'boys').id }; }
function relay(state, gender) { return { [`${gender}:relay`]: state.athletes.filter(a => a.gender === gender).slice(0, 4).map(a => a.id) }; }

test('career getters are non-mutating; annual choices lock after April week1 and reopen next year', () => {
  const s = G.createGame(80), initial = clone(s);
  const view = G.getCareer(s);
  view.season.stats.medals.gold = 99; view.schoolRecords.push({ fake: true });
  assert.deepEqual(s, initial);
  assert.equal(G.chooseSeasonGoal(s, 'relay').ok, true);
  assert.equal(G.setSeasonMode(s, 'challenge').ok, true);
  assert.equal(G.getCareer(s).mode.nationalBonus, 8);
  G.confirmMonthlyPlan(s); G.advanceWeek(s);
  const locked = clone(s);
  assert.equal(G.chooseSeasonGoal(s, 'champion').ok, false);
  assert.equal(G.setSeasonMode(s, 'normal').ok, false);
  assert.deepEqual(s, locked);
  advanceTo(s, 1, 2);
  assert.equal(G.getCareer(s).canChangeGoal, true);
  assert.equal(G.getCareer(s).season.goalId, 'relay');
  assert.equal(G.getCareer(s).season.mode, 'challenge');
  assert.equal(G.chooseSeasonGoal(s, 'allRound').ok, true);
  assert.equal(G.setSeasonMode(s, 'normal').ok, true);
  assert.equal(G.validateSave(s), true);
});

test('all-round goal grants its support fund once, independently of tournament prizes', () => {
  const s = G.createGame(1); G.chooseSeasonGoal(s, 'allRound'); advanceTo(s, 5); peak(s);
  const money = s.money, result = G.runMeet(s, individualEntries(s), 'steady');
  assert.equal(result.ok, true);
  assert.equal(result.summary.careerReward, 60000);
  assert.equal(s.money, money + result.summary.prize + 60000);
  assert.equal(G.getCareer(s).goal.achieved, true);
  assert.equal(G.getCareer(s).lifetime.goalsAchieved, 1);
  assert.match(result.summary.careerMessage, /年度目標/);
  advanceTo(s, 7); peak(s);
  assert.equal(G.runMeet(s, individualEntries(s), 'steady').summary.careerReward, 0);
  assert.equal(G.getCareer(s).lifetime.goalsAchieved, 1);
  assert.equal(G.validateSave(s), true);
});

test('individual personal-best goal counts first marks and spec improvements, excluding open marks', () => {
  const s = G.createGame(2); advanceTo(s, 5); peak(s, 85);
  const district = G.runMeet(s, individualEntries(s), 'steady');
  assert.equal(district.ok, true);
  assert.ok(district.results.every(result => result.qualified), 'The fixture qualifies all twelve entrants for their second official marks');
  assert.equal(G.getCareer(s).goal.current, 12);
  advanceTo(s, 7); peak(s);
  const result = G.runMeet(s, individualEntries(s), 'steady');
  assert.equal(result.summary.careerReward, 50000);
  assert.equal(G.getCareer(s).goal.current, 24);
  const open = G.createGame(3); advanceTo(open, 7); peak(open);
  const openResult = G.runMeet(open, individualEntries(open), 'steady');
  assert.ok(openResult.results.every(r => !r.official && !r.schoolRecord));
  assert.equal(G.getCareer(open).goal.current, 0);
  assert.equal(G.getCareer(open).schoolRecords.length, 0);
});

test('relay goal needs both genders, with four named record holders retained', () => {
  const s = G.createGame(4); G.chooseSeasonGoal(s, 'relay'); advanceTo(s, 5); peak(s);
  G.runMeet(s, relay(s, 'boys'), 'steady');
  assert.equal(G.getCareer(s).goal.current, 1);
  assert.equal(G.getCareer(s).goal.rewarded, false);
  advanceTo(s, 7); peak(s);
  const open = G.runMeet(s, relay(s, 'girls'), 'steady');
  assert.equal(open.results[0].official, false);
  assert.equal(G.getCareer(s).goal.current, 1);
  advanceTo(s, 21); peak(s);
  assert.equal(G.runMeet(s, relay(s, 'girls'), 'steady').summary.careerReward, 60000);
  const records = G.getCareer(s).schoolRecords.filter(r => r.eventId === 'relay');
  assert.equal(records.length, 2);
  assert.ok(records.every(r => r.members.length === 4 && r.athleteIds.length === 4 && r.members.every(m => m.name)));
  assert.equal(G.validateSave(s), true);
});

for (const { goalId, seed, tactic, titles } of [
  { goalId: 'interhigh', seed: 5, tactic: 'steady', titles: 0 },
  { goalId: 'champion', seed: 1, tactic: 'aggressive', titles: 1 }
]) test(`${goalId} goal requires an official Interhigh appearance/result`, () => {
  const s = G.createGame(seed); G.chooseSeasonGoal(s, goalId);
  for (const week of [5, 7, 11]) {
    advanceTo(s, week); peak(s); G.runMeet(s, boys100(s), 'steady');
    assert.equal(G.getCareer(s).goal.rewarded, false);
  }
  advanceTo(s, 16); peak(s);
  const result = G.runMeet(s, boys100(s), tactic);
  assert.equal(result.results[0].official, true);
  assert.equal(result.results[0].medal === 'gold', titles === 1, 'Appearance and championship goals exercise distinct outcomes');
  assert.equal(result.summary.careerReward, goalId === 'interhigh' ? 80000 : 100000);
  assert.equal(G.getCareer(s).lifetime.interhighTitles, titles);
  assert.equal(G.getCareer(s).lifetime.currentStreak, titles);
  assert.equal(G.validateSave(s), true);
});

test('indoor goal uses official age/standard-qualified results, not an outdoor medal', () => {
  const s = G.createGame(6); G.chooseSeasonGoal(s, 'indoor');
  advanceTo(s, 5); peak(s);
  G.runMeet(s, boys100(s), 'steady');
  assert.equal(G.getCareer(s).goal.current, 0);
  advanceTo(s, 41); peak(s);
  const runner = s.athletes.find(a => a.gender === 'boys');
  assert.equal(G.getEntryStatus(s, runner, 'boys:60m').official, true);
  const result = G.runMeet(s, { 'boys:60m': runner.id }, 'steady');
  assert.equal(result.summary.careerReward, 80000);
  assert.equal(G.getCareer(s).goal.current, 1);
  assert.ok(G.getCareer(s).schoolRecords.some(r => r.eventId === '60m'));
  assert.equal(G.validateSave(s), true);
});

test('school records separate gender and hurdle height and survive graduation', () => {
  const s = G.createGame(7), boy = s.athletes[3], girl = s.athletes[9];
  advanceTo(s, 5); peak(s);
  G.runMeet(s, { 'boys:110mh': boy.id, 'girls:100mh': girl.id }, 'steady');
  advanceTo(s, 27); peak(s);
  assert.equal(G.runMeet(s, { 'boys:110mh': boy.id, 'girls:100mh': girl.id }, 'steady').ok, true);
  const keys = G.getCareer(s).schoolRecords.map(r => r.key).sort();
  assert.deepEqual(keys, ['boys:110mh:0.991', 'boys:110mh:1.067', 'girls:100mh:0.762', 'girls:100mh:0.838']);
  const records = clone(G.getCareer(s).schoolRecords);
  advanceTo(s, 1, 4);
  assert.deepEqual(G.getCareer(s).schoolRecords, records);
  assert.equal(s.athletes.some(a => a.id === boy.id), false);
  const graduate = G.getCareer(s).alumni.find(a => a.id === boy.id);
  assert.equal(graduate.graduationYear, 3);
  assert.equal(graduate.name, boy.name);
  assert.ok(graduate.bestBySpec['110mh:1.067']);
  assert.equal(G.getCareer(s).lifetime.graduates, 12);
  assert.equal(G.validateSave(s), true);
});

test('challenge raises rivals by4 locally and8 nationally but preserves player performance and mark mode', () => {
  const normal = G.createGame(8), challenge = G.createGame(8);
  G.setSeasonMode(challenge, 'challenge');
  for (const week of [5, 7, 11, 16]) {
    for (const s of [normal, challenge]) { advanceTo(s, week); peak(s); }
    const normalField = G.getMeetField(normal, 'boys:100m'), challengeField = G.getMeetField(challenge, 'boys:100m');
    assert.equal(challengeField.cutoffRating - normalField.cutoffRating, week === 16 ? 8 : 4);
    assert.equal(challengeField.participants, normalField.participants);
    const a = G.runMeet(normal, boys100(normal), 'steady').results[0];
    const b = G.runMeet(challenge, boys100(challenge), 'steady').results[0];
    assert.equal(a.value, b.value);
    for (const rival of a.participants.filter(p => !p.isPlayer)) {
      const other = b.participants.find(p => p.athleteId === rival.athleteId);
      assert.ok(other, 'Both modes feature the same opponents');
      assert.ok(other.value < rival.value, 'Challenge mode improves every opponent without relying on a linear record coefficient');
    }
    assert.equal(challenge.lastMeet.mode, 'challenge');
    assert.ok(G.getCareer(challenge).schoolRecords.every(r => r.mode === 'challenge'));
  }
  assert.equal(G.validateSave(challenge), true);
});

test('legacy v2 restores only available history without changing data on read or fabricating alumni', () => {
  const s = G.createGame(9); advanceTo(s, 5); peak(s); G.runMeet(s, boys100(s), 'steady'); advanceTo(s, 1, 4);
  delete s.career;
  for (const meet of [...s.history, s.lastMeet].filter(Boolean)) {
    delete meet.mode; delete meet.summary.careerMessage; delete meet.summary.careerReward;
    for (const result of meet.results) { delete result.schoolRecord; delete result.personalBest; }
  }
  const original = clone(s), view = G.getCareer(s);
  assert.equal(G.validateSave(s), true);
  assert.deepEqual(s, original);
  assert.equal(view.migrated, true);
  assert.equal(view.alumni.length, 0);
  assert.equal(view.schoolRecords.length, 1);
  assert.ok(view.seasons.every(season => season.partial && season.goalId === null && season.reward === 0));
  assert.equal(G.setFocus(s, s.athletes[0].id, 'mental').ok, true);
  assert.ok(s.career);
  assert.equal(G.validateSave(s), true);
});

test('35-year history is bounded while lifetime totals and yearly resets remain correct', () => {
  const s = G.createGame(10);
  advanceTo(s, 1, 36);
  const c = G.getCareer(s);
  assert.equal(c.seasons.length, 30);
  assert.equal(c.seasons[0].year, 35);
  assert.equal(c.seasons[29].year, 6);
  assert.equal(c.alumni.length, 60);
  assert.equal(c.lifetime.completedSeasons, 35);
  assert.equal(c.lifetime.graduates, 33 * 12);
  assert.equal(c.season.stats.meetCount, 0);
  assert.equal(c.season.goalRewarded, false);
  assert.equal(G.validateSave(s), true);
});

test('a legacy goal recovered after the last meet is paid once at year end and archived as achieved', () => {
  const legacy = G.createGame(12);
  // Choose a different, unfulfilled goal while building the legacy history,
  // so this fixture has never received a goal reward.
  G.chooseSeasonGoal(legacy, 'indoor');
  advanceTo(legacy, 5); peak(legacy, 75); G.runMeet(legacy, individualEntries(legacy), 'steady');
  advanceTo(legacy, 7); peak(legacy); G.runMeet(legacy, individualEntries(legacy), 'steady');
  advanceTo(legacy, 48);
  delete legacy.career;
  const beforeRead = clone(legacy), recovered = G.getCareer(legacy);
  assert.equal(recovered.goal.achieved, true);
  assert.equal(recovered.goal.rewarded, false);
  assert.deepEqual(legacy, beforeRead);
  assert.equal(G.validateSave(legacy), true);
  const alreadyPaid = clone(legacy);
  alreadyPaid.career = clone(recovered);
  delete alreadyPaid.career.goal; delete alreadyPaid.career.mode;
  delete alreadyPaid.career.canChangeGoal; delete alreadyPaid.career.canChangeMode;
  alreadyPaid.career.season.goalRewarded = true;
  alreadyPaid.career.season.goalAchievedWeek = 7;
  alreadyPaid.career.lifetime.goalsAchieved = 1;
  const unpaidMoney = legacy.money;
  for (const s of [legacy, alreadyPaid]) if (s.monthPlanPending) G.confirmMonthlyPlan(s);
  const paidAtYearEnd = G.advanceWeek(legacy), noDuplicate = G.advanceWeek(alreadyPaid);
  assert.equal(paidAtYearEnd.ok, true);
  assert.equal(noDuplicate.ok, true);
  assert.equal(legacy.money - alreadyPaid.money, 50000);
  assert.equal(legacy.money - unpaidMoney, paidAtYearEnd.report.balance);
  assert.equal(paidAtYearEnd.report.income - noDuplicate.report.income, 50000);
  assert.ok(paidAtYearEnd.report.events.some(text => text.includes('年度目標') && text.includes('50,000')));
  assert.equal(noDuplicate.report.events.some(text => text.includes('年度目標')), false);
  assert.equal(legacy.career.seasons[0].achieved, true);
  assert.equal(legacy.career.seasons[0].reward, 50000);
  assert.equal(legacy.career.lifetime.goalsAchieved, 1);
  assert.equal(legacy.career.season.goalRewarded, false);
  assert.equal(G.validateSave(legacy), true);
  assert.equal(G.validateSave(alreadyPaid), true);
});

test('malformed optional career structures cannot be imported', () => {
  const s = G.createGame(11); advanceTo(s, 5); peak(s); G.runMeet(s, boys100(s), 'steady'); advanceTo(s, 1, 4);
  for (const mutate of [
    c => { c.version = 2; }, c => { c.season.year++; }, c => { c.season.mode = 'cheat'; },
    c => { c.season.goalId = 'cheat'; }, c => { c.season.stats.personalBests = 999; },
    c => { c.season.goalRewarded = true; c.season.goalAchievedWeek = 1; },
    c => { c.schoolRecords[0].key = 'girls:100m'; }, c => { c.schoolRecords[0].mode = 'cheat'; },
    c => { c.schoolRecords.push(clone(c.schoolRecords[0])); }, c => { c.schoolRecords[0].week = 48; },
    c => { c.alumni[0].stats.speed = 101; }, c => { c.alumni.push(clone(c.alumni[0])); },
    c => { c.seasons[0].reward = 999999; }, c => { c.seasons.push(clone(c.seasons[0])); },
    c => { c.lifetime.completedSeasons = 1000; }, c => { c.lifetime.currentStreak = 999; }
  ]) {
    const invalid = clone(s); mutate(invalid.career);
    assert.equal(G.validateSave(invalid), false, mutate.toString());
  }
});
