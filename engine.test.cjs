'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./engine.js');
const clone = value => JSON.parse(JSON.stringify(value));

function confirmPlan(state) {
  if (state.monthPlanPending) assert.equal(G.confirmMonthlyPlan(state).ok, true);
}
function advanceTo(state, targetWeek, targetYear = state.year) {
  let turns = 0;
  while (state.year !== targetYear || state.week !== targetWeek) {
    if (state.pendingMeet) assert.equal(G.skipMeet(state).ok, true);
    else { confirmPlan(state); assert.equal(G.advanceWeek(state).ok, true); }
    assert.ok(++turns < 400, 'Calendar progression must terminate');
  }
}
function healthy(state) {
  state.athletes.forEach(athlete => { athlete.injury = 0; athlete.energy = 100; athlete.morale = 100; });
}
function pickEntries(state) {
  const entries = {}, used = new Set();
  for (const division of G.getMeetEvents(state)) {
    if (division.id === 'relay') continue;
    const athlete = state.athletes.filter(a => a.gender === division.gender && !a.injury && !used.has(a.id))
      .sort((a, b) => G.getAthleteRating(b, division.id) - G.getAthleteRating(a, division.id))[0];
    if (athlete) { entries[division.key] = athlete.id; used.add(athlete.id); }
  }
  return entries;
}

test('a new school starts reproducibly with six boys and six girls, all first-years', () => {
  const state = G.createGame(42);
  assert.deepEqual(state, G.createGame(42));
  assert.equal(state.version, 2);
  assert.equal(state.athletes.length, 12);
  for (const gender of ['boys', 'girls']) assert.equal(state.athletes.filter(a => a.gender === gender).length, 6);
  assert.ok(state.athletes.every(a => a.grade === 1));
  assert.equal(new Set(state.athletes.map(a => a.id)).size, 12);
  assert.equal(G.getCalendar(state).month, 4);
  assert.match(G.getCalendar(state).label, /4月.*1週/);
  assert.equal(G.getNextMeet(state).weeksUntil, 4);
  assert.equal(G.validateSave(state), true);
  assert.equal(G.validateSave(JSON.stringify(state)), true);
});

test('the 48-week calendar places all requested tournaments, including two same-week championships', () => {
  assert.deepEqual(G.MEETS.map(m => m.week), [5, 7, 11, 16, 21, 23, 25, 27, 27, 41, 41]);
  const state = G.createGame(4);
  const expected = [[1, 4], [5, 5], [11, 6], [16, 7], [21, 9], [25, 10], [37, 1], [41, 2], [48, 3]];
  for (const [week, month] of expected) assert.equal(G.getCalendar({ ...state, week }).month, month);
  assert.ok(G.MEETS.some(m => m.week === 16 && m.name.includes('インターハイ')));
  assert.equal(G.MEETS.filter(m => m.week === 27).length, 2);
  assert.equal(G.MEETS.filter(m => m.week === 41).length, 2);
});

test('monthly planning must be confirmed before practice and returns at each month boundary', () => {
  const state = G.createGame(3), original = clone(state);
  assert.equal(state.monthPlanPending, true);
  assert.equal(G.advanceWeek(state).ok, false);
  assert.deepEqual(state, original);
  assert.equal(G.confirmMonthlyPlan(state).ok, true);
  assert.equal(state.monthPlanPending, false);
  for (let week = 2; week <= 5; week++) {
    assert.equal(G.advanceWeek(state).ok, true);
    assert.equal(state.week, week);
  }
  assert.equal(state.monthPlanPending, true);
  assert.equal(state.pendingMeet.week, 5);
  assert.equal(G.validateSave(state), true);
});

