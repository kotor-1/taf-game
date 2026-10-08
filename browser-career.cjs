'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const E=require('./engine.js');
let chromium;
for(const modulePath of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{({chromium}=require(modulePath));break;}catch{}
}
if(!chromium)throw new Error('Playwright is required.');
const url=process.env.GAME_URL||'http://127.0.0.1:4173';
const out=process.env.QA_OUTPUT_DIR||path.join(os.tmpdir(),'taf-career-qa');
const key='hokago-track-club-save-v2';
const errors=[];
const read=page=>page.evaluate(key=>TrackSaveStore.create({storage:()=>localStorage,key,validate:TrackGame.validateSave}).load().state,key);
const action=(page,id)=>page.locator(`[data-action="${id}"]`).first().click();
const nav=(page,id)=>page.locator(`.nav-btn[data-page="${id}"]`).click();
async function overflow(page){const s=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(s.scroll<=s.width+1,JSON.stringify(s));}
function campaign(){
  const s=E.createGame(4131);
  while(s.year<4){
    if(s.pendingMeet){
      const entries={},used=new Set();
      for(const d of E.getMeetEvents(s).filter(d=>!d.teamSize)){
        const a=E.getEligibleAthletes(s,d).filter(a=>!used.has(a.id)).sort((a,b)=>Number(E.getEntryStatus(s,b,d).official)-Number(E.getEntryStatus(s,a,d).official)||E.getAthleteRating(b,d.id)*b.energy-E.getAthleteRating(a,d.id)*a.energy)[0];
        if(a){entries[d.key]=a.id;used.add(a.id);}
      }
      for(const d of E.getMeetEvents(s).filter(d=>d.teamSize)){
        const a=E.getEligibleAthletes(s,d).sort((a,b)=>E.getAthleteRating(b,'relay')-E.getAthleteRating(a,'relay')).slice(0,4);
        if(a.length===4)entries[d.key]=a.map(a=>a.id);
      }
      assert.equal((Object.keys(entries).length?E.runMeet(s,entries,'steady'):E.skipMeet(s)).ok,true);continue;
    }
    for(const f of E.FACILITIES){const cost=E.getFacilityCost(s,f.id);if(cost&&s.money>cost+50000)E.upgradeFacility(s,f.id);}
    for(const a of s.athletes){
      const event=E.EVENTS.find(e=>e.id===E.getSuitability(a)[0].eventId);
      E.setTraining(s,a.id,a.energy<65?'rest':E.getDefaultTraining(event.id));
      E.setFocus(s,a.id,Object.entries(event.weights).sort(([ka,wa],[kb,wb])=>wb*(100-a.stats[kb])-wa*(100-a.stats[ka]))[0][0]);
    }
    if(s.monthPlanPending)E.confirmMonthlyPlan(s);
    assert.equal(E.advanceWeek(s).ok,true);
  }
  assert.equal(E.validateSave(s),true);return s;
}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try{
    const mature=campaign();
    for(const [label,viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
      const context=await browser.newContext({viewport,reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(({key,state})=>{if(!sessionStorage.getItem('career-seeded')){localStorage.setItem(key,JSON.stringify(state));sessionStorage.setItem('career-seeded','1');}},{key,state:E.createGame(331)});
      await page.goto(url);await page.locator('#campus').waitFor();
      await nav(page,'career');
      await page.locator('[data-action="season-goal"][data-id="relay"]').click();
      await page.locator('[data-action="season-mode"][data-id="challenge"]').click();
      let s=await read(page);assert.equal(s.career.season.goalId,'relay');assert.equal(s.career.season.mode,'challenge');
      await overflow(page);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,label+'-annual-goals.png'),fullPage:true});
      await nav(page,'training');
      await action(page,'auto-focus');s=await read(page);assert.ok(s.athletes.every(a=>E.FOCUSES.some(f=>f.id===a.focus)));
      await action(page,'monthly-plan');await action(page,'confirm-plan');
      await action(page,'advance');await action(page,'close');
      await nav(page,'career');assert.equal(await page.locator('[data-action="season-mode"]:not([disabled])').count(),0);
      await page.reload();await page.locator('#campus').waitFor();s=await read(page);assert.equal(s.career.season.mode,'challenge');assert.equal(s.week,2);
      await page.locator('#import-save').setInputFiles({name:'mature.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mature))});
      await page.locator('#confirm-import').click();
      assert.equal((await read(page)).year,4);
      const relayMeet=mature.history.findIndex(m=>m.results.some(r=>r.eventId==='relay'&&r.newBest));
      assert.ok(relayMeet>=0);
      await nav(page,'calendar');await page.locator(`[data-action="past-meet"][data-index="${relayMeet}"]`).click();
      const relayResult=mature.history[relayMeet].results.find(r=>r.eventId==='relay'&&r.newBest);
      assert.ok((await page.locator(`[data-result-event="${relayResult.divisionKey}"]`).textContent()).includes('NEW TEAM BEST!'));
      await action(page,'close');
      const specMeet=mature.history.findIndex(m=>m.results.some(r=>r.personalBest&&!r.newBest));
      if(specMeet>=0){
        await page.locator(`[data-action="past-meet"][data-index="${specMeet}"]`).click();
        const specResult=mature.history[specMeet].results.find(r=>r.personalBest&&!r.newBest);
        assert.ok((await page.locator(`[data-result-event="${specResult.divisionKey}"]`).textContent()).includes('NEW PERSONAL BEST!'));
        await action(page,'close');
      }
      await nav(page,'career');
      for(const tab of ['records','alumni','seasons']){
        await page.locator(`[data-action="career-tab"][data-id="${tab}"]`).click();
        await page.locator(`[data-career-content="${tab}"]`).waitFor();await overflow(page);
        assert.ok(await page.locator(tab==='records'?'.legacy-record':tab==='alumni'?'.legacy-alumnus':'.legacy-season').count()>0);
        if(tab==='alumni'){assert.equal(await page.locator('.legacy-alumnus').count(),12);await page.locator('.legacy-alumnus summary').first().click();}
        await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,label+'-'+tab+'.png'),fullPage:true});
      }
      await nav(page,'diary');
      const downloadPromise=page.waitForEvent('download');await action(page,'export');const download=await downloadPromise;
      const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(E.validateSave(exported),true);assert.deepEqual(exported.career,mature.career);
      await page.reload();await page.locator('#campus').waitFor();assert.equal((await read(page)).career.alumni.length,12);
      // An existing v2 save is still readable and becomes a career save on first game action.
      const legacy=E.createGame(64);delete legacy.career;
      await page.locator('#import-save').setInputFiles({name:'legacy-v2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await page.locator('#confirm-import').click();
      await nav(page,'career');assert.ok((await page.locator('.legacy-hero').textContent()).includes('次の世代'));
      await page.locator('[data-action="season-goal"][data-id="interhigh"]').click();assert.equal(E.validateSave(await read(page)),true);
      await context.close();console.log(label+': yearly choices, locking, reload, 3 generations, records, alumni, archive, export, old-save compatibility PASS');
    }
    assert.deepEqual(errors,[]);console.log('Career browser QA passed; screenshots: '+out);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
