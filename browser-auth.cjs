/* Optional LIVE integration QA. Never commit account credentials.
 * TAF_AUTH_QA_FILE must point to a mode-600 JSON fixture containing
 * {accounts:[{username,password,userId},...],databaseChecksDone:true}.
 * A first account without userId is created through the signup UI only when
 * TAF_AUTH_QA_ALLOW_SIGNUP=1. Subsequent tests reuse these disposable accounts.
 * GAME_URL, PLAYWRIGHT_MODULE_PATH and QA_OUTPUT_DIR can override defaults.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const E=require('./engine.js');
const fixturePath=process.env.TAF_AUTH_QA_FILE;
if(!fixturePath){console.log('SKIP: live auth QA requires TAF_AUTH_QA_FILE with disposable account credentials.');process.exit(0);}
let playwright;
for(const candidate of [process.env.PLAYWRIGHT_MODULE_PATH,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){
  try{playwright=require(candidate);break;}catch{}
}
if(!playwright)throw Error('Playwright is required for optional live auth QA.');
const url=process.env.GAME_URL||'http://127.0.0.1:4173';
const output=process.env.QA_OUTPUT_DIR||path.join(os.tmpdir(),'taf-auth-ui-qa');
const key='hokago-track-club-save-v2';
const accountKey=account=>key+':account:'+account.userId;
const errors=[];
const secrets=new Set();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const accountAction=(page,action)=>page.locator(`[data-account-action="${action}"]`).first();
const gameAction=(page,action)=>page.locator(`[data-action="${action}"]`).first();
const readSave=(page,account)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),account?accountKey(account):key);
const readFixture=async()=>{const data=JSON.parse(await fs.readFile(fixturePath,'utf8'));for(const account of data.accounts||[])if(account.password)secrets.add(account.password);return data;};
async function updateFixture(fn){
  const fixture=await readFixture();fn(fixture);
  const temp=fixturePath+'.browser-tmp';await fs.writeFile(temp,JSON.stringify(fixture,null,2),{mode:0o600});await fs.rename(temp,fixturePath);
}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
async function closeDialog(page){if(await page.locator('#game-dialog[open]').count())await page.locator('#game-dialog [data-action="close"]').last().click();}
async function seed(page,name){
  const game=E.createGame(19);game.schoolName=name;
  await page.addInitScript(({key,game})=>{
    if(!sessionStorage.getItem('qa-auth-seeded')){localStorage.setItem(key,JSON.stringify(game));sessionStorage.setItem('qa-auth-seeded','1');}
  },{key,game});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.locator('#campus').waitFor();
  await page.locator('[data-account-bar]').waitFor();
  return game;
}
async function waitSynced(page,account){
  await page.waitForFunction(key=>{const m=JSON.parse(localStorage.getItem(key+'-sync')||'null');return m&&!m.pending&&m.baseRevision>=1;},accountKey(account),{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('.account-strip [data-cloud-status]')?.textContent.includes('クラウド保存済み'),null,{timeout:30000});
}
async function login(page,account,signup=false){
  await accountAction(page,'open').click();
  await accountAction(page,signup?'signup-tab':'signin-tab').click();
  await page.locator('#login-id').fill(account.username);
  await page.locator('#login-password').fill(account.password);
  if(signup)await page.locator('#login-password-confirm').fill(account.password);
  await page.locator('#account-form button[type=submit]').click();
  await page.locator('[data-account-panel]').waitFor({timeout:30000});
  const userId=(await page.locator('.account-reference code').textContent()).trim();
  if(account.userId)assert.equal(userId,account.userId);else account.userId=userId;
  await page.waitForFunction(()=>{const text=document.querySelector('.account-strip [data-cloud-status]')?.textContent||'';return !text.includes('確認中');},null,{timeout:30000});
}
async function logout(page){
  await closeDialog(page);await accountAction(page,'open').click();
  await accountAction(page,'logout-confirm').click();await accountAction(page,'logout').click();
  await page.waitForFunction(()=>document.querySelector('.account-strip-copy strong')?.textContent==='ゲストでプレイ中');
}
async function rename(page,name){
  await closeDialog(page);await gameAction(page,'settings').click();
  await page.locator('#school-name').fill(name);await gameAction(page,'save-settings').click();
  await closeDialog(page);
  assert.ok((await page.locator('.school-name').textContent()).includes(name));
}
async function advance(page,account){
  await closeDialog(page);
  let data=await readSave(page,account);
  if(data.monthPlanPending){await gameAction(page,'monthly-plan').click();await gameAction(page,'confirm-plan').click();await closeDialog(page);}
  data=await readSave(page,account);
  assert.equal(data.pendingMeet,null);
  await gameAction(page,'advance').click();await closeDialog(page);
  assert.equal((await readSave(page,account)).week,data.week+1);
}
async function checkOverflow(page,label){
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,dialog:document.querySelector('#game-dialog[open]')?.getBoundingClientRect().toJSON()}));
  assert.ok(dimensions.page<=dimensions.viewport+1,label+' page overflow');
  if(dimensions.dialog)assert.ok(dimensions.dialog.x>=-1&&dimensions.dialog.right<=dimensions.viewport+1,label+' dialog overflow');
}

(async()=>{
  const fileMode=(await fs.stat(fixturePath)).mode&0o777;
  assert.equal(fileMode&0o077,0,'The account fixture must not be readable by other users.');
  await fs.mkdir(output,{recursive:true});
  let fixture=await readFixture();assert.ok(fixture.accounts?.[0]?.username&&fixture.accounts[0].password);
  const A=fixture.accounts[0];
  const browser=await playwright.chromium.launch({headless:true});
  try{
    const first=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    const page=await first.newPage();const guest=await seed(page,'ゲスト保存確認高校');
    await advance(page);const progressedGuest=await readSave(page);
    assert.equal(progressedGuest.week,guest.week+1);
    await accountAction(page,'open').click();
    assert.equal(await page.locator('a[href^="mailto:rkoto2810@gmail.com"]').count(),1);
    await screenshot(page,'desktop-login');await closeDialog(page);
    const signingUp=!A.userId;
    if(signingUp)assert.equal(process.env.TAF_AUTH_QA_ALLOW_SIGNUP,'1','Creating a QA account requires explicit fixture authorization.');
    await login(page,A,signingUp);
    if(signingUp){
      assert.equal(await accountAction(page,'use-local').count(),1);
      await screenshot(page,'desktop-first-save-choice');
      await accountAction(page,'use-local').click();await waitSynced(page,A);
      assert.deepEqual(await readSave(page,A),progressedGuest);
      await updateFixture(data=>{data.accounts[0].userId=A.userId;data.signupReady=true;});
      console.log('PASS: live UI signup with no email; explicit guest migration; original guest preserved. QA_SIGNUP_READY');
    }else{await closeDialog(page);await waitSynced(page,A);}
    assert.deepEqual(await readSave(page),progressedGuest);
    await rename(page,'クラウド同期確認高校');await waitSynced(page,A);
    await screenshot(page,'desktop-cloud-saved');

    // Database checks use the same two disposable users. Do not change their
    // password until the database tester signals that it has finished.
    for(let attempts=0;attempts<150;attempts++){
      fixture=await readFixture();if(fixture.accounts[1]?.userId&&fixture.databaseChecksDone)break;
      await wait(2000);
    }
    assert.ok(fixture.accounts[1]?.userId&&fixture.databaseChecksDone,'The two-account database QA fixture must be ready.');
    const B=fixture.accounts[1];

    const second=await browser.newContext({viewport:{width:1365,height:1000}});
    const other=await second.newPage();await seed(other,'別端末のゲスト高校');
    await login(other,A);await closeDialog(other);await waitSynced(other,A);
    assert.equal((await readSave(other,A)).schoolName,'クラウド同期確認高校');
    assert.equal((await readSave(other)).schoolName,'別端末のゲスト高校');
    assert.deepEqual(await readSave(other,A),await readSave(page,A));
    console.log('PASS: second independent browser resumes the same cloud save and retains its own guest.');

    // Both browsers have the same base revision. A change on each must create
    // an explicit choice, not last-writer-wins data loss.
    await rename(page,'先に進んだ端末高校');await waitSynced(page,A);
    await rename(other,'後から進んだ端末高校');
    await other.waitForFunction(()=>document.querySelector('.account-strip [data-cloud-status]')?.textContent.includes('異なる進行'),null,{timeout:30000});
    assert.equal((await readSave(other,A)).schoolName,'後から進んだ端末高校');
    assert.equal((await readSave(page,A)).schoolName,'先に進んだ端末高校');
    assert.equal(await other.locator('[data-game-area]').getAttribute('inert'),'');
    await accountAction(other,'open').click();await screenshot(other,'desktop-save-conflict');
    await accountAction(other,'use-remote').click();await waitSynced(other,A);
    assert.equal((await readSave(other,A)).schoolName,'先に進んだ端末高校');
    console.log('PASS: concurrent save conflict blocks play and preserves both choices; explicit cloud choice resumes safely.');

    await logout(page);assert.deepEqual(await readSave(page),progressedGuest);
    assert.ok((await page.locator('.school-name').textContent()).includes(progressedGuest.schoolName));
    await login(page,B);
    if(await accountAction(page,'use-remote').count())await accountAction(page,'use-remote').click();else await closeDialog(page);
    await waitSynced(page,B);
    assert.notEqual((await readSave(page,B)).schoolName,'先に進んだ端末高校');
    await rename(page,'第二アカウント専用高校');await waitSynced(page,B);
    assert.equal((await readSave(page,A)).schoolName,'先に進んだ端末高校');
    await logout(page);await login(page,A);await closeDialog(page);await waitSynced(page,A);
    assert.equal((await readSave(page,A)).schoolName,'先に進んだ端末高校');
    assert.equal((await readSave(page,B)).schoolName,'第二アカウント専用高校');
    console.log('PASS: logout restores the original guest; two accounts have isolated local and cloud progress.');

    await accountAction(page,'open').click();await accountAction(page,'password').click();
    const nextPassword='TafQa_'+crypto.randomBytes(18).toString('base64url');
    secrets.add(nextPassword);
    await page.locator('#new-password').fill(nextPassword);await page.locator('#new-password-confirm').fill(nextPassword);
    await page.locator('#password-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('パスワードを変更しました'),null,{timeout:30000});
    A.password=nextPassword;await updateFixture(data=>{data.accounts[0].password=nextPassword;data.passwordChangeChecked=true;});
    await logout(page);await login(page,A);await closeDialog(page);await waitSynced(page,A);
    console.log('PASS: password changes on the disposable account and the new password signs in successfully.');

    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const small=await mobile.newPage();await seed(small,'スマホゲスト確認高校');
    await accountAction(small,'open').click();await checkOverflow(small,'mobile login');await screenshot(small,'mobile-login');
    await accountAction(small,'signup-tab').click();await checkOverflow(small,'mobile signup');await screenshot(small,'mobile-signup');await closeDialog(small);
    await login(small,A);await checkOverflow(small,'mobile account');await screenshot(small,'mobile-account');await closeDialog(small);await waitSynced(small,A);
    assert.equal((await readSave(small,A)).schoolName,'先に進んだ端末高校');
    await checkOverflow(small,'mobile game');await screenshot(small,'mobile-cloud-saved');
    await small.reload();await waitSynced(small,A);
    assert.equal((await readSave(small,A)).schoolName,'先に進んだ端末高校');
    assert.deepEqual(errors,[],'No browser JavaScript runtime errors');
    await updateFixture(data=>{data.browserChecksDone=true;data.browserCheckedAt=new Date().toISOString();});
    console.log('PASS: mobile login, signup, account layout and session restoration; no runtime errors.');
    console.log('Screenshots: '+output);
  }finally{await browser.close();}
})().catch(error=>{let message=String(error.message);for(const secret of secrets)message=message.replaceAll(secret,'[redacted]');console.error(message);process.exitCode=1;});
