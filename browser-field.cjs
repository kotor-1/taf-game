/* Large meet fields and legacy replay browser QA. Start the game server first.
 * GAME_URL, QA_OUTPUT_DIR and PLAYWRIGHT_MODULE_PATH may override defaults.
 * Uses guest saves and a stubbed auth-settings response; creates no accounts.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const E = require('./engine.js');
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
if (!chromium) throw Error('Playwright is required for optional large-field browser QA.');
const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const output = process.env.QA_OUTPUT_DIR || '/tmp/taf-field-qa';
const saveKey = 'hokago-track-club-save-v2';
const tutorialKey = 'hokago-track-club-tutorial-v1';
const errors = [];
const readSave = page => page.evaluate(key => TrackSaveStore.decode(localStorage.getItem(key)), saveKey);
const action = (page, id) => page.locator(`#game-dialog[open] [data-action="${id}"]:visible, [data-action="${id}"]:visible`).first();
async function close(page) {
  if (await page.locator('#game-dialog[open]').count()) await action(page, 'close').click();
}
async function overflow(page, label) {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, dialog: document.querySelector('#game-dialog[open]')?.getBoundingClientRect().toJSON() }));
  assert.ok(size.scroll <= size.width + 1, `${label}: horizontal document overflow`);
  if (size.dialog) assert.ok(size.dialog.x >= -1 && size.dialog.right <= size.width + 1, `${label}: horizontal dialog overflow`);
}
function districtState() {
  const state = E.createGame(8129);
  while (state.week < 5) {
    if (state.monthPlanPending) assert.equal(E.confirmMonthlyPlan(state).ok, true);
    assert.equal(E.advanceWeek(state).ok, true);
  }
  if (state.monthPlanPending) assert.equal(E.confirmMonthlyPlan(state).ok, true);
  for (const athlete of state.athletes) { athlete.injury = 0; athlete.energy = 100; athlete.morale = 100; }
  assert.equal(E.validateSave(state), true);
  return state;
}
function qualifyingState() {
  const base = districtState(), id = base.athletes.find(a => a.gender === 'boys').id;
  for (let level = 40; level <= 100; level += .25) {
    const state = structuredClone(base), athlete = state.athletes.find(a => a.id === id);
    for (const stat of E.STAT_KEYS) athlete.stats[stat] = level;
    assert.equal(E.runMeet(state, { 'boys:100m': id }, 'steady').ok, true);
    const result = state.lastMeet.results[0];
    if (result.rank >= 13 && result.rank <= 16 && result.qualified) {
      assert.equal(result.medal, null, 'A qualifier outside the top three must not win a medal');
      assert.equal(E.validateSave(state), true);
      return state;
    }
  }
  throw Error('Could not build a district qualifier ranked 13–16; check field balance and qualification.');
}
function lowRankState() {
  const state = districtState();
  for (const athlete of state.athletes) for (const stat of E.STAT_KEYS) athlete.stats[stat] = 5;
  const entries = {};
  for (const gender of ['boys', 'girls']) {
    const athletes = state.athletes.filter(a => a.gender === gender);
    const ids = gender === 'boys' ? ['100m', '400m', '1500m', '110mh', 'longjump', 'highjump'] : ['100m', '400m', '1500m', '100mh', 'polevault', 'triplejump'];
    ids.forEach((eventId, index) => { entries[gender + ':' + eventId] = athletes[index].id; });
    entries[gender + ':relay'] = athletes.slice(0, 4).map(a => a.id);
  }
  assert.equal(E.runMeet(state, entries, 'steady').ok, true);
  assert.ok(state.lastMeet.results.every(result => result.rank > 12), 'The fixture exercises self entrants omitted by the former first-12 display');
  assert.equal(E.validateSave(state), true);
  return state;
}
function nationalState() {
  const state = districtState();
  while (state.week < 16) {
    if (state.pendingMeet) { assert.equal(E.skipMeet(state).ok, true); continue; }
    if (state.monthPlanPending) assert.equal(E.confirmMonthlyPlan(state).ok, true);
    assert.equal(E.advanceWeek(state).ok, true);
  }
  const athlete = state.athletes.find(a => a.gender === 'boys');
  athlete.injury = 0; athlete.energy = 100;
  for (const stat of E.STAT_KEYS) athlete.stats[stat] = 5;
  state.qualification.nationals['boys:100m'] = [athlete.id];
  assert.equal(E.runMeet(state, { 'boys:100m': athlete.id }, 'steady').ok, true);
  assert.equal(state.lastMeet.results[0].participants.length, 64);
  assert.equal(E.validateSave(state), true);
  return state;
}
function legacyState(modern) {
  const state = structuredClone(modern);
  // Version 2 saves historically had eight entrants and no field metadata.
  const meet = structuredClone(state.lastMeet);
  for (const result of meet.results) {
    const player = result.participants.find(p => p.isPlayer);
    result.participants = [...result.participants.filter(p => !p.isPlayer).slice(0, 7), player];
    const lowerBetter = E.EVENTS.find(event => event.id === result.eventId).lowerBetter;
    result.participants.sort((a, b) => lowerBetter ? a.value - b.value : b.value - a.value);
    result.participants.forEach((p, i) => { p.rank = i && p.value === result.participants[i - 1].value ? result.participants[i - 1].rank : i + 1; });
    result.rank = player.rank;
    result.qualified = false;
    result.medal = null;
    for (const key of ['fieldSize', 'schoolCount', 'qualificationPlaces', 'qualificationMark', 'fieldSchools', 'fieldVersion']) delete result[key];
  }
  meet.summary.qualified = false;
  state.lastMeet = meet;
  state.history = [structuredClone(meet)];
  state.qualification.prefecture = {};
  state.goal.districtQualified = false;
  assert.equal(E.validateSave(state), true, 'Existing eight-entrant meet histories remain valid');
  return state;
}
async function openPage(browser, viewport, state) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', acceptDownloads: true, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await context.route('**/auth/v1/settings', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ external: { email: true }, disable_signup: false, mailer_autoconfirm: true }) }));
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(url).origin) errors.push(response.status() + ' ' + response.url()); });
  await page.addInitScript(({ saveKey, tutorialKey, state }) => {
    if (sessionStorage.getItem('qa-field-seeded')) return;
    localStorage.setItem(saveKey, JSON.stringify(state));
    localStorage.setItem(tutorialKey, JSON.stringify({ version: 1, status: 'dismissed', step: 0, completed: false }));
    sessionStorage.setItem('qa-field-seeded', '1');
  }, { saveKey, tutorialKey, state });
  await page.goto(url); await page.locator('#campus').waitFor();
  return { context, page };
}
async function loadState(page, state) {
  await close(page);
  await page.locator('#import-save').setInputFiles({ name: 'field-scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await page.locator('#confirm-import').click();
  await page.locator('#campus').waitFor();
  assert.deepEqual(await readSave(page), state, 'Import must preserve all opponents, results and qualification');
}
async function openResults(page) {
  await close(page); await page.locator('.nav-btn[data-page="calendar"]').click();
  await page.locator('[data-action="past-meet"][data-index="0"]').click();
  await page.locator('.event-result').first().waitFor();
}
async function instrumentScene(page) {
  await page.evaluate(() => {
    const original = TrackScene.prototype.setMode;
    TrackScene.prototype.setMode = function (mode, data) {
      const before = JSON.stringify(data);
      original.call(this, mode, data);
      if (mode === 'race') window.qaFieldRace = { eventId: data.eventId, inputLength: data.runners.length, unchanged: JSON.stringify(data) === before, runners: this.race.runners.map(r => ({ name: r.name, isPlayer: r.isPlayer, place: r.place, overallPlace: r.overallPlace })) };
    };
  });
}
async function checkRanking(page, result, { legacy = false } = {}) {
  const section = page.locator(`[data-result-event="${result.divisionKey}"]`);
  const info = await section.locator('.result-field-info').textContent();
  const schoolCount = new Set(result.participants.map(p => p.school)).size;
  assert.match(info, new RegExp(`${result.participants.length}${result.eventId === 'relay' ? 'チーム' : '人'}`));
  assert.match(info, new RegExp(`${schoolCount}校`));
  if (!legacy && result.qualificationPlaces) assert.match(info, new RegExp(`上位${result.qualificationPlaces}位`));
  await section.locator('summary').click();
  const rows = section.locator('.ranking-table tbody tr');
  assert.equal(await rows.count(), result.participants.length, 'Every entrant appears in the expanded result table');
  const actual = await rows.evaluateAll(nodes => nodes.map(row => ({ rank: Number(row.cells[0].textContent), name: row.cells[1].textContent, record: row.cells[2].textContent, ours: row.classList.contains('ours') })));
  result.participants.forEach((participant, index) => {
    assert.equal(actual[index].rank, participant.rank);
    assert.ok(actual[index].name.includes(participant.name || participant.school));
    assert.equal(actual[index].record.trim(), participant.formatted || E.formatResult(participant.value, result.eventId));
    assert.equal(actual[index].ours, participant.isPlayer);
  });
  assert.equal(await section.locator('.ranking-table tbody tr.ours').count(), 1);
  if (!legacy && result.official && result.qualificationPlaces) {
    assert.equal(await section.locator('.ranking-qualifier').count(), result.participants.filter(p => p.rank <= result.qualificationPlaces).length, 'Tied advancement positions are distinguished from the top-three podium');
  }
  await rows.last().scrollIntoViewIfNeeded();
  assert.equal(await rows.last().isVisible(), true, 'Last entrant is reachable in the scrollable results');
  await section.locator('summary').click();
}
async function checkReplay(page, result, index, label, screenshot = false) {
  const before = await readSave(page);
  await page.locator(`[data-action="replay-event"][data-index="${index}"]`).click();
  await page.locator('#race-canvas').waitFor();
  const race = await page.evaluate(() => window.qaFieldRace);
  assert.equal(race.eventId, result.eventId);
  assert.equal(race.inputLength, result.participants.length);
  assert.equal(race.unchanged, true, 'Rendering must not change the stored participant order or overall ranks');
  assert.ok(race.runners.length <= 8 && race.runners.length > 0);
  assert.equal(race.runners.filter(runner => runner.isPlayer).length, 1, 'Our low-ranked entrant is included in the race highlight');
  assert.equal(race.runners.find(runner => runner.isPlayer).overallPlace, result.rank);
  assert.deepEqual(race.runners.map(runner => runner.place), race.runners.map((_, i) => i + 1));
  await overflow(page, label + ' replay ' + result.eventId);
  if (screenshot) await page.screenshot({ path: path.join(output, label + '-low-rank-replay.png'), fullPage: true });
  await action(page, 'race-skip').click(); await page.locator('.event-result').first().waitFor();
  assert.deepEqual(await readSave(page), before, 'Replay is read-only and must not award results twice');
}
async function checkViewport(browser, label, viewport, fixtures) {
  const { context, page } = await openPage(browser, viewport, districtState());
  try {
    await action(page, 'enter-meet').click();
    for (const [gender, mark] of [['boys', '11.40秒'], ['girls', '13.20秒']]) {
      await page.locator(`[data-action="entry-gender"][data-gender="${gender}"]`).click();
      const division = page.locator('.division-entry').filter({ has: page.locator(`[data-entry="${gender}:100m"]`) });
      const text = await division.locator('.meet-field-info').textContent();
      assert.match(text, /(?:48|64)人/); assert.match(text, /(?:2[4-9]|[3-6][0-9])校/); assert.match(text, /上位16位/); assert.ok(text.includes(mark), `District ${gender} entry guidance shows ${mark}`);
    }
    await overflow(page, label + ' entry');
    await page.screenshot({ path: path.join(output, label + '-entry-field.png'), fullPage: true });
    await action(page, 'start-meet').click(); await page.locator('#race-canvas').waitFor();
    await action(page, 'race-skip').click(); await page.locator('.event-result').first().waitFor();
    const played = await readSave(page);
    assert.ok(played.lastMeet.results.some(result => result.participants.length === 48) && played.lastMeet.results.every(result => result.participants.length >= 24), 'Playing a meet in the browser generates and saves the larger field');
    assert.equal(E.validateSave(played), true);

    await loadState(page, fixtures.qualifying); await instrumentScene(page); await openResults(page);
    const qualifier = fixtures.qualifying.lastMeet.results[0];
    assert.equal(qualifier.qualificationPlaces, 16);
    const text = await page.locator('.result-person').first().textContent();
    assert.match(text, /次大会へ進出/); assert.doesNotMatch(text, /表彰台|入賞/);
    assert.equal(await page.locator('.result-rank.medal').count(), 0, 'A 13th–16th place qualifier has no podium styling');
    assert.deepEqual((await readSave(page)).medals, { gold: 0, silver: 0, bronze: 0 });
    await checkRanking(page, qualifier); await overflow(page, label + ' qualifying results');
    await page.locator('.result-expand summary').click();
    await page.screenshot({ path: path.join(output, label + '-qualifying-results.png'), fullPage: true });
    await page.locator('.result-expand summary').click();
    await checkReplay(page, qualifier, 0, label, true);

    await loadState(page, fixtures.national); await openResults(page);
    await checkRanking(page, fixtures.national.lastMeet.results[0]);
    await checkReplay(page, fixtures.national.lastMeet.results[0], 0, label);
    await overflow(page, label + ' national 64-entrant results');

    await loadState(page, fixtures.low); await openResults(page);
    for (const [index, result] of fixtures.low.lastMeet.results.entries()) {
      const fieldEvent = E.EVENTS.find(event => event.id === result.eventId).unit === 'm';
      assert.ok(result.participants.length >= (result.eventId === 'relay' || fieldEvent ? 24 : 48));
      assert.ok(new Set(result.participants.map(p => p.school)).size >= 16);
      await checkRanking(page, result); await checkReplay(page, result, index, label);
    }
    await overflow(page, label + ' all-event results');
    await close(page); await action(page, 'settings').click();
    const pending = page.waitForEvent('download'); await action(page, 'export').click();
    const download = await pending, file = path.join(output, label + '-field-save.json');
    await download.saveAs(file);
    const exported = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.deepEqual(exported, fixtures.low, 'Export includes all competitors as ordinary JSON');
    await loadState(page, exported); await page.reload(); await page.locator('#campus').waitFor();
    assert.deepEqual(await readSave(page), exported, 'Compressed local save survives reload without losing large fields');
    await instrumentScene(page);

    await loadState(page, fixtures.legacy); await openResults(page);
    for (const [index, result] of fixtures.legacy.lastMeet.results.entries()) {
      await checkRanking(page, result, { legacy: true }); await checkReplay(page, result, index, label);
    }
    assert.deepEqual(await readSave(page), fixtures.legacy, 'Legacy eight-entrant histories are not rewritten by display or replay');
    await page.screenshot({ path: path.join(output, label + '-legacy-results.png'), fullPage: true });
    console.log(`PASS: ${label} large fields, full rankings, school counts, advancement without podium, all-event low-rank replay, export/reload and legacy eight-entrant replay.`);
  } finally { await context.close(); }
}
(async () => {
  await fs.mkdir(output, { recursive: true });
  const fixtures = { qualifying: qualifyingState(), low: lowRankState(), national: nationalState() };
  fixtures.legacy = legacyState(fixtures.low);
  const browser = await chromium.launch({ headless: true });
  try {
    await checkViewport(browser, 'desktop', { width: 1440, height: 1000 }, fixtures);
    await checkViewport(browser, 'mobile', { width: 390, height: 844 }, fixtures);
    assert.deepEqual(errors, [], 'No JavaScript or hosted-asset errors');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