test('school events use boys 110m hurdles, girls 100m hurdles, and separate relay divisions', () => {
  const state = G.createGame(5);
  advanceTo(state, 5);
  const events = G.getMeetEvents(state);
  assert.equal(events.length, 18);
  const keys = events.map(e => e.key);
  for (const key of ['boys:110mh', 'girls:100mh', 'boys:relay', 'girls:relay']) assert.ok(keys.includes(key));
  assert.ok(!keys.includes('girls:110mh'));
  assert.ok(!keys.includes('boys:100mh'));
  for (const division of events.filter(e => e.id !== 'relay')) {
    for (const athlete of state.athletes.filter(a => a.gender === division.gender)) {
      assert.ok(Number.isFinite(G.predictResult(athlete, division.id)));
      assert.ok(G.predictResult(athlete, division.id) > 0);
    }
  }
  assert.equal(G.formatResult(16.7, '100mh'), '16.70秒');
  assert.equal(G.formatResult(1.85, 'highjump'), '1.85m');
  assert.equal(G.formatResult(299.99, '1500m'), '5:00.0');
});

test('invalid sex, duplicate individuals, missing runners and repeat meets cannot mutate state', () => {
  const state = G.createGame(51);
  advanceTo(state, 5); healthy(state);
  const boys = state.athletes.filter(a => a.gender === 'boys'), girls = state.athletes.filter(a => a.gender === 'girls');
  const snapshot = clone(state), boysRelay = boys.slice(0, 4).map(a => a.id);
  const badEntries = [
    {}, { 'boys:100m': girls[0].id }, { 'girls:100mh': boys[0].id },
    { 'girls:110mh': girls[0].id }, { 'boys:100m': 'missing' },
    { 'boys:100m': boys[0].id, 'boys:400m': boys[0].id },
    { 'boys:relay': boysRelay.slice(0, 3) }, { 'boys:relay': [boysRelay[0], boysRelay[0], ...boysRelay.slice(2)] },
    { 'boys:relay': [girls[0].id, ...boysRelay.slice(1)] }, { 'unknown:100m': boys[0].id }
  ];
  for (const entries of badEntries) {
    assert.equal(G.runMeet(state, entries).ok, false, JSON.stringify(entries));
    assert.deepEqual(state, snapshot);
  }
  assert.equal(G.advanceWeek(state).ok, false);
  assert.equal(G.runMeet(state, pickEntries(state), 'unknown').ok, false);
  assert.deepEqual(state, snapshot);
  const outcome = G.runMeet(state, pickEntries(state), 'steady');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.results.length, 12);
  const completed = structuredClone(state);
  assert.equal(G.runMeet(state, pickEntries(state)).ok, false);
  assert.deepEqual(state, completed);
  assert.equal(G.validateSave(state), true);
});

test('relays require four healthy athletes of one gender and respond to order and fatigue', () => {
  const state = G.createGame(1), boys = state.athletes.filter(a => a.gender === 'boys').slice(0, 4);
  for (const athlete of boys) {
    for (const key of G.STAT_KEYS) athlete.stats[key] = 50;
    athlete.energy = 100; athlete.morale = 80;
  }
  boys[0].stats.technique = 100; boys[1].stats.speed = 100;
  const ids = boys.map(a => a.id), swapped = [ids[1], ids[0], ids[2], ids[3]];
  assert.ok(G.predictRelayResult(state, ids) < G.predictRelayResult(state, swapped));
  const baseline = G.predictRelayResult(state, ids);
  boys[2].energy = 10;
  assert.ok(G.predictRelayResult(state, ids) > baseline);
  boys[2].energy = 100;
  assert.equal(G.predictRelayResult(state, ids.slice(0, 3)), null);
  assert.equal(G.predictRelayResult(state, [ids[0], ids[0], ids[2], ids[3]]), null);
  assert.equal(G.predictRelayResult(state, ['missing', ...ids.slice(1)]), null);
  assert.equal(G.predictRelayResult(state, [state.athletes.find(a => a.gender === 'girls').id, ...ids.slice(1)]), null);
  boys[0].injury = 1;
  assert.equal(G.predictRelayResult(state, ids), null);
});

