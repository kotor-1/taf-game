/* End-to-end checks for the live weekly practice; never creates accounts. */
'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const E=require('./engine.js');
let playwright;
for(const modulePath of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(modulePath);break;}catch{}}
if(!playwright)throw Error('Playwright is required.');
const url=process.env.GAME_URL||'http://127.0.0.1:4173',output=process.env.QA_OUTPUT_DIR||'/tmp/taf-journey-qa',key='hokago-track-club-save-v2';
const errors=[];
const read=page=>page.evaluate(k=>TrackSaveStore.decode(localStorage.getItem(k)),key);
const nav=(page,id)=>page.locator(`.nav-btn[data-page="${id}"]`).click();
const action=(page,id)=>page.locator(`[data-action="${id}"]`).first();
const practice=(page,id)=>page.locator(`#practice-dialog [data-training-action="${id}"]`).first();
async function ready(page){await page.locator('#campus').waitFor();await page.waitForFunction(()=>document.querySelector('[data-tutorial-welcome]'));}
async function load(page,game){assert.equal(E.validateSave(game),true);await page.goto(url);await page.evaluate(({key,game})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify(game));},{key,game});await page.reload();await ready(page);}
async function stateAt(week){const game=E.createGame(210);while(game.week!==week){if(game.pendingMeet)E.skipMeet(game);else{if(game.monthPlanPending)E.confirmMonthlyPlan(game);E.advanceWeek(game);}}return game;}
async function start(page){await action(page,'start-training').click();await page.locator('#practice-dialog[open]').waitFor();}
async function decide(page,decision='balanced'){await practice(page,'skip').click();await page.locator(`[data-decision="${decision}"]`).click();}
async function finish(page){await practice(page,'skip').click();await practice(page,'close').click();await page.locator('.academy-summary').waitFor();}
(async()=>{
 await fs.mkdir(output,{recursive:true});const browser=await playwright.chromium.launch({headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await ready(page);
 assert.equal(await page.locator('[data-ability]').count(),9);assert.equal(await page.locator('[data-week-block]').count(),3);assert.doesNotMatch(await page.locator('[data-game-area]').innerText(),/部の活動費|万円/);
 await action(page,'monthly-plan').click();await action(page,'confirm-plan').click();
 await page.locator('[data-week-block="0"]').selectOption('load');await page.locator('[data-week-block="1"]').selectOption('skill');await page.locator('[data-week-block="2"]').selectOption('recovery');
 assert.deepEqual((await read(page)).weekRoute,['load','skill','recovery']);
 await page.locator('[data-action="route-swap"][data-from="0"][data-to="1"]').click();assert.deepEqual((await read(page)).weekRoute,['skill','load','recovery']);
 await page.reload();await ready(page);assert.equal(await page.locator('[data-week-block="0"]').inputValue(),'skill');
 const before=await read(page);await start(page);await practice(page,'pause').click();const paused=await page.locator('[data-practice-progress]').getAttribute('style');await page.waitForTimeout(160);assert.equal(await page.locator('[data-practice-progress]').getAttribute('style'),paused);
 await page.locator('[data-training-action="speed"][data-speed="4"]').click();assert.equal(await page.locator('[data-speed="4"]').getAttribute('aria-pressed'),'true');
 await practice(page,'close').click();assert.deepEqual(await read(page),before,'Closing before the decision does not advance or change athletes');
 await start(page);await practice(page,'skip').click();await page.keyboard.press('Escape');assert.deepEqual(await read(page),before,'Esc during the decision cancels the presentation');
 await start(page);await practice(page,'skip').click();await page.reload();await ready(page);assert.deepEqual(await read(page),before,'Reload before committing keeps the same week');
 await start(page);await practice(page,'skip').click();const selected=before.athletes[3].id;await page.locator('[data-practice-target]').selectOption(selected);assert.match(await page.locator('[data-instruction-text]').innerText(),new RegExp(before.athletes[3].name));await page.screenshot({path:path.join(output,'desktop-decision.png')});
 await page.locator('[data-decision="push"]').evaluate(b=>{b.click();b.click();});let after=await read(page);assert.equal(after.totalWeeks,before.totalWeeks+1,'Double decision clicks advance exactly one week');assert.equal(after.lastReport.coachedAthleteId,selected);assert.equal(after.lastReport.decision,'push');assert.equal(E.validateSave(after),true);
 await page.reload();await ready(page);assert.equal((await read(page)).totalWeeks,after.totalWeeks,'Reload after commit retains exactly one week');assert.equal(await page.locator('.academy-summary').count(),1);assert.equal(await page.locator('#practice-dialog[open]').count(),0);
 await nav(page,'training');await start(page);await decide(page,'care');await finish(page);assert.equal(await page.locator('.nav-btn[data-page="overview"]').getAttribute('aria-current'),'page');assert.equal(await page.locator('#game-dialog[open]').count(),0,'Weekly growth is inline, without a mandatory modal');
 await nav(page,'facilities');const free=await read(page);assert.equal(free.money,0);await action(page,'upgrade').click();await action(page,'upgrade').click();assert.equal(E.getFacilityPlan(await read(page)).available,0);assert.equal(await page.locator('[data-action="upgrade"]:not([disabled])').count(),0);
 const autumn=await stateAt(25);while(autumn.pendingMeet)E.skipMeet(autumn);await load(page,autumn);await nav(page,'scouting');assert.equal(await page.locator('.scout-card').count(),12);await page.locator('[data-action="recruit"]:not([disabled])').first().click();assert.equal((await read(page)).scouted.length,1);assert.equal((await read(page)).money,0);
 const old=E.createGame(6);for(const a of [...old.athletes,...old.candidates]){delete a.stats.acceleration;delete a.stats.speedEndurance;}delete old.weekRoute;delete old.facilityPlan;await load(page,old);assert.equal(await page.locator('[data-ability]').count(),9);assert.doesNotMatch(await page.locator('[data-spotlight-card]').innerText(),/NaN|undefined/);await action(page,'monthly-plan').click();await action(page,'confirm-plan').click();await start(page);await decide(page);await finish(page);assert.ok((await read(page)).athletes.every(a=>Number.isFinite(a.stats.acceleration)&&Number.isFinite(a.stats.speedEndurance)));
 const week4=await stateAt(4);await load(page,week4);await start(page);await decide(page);await finish(page);assert.equal((await read(page)).week,5);assert.equal((await read(page)).pendingMeet.id,'district');await action(page,'monthly-plan').click();await action(page,'confirm-plan').click();await action(page,'enter-meet').click();assert.equal(await page.locator('#practice-dialog[open]').count(),0);await action(page,'close').click();
 const endYear=await stateAt(48);await load(page,endYear);await start(page);await decide(page);await finish(page);after=await read(page);assert.equal(after.year,2);assert.equal(after.week,1);assert.equal(after.athletes.length,24);assert.equal(E.validateSave(after),true);
 const injured=E.createGame(32);E.confirmMonthlyPlan(injured);injured.athletes.forEach(a=>a.injury=2);await load(page,injured);await start(page);await decide(page,'care');await finish(page);assert.equal((await read(page)).totalWeeks,1,'Whole-team recovery works even if all athletes are injured');
 const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,reducedMotion:'reduce'}),mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url);await ready(mobile);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overview fits mobile width');await mobile.screenshot({path:path.join(output,'mobile-overview.png'),fullPage:true});await action(mobile,'monthly-plan').click();await action(mobile,'confirm-plan').click();await start(mobile);await mobile.waitForFunction(()=>document.querySelector('#practice-dialog')?.dataset.phase==='decision');assert.ok(await mobile.locator('#practice-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),'Live practice fits mobile width');await mobile.screenshot({path:path.join(output,'mobile-decision.png'),fullPage:true});await mobile.locator('[data-decision="balanced"]').click();await mobile.waitForFunction(()=>document.querySelector('#practice-dialog')?.dataset.phase==='finish');await practice(mobile,'close').click();assert.equal((await read(mobile)).totalWeeks,1);
 assert.deepEqual(errors,[]);console.log('PASS: route persistence, 9 abilities, cancellation/reload, exactly-once weekly decisions, target selection, inline growth, facilities, scouting, legacy saves, meet/year gates, injured team, reduced-motion mobile.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
