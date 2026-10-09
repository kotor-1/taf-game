/* Optional integration checks. Start the local server before npm run test:browser.
 * PLAYWRIGHT_MODULE_PATH, GAME_URL and QA_OUTPUT_DIR may override the defaults.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const engine = require('./engine.js');
let playwright;
for (const location of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { playwright = require(location); break; } catch {}
}
if (!playwright) throw new Error('Playwright が必要です。PLAYWRIGHT_MODULE_PATH に既存の Playwright のパスを指定してください。');
const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const saveKey = 'hokago-track-club-save-v2', oldSaveKey = 'hokago-track-club-save-v1';
const backupKey = saveKey + '-backup', recoveryKey = saveKey + '-recovery';
const legacyBackup = JSON.stringify({ version: 1, schoolName: '旧データの保存確認', week: 6 });
const outputDirectory = process.env.QA_OUTPUT_DIR || os.tmpdir();
const artifact = name => path.join(outputDirectory, name);
const errors = [];
const observedPages = new WeakSet();
const readSave = page => page.evaluate(key => TrackSaveStore.decode(localStorage.getItem(key)), saveKey);
const click = (page, action) => page.locator(`[data-action="${action}"]`).first().click();
const navigate = (page, tab) => page.locator(`.nav-btn[data-page="${tab}"]`).click();
async function close(page) {
  if (await page.locator('#game-dialog[open]').count()) await page.locator('#game-dialog [data-action="close"]').first().click();
}
function calendarState(week) {
  const state = engine.createGame(4);
  let turns = 0;
  while (state.week < week) {
    if (state.pendingMeet) assert.equal(engine.skipMeet(state).ok, true);
    else {
      if (state.monthPlanPending) assert.equal(engine.confirmMonthlyPlan(state).ok, true);
      assert.equal(engine.advanceWeek(state).ok, true);
    }
    assert.ok(++turns < 100);
  }
  return state;
}
function observePage(page) {
  if (observedPages.has(page)) return;
  observedPages.add(page);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
}
async function checkHostedAssets(page) {
  const assets = await page.locator('script[src],link[rel="stylesheet"],link[rel="icon"]').evaluateAll(nodes => nodes.map(node => node.src || node.href));
  const base = new URL('.', page.url()).href;
  assert.ok(assets.length >= 5, 'The document includes all game assets');
  for (const asset of assets) assert.ok(asset.startsWith(base), `Asset must resolve under the published game path: ${asset}`);
  assert.match(await page.title(), /放課後トラック部/);
}
async function assertRenderedSave(page, expected) {
  assert.ok((await page.locator('.school-name').textContent()).includes(expected.schoolName));
  assert.match(await page.locator('.bottomline').textContent(), new RegExp(`第${expected.week}週`));
  await navigate(page, 'training');
  for (const athlete of expected.athletes) assert.equal(await page.locator(`select[data-focus="${athlete.id}"]`).inputValue(), athlete.focus);
  await navigate(page, 'overview');
}
async function seedGame(page, game = engine.createGame(4)) {
  observePage(page);
  await page.addInitScript(({ key, game, oldKey, legacyBackup }) => {
    if (!sessionStorage.getItem('qa-seeded')) {
      localStorage.setItem(key, JSON.stringify(game));
      localStorage.setItem(oldKey, legacyBackup);
      sessionStorage.setItem('qa-seeded', '1');
    }
  }, { key: saveKey, game, oldKey: oldSaveKey, legacyBackup });
  await page.goto(url);
  await page.locator('#campus').waitFor();
  await checkHostedAssets(page);
}
async function loadState(page, state) {
  assert.equal(engine.validateSave(state), true);
  await page.locator('#import-save').setInputFiles({ name: 'scenario.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await page.locator('#confirm-import').waitFor();
  await page.locator('#confirm-import').click();
  await page.locator('#campus').waitFor();
  assert.deepEqual(await readSave(page), state);
}
async function checkOverflow(page, label) {
  const sizes = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(sizes.scrollWidth <= sizes.width + 1, `${label}: horizontal overflow ${JSON.stringify(sizes)}`);
}
async function confirmMonthlyPlan(page) {
  const before = await readSave(page);
  if (!before.monthPlanPending) return;
  if (!await page.locator('[data-action="confirm-plan"]:visible').count()) await click(page, 'monthly-plan');
  await page.locator('[data-action="confirm-plan"]:visible').waitFor();
  assert.equal((await readSave(page)).week, before.week, 'Opening the monthly plan must not advance time');
  await click(page, 'confirm-plan');
  assert.equal((await readSave(page)).monthPlanPending, false);
  await close(page);
}
async function advanceWeek(page) {
  await confirmMonthlyPlan(page);
  const before = await readSave(page);
  await click(page, 'start-training');
  await page.locator('#practice-dialog[open]').waitFor();
  assert.deepEqual(await readSave(page), before, 'Starting the animation alone must not commit a week');
  if (!await page.locator('[data-training-action="decide"]:visible').count()) await page.locator('[data-training-action="skip"]').click();
  await page.locator('[data-training-action="decide"][data-decision="balanced"]').click();
  assert.equal((await readSave(page)).week, before.week + 1);
  if (await page.locator('#practice-dialog').getAttribute('data-phase') !== 'finish') await page.locator('[data-training-action="skip"]').click();
  await page.locator('.practice-finish-action [data-training-action="close"]').click();
  await page.locator('.academy-summary').waitFor();
}
async function startAndFinishMeet(page) {
  await click(page, 'start-meet');
  await page.locator('#race-canvas').waitFor();
  await click(page, 'race-skip');
  await page.locator('.result-row').first().waitFor();
}
async function downloadSave(page, filename) {
  const pending = page.waitForEvent('download');
  await click(page, 'export');
  const download = await pending;
  const filenameOnDisk = artifact(filename);
  await download.saveAs(filenameOnDisk);
  return JSON.parse(await fs.readFile(filenameOnDisk, 'utf8'));
}
async function checkPersistence(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await seedGame(page);
  const original = await readSave(page);
  await click(page, 'settings');
  await page.locator('#school-name').fill('保存テスト高校');
  await click(page, 'save-settings');
  const updated = await readSave(page);
  assert.equal(updated.schoolName, '保存テスト高校');
  assert.deepEqual(await page.evaluate(key => TrackSaveStore.decode(localStorage.getItem(key)), backupKey), original);
  await click(page, 'manual-save');
  assert.match(await page.locator('#toast').textContent(), /セーブしました/);
  assert.equal(await page.locator('[data-save-status]').first().getAttribute('data-save-state'), 'saved');
  await page.reload();
  await assertRenderedSave(page, updated);
  await click(page, 'settings');
  await page.locator('[data-action="restore-backup"]').click();
  await page.locator('#confirm-restore').click();
  assert.deepEqual(await readSave(page), original);
  await assertRenderedSave(page, original);
  await page.screenshot({ path: artifact('hokago-save-restored.png'), fullPage: true });

  // A damaged primary must recover a validated backup and retain the damaged raw file.
  const recoveryContext = await browser.newContext();
  const recovery = await recoveryContext.newPage();
  observePage(recovery);
  const damaged = '{"version":2,"broken":';
  await recovery.addInitScript(({ saveKey, backupKey, state, damaged }) => {
    if (sessionStorage.getItem('qa-recovery-seeded')) return;
    localStorage.setItem(saveKey, damaged);
    localStorage.setItem(backupKey, JSON.stringify(state));
    sessionStorage.setItem('qa-recovery-seeded', '1');
  }, { saveKey, backupKey, state: updated, damaged });
  await recovery.goto(url);
  await recovery.locator('#campus').waitFor();
  await recovery.waitForFunction(() => document.querySelector('#toast').textContent.includes('復旧'));
  assert.deepEqual(await readSave(recovery), updated);
  assert.equal(await recovery.evaluate(key => localStorage.getItem(key), recoveryKey), damaged);
  await assertRenderedSave(recovery, updated);
  await recovery.reload();
  await assertRenderedSave(recovery, updated);
  await recoveryContext.close();

  // A complete 60-meet campaign export exceeds the old 2 MB import limit.
  const longCampaign = calendarState(5), entries = {}, used = new Set();
  for (const athlete of longCampaign.athletes) { athlete.injury = 0; athlete.energy = 100; }
  for (const division of engine.getMeetEvents(longCampaign)) {
    if (division.id === 'relay') {
      entries[division.key] = longCampaign.athletes.filter(a => a.gender === division.gender).slice(0, 4).map(a => a.id);
    } else {
      const athlete = longCampaign.athletes.find(a => a.gender === division.gender && !used.has(a.id));
      if (athlete) { entries[division.key] = athlete.id; used.add(athlete.id); }
    }
  }
  assert.equal(engine.runMeet(longCampaign, entries, 'steady').ok, true);
  longCampaign.history = Array.from({ length: 60 }, () => structuredClone(longCampaign.lastMeet));
  assert.equal(engine.validateSave(longCampaign), true);
  const largeBuffer = Buffer.from(JSON.stringify(longCampaign, null, 2));
  assert.ok(largeBuffer.length > 2_000_000, 'Exercise import of an actual game export larger than the old limit');
  const largeContext = await browser.newContext({ acceptDownloads: true });
  const largePage = await largeContext.newPage();
  await seedGame(largePage);
  await largePage.locator('#import-save').setInputFiles({ name: 'long-campaign.json', mimeType: 'application/json', buffer: largeBuffer });
  await largePage.locator('#confirm-import').click();
  assert.deepEqual(await readSave(largePage), longCampaign);
  await click(largePage, 'settings');
  assert.deepEqual(await downloadSave(largePage, 'hokago-long-campaign.json'), longCampaign);
  await close(largePage);
  await largePage.reload();
  assert.equal((await readSave(largePage)).history.length, 60);
  await assertRenderedSave(largePage, longCampaign);
  await largeContext.close();

  // Quota errors must keep the last persisted state and clearly distinguish unsaved progress.
  await page.evaluate(() => {
    window.qaOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('hokago-track-club-save-v2')) throw new DOMException('Simulated storage quota', 'QuotaExceededError');
      return window.qaOriginalSetItem.call(this, key, value);
    };
  });
  await navigate(page, 'training');
  await page.locator('select[data-focus]').first().selectOption('power');
  assert.deepEqual(await readSave(page), original);
  assert.equal(await page.locator('[data-save-status]').first().getAttribute('data-save-state'), 'error');
  assert.ok(await page.locator('[data-save-alert]').first().isVisible());
  await click(page, 'manual-save');
  assert.doesNotMatch(await page.locator('#toast').textContent(), /セーブしました/);
  await click(page, 'settings');
  await page.locator('#school-name').fill('未保存テスト高校');
  await click(page, 'save-settings');
  assert.match(await page.locator('#toast').textContent(), /保存できていません/);
  const exported = await downloadSave(page, 'hokago-unsaved-export.json');
  assert.equal(exported.schoolName, '未保存テスト高校');
  assert.equal(exported.athletes[0].focus, 'power');
  assert.equal(engine.validateSave(exported), true);
  assert.deepEqual(await readSave(page), original);
  assert.ok(await page.locator('[data-save-alert]').first().isVisible(), 'Export success must not conceal an unsaved warning');
  await page.screenshot({ path: artifact('hokago-save-failure.png'), fullPage: true });
  const imported = { ...exported, schoolName: '未保存読込テスト' };
  await page.locator('#import-save').setInputFiles({ name: 'quota-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await page.locator('#confirm-import').click();
  assert.match(await page.locator('#toast').textContent(), /保存できていません/);
  assert.deepEqual(await readSave(page), original);
  await assertRenderedSave(page, imported);
  await page.evaluate(() => { Storage.prototype.setItem = window.qaOriginalSetItem; });
  await click(page, 'manual-save');
  assert.deepEqual(await readSave(page), imported);
  assert.equal(await page.locator('[data-save-status]').first().getAttribute('data-save-state'), 'saved');
  assert.equal(await page.locator('[data-save-alert]').first().isVisible(), false);
  await page.reload();
  await assertRenderedSave(page, imported);

  // Another tab may not silently overwrite newer progress.
  const sibling = await context.newPage();
  observePage(sibling);
  await sibling.goto(url);
  await sibling.locator('#campus').waitFor();
  await navigate(page, 'training');
  await page.locator('select[data-focus]').first().selectOption('speed');
  const latest = await readSave(page);
  await sibling.locator('[data-save-status][data-save-state="error"]').first().waitFor();
  assert.match(await sibling.locator('[data-save-alert]').first().textContent(), /別のタブ/);
  await click(sibling, 'manual-save');
  assert.deepEqual(await readSave(sibling), latest);
  await sibling.reload();
  await assertRenderedSave(sibling, latest);
  assert.equal(await sibling.locator('[data-save-status]').first().getAttribute('data-save-state'), 'saved');
  await context.close();
}

(async () => {
  await fs.mkdir(outputDirectory, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await desktop.newPage();
    await seedGame(page);
    let saved = await readSave(page);
    assert.equal(saved.version, 2);
    assert.equal(saved.athletes.length, 12);
    assert.equal(saved.athletes.filter(a => a.gender === 'boys').length, 6);
    assert.equal(saved.athletes.filter(a => a.gender === 'girls').length, 6);
    assert.ok(saved.athletes.every(a => a.grade === 1));
    await page.screenshot({ path: artifact('hokago-v2-desktop.png'), fullPage: true });
    for (const tab of ['overview', 'training', 'team', 'scouting', 'facilities', 'calendar', 'diary']) {
      await navigate(page, tab);
      assert.ok(await page.locator('h1').textContent());
      assert.equal(await page.locator('.nav-btn[aria-current="page"]').getAttribute('data-page'), tab);
      await checkOverflow(page, `desktop ${tab}`);
    }

    await navigate(page, 'training');
    assert.equal(await page.locator('select[data-focus]').count(), 12);
    const focusId = await page.locator('select[data-focus]').first().getAttribute('data-focus');
    await page.locator('select[data-focus]').first().selectOption('speed');
    assert.equal((await readSave(page)).athletes.find(a => a.id === focusId).focus, 'speed');
    await page.screenshot({ path: artifact('hokago-v2-monthly-training.png'), fullPage: true });
    await confirmMonthlyPlan(page);
    await page.locator('select[data-week-block="0"]').selectOption('speed');
    assert.equal((await readSave(page)).weekRoute[0], 'speed');
    await page.locator('[data-action="intensity"][data-id="easy"]').click();
    assert.equal((await readSave(page)).intensity, 'easy');
    await navigate(page, 'team');
    await click(page, 'athlete');
    const detail = await page.locator('#game-dialog').textContent();
    assert.match(detail, /適性/);
    assert.match(detail, /スピード/);
    assert.equal(await page.locator('#game-dialog [data-ability]').count(), 9);
    assert.equal(await page.locator('#game-dialog .academy-rank').count(), 9);
    await checkOverflow(page, 'desktop ability dialog');
    await close(page);
    await navigate(page, 'scouting');
    assert.equal(await page.locator('[data-action="recruit"]:not([disabled])').count(), 0, 'Scouting is unavailable in April');
    await close(page);
    await navigate(page, 'facilities');
    saved = await readSave(page);
    await page.locator('[data-action="upgrade"][data-id="recovery"]').click();
    assert.equal((await readSave(page)).facilities.recovery, 2);
    assert.equal(engine.getFacilityPlan(await readSave(page)).used, engine.getFacilityPlan(saved).used + 1);
    assert.equal((await readSave(page)).money, saved.money, 'School facility requests do not spend club funds');

    await navigate(page, 'overview');
    while ((await readSave(page)).week < 5) await advanceWeek(page);
    saved = await readSave(page);
    assert.equal(saved.pendingMeet.id, 'district');
    assert.equal(saved.monthPlanPending, true);
    await confirmMonthlyPlan(page);
    await click(page, 'enter-meet');
    assert.equal(await page.locator('[data-entry]').count(), 16);
    assert.equal(await page.locator('[data-entry="boys:110mh"]').count(), 1);
    assert.equal(await page.locator('[data-entry="girls:100mh"]').count(), 1);
    assert.equal(await page.locator('[data-entry="girls:110mh"]').count(), 0);
    const selectors = await page.locator('[data-entry]').evaluateAll(nodes => nodes.map(node => ({ key: node.dataset.entry, ids: [...node.options].map(option => option.value).filter(Boolean) })));
    for (const selector of selectors) assert.ok(selector.ids.every(id => saved.athletes.find(a => a.id === id).gender === selector.key.split(':')[0]));
    for (const gender of ['boys', 'girls']) {
      await page.locator(`[data-action="entry-gender"][data-gender="${gender}"]`).click();
      await page.locator(`input[data-relay-gender="${gender}"]`).check();
    }
    assert.equal(await page.locator('[data-relay-leg]').count(), 8);
    await checkOverflow(page, 'desktop gender-separated entries');
    await page.screenshot({ path: artifact('hokago-v2-entry.png'), fullPage: true });
    await startAndFinishMeet(page);
    saved = await readSave(page);
    assert.equal(saved.lastMeet.results.length, 14);
    assert.equal(await page.locator('.result-row').count(), 14);
    assert.equal(saved.lastMeet.results.filter(r => r.eventId === 'relay').length, 2);
    assert.equal(engine.validateSave(saved), true);
    const girlHurdle = saved.lastMeet.results.findIndex(r => r.eventId === '100mh');
    await page.locator(`[data-action="replay-event"][data-index="${girlHurdle}"]`).click();
    await page.locator('#race-canvas').waitFor();
    assert.equal(await page.locator('#race-canvas').getAttribute('data-event'), '100mh');
    await click(page, 'race-skip');
    assert.deepEqual(await readSave(page), saved, 'Replay must not repeat rewards or mutate results');
    await close(page);
    await page.reload();
    assert.deepEqual(await readSave(page), saved);
    await assertRenderedSave(page, saved);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), oldSaveKey), legacyBackup, 'v1 data remains preserved');

    await click(page, 'settings');
    const downloadPromise = page.waitForEvent('download');
    await click(page, 'export');
    const download = await downloadPromise;
    const savePath = artifact('hokago-v2-save.json');
    await download.saveAs(savePath);
    assert.deepEqual(JSON.parse(await fs.readFile(savePath, 'utf8')), saved);
    const legacyDownloadPromise = page.waitForEvent('download');
    await click(page, 'export-legacy');
    const legacyDownload = await legacyDownloadPromise;
    const legacyPath = artifact('hokago-v1-backup.json');
    await legacyDownload.saveAs(legacyPath);
    assert.equal(await fs.readFile(legacyPath, 'utf8'), legacyBackup);

    const imported = { ...saved, schoolName: '新設テスト高校' };
    await page.locator('#import-save').setInputFiles({ name: 'v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.locator('#confirm-import').waitFor();
    assert.equal((await readSave(page)).schoolName, saved.schoolName);
    await page.locator('#confirm-import').click();
    assert.equal((await readSave(page)).schoolName, imported.schoolName);
    await page.locator('#import-save').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2}') });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('有効なセーブデータではありません'));
    assert.equal((await readSave(page)).schoolName, imported.schoolName);
    await close(page);

    const october = calendarState(25);
    await loadState(page, october);
    await navigate(page, 'team');
    await navigate(page, 'scouting');
    const candidateId = await page.locator('[data-action="recruit"]:not([disabled])').first().getAttribute('data-id');
    const beforeRecruit = await readSave(page);
    await page.locator(`[data-action="recruit"][data-id="${candidateId}"]`).click();
    saved = await readSave(page);
    assert.equal(saved.athletes.length, 12);
    assert.ok(saved.scouted.some(a => a.id === candidateId));
    assert.equal(saved.money, beforeRecruit.money, 'Scouting is free');
    await checkOverflow(page, 'desktop October scout');
    await page.screenshot({ path: artifact('hokago-v2-scouting.png'), fullPage: true });
    await close(page);

    const indoor = calendarState(41);
    await loadState(page, indoor);
    await click(page, 'enter-meet');
    const indoorKeys = await page.locator('[data-entry]').evaluateAll(nodes => nodes.map(node => node.dataset.entry));
    assert.ok(indoorKeys.includes('boys:60m'));
    assert.ok(indoorKeys.includes('girls:60mh'));
    assert.ok(indoorKeys.every(key => !/400m|1500m|highjump|relay/.test(key)));
    assert.match(await page.locator('#game-dialog').textContent(), /標準/);
    await checkOverflow(page, 'desktop indoor entry');
    await page.screenshot({ path: artifact('hokago-v2-indoor.png'), fullPage: true });
    await click(page, 'skip-meet-confirm');
    await click(page, 'skip-meet');
    assert.equal((await readSave(page)).week, 41);
    assert.ok((await readSave(page)).pendingMeet);
    assert.notEqual((await readSave(page)).pendingMeet.id, indoor.pendingMeet.id);
    await close(page);

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const small = await mobile.newPage();
    await seedGame(small);
    assert.ok(await small.locator('.bottomline [data-save-status]').isVisible(), 'Mobile save status remains visible');
    await click(small, 'manual-save');
    assert.match(await small.locator('#toast').textContent(), /セーブしました/);
    await click(small, 'settings');
    await checkOverflow(small, 'mobile save settings');
    assert.ok(await small.locator('#game-dialog [data-action="manual-save"]').isVisible());
    await close(small);
    await small.evaluate(() => window.scrollTo(0, 0));
    await small.screenshot({ path: artifact('hokago-v2-mobile.png'), fullPage: true });
    for (const tab of ['overview', 'training', 'team', 'scouting', 'facilities', 'calendar', 'diary']) {
      await navigate(small, tab);
      await checkOverflow(small, `mobile ${tab}`);
    }
    await navigate(small, 'team');
    await click(small, 'athlete');
    await checkOverflow(small, 'mobile ability dialog');
    await close(small);
    await advanceWeek(small);
    while ((await readSave(small)).week < 5) await advanceWeek(small);
    await confirmMonthlyPlan(small);
    await click(small, 'enter-meet');
    for (const gender of ['boys', 'girls']) {
      await small.locator(`[data-action="entry-gender"][data-gender="${gender}"]`).click();
      await small.locator(`input[data-relay-gender="${gender}"]`).check();
    }
    await checkOverflow(small, 'mobile gender-separated entry');
    await small.screenshot({ path: artifact('hokago-v2-mobile-entry.png'), fullPage: true });
    await startAndFinishMeet(small);
    assert.equal(await small.locator('.result-row').count(), 14);
    await checkOverflow(small, 'mobile results');
    await small.screenshot({ path: artifact('hokago-v2-mobile-results.png'), fullPage: true });
    await close(small);
    assert.equal(engine.validateSave(await readSave(small)), true);
    await desktop.close(); await mobile.close();
    await checkPersistence(browser);
    assert.deepEqual(errors, [], 'No browser runtime errors or failed requests');
    console.log('PASS: 12 first-year athletes; seven desktop/mobile tabs; monthly plans and seven-day routes; coaching and inline weekly highlights; nine abilities/ranks; school facility requests; free October scouting; 14 gender-separated event results; female hurdles replay; indoor event/standard display and dual meet queue; v2 save/reload/export/import; v1 preservation; mobile layouts.');
    console.log('Screenshots: ' + artifact('hokago-v2-desktop.png') + ', ' + artifact('hokago-v2-mobile.png'));
    console.log('PASS: published-path assets; desktop/mobile manual save and rendered reload; previous-save restore; damaged-primary recovery; 60-meet export/import over 2 MB; failed-write warning and in-memory export/import; retry after storage recovery; stale-tab overwrite prevention.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