test('individual athletes may double in their own relay and separate team records survive reload', () => {
  const state = G.createGame(67);
  advanceTo(state, 5); healthy(state);
  const entries = pickEntries(state);
  for (const gender of ['boys', 'girls']) entries[gender + ':relay'] = state.athletes.filter(a => a.gender === gender).slice(0, 4).map(a => a.id);
  assert.equal(G.validateEntries(state, entries).ok, true);
  const replay = clone(state);
  const result = G.runMeet(state, entries, 'steady');
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 14);
  assert.deepEqual(result, G.runMeet(replay, Object.fromEntries(Object.entries(entries).reverse()), 'steady'));
  assert.deepEqual(state, replay, 'Object key insertion order must not affect a meet');
  const relays = result.results.filter(r => r.eventId === 'relay');
  assert.equal(relays.length, 2);
  for (const relay of relays) {
    assert.deepEqual(relay.members.map(m => m.leg), [1, 2, 3, 4]);
    assert.equal(new Set(relay.athleteIds).size, 4);
    assert.equal(state.teamBest[relay.gender].relay, relay.value);
  }
  assert.equal(G.validateSave(JSON.stringify(state)), true);
});

test('same-week U18/U20 championships cannot be skipped by advancing the calendar', () => {
  const state = G.createGame(81);
  for (const week of [27, 41]) {
    advanceTo(state, week);
    const first = state.pendingMeet.id;
    const snapshot = clone(state);
    assert.equal(G.advanceWeek(state).ok, false);
    assert.deepEqual(state, snapshot);
    assert.equal(G.skipMeet(state).ok, true);
    assert.equal(state.week, week);
    assert.ok(state.pendingMeet);
    assert.notEqual(state.pendingMeet.id, first);
    assert.equal(G.advanceWeek(state).ok, false);
    assert.equal(G.skipMeet(state).ok, true);
    assert.equal(state.pendingMeet, null);
    confirmPlan(state);
    assert.equal(G.advanceWeek(state).ok, true);
    assert.equal(state.week, week + 1);
    assert.equal(G.validateSave(state), true);
  }
});

test('injuries never trap the player at a tournament', () => {
  const state = G.createGame(7);
  advanceTo(state, 5);
  state.athletes.forEach(a => { a.injury = 2; });
  assert.equal(G.runMeet(state, { 'boys:100m': state.athletes.find(a => a.gender === 'boys').id }).ok, false);
  assert.equal(G.skipMeet(state).ok, true);
  confirmPlan(state);
  assert.equal(G.advanceWeek(state).ok, true);
  assert.equal(G.validateSave(state), true);
});

test('the complete three-year cycle grows cohorts and graduates the founding class', () => {
  const state = G.createGame(4), founders = state.athletes.map(a => a.id);
  for (let year = 2; year <= 4; year++) {
    advanceTo(state, 1, year);
    assert.equal(state.athletes.length, Math.min(year, 3) * 12);
    const newcomers = state.athletes.filter(a => a.grade === 1);
    assert.equal(newcomers.length, 12);
    for (const gender of ['boys', 'girls']) assert.equal(newcomers.filter(a => a.gender === gender).length, 6);
    assert.ok(state.athletes.every(a => a.grade >= 1 && a.grade <= 3));
    assert.equal(G.validateSave(state), true, `year ${year}`);
  }
  assert.ok(founders.every(id => !state.athletes.some(a => a.id === id)));
  assert.ok(state.money >= 0);
});

test('cloud JSONB object-key reordering is accepted without weakening practice-card validation', () => {
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorder(entry)])) : value;
  const initial = G.createGame(20261008);
  initial.practiceCards = clone(G.PRACTICE_CARDS.slice(0, 3));
  const reordered = reorder(initial);
  assert.notEqual(JSON.stringify(initial), JSON.stringify(reordered));
  assert.deepEqual(reordered, initial);
  assert.equal(G.validateSave(reordered), true);
  assert.equal(G.validateSave(JSON.stringify(reordered)), true);
  for (const mutate of [
    s => { s.practiceCards[1].cost = 1; },
    s => { delete s.practiceCards[1].description; },
    s => { s.practiceCards[1].extra = 'unexpected'; },
    s => { s.practiceCards[1].stats.technique = 99; },
    s => { delete s.practiceCards[1].stats.agility; },
    s => { s.practiceCards[1].stats.extra = 0; },
    s => { s.practiceCards[1].stats = [0.35, 0.15]; },
    s => { s.practiceCards[0].stats = []; }
  ]) {
    const malformed = clone(reordered); mutate(malformed);
    assert.equal(G.validateSave(malformed), false, mutate.toString());
  }
});

