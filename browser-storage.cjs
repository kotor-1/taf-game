/* Long-campaign storage QA. Use a real long-run fixture from long-run.test.cjs:
 * TAF_LONG_SAVE_FILE=/tmp/taf-long-run-career/adaptive.json node browser-storage.cjs
 * Optionally set TAF_AUTH_QA_FILE to reuse two existing disposable accounts and
 * exercise real cloud migration/resume. This script never creates accounts.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const E=require('./engine.js');
const P=require('./persistence.js');
const fixturePath=process.env.TAF_LONG_SAVE_FILE;
if(!fixturePath){console.log('SKIP: long-save browser QA requires TAF_LONG_SAVE_FILE.');process.exit(0);}
let playwright;
for(const candidate of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(candidate);break;}catch{}}
if(!playwright)throw Error('Playwright is required for optional browser QA.');
const url=process.env.GAME_URL||'http://127.0.0.1:4173';
const output=process.env.QA_OUTPUT_DIR||'/tmp/taf-storage-qa';
const key='hokago-track-club-save-v2';
const accountKey=account=>key+':account:'+account.userId;
const secrets=new Set(),errors=[];
const networkByPage=new WeakMap();
const readSave=(page,k=key)=>page.evaluate(k=>TrackSaveStore.decode(localStorage.getItem(k)),k);
const action=(page,id)=>page.locator(`[data-action="${id}"]`).first();
const accountAction=(page,id)=>page.locator(`[data-account-action="${id}"]`).first();
async function close(page){if(await page.locator('#game-dialog[open]').count())await page.locator('#game-dialog [data-action="close"]').last().click();}
async function waitSynced(page,account){
  try{await page.waitForFunction(k=>{const m=JSON.parse(localStorage.getItem(k+'-sync')||'null');return m&&!m.pending&&m.baseRevision>=1;},accountKey(account),{timeout:90000});}
  catch(error){const diagnostic=await page.evaluate(k=>{const m=JSON.parse(localStorage.getItem(k+'-sync')||'null');return {sync:m?{pending:m.pending,baseRevision:m.baseRevision}:null,status:[...document.querySelectorAll('[data-cloud-status]')].map(node=>node.textContent)};},accountKey(account));throw Error('Cloud sync timed out: '+JSON.stringify({...diagnostic,network:networkByPage.get(page)||[]}));}
}
async function login(page,account){
  await close(page);await accountAction(page,'open').click();await accountAction(page,'signin-tab').click();
  await page.locator('#login-id').fill(account.username);await page.locator('#login-password').fill(account.password);
  await page.locator('#account-form button[type=submit]').click();await page.locator('[data-account-panel]').waitFor({timeout:30000});
  assert.equal((await page.locator('.account-reference code').textContent()).trim(),account.userId);
  if(await accountAction(page,'use-local').count())await accountAction(page,'use-local').click();else await close(page);
  await waitSynced(page,account);
}
async function logout(page){await close(page);await accountAction(page,'open').click();await accountAction(page,'logout-confirm').click();await accountAction(page,'logout').click();await page.waitForFunction(()=>document.querySelector('.account-strip-copy strong')?.textContent==='ゲストでプレイ中');}
async function observe(page){
  const network=[];networkByPage.set(page,network);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{const endpoint=new URL(response.url()).pathname;if(endpoint.startsWith('/rest/v1/'))network.push({endpoint,status:response.status(),elapsedMs:Math.round(Date.now()-response.request().timing().startTime)});});
  page.on('requestfailed',request=>{const endpoint=new URL(request.url()).pathname;if(endpoint.startsWith('/rest/v1/'))network.push({endpoint,error:request.failure()?.errorText,elapsedMs:Math.round(Date.now()-request.timing().startTime)});});
  await page.goto(url);await page.locator('#campus').waitFor();
}
(async()=>{
  const game=JSON.parse(await fs.readFile(fixturePath,'utf8'));assert.equal(E.validateSave(game),true);assert.equal(game.history.length,60);assert.equal(game.athletes.length,36);
  const raw=JSON.stringify(game),packed=P.encode(game);assert.ok(raw.length>1000000,'Use a mature long-campaign fixture');
  let accounts=null;
  if(process.env.TAF_AUTH_QA_FILE){const stat=await fs.stat(process.env.TAF_AUTH_QA_FILE);assert.equal(stat.mode&0o077,0);accounts=JSON.parse(await fs.readFile(process.env.TAF_AUTH_QA_FILE,'utf8')).accounts;assert.ok(accounts[0]?.userId&&accounts[1]?.userId);for(const a of accounts)secrets.add(a.password);}
  const ids=accounts?accounts.map(a=>a.userId):['storage-qa-a','storage-qa-b'];
  await fs.mkdir(output,{recursive:true});const browser=await playwright.chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});const page=await context.newPage();
    await page.addInitScript(({key,packed})=>{if(!sessionStorage.getItem('qa-long-seeded')){localStorage.setItem(key,packed);localStorage.setItem(key+'-backup',packed);sessionStorage.setItem('qa-long-seeded','1');}},{key,packed});
    await observe(page);assert.equal((await readSave(page)).year,game.year);
    const sizes=await page.evaluate(({key,game,raw,ids})=>{
      let legacyQuotaHit=false;const testKeys=[];
      try{for(let i=0;i<6;i++){const k='qa-long-raw-'+i;testKeys.push(k);localStorage.setItem(k,raw);}}catch(error){if(error.name!=='QuotaExceededError')throw error;legacyQuotaHit=true;}finally{for(const k of testKeys)localStorage.removeItem(k);}
      const saved=[];
      for(const [index,k]of [key,...ids.map(id=>key+':account:'+id)].entries()){
        const store=TrackSaveStore.create({storage:()=>localStorage,validate:TrackGame.validateSave,key:k});store.load();
        if(!store.save(game))throw Error('Long save failed');const next=structuredClone(game);next.schoolName=['長期ゲスト保存高校','長期アカウントＡ高校','長期アカウントＢ高校'][index];
        if(!store.save(next))throw Error('Long backup failed');
        saved.push({characters:localStorage.getItem(k).length,backupCharacters:localStorage.getItem(k+'-backup').length,valid:TrackGame.validateSave(store.load().state),history:store.backup().history.length});
      }
      return {legacyQuotaHit,rawCharacters:raw.length,storedCharacters:saved.reduce((n,s)=>n+s.characters+s.backupCharacters,0),slots:saved};
    },{key,game,raw,ids});
    assert.equal(sizes.legacyQuotaHit,true,'Uncompressed copies demonstrate the real browser quota boundary');assert.ok(sizes.slots.every(s=>s.valid&&s.history===60));assert.ok(sizes.storedCharacters<raw.length);
    await page.reload();assert.equal((await readSave(page)).schoolName,'長期ゲスト保存高校');
    assert.equal(await page.locator('[data-save-status]').first().getAttribute('data-save-state'),'saved');
    const pastIndex=game.history.findIndex(meet=>meet.results.some(result=>!game.athletes.some(a=>a.id===result.athleteId)));
    assert.ok(pastIndex>=0,'The mature fixture includes a graduated athlete result');
    const resultIndex=game.history[pastIndex].results.findIndex(result=>!game.athletes.some(a=>a.id===result.athleteId));
    await page.locator('.nav-btn[data-page="calendar"]').click();await page.locator(`[data-action="past-meet"][data-index="${pastIndex}"]`).click();await page.locator(`[data-action="replay-event"][data-index="${resultIndex}"]`).click();await page.locator('#race-canvas').waitFor();await action(page,'race-skip').click();await page.locator('.result-row').first().waitFor();await close(page);
    assert.equal((await readSave(page)).history.length,60);assert.equal((await readSave(page)).year,game.year);
    await page.locator('[data-page="career"]').first().click();await page.screenshot({path:path.join(output,'long-career.png'),fullPage:true});
    const downloaded=page.waitForEvent('download');await action(page,'settings').click();await action(page,'export').click();const download=await downloaded;const exported=path.join(output,'long-save-export.json');await download.saveAs(exported);
    const exportedGame=JSON.parse(await fs.readFile(exported,'utf8'));assert.equal(E.validateSave(exportedGame),true);assert.equal(exportedGame.history.length,60);await close(page);
    console.log('PASS: actual Chromium quota exceeded by legacy copies; compressed guest + two accounts + three backups fit, all 60 meet histories retained.');
    console.log(JSON.stringify({year:game.year,athletes:game.athletes.length,rawCharacters:sizes.rawCharacters,totalSixSlotCharacters:sizes.storedCharacters,largestPackedSlot:Math.max(...sizes.slots.map(s=>s.characters))}));
    console.log('PASS: mature save reload, graduated-athlete highlight replay, career screen, normal JSON export.');
    if(accounts){
      const [A,B]=accounts;console.log('CHECK: upload current full fixture to existing account A.');await login(page,A);assert.deepEqual(await readSave(page,accountKey(A)),{...game,schoolName:'長期アカウントＡ高校'},'Upload this run\'s complete fixture rather than an older cloud save from a previous QA run');
      await close(page);await page.locator('[data-page="overview"]').first().click();
      let before=await readSave(page,accountKey(A));if(before.monthPlanPending){await action(page,'monthly-plan').click();await action(page,'confirm-plan').click();await close(page);}
      const beforePractice=await readSave(page,accountKey(A));
      await action(page,'start-training').click();await page.locator('#practice-dialog[open]').waitFor();
      assert.deepEqual(await readSave(page,accountKey(A)),beforePractice,'Live practice remains uncommitted until the coaching choice');
      if(!await page.locator('[data-training-action="decide"]:visible').count())await page.locator('[data-training-action="skip"]').click();
      await page.locator('[data-training-action="decide"][data-decision="balanced"]').click();
      if(await page.locator('#practice-dialog').getAttribute('data-phase')!=='finish')await page.locator('[data-training-action="skip"]').click();
      await page.locator('.practice-finish-action [data-training-action="close"]').click();
      await page.locator('.academy-summary').waitFor();await waitSynced(page,A);const progressed=await readSave(page,accountKey(A));assert.equal(progressed.totalWeeks,game.totalWeeks+1);
      console.log('CHECK: load latest cloud save into a separate mobile browser.');const second=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const other=await second.newPage();await observe(other);await login(other,A);await close(other);
      assert.deepEqual(await readSave(other,accountKey(A)),progressed);assert.equal((await readSave(other,accountKey(A))).history.length,60);await other.screenshot({path:path.join(output,'long-cloud-mobile.png'),fullPage:true});
      await logout(page);assert.equal((await readSave(page)).schoolName,'長期ゲスト保存高校');await login(page,B);assert.deepEqual(await readSave(page,accountKey(B)),{...game,schoolName:'長期アカウントＢ高校'});assert.equal((await readSave(page,accountKey(A))).totalWeeks,progressed.totalWeeks);
      assert.equal(await page.locator('[data-save-status]').first().getAttribute('data-save-state'),'saved');
      console.log('PASS: real Supabase long-save upload, one-week progression, separate-mobile-browser resume and second-account isolation; no new accounts.');
    }
    assert.deepEqual(errors,[],'No JavaScript errors during long-campaign play');console.log('Screenshots: '+output);
  }finally{await browser.close();}
})().catch(error=>{let message=String(error.message);for(const secret of secrets)message=message.replaceAll(secret,'[redacted]');console.error(message);process.exitCode=1;});
