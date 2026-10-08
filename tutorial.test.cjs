'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Tutorial=require('./tutorial.js');
function setup(initial={}){
  const data=new Map(Object.entries(initial)),writes=[],changes=[];
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push(key);data.set(key,String(value));}};
  const options={storage:()=>storage,onChange:status=>changes.push(status)};
  return {model:Tutorial.create(options),options,storage,data,writes,changes};
}
test('new progress starts at athlete without changing any browser data',()=>{
  const x=setup({'hokago-track-club-save-v2':'guest save','hokago-track-club-save-v2:account:123':'account save','auth-token':'auth state'});
  assert.deepEqual(x.model.getStatus(),{version:1,status:'new',step:0,completed:false,stepId:'athlete',persisted:false});
  assert.deepEqual(x.writes,[]);assert.equal(x.data.size,3);assert.equal(x.changes.length,0);
  assert.deepEqual(Tutorial.STEPS.map(s=>s.id),['athlete','plan','card','week','calendar','career','save']);
});
test('only completion of the active matching step allows next',()=>{
  const {model,changes}=setup();model.complete('athlete');assert.equal(model.getStatus().status,'new');
  model.start();model.next();assert.equal(model.getStatus().step,0);model.complete('plan');assert.equal(model.getStatus().completed,false);
  model.complete('athlete');assert.equal(model.getStatus().completed,true);model.complete('athlete');assert.equal(changes.length,2);
  model.next();assert.equal(model.getStatus().stepId,'plan');assert.equal(model.getStatus().completed,false);
});
test('the entire seven-step route finishes and cannot advance past the final step',()=>{
  const {model}=setup();model.start();
  for(const {id} of Tutorial.STEPS){assert.equal(model.getStatus().stepId,id);model.complete(id);model.next();}
  assert.deepEqual(model.getStatus(),{version:1,status:'done',step:6,completed:true,stepId:'save',persisted:true});
  const final=model.getStatus();model.next();model.skip();model.complete('save');model.pause();model.dismiss();model.start();assert.deepEqual(model.getStatus(),final);
});
test('pausing and reloading preserves the exact step and its completion flag',()=>{
  const x=setup();x.model.start();x.model.skip();x.model.skip();x.model.complete('card');x.model.pause();
  const model=Tutorial.create(x.options);assert.equal(model.getStatus().status,'paused');assert.equal(model.getStatus().stepId,'card');assert.equal(model.getStatus().completed,true);
  model.next();model.skip();model.complete('card');assert.equal(model.getStatus().status,'paused');
  model.start();assert.equal(model.getStatus().stepId,'card');assert.equal(model.getStatus().completed,true);model.next();assert.equal(model.getStatus().stepId,'week');
});
test('an active tutorial resumes from the same step after a browser reload',()=>{
  const x=setup();x.model.start();x.model.skip();x.model.skip();x.model.skip();x.model.complete('week');
  const model=Tutorial.create(x.options);assert.equal(model.getStatus().status,'active');assert.equal(model.getStatus().stepId,'week');assert.equal(model.getStatus().completed,true);assert.equal(model.getStatus().persisted,true);
});
test('dismiss postpones the welcome and starting later begins normally',()=>{
  const x=setup();x.model.dismiss();assert.equal(x.model.getStatus().status,'dismissed');
  const model=Tutorial.create(x.options);assert.equal(model.getStatus().status,'dismissed');model.start();assert.equal(model.getStatus().status,'active');assert.equal(model.getStatus().stepId,'athlete');
  model.skip();model.dismiss();assert.equal(model.getStatus().status,'active');assert.equal(model.getStatus().stepId,'plan');
});
test('restart resets tutorial progress without resetting or modifying a game save',()=>{
  const x=setup({'hokago-track-club-save-v2':'existing game','other-settings':'existing preferences'});x.model.start();for(let i=0;i<7;i++)x.model.skip();
  x.model.start(true);assert.equal(x.model.getStatus().status,'active');assert.equal(x.model.getStatus().step,0);assert.equal(x.model.getStatus().completed,false);
  assert.equal(x.data.get('hokago-track-club-save-v2'),'existing game');assert.equal(x.data.get('other-settings'),'existing preferences');assert.ok(x.writes.every(key=>key===Tutorial.KEY));
});
test('skip permits an explanation-only route even when a real game action cannot be performed',()=>{
  const {model}=setup();model.start();for(let i=0;i<7;i++)model.skip();assert.equal(model.getStatus().status,'done');assert.equal(model.getStatus().step,6);
});
test('malformed or impossible stored progress falls back safely without overwriting it on load',()=>{
  const invalid=['{broken','null','[]','42',JSON.stringify({version:2,status:'active',step:0,completed:false}),JSON.stringify({version:1,status:'active',step:-1,completed:false}),JSON.stringify({version:1,status:'active',step:7,completed:false}),JSON.stringify({version:1,status:'active',step:1.5,completed:false}),JSON.stringify({version:1,status:'active',step:1,completed:'yes'}),JSON.stringify({version:1,status:'unknown',step:0,completed:false}),JSON.stringify({version:1,status:'new',step:4,completed:false}),JSON.stringify({version:1,status:'dismissed',step:0,completed:true}),JSON.stringify({version:1,status:'done',step:6,completed:false}),JSON.stringify({version:1,status:'done',step:0,completed:true})];
  for(const raw of invalid){const x=setup({[Tutorial.KEY]:raw});assert.equal(x.model.getStatus().status,'new');assert.equal(x.model.getStatus().persisted,false);assert.equal(x.data.get(Tutorial.KEY),raw);assert.equal(x.writes.length,0);x.model.start();assert.equal(x.model.getStatus().status,'active');assert.equal(x.model.getStatus().persisted,true);}
});
test('blocked localStorage keeps the tutorial usable in memory and reports unsaved progress',()=>{
  const changes=[],model=Tutorial.create({storage:()=>{throw Error('SecurityError');},onChange:s=>changes.push(s)});
  model.start();model.complete('athlete');model.next();model.pause();assert.equal(model.getStatus().stepId,'plan');assert.equal(model.getStatus().status,'paused');assert.equal(model.getStatus().persisted,false);assert.equal(changes.length,4);
});
test('quota errors preserve saved progress and a later successful action resumes persistence',()=>{
  const x=setup();x.model.start();const initial=x.data.get(Tutorial.KEY),original=x.storage.setItem;
  x.storage.setItem=()=>{throw Error('QuotaExceededError');};x.model.complete('athlete');x.model.next();assert.equal(x.model.getStatus().stepId,'plan');assert.equal(x.model.getStatus().persisted,false);assert.equal(x.data.get(Tutorial.KEY),initial);
  x.storage.setItem=original;x.model.complete('plan');assert.equal(x.model.getStatus().persisted,true);assert.equal(Tutorial.create(x.options).getStatus().stepId,'plan');
});
test('silent write failures are not reported as persisted',()=>{
  const x=setup();x.storage.setItem=()=>{};x.model.start();assert.equal(x.model.getStatus().status,'active');assert.equal(x.model.getStatus().persisted,false);
});
test('returned statuses and callback values cannot mutate the model',()=>{
  const {model}=setup();const status=model.start();status.step=6;status.completed=true;status.status='done';assert.equal(model.getStatus().stepId,'athlete');assert.equal(model.getStatus().status,'active');
  const observed=Tutorial.create({storage:()=>({getItem:()=>null,setItem:()=>{}}),onChange:s=>{s.step=6;s.completed=true;}});observed.start();assert.equal(observed.getStatus().stepId,'athlete');assert.equal(observed.getStatus().completed,false);
});
test('the browser UMD exposes TrackTutorial without needing DOM APIs',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('./tutorial.js'),'utf8'),context);
  assert.equal(context.TrackTutorial.KEY,Tutorial.KEY);const model=context.TrackTutorial.create({storage:()=>{throw Error('offline');}});model.start();assert.equal(model.getStatus().stepId,'athlete');
});