test('save validation rejects invalid versions, impossible resources, malformed athletes and queues', () => {
  assert.equal(G.validateSave('{oops'), false);
  assert.equal(G.validateSave(null), false);
  const initial = G.createGame(9);
  for (const mutate of [
    s => { s.version = 1; }, s => { s.money = -1; }, s => { s.money = Infinity; },
    s => { s.rng = 0; }, s => { s.week = 49; }, s => { s.week = 0; },
    s => { s.facilities.track = 8; }, s => { s.athletes[0].stats.speed = NaN; },
    s => { s.athletes[0].energy = -2; }, s => { s.athletes[0].gender = 'invalid'; },
    s => { s.athletes[0].grade = 4; }, s => { s.athletes[1].id = s.athletes[0].id; },
    s => { s.athletes[0].id = '\" onclick=\"alert(1)'; }, s => { s.history = [{ results: null }]; },
    s => { s.lastMeet = {}; }, s => { s.lastReport = {}; }, s => { s.pendingMeet = { id: 'invented', week: 1 }; }
  ]) {
    const state = clone(initial); mutate(state);
    assert.equal(G.validateSave(state), false, mutate.toString());
  }
});

test('individual monthly focus changes which ability grows and suitability ranks relevant events', () => {
  const speed = G.createGame(112), stamina = clone(speed);
  const id = speed.athletes[0].id;
  assert.equal(G.setFocus(speed, id, 'speed').ok, true);
  assert.equal(G.setFocus(stamina, id, 'stamina').ok, true);
  const snapshot = clone(speed);
  assert.equal(G.setFocus(speed, id, 'invented').ok, false);
  assert.deepEqual(speed, snapshot);
  for (const state of [speed, stamina]) { confirmPlan(state); assert.equal(G.advanceWeek(state).ok, true); }
  assert.ok(speed.athletes[0].stats.speed > stamina.athletes[0].stats.speed);
  assert.ok(stamina.athletes[0].stats.stamina > speed.athletes[0].stats.stamina);
  for (const state of [speed, stamina]) assert.equal(G.validateSave(state), true);
  for (const athlete of speed.athletes) {
    const fit = G.getSuitability(athlete);
    assert.ok(fit.length >= 6);
    assert.ok(fit.every((event, index) => index === 0 || event.rating <= fit[index - 1].rating));
    const hurdle = athlete.gender === 'boys' ? '110mh' : '100mh';
    const wrong = athlete.gender === 'boys' ? '100mh' : '110mh';
    assert.ok(fit.some(event => event.eventId === hurdle));
    assert.ok(!fit.some(event => event.eventId === wrong));
    assert.ok(fit.every(event => Number.isFinite(event.rating) && typeof event.rank === 'string'));
  }
});

