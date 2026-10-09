'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./engine.js');
const clone = value => JSON.parse(JSON.stringify(value));

function atMeet(seed = 1, id = 'district') {
  const state = G.createGame(seed), target = G.MEETS.find(meet => meet.id === id);
  while (state.week < target.week || state.pendingMeet?.id !== id) {
    if (state.pendingMeet) assert.equal(G.skipMeet(state).ok, true);
    else {
      if (state.monthPlanPending) assert.equal(G.confirmMonthlyPlan(state).ok, true);
      state.athletes.forEach(athlete => { athlete.training = 'rest'; });
      assert.equal(G.advanceWeek(state).ok, true);
    }
  }
  return state;
}
function setRating(athlete, rating) {
  G.STAT_KEYS.forEach(key => { athlete.stats[key] = rating; });
  athlete.energy = 100; athlete.morale = 80; athlete.injury = 0;
}
function enter(state, key, rating = 75) {
  const gender = key.split(':')[0], division = G.getMeetEvents(state).find(item => item.key === key);
  const athletes = state.athletes.filter(athlete => athlete.gender === gender).slice(0, division.teamSize || 1);
  athletes.forEach(athlete => setRating(athlete, rating));
  if (state.qualification[state.pendingMeet.id] !== true) {
    state.qualification[state.pendingMeet.id][key] = division.teamSize ? true : [athletes[0].id];
  }
  const selection = division.teamSize ? athletes.map(athlete => athlete.id) : athletes[0].id;
  const outcome = G.runMeet(state, { [key]: selection }, 'steady');
  assert.equal(outcome.ok, true, outcome.message);
  return outcome.results[0];
}
function changeResults(state, change) {
  for (const meet of [...state.history, state.lastMeet].filter(Boolean)) meet.results.forEach(change);
}

test('competition fields have enough athletes and schools at each stage, with separate advancement quotas', () => {
  const state = G.createGame(11);
  const expected = {
    district: { '100m': [48, 24, 16], highjump: [24, 16, 8], relay: [24, 24, 8] },
    prefecture: { '100m': [64, 40, 6], highjump: [32, 24, 6], relay: [32, 32, 6] },
    regional: { '100m': [48, 36, 6], highjump: [32, 24, 6], relay: [24, 24, 6] },
    nationals: { '100m': [64, 56, 0], highjump: [40, 32, 0], relay: [48, 48, 0] }
  };
  for (const [meet, events] of Object.entries(expected)) {
    for (const [event, counts] of Object.entries(events)) {
      for (const gender of ['boys', 'girls']) {
        const key = gender + ':' + event, field = G.getMeetField(state, key, meet);
        assert.deepEqual([field.participants, field.schools, field.qualifyPlaces], counts, meet + ' ' + key);
        const division = G.getMeetEvents(state, meet).find(item => item.key === key);
        assert.deepEqual(G.getMeetField(state, division, meet), field, 'Division objects and keys describe the same field');
        if (field.qualifyPlaces) assert.ok(Number.isFinite(field.benchmark) && field.benchmark > 0);
        else assert.equal(field.benchmark, null, 'Final championships have no next-stage qualifying mark');
      }
    }
  }
});

test('district 100m advancement consistently requires roughly 11.4 for boys and 13.2 for girls', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const [gender, target] of [['boys', 11.4], ['girls', 13.2]]) {
      const state = atMeet(seed), result = enter(state, gender + ':100m', 25);
      assert.equal(result.qualified, false);
      assert.equal(result.qualificationPlaces, 16);
      const cutoff = result.participants[result.qualificationPlaces - 1].value;
      assert.ok(Math.abs(cutoff - target) <= .080001, `${gender} seed ${seed}: ${cutoff} versus ${target}`);
      assert.equal(result.qualificationMark, cutoff);
    }
  }
});

test('all individual and relay performance curves improve with ability for both genders', () => {
  const state = G.createGame(55);
  for (const gender of ['boys', 'girls']) {
    const athletes = state.athletes.filter(athlete => athlete.gender === gender), athlete = athletes[0];
    for (const event of G.EVENTS.filter(item => !item.gender || item.gender === gender)) {
      const marks = [];
      for (let rating = 0; rating <= 100; rating++) {
        athletes.forEach(item => setRating(item, rating));
        const mark = event.teamSize ? G.predictRelayResult(state, athletes.slice(0, 4).map(item => item.id)) : G.predictResult(athlete, event.id);
        assert.ok(Number.isFinite(mark) && mark > 0, gender + ' ' + event.id + ' ' + rating);
        if (marks.length) assert.ok(event.lowerBetter ? mark <= marks.at(-1) : mark >= marks.at(-1), gender + ' ' + event.id + ' must be monotonic');
        marks.push(mark);
      }
      assert.notEqual(marks[0], marks.at(-1), gender + ' ' + event.id + ' must reward development');
    }
    setRating(athlete, 75);
    assert.equal(G.predictResult(athlete, '100m'), gender === 'boys' ? 11.4 : 13.2);
    setRating(athlete, 100);
    assert.ok(G.predictResult(athlete, '1500m') < (gender === 'boys' ? 230 : 270), 'Developed distance runners can reach the national-level game profile');
  }
});

