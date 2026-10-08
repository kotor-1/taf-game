/* Tutorial integration QA. Start the game server first.
 * GAME_URL, QA_OUTPUT_DIR and PLAYWRIGHT_MODULE_PATH may override defaults.
 * Authentication settings are stubbed; these tests never create or use accounts.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const E=require('./engine.js');
let chromium;
for(const candidate of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(candidate));break;}catch{}
}
if(!chromium)throw Error('Playwright is required for optional tutorial browser QA.');
const url=process.env.GAME_URL||'http://127.0.0.1:4173';
const output=process.env.QA_OUTPUT_DIR||'/tmp/taf-tutorial-qa';
const saveKey='hokago-track-club-save-v2';
const tutorialKey='hokago-track-club-tutorial-v1';
const steps=['athlete','plan','card','week','calendar','career','save'];
const errors=[];
const readGame=page=>page.evaluate(key=>TrackSaveStore.decode(localStorage.getItem(key)),saveKey);
const readTutorial=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),tutorialKey);
const readBackup=page=>page.evaluate(key=>TrackSaveStore.decode(localStorage.getItem(key+'-backup')),saveKey);
async function button(page,selector){
  const inDialog=page.locator('#game-dialog[open] '+selector+':visible');
  return await inDialog.count()?inDialog.first():page.locator(selector+':visible').first();
}
const tutorialButton=(page,id)=>button(page,`[data-tutorial-action="${id}"]`);
const gameButton=(page,id)=>button(page,`[data-action="${id}"]`);
async function tutorialAction(page,id){await (await tutorialButton(page,id)).click();}
async function gameAction(page,id){await (await gameButton(page,id)).click();}
async function close(page){if(await page.locator('#game-dialog[open]').count())await gameAction(page,'close');}
async function expectTutorial(page,expected){
  await page.waitForFunction(({key,expected})=>{const actual=JSON.parse(localStorage.getItem(key)||'null');return actual&&Object.entries(expected).every(([k,v])=>actual[k]===v);},{key:tutorialKey,expected});
}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
async function overflow(page,label){
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dialog:document.querySelector('#game-dialog[open]')?.getBoundingClientRect().toJSON()}));
  assert.ok(dimensions.scroll<=dimensions.width+1,label+' has horizontal page overflow');
  if(dimensions.dialog)assert.ok(dimensions.dialog.x>=-1&&dimensions.dialog.right<=dimensions.width+1,label+' has horizontal dialog overflow');
}
async function freshPage(browser,{viewport={width:1440,height:1000},state,backup,tutorial}={}){
  const context=await browser.newContext({viewport,reducedMotion:'reduce',acceptDownloads:true,...(viewport.width<600?{isMobile:true,hasTouch:true}:{} )});
  await context.route('**/auth/v1/settings',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({external:{email:true},disable_signup:false,mailer_autoconfirm:true})}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  if(state||backup||tutorial)await page.addInitScript(({saveKey,tutorialKey,state,backup,tutorial})=>{
    if(sessionStorage.getItem('qa-tutorial-seeded'))return;
    if(state)localStorage.setItem(saveKey,JSON.stringify(state));
    if(backup)localStorage.setItem(saveKey+'-backup',JSON.stringify(backup));
    if(tutorial)localStorage.setItem(tutorialKey,JSON.stringify(tutorial));
    sessionStorage.setItem('qa-tutorial-seeded','1');
  },{saveKey,tutorialKey,state,backup,tutorial});
  await page.goto(url);await page.locator('#campus').waitFor();
  return {context,page};
}
function olderGame(){
  const game=E.createGame(622);game.schoolName='既存の部活を保護';
  while(game.year<4||game.week<8){
    if(game.pendingMeet){assert.equal(E.skipMeet(game).ok,true);continue;}
    if(game.monthPlanPending)assert.equal(E.confirmMonthlyPlan(game).ok,true);
    assert.equal(E.advanceWeek(game).ok,true);
  }
  delete game.career;assert.equal(E.validateSave(game),true);return game;
}
async function checkFullWalkthrough(browser,label,viewport){
  const {context,page}=await freshPage(browser,{viewport});
  try{
    await page.locator('[data-tutorial-welcome]').waitFor();
    assert.equal(await page.locator('#game-dialog[open]').count(),0,'First welcome must not force a modal');
    const original=await readGame(page),originalBackup=await readBackup(page);
    assert.equal(original.week,1);assert.equal(original.athletes.length,12);
    await screenshot(page,label+'-welcome');await overflow(page,label+' welcome');
    await tutorialAction(page,'start');await expectTutorial(page,{status:'active',step:0,completed:false});
    assert.deepEqual(await readGame(page),original,'Starting the guide must not reset or advance the game');
    assert.deepEqual(await readBackup(page),originalBackup);

    await tutorialAction(page,'do');await page.locator('.detail-profile').waitFor();
    await expectTutorial(page,{step:0,completed:true});
    assert.equal(await page.locator('[data-tutorial-step]:visible').count(),1,'The guide must not duplicate across the modal and main screen');
    assert.deepEqual(await readGame(page),original,'Inspecting athlete abilities is read-only');
    await overflow(page,label+' athlete guide');await screenshot(page,label+'-athlete');
    await close(page);await tutorialAction(page,'next');await expectTutorial(page,{step:1,completed:false});

    await tutorialAction(page,'do');await page.locator('#game-dialog [data-action="confirm-plan"]').waitFor();
    assert.equal((await readTutorial(page)).completed,false,'Opening monthly planning is not confirming it');
    const focus=page.locator('#game-dialog select[data-focus]').first();
    const previous=await focus.inputValue(),chosen=previous==='power'?'speed':'power';
    const athleteId=await focus.getAttribute('data-focus');await focus.selectOption(chosen);
    assert.equal((await readGame(page)).athletes.find(a=>a.id===athleteId).focus,chosen);
    assert.equal((await readGame(page)).week,1);assert.equal((await readTutorial(page)).completed,false);
    await gameAction(page,'confirm-plan');await expectTutorial(page,{step:1,completed:true});
    assert.equal((await readGame(page)).monthPlanPending,false);
    await close(page);await tutorialAction(page,'next');await expectTutorial(page,{step:2,completed:false});

    await tutorialAction(page,'do');assert.equal((await readTutorial(page)).completed,false,'Card step requires an explicit selection');
    const card=page.locator('[data-action="practice-card"]:not(.selected)').first();
    const cardId=await card.getAttribute('data-id');await card.click();await expectTutorial(page,{step:2,completed:true});
    assert.equal((await readGame(page)).selectedPracticeCard,cardId);assert.equal((await readGame(page)).week,1);
    await tutorialAction(page,'next');await expectTutorial(page,{step:3,completed:false});
    const beforeGoal=await readGame(page);
    await tutorialAction(page,'year-plan');await expectTutorial(page,{step:3,completed:false});
    assert.deepEqual(await readGame(page),beforeGoal,'Opening the optional annual plan must not consume April week 1');
    await page.locator('[data-action="season-goal"][data-id="relay"]').click();
    await page.locator('[data-action="season-mode"][data-id="challenge"]').click();
    assert.equal((await readGame(page)).career.season.goalId,'relay');assert.equal((await readGame(page)).career.season.mode,'challenge');
    assert.equal((await readGame(page)).week,1);await expectTutorial(page,{step:3,completed:false});
    const beforeWeek=await readGame(page);await tutorialAction(page,'do');
    await expectTutorial(page,{step:3,completed:true});const afterWeek=await readGame(page);
    assert.equal(afterWeek.week,beforeWeek.week+1);assert.equal(afterWeek.totalWeeks,beforeWeek.totalWeeks+1,'One guided advance is exactly one week');
    await overflow(page,label+' weekly report');await screenshot(page,label+'-week');await close(page);
    await tutorialAction(page,'next');await expectTutorial(page,{step:4,completed:false});

    const readOnly=await readGame(page),readOnlyBackup=await readBackup(page);
    for(const index of [4,5]){
      await tutorialAction(page,'do');await expectTutorial(page,{step:index,completed:true});
      assert.equal(await page.locator(`.nav-btn[data-page="${steps[index]}"]`).getAttribute('aria-current'),'page');
      assert.deepEqual(await readGame(page),readOnly,'Calendar and career guidance must not change the save');
      assert.deepEqual(await readBackup(page),readOnlyBackup);
      await overflow(page,label+' '+steps[index]);await tutorialAction(page,'next');
    }
    await expectTutorial(page,{step:6,completed:false});await tutorialAction(page,'do');
    await page.locator('#school-name').waitFor();assert.equal((await readTutorial(page)).completed,false,'Opening settings is not a successful save');
    await gameAction(page,'manual-save');await expectTutorial(page,{step:6,completed:true});
    await close(page);await tutorialAction(page,'next');await expectTutorial(page,{status:'done'});
    await page.locator('[data-tutorial-done]').waitFor();await screenshot(page,label+'-complete');
    const completed=await readGame(page);assert.equal(completed.week,2);assert.equal(E.validateSave(completed),true);
    await page.reload();await page.locator('#campus').waitFor();await expectTutorial(page,{status:'done'});
    assert.equal(await page.locator('[data-tutorial-step]:visible').count(),0);assert.deepEqual(await readGame(page),completed);
    await gameAction(page,'help');await tutorialAction(page,'restart');await expectTutorial(page,{status:'active',step:0,completed:false});
    assert.deepEqual(await readGame(page),completed,'Restarting the guide must never restart the club');
    console.log(label+': optional welcome, seven real-action steps, manual next, no duplicate week, reload, help restart, layout PASS');
  }finally{await context.close();}
}
async function checkOldSaveAndResume(browser){
  const old=olderGame(),backup=E.createGame(624),{context,page}=await freshPage(browser,{state:old,backup});
  try{
    await page.locator('[data-tutorial-welcome]').waitFor();assert.equal(await page.locator('#game-dialog[open]').count(),0);
    const before=await readGame(page),beforeBackup=await readBackup(page);assert.equal(before.year,4);assert.equal(before.week,8);
    await tutorialAction(page,'start');await tutorialAction(page,'skip');await expectTutorial(page,{status:'active',step:1,completed:false});
    assert.deepEqual(await readGame(page),before);assert.deepEqual(await readBackup(page),beforeBackup);
    await tutorialAction(page,'do');await page.locator('#game-dialog [data-action="confirm-plan"]').waitFor();
    await page.keyboard.press('Space');assert.deepEqual(await readGame(page),before,'Space in a dialog must not advance a hidden week');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#game-dialog[open]').count(),0);
    assert.deepEqual(await readGame(page),before);await expectTutorial(page,{status:'active',step:1,completed:false});
    await page.reload();await page.locator('#campus').waitFor();await expectTutorial(page,{status:'active',step:1,completed:false});
    assert.deepEqual(await readGame(page),before);assert.deepEqual(await readBackup(page),beforeBackup);
    await tutorialAction(page,'pause');await expectTutorial(page,{status:'paused',step:1});
    await page.reload();await page.locator('#campus').waitFor();await expectTutorial(page,{status:'paused',step:1});
    await gameAction(page,'help');await tutorialAction(page,'resume');await expectTutorial(page,{status:'active',step:1,completed:false});
    for(let index=1;index<7;index++){await expectTutorial(page,{status:'active',step:index});await tutorialAction(page,'skip');}
    await expectTutorial(page,{status:'done'});assert.deepEqual(await readGame(page),before);assert.deepEqual(await readBackup(page),beforeBackup);
    await screenshot(page,'existing-save-skipped');
    console.log('Existing v2 save: opt-in guide, exact progress/backup preservation, Escape/Space, active reload, pause/resume and explanation-only completion PASS');
  }finally{await context.close();}
}
async function checkDismissAndSaveFailure(browser){
  const {context,page}=await freshPage(browser,{state:E.createGame(625)});
  try{
    await page.locator('[data-tutorial-welcome]').waitFor();const before=await readGame(page);
    await tutorialAction(page,'dismiss');await expectTutorial(page,{status:'dismissed'});
    await page.reload();await page.locator('#campus').waitFor();assert.equal(await page.locator('[data-tutorial-welcome]:visible').count(),0);assert.deepEqual(await readGame(page),before);
    await gameAction(page,'help');
    const start=await tutorialButton(page,'start');if(await start.count())await start.click();else await tutorialAction(page,'restart');
    await expectTutorial(page,{status:'active',step:0});for(let i=0;i<6;i++)await tutorialAction(page,'skip');
    await expectTutorial(page,{status:'active',step:6,completed:false});
    await page.evaluate(key=>{
      window.__tutorialQaSetItem=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k.startsWith(key))throw new DOMException('QA quota exceeded','QuotaExceededError');return window.__tutorialQaSetItem.call(this,k,v);};
    },saveKey);
    await tutorialAction(page,'do');await page.locator('#school-name').fill('保存失敗の確認');await gameAction(page,'save-settings');
    assert.deepEqual(await readGame(page),before,'A failed save must leave the committed game intact');
    await tutorialAction(page,'do');await gameAction(page,'manual-save');
    assert.equal((await readTutorial(page)).completed,false,'A failed write must not complete the save tutorial step');
    assert.equal(await page.locator('[data-save-status]').first().getAttribute('data-save-state'),'error');
    const next=await tutorialButton(page,'next');if(await next.count())assert.equal(await next.isDisabled(),true);
    await screenshot(page,'save-failure-incomplete');
    await page.evaluate(()=>{Storage.prototype.setItem=window.__tutorialQaSetItem;delete window.__tutorialQaSetItem;});
    await gameAction(page,'manual-save');await expectTutorial(page,{step:6,completed:true});
    assert.equal((await readGame(page)).schoolName,'保存失敗の確認');assert.equal(E.validateSave(await readGame(page)),true);
    console.log('Dismiss/reload/help opt-in and failed-write tutorial gating with successful retry PASS');
  }finally{await context.close();}
}
async function checkFocusAndImport(browser){
  const state=E.createGame(626);E.confirmMonthlyPlan(state);
  const {context,page}=await freshPage(browser,{state,tutorial:{version:1,status:'active',step:4,completed:false}});
  try{
    await page.locator('[data-tutorial-step="calendar"]:visible').waitFor();const before=await readGame(page);
    await (await tutorialButton(page,'pause')).focus();
    // A cloud completion uses the same save/onStatus update path. A redundant
    // status render must not remove the keyboard's focused tutorial control.
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-tutorial-action')),'pause','A status update must preserve the focused guide button');
    await page.keyboard.press('Space');await expectTutorial(page,{status:'paused',step:4});
    assert.deepEqual(await readGame(page),before,'Space on the pause button must not become a one-week game shortcut');
    await gameAction(page,'help');await tutorialAction(page,'resume');await expectTutorial(page,{status:'active',step:4});
    const imported=E.createGame(627);imported.schoolName='ガイド中の読込確認';
    await page.locator('#import-save').setInputFiles({name:'tutorial-import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.locator('#confirm-import').click();await expectTutorial(page,{status:'paused',step:4});
    assert.deepEqual(await readGame(page),imported,'Importing a save must pause stale tutorial instructions and preserve the imported game');
    console.log('Focused guide control survives save status updates; Space cannot become hidden week progress; importing another save safely pauses guidance PASS');
  }finally{await context.close();}
}
(async()=>{
  await fs.mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true});
  try{
    const phase=process.env.TUTORIAL_QA_PHASE||'all';assert.ok(['all','walkthrough','preservation','focus'].includes(phase));
    if(['all','walkthrough'].includes(phase)){await checkFullWalkthrough(browser,'desktop',{width:1440,height:1000});await checkFullWalkthrough(browser,'mobile',{width:390,height:844});}
    if(['all','preservation'].includes(phase)){await checkOldSaveAndResume(browser);await checkDismissAndSaveFailure(browser);}
    if(['all','focus'].includes(phase))await checkFocusAndImport(browser);
    assert.deepEqual(errors,[],'No tutorial or game JavaScript runtime errors');console.log('Tutorial browser QA passed; screenshots: '+output);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