test('October scouting reserves a middle-school student for next April and never inserts them immediately', () => {
  const state = G.createGame(19);
  const initial = clone(state);
  assert.equal(G.recruitAthlete(state, state.candidates[0].id).ok, false);
  assert.deepEqual(state, initial);
  advanceTo(state, 25);
  const recruit = G.getCandidates(state)[0];
  assert.ok(recruit);
  assert.equal(recruit.grade, 0);
  state.money = Math.max(state.money, recruit.cost + 1000);
  const count = state.athletes.length, money = state.money;
  assert.equal(G.recruitAthlete(state, recruit.id).ok, true);
  assert.equal(state.athletes.length, count);
  assert.equal(state.money, money);
  assert.ok(state.scouted.some(a => a.id === recruit.id));
  const snapshot = clone(state);
  assert.equal(G.recruitAthlete(state, recruit.id).ok, false);
  assert.deepEqual(state, snapshot);
  advanceTo(state, 29);
  const another = state.candidates.find(a => a.id !== recruit.id);
  const november = clone(state);
  assert.equal(G.recruitAthlete(state, another.id).ok, false);
  assert.deepEqual(state, november);
  advanceTo(state, 1, 2);
  const joined = state.athletes.filter(a => a.name === recruit.name);
  assert.ok(joined.some(a => a.grade === 1 && a.gender === recruit.gender));
  assert.equal(state.athletes.length, 24);
  assert.equal(state.athletes.filter(a => a.grade === 1 && a.gender === recruit.gender).length, 6);
  assert.equal(state.scouted.length, 0);
  assert.equal(G.validateSave(state), true);
});

test('2025 indoor divisions use 60m, 60m hurdles and the correct age-category jumps', () => {
  const state = G.createGame(44);
  const u18 = G.MEETS.find(m => m.id === 'indoorU18'), u20 = G.MEETS.find(m => m.id === 'indoorU20');
  assert.ok(u18 && u20);
  const younger = G.getMeetEvents(state, u18), older = G.getMeetEvents(state, u20);
  const keys = divisions => divisions.map(d => d.key).sort();
  assert.deepEqual(keys(younger), ['boys:60m', 'boys:60mh', 'boys:longjump', 'boys:polevault', 'girls:60m', 'girls:60mh', 'girls:longjump'].sort());
  assert.deepEqual(keys(older), ['boys:60m', 'boys:60mh', 'boys:longjump', 'boys:polevault', 'boys:triplejump', 'girls:60m', 'girls:60mh', 'girls:longjump', 'girls:polevault', 'girls:triplejump'].sort());
  for (const division of [...younger, ...older]) assert.ok(!['highjump', '400m', '1500m', 'relay'].includes(division.id));
  for (const [divisions, gender, sprint, hurdle, jump] of [
    [younger, 'boys', 10.78, 14.80, 6.95], [younger, 'girls', 12.23, 14.55, 5.65],
    [older, 'boys', 10.60, 14.45, 7.40], [older, 'girls', 12.08, 14.35, 5.88]
  ]) {
    const find = id => divisions.find(d => d.gender === gender && d.id === id);
    assert.equal(find('60m').standard, sprint);
    assert.equal(find('60m').standardEvent, '100m');
    assert.equal(find('60mh').standard, hurdle);
    assert.equal(find('60mh').standardEvent, gender === 'boys' ? '110mh' : '100mh');
    assert.equal(find('longjump').standard, jump);
  }
  assert.equal(younger.find(d => d.key === 'girls:60mh').hurdleHeight, .762);
  assert.equal(older.find(d => d.key === 'girls:60mh').hurdleHeight, .838);
});

test('indoor standards require recent official outdoor records and exact hurdle specifications', () => {
  const state = G.createGame(15);
  advanceTo(state, 41); healthy(state);
  const boy = state.athletes.find(a => a.gender === 'boys'), girl = state.athletes.find(a => a.gender === 'girls');
  const currentYear = G.getCalendar(state).calendarYear;
  const status = (athlete, key) => G.getEntryStatus(state, athlete, key, 'indoorU18');
  boy.best['100m'] = 10.5;
  assert.equal(status(boy, 'boys:60m').eligible, false, 'A practice or open personal best is not an official qualifying record');
  boy.officialBest['100m'] = { value: 10.78, calendarYear: currentYear - 1 };
  assert.equal(status(boy, 'boys:60m').eligible, true, 'Equal to the standard is sufficient');
  boy.officialBest['100m'].value = 10.79;
  assert.equal(status(boy, 'boys:60m').eligible, false);
  boy.officialBest['100m'] = { value: 10.5, calendarYear: currentYear - 2 };
  assert.equal(status(boy, 'boys:60m').eligible, false, 'Old records expire');
  boy.officialBest['100m'].calendarYear = currentYear + 1;
  assert.equal(status(boy, 'boys:60m').eligible, false, 'Future-dated records cannot qualify');
  girl.officialBest['100mh:0.838'] = { value: 14, calendarYear: currentYear - 1 };
  assert.equal(status(girl, 'girls:60mh').eligible, false, 'A different hurdle height is not accepted for indoor qualification');
  girl.officialBest['100mh:0.762'] = { value: 14.55, calendarYear: currentYear - 1 };
  assert.equal(status(girl, 'girls:60mh').eligible, true);
  girl.officialBest['100mh:0.762'].value = 14.56;
  assert.equal(status(girl, 'girls:60mh').eligible, false);
});