test('development makes district advancement possible without giving beginners automatic qualification', () => {
  for (let seed = 1; seed <= 12; seed++) {
    for (const key of ['boys:100m', 'girls:100m', 'boys:highjump', 'girls:highjump', 'boys:relay', 'girls:relay']) {
      const beginner = atMeet(seed), developed = clone(beginner);
      const low = enter(beginner, key, 40), high = enter(developed, key, 90);
      assert.equal(low.qualified, false, key + ' beginner');
      assert.equal(high.qualified, true, key + ' developed');
      assert.ok(high.rank < low.rank);
      assert.equal(high.medal, high.rank <= 3 ? ['gold', 'silver', 'bronze'][high.rank - 1] : null);
      assert.ok(G.getEntryStatus(developed, developed.athletes.find(athlete => athlete.id === high.athleteId), key, 'prefecture').official);
      assert.equal(G.validateSave(developed), true);
    }
  }
});

test('large fields have named athletes, real school counts, and consistent tied rankings and qualification', () => {
  let ties = 0, qualifiedOutsidePodium = 0;
  for (let seed = 1; seed <= 16; seed++) {
    for (const [meet, key] of [['district', 'boys:100m'], ['district', 'girls:highjump'], ['prefecture', 'girls:100m'], ['regional', 'boys:relay'], ['nationals', 'boys:100m']]) {
      const state = atMeet(seed, meet), result = enter(state, key, meet === 'district' ? 76 : 87);
      assert.equal(result.participants.length, result.fieldSize);
      assert.equal(new Set(result.participants.map(participant => participant.school)).size, result.schoolCount);
      assert.equal(result.participants.filter(participant => participant.isPlayer).length, 1);
      assert.equal(new Set(result.participants.map(participant => participant.athleteId)).size, result.fieldSize);
      for (const [index, participant] of result.participants.entries()) {
        const firstEqual = result.participants.findIndex(item => item.value === participant.value);
        assert.equal(participant.rank, firstEqual + 1);
        if (index && participant.value === result.participants[index - 1].value) ties++;
        if (!participant.isPlayer && key.split(':')[1] !== 'relay') assert.notEqual(participant.name, participant.school);
      }
      assert.equal(result.qualified, result.official && result.qualificationPlaces > 0 && result.rank <= result.qualificationPlaces);
      if (result.qualified && result.rank > 3) { qualifiedOutsidePodium++; assert.equal(result.medal, null); }
      assert.equal(G.validateSave(JSON.stringify(state)), true, meet + ' ' + key);
    }
  }
  assert.ok(ties > 0, 'Rounded field records exercise equal-place results');
  assert.ok(qualifiedOutsidePodium > 0, 'Advancement is separate from the three medal places');
});

test('large-field saves reject inconsistent field metadata, missing athletes, and impossible ranks', () => {
  const valid = atMeet(21); enter(valid, 'boys:100m', 90);
  assert.equal(G.validateSave(valid), true);
  const corruptions = [
    result => { result.fieldSize++; },
    result => { result.schoolCount++; },
    result => { result.qualificationPlaces = result.fieldSize + 1; },
    result => { result.qualificationMark = -1; },
    result => { result.rank = result.fieldSize + 1; },
    result => { result.participants.pop(); },
    result => { result.participants[1].rank = 999; },
    result => { result.participants[1].isPlayer = true; }
  ];
  for (const corrupt of corruptions) {
    const state = clone(valid); changeResults(state, corrupt);
    assert.equal(G.validateSave(state), false, corrupt.toString());
  }
});

test('previous eight-athlete result saves still load without rewriting their historical records', () => {
  const legacy = atMeet(33); enter(legacy, 'boys:100m', 100);
  changeResults(legacy, result => {
    result.participants = result.participants.slice(0, 8);
    result.participants.forEach((participant, index) => {
      participant.rank = result.participants.findIndex(item => item.value === participant.value) + 1;
      if (!participant.isPlayer) { participant.athleteId = 'rival-' + (index - 1); participant.school = '旧大会' + index + '高校'; participant.name = participant.school; }
    });
    result.rank = result.participants.find(participant => participant.isPlayer).rank;
    for (const key of ['fieldSize', 'schoolCount', 'qualificationPlaces', 'qualificationMark']) delete result[key];
  });
  const before = JSON.stringify(legacy);
  assert.equal(G.validateSave(before), true);
  assert.equal(JSON.stringify(legacy), before, 'Validating an older save does not modify old marks');
});

test('older pending-meet snapshots remain playable after descriptions and opponent strengths change', () => {
  const legacy = atMeet(77);
  legacy.pendingMeet = {
    id: 'district', name: 'インターハイ 地区予選', week: 5, dateLabel: '5月1週', kind: 'school',
    level: 1, rating: 55, prize: 14000, next: 'prefecture', description: '男女・種目別に3位以内の選手が県大会へ。'
  };
  assert.equal(G.validateSave(JSON.stringify(legacy)), true);
  const result = enter(legacy, 'boys:100m', 90);
  assert.equal(result.fieldSize, 48);
  assert.equal(result.qualificationPlaces, 16);
  assert.equal(G.validateSave(legacy), true);
});