test('indoor age divisions follow the calendar year, with U20 jump exceptions for U18 athletes', () => {
  const state = G.createGame(18);
  advanceTo(state, 41); healthy(state);
  const boy = state.athletes.find(a => a.gender === 'boys'), girl = state.athletes.find(a => a.gender === 'girls');
  const calendarYear = G.getCalendar(state).calendarYear;
  for (const athlete of [boy, girl]) athlete.birthYear = calendarYear - 17;
  assert.equal(G.getAge(state, boy), 17);
  boy.officialBest['100m'] = { value: 10.5, calendarYear };
  assert.equal(G.getEntryStatus(state, boy, 'boys:60m', 'indoorU18').eligible, true);
  assert.equal(G.getEntryStatus(state, boy, 'boys:60m', 'indoorU20').eligible, false);
  boy.birthYear = calendarYear - 18;
  assert.equal(G.getEntryStatus(state, boy, 'boys:60m', 'indoorU18').eligible, false);
  assert.equal(G.getEntryStatus(state, boy, 'boys:60m', 'indoorU20').eligible, true);
  boy.birthYear = calendarYear - 17;
  boy.officialBest.polevault = { value: 5, calendarYear };
  assert.equal(G.getEntryStatus(state, boy, 'boys:polevault', 'indoorU20').eligible, false);
  girl.officialBest.polevault = { value: 3.71, calendarYear };
  assert.equal(G.getEntryStatus(state, girl, 'girls:polevault', 'indoorU20').eligible, true);
  boy.officialBest.triplejump = { value: 14.90, calendarYear };
  girl.officialBest.triplejump = { value: 12.30, calendarYear };
  assert.equal(G.getEntryStatus(state, boy, 'boys:triplejump', 'indoorU20').eligible, true);
  assert.equal(G.getEntryStatus(state, girl, 'girls:triplejump', 'indoorU20').eligible, true);
});

test('a championship athlete cannot compete twice in one week, while a teammate may use the second meet', () => {
  const state = G.createGame(8);
  advanceTo(state, 27); healthy(state);
  const [runner, teammate] = state.athletes.filter(a => a.gender === 'boys' && G.getAge(state, a) === 16);
  for (const athlete of [runner, teammate]) athlete.officialBest['100m'] = { value: 10.5, calendarYear: G.getCalendar(state).calendarYear };
  assert.equal(G.runMeet(state, { 'boys:100m': runner.id }, 'steady').ok, true);
  assert.equal(state.pendingMeet.id, 'u20nationals');
  assert.equal(G.getEntryStatus(state, runner, 'boys:100m').eligible, false);
  assert.equal(G.getEntryStatus(state, teammate, 'boys:100m').eligible, true);
  const snapshot = structuredClone(state);
  assert.equal(G.runMeet(state, { 'boys:100m': runner.id }).ok, false);
  assert.deepEqual(state, snapshot);
  assert.equal(G.runMeet(state, { 'boys:100m': teammate.id }, 'steady').ok, true);
  assert.equal(state.pendingMeet, null);
  assert.equal(G.validateSave(state), true);
});

test('qualification belongs to the individual event, and open results cannot earn official advancement', () => {
  const state = G.createGame(7);
  advanceTo(state, 5); healthy(state);
  const [winner, teammate] = state.athletes.filter(a => a.gender === 'boys');
  for (const key of G.STAT_KEYS) winner.stats[key] = 100;
  const outcome = G.runMeet(state, { 'boys:100m': winner.id }, 'steady');
  assert.equal(outcome.results[0].rank, 1);
  advanceTo(state, 7); healthy(state);
  assert.equal(G.getEntryStatus(state, winner, 'boys:100m').official, true);
  assert.equal(G.getEntryStatus(state, teammate, 'boys:100m').official, false);
  assert.equal(G.getEntryStatus(state, winner, 'boys:400m').official, false);
  for (const key of G.STAT_KEYS) teammate.stats[key] = 100;
  const officialBefore = clone(teammate.officialBest), medals = clone(state.medals);
  const open = G.runMeet(state, { 'boys:100m': teammate.id }, 'steady');
  assert.equal(open.results[0].rank, 1);
  assert.equal(open.results[0].official, false);
  assert.equal(open.results[0].medal, null);
  assert.equal(open.results[0].qualified, false);
  assert.deepEqual(teammate.officialBest, officialBefore);
  assert.deepEqual(state.medals, medals);
  assert.equal(G.validateSave(state), true);
});

test('legacy practice selections map to free weekly routes with growth/fatigue tradeoffs, while rest heals', () => {
  let camp;
  for (let seed = 1; seed <= 50 && !camp; seed++) {
    const candidate = G.createGame(seed);
    if (candidate.practiceCards.some(card => card.id === 'camp')) camp = candidate;
  }
  assert.ok(camp);
  const normal = clone(camp);
  assert.equal(G.choosePracticeCard(camp, 'camp').ok, true);
  assert.equal(G.choosePracticeCard(normal, 'basic').ok, true);
  const original = clone(camp);
  assert.equal(G.choosePracticeCard(camp, 'invented').ok, false);
  assert.deepEqual(camp, original);
  for (const state of [camp, normal]) { confirmPlan(state); assert.equal(G.advanceWeek(state).ok, true); }
  assert.ok(camp.athletes[0].stats.speed > normal.athletes[0].stats.speed);
  assert.ok(camp.athletes[0].energy < normal.athletes[0].energy);
  assert.equal(camp.lastReport.expenses, 0);
  assert.equal(normal.lastReport.expenses, 0);
  assert.equal(camp.money, 0);
  assert.equal(camp.practiceCards.length, 3);
  assert.equal(camp.selectedPracticeCard, 'basic');
  const athlete = camp.athletes[0];
  athlete.energy = 10; athlete.injury = 2;
  assert.equal(G.setTraining(camp, athlete.id, 'rest').ok, true);
  G.advanceWeek(camp); G.advanceWeek(camp);
  assert.equal(athlete.injury, 0);
  assert.ok(athlete.energy >= 60);
  assert.equal(G.validateSave(camp), true);
});

test('a recent qualifying performance remains usable after an older all-time best expires', () => {
  const state = G.createGame(21);
  advanceTo(state, 41, 3); healthy(state);
  const athlete = state.athletes.find(a => a.gender === 'girls' && a.grade === 3 && a.birthMonth > 3);
  const calendarYear = G.getCalendar(state).calendarYear;
  assert.equal(calendarYear, 2029);
  athlete.officialBest.longjump = { value: 6, calendarYear: calendarYear - 2 };
  athlete.officialRecords = { longjump: { [calendarYear - 1]: 5.9 } };
  assert.equal(G.getEntryStatus(state, athlete, 'girls:longjump', 'indoorU20').eligible, true);
  assert.equal(G.validateSave(state), true);
  athlete.officialRecords.longjump[calendarYear - 1] = 5.87;
  assert.equal(G.getEntryStatus(state, athlete, 'girls:longjump', 'indoorU20').eligible, false);
});
