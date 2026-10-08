const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('./sync.js');
const P=require('./persistence.js');
const E=require('./engine.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const game=name=>{const g=E.createGame(12);g.schoolName=name;return g;};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function makeCloud(user=null){
  let status={user,ready:false,error:null};const listeners=new Set(),records=new Map(),calls=[];
  let failLoad=null,failSave=null,hookSave=null,hookLoad=null;
  const cloud={
    getStatus:()=>({...status}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    init:async()=>{status.ready=true;for(const fn of listeners)fn(status,'READY');return status;},
    setUser:next=>{status.user=next;for(const fn of listeners)fn(status,next?'SIGNED_IN':'SIGNED_OUT');},
    load:async id=>{if(failLoad)throw failLoad;if(hookLoad)await hookLoad(id);return records.has(id)?copy(records.get(id)):null;},
    save:async(data,expectedRevision,id)=>{calls.push({id,data:copy(data),expectedRevision});if(hookSave)await hookSave(data,expectedRevision,id);if(failSave)throw failSave;const row=records.get(id);if((row?.revision||0)!==expectedRevision)throw Object.assign(Error('conflict'),{code:'conflict'});const next={data:copy(data),revision:expectedRevision+1,updatedAt:new Date().toISOString()};records.set(id,next);return {revision:next.revision,updatedAt:next.updatedAt};},
    records,calls,setLoadError:value=>failLoad=value,setSaveError:value=>failSave=value,setSaveHook:value=>hookSave=value,setLoadHook:value=>hookLoad=value,
  };return cloud;
}
function setup({cloud=makeCloud(),initial={}}={}){
  const data=new Map(Object.entries(initial)),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};
  const options={cloud,storage:()=>storage,validate:E.validateSave,createGame:()=>game('新規高校'),debounceMs:100000};
  const sync=S.create(options);return {sync,cloud,data,storage,options};
}
const user=id=>({id,loginId:id});
const row=(name,revision=1)=>({data:game(name),revision,updatedAt:'2026-10-08T10:00:00.000Z'});
test('guest load and save retain the original local key',async t=>{
  const x=setup({initial:{[P.KEY]:JSON.stringify(game('ゲスト高校'))}});t.after(()=>x.sync.dispose());
  assert.equal(x.sync.getState().schoolName,'ゲスト高校');await x.sync.init();assert.equal(x.sync.getStatus().phase,'guest');
  x.sync.getState().schoolName='ゲスト続き';assert.equal(x.sync.save(x.sync.getState()),true);assert.equal(JSON.parse(x.data.get(P.KEY)).schoolName,'ゲスト続き');assert.equal(x.cloud.calls.length,0);
});
test('first account explicitly chooses guest migration and preserves the guest slot',async t=>{
  const cloud=makeCloud(user('a')),guest=game('引継ぎ高校'),x=setup({cloud,initial:{[P.KEY]:JSON.stringify(guest)}});t.after(()=>x.sync.dispose());
  await x.sync.init();assert.equal(x.sync.getStatus().phase,'choose');assert.equal(cloud.calls.length,0);
  assert.equal(await x.sync.selectLocal(),true);assert.equal(cloud.records.get('a').data.schoolName,'引継ぎ高校');assert.equal(x.data.get(P.KEY),JSON.stringify(guest));assert.equal(x.sync.getStatus().pending,false);
});
test('first account can start a separate new game instead of copying guest',async t=>{
  const x=setup({cloud:makeCloud(user('a')),initial:{[P.KEY]:JSON.stringify(game('ゲスト高校'))}});t.after(()=>x.sync.dispose());
  await x.sync.init();await x.sync.selectRemote();assert.equal(x.cloud.records.get('a').data.schoolName,'新規高校');assert.equal(JSON.parse(x.data.get(P.KEY)).schoolName,'ゲスト高校');
});
test('a cloud save loads without overwriting the guest save',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('クラウド高校',4));const x=setup({cloud,initial:{[P.KEY]:JSON.stringify(game('ゲスト高校'))}});t.after(()=>x.sync.dispose());
  await x.sync.init();assert.equal(x.sync.getState().schoolName,'クラウド高校');assert.equal(x.sync.getStatus().revision,4);assert.equal(cloud.calls.length,0);assert.equal(JSON.parse(x.data.get(P.KEY)).schoolName,'ゲスト高校');
});
test('offline changes resume after reload using their original base revision',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('保存済み'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();
  cloud.setSaveError(Object.assign(Error('offline'),{code:'network'}));x.sync.getState().schoolName='オフライン育成';x.sync.save(x.sync.getState());assert.equal(await x.sync.flush(),false);assert.equal(x.sync.getStatus().phase,'offline');
  x.sync.dispose();cloud.setSaveError(null);const second=S.create(x.options);t.after(()=>second.dispose());await second.init();assert.equal(second.getStatus().pending,true);assert.equal(await second.flush(),true);assert.equal(cloud.records.get('a').data.schoolName,'オフライン育成');assert.equal(cloud.records.get('a').revision,2);
});
test('different local and cloud progress requires an explicit conflict choice',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('初期'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();
  x.sync.getState().schoolName='端末の続き';x.sync.save(x.sync.getState());cloud.records.set('a',row('別端末の続き',2));assert.equal(await x.sync.flush(),false);assert.equal(x.sync.getStatus().phase,'conflict');assert.equal(cloud.records.get('a').data.schoolName,'別端末の続き');
  assert.equal(await x.sync.selectLocal(),true);assert.equal(cloud.records.get('a').data.schoolName,'端末の続き');assert.equal(cloud.records.get('a').revision,3);
});
test('choosing remote resolves conflict and retains the prior local backup',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('初期'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();x.sync.getState().schoolName='端末';x.sync.save(x.sync.getState());cloud.records.set('a',row('クラウド',2));await x.sync.flush();
  assert.equal(await x.sync.selectRemote(),true);assert.equal(x.sync.getState().schoolName,'クラウド');assert.equal(x.sync.getLocalStore().backup().schoolName,'端末');assert.equal(x.sync.getStatus().pending,false);
});
test('edits during a cloud write are coalesced into a second serial write',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('初期'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();let release;const gate=new Promise(resolve=>release=resolve);let count=0;cloud.setSaveHook(async()=>{if(count++===0)await gate;});
  x.sync.getState().schoolName='途中';x.sync.save(x.sync.getState());const pending=x.sync.flush();await tick();x.sync.getState().schoolName='最新版';x.sync.save(x.sync.getState());release();assert.equal(await pending,true);assert.equal(cloud.calls.length,2);assert.equal(cloud.calls[0].expectedRevision,1);assert.equal(cloud.calls[1].expectedRevision,2);assert.equal(cloud.records.get('a').data.schoolName,'最新版');
});
test('late load from a previous account cannot replace the newly active account',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('A高校'));cloud.records.set('b',row('B高校'));let release;const gate=new Promise(resolve=>release=resolve);cloud.setLoadHook(async id=>{if(id==='a')await gate;});const x=setup({cloud});t.after(()=>x.sync.dispose());const pending=x.sync.init();await tick();cloud.setUser(user('b'));await tick();await tick();assert.equal(x.sync.getState().schoolName,'B高校');release();await pending;assert.equal(x.sync.getState().schoolName,'B高校');assert.equal(x.sync.getStatus().account.id,'b');
});
test('sign-out restores guest while stale in-flight account responses are ignored',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('A高校'));const x=setup({cloud,initial:{[P.KEY]:JSON.stringify(game('ゲスト高校'))}});t.after(()=>x.sync.dispose());await x.sync.init();let release;cloud.setSaveHook(()=>new Promise(resolve=>release=resolve));x.sync.getState().schoolName='A変更';x.sync.save(x.sync.getState());const pending=x.sync.flush();await tick();cloud.setUser(null);await tick();assert.equal(x.sync.getState().schoolName,'ゲスト高校');release();assert.equal(await pending,false);assert.equal(x.sync.getStatus().phase,'guest');assert.equal(JSON.parse(x.data.get(P.KEY)).schoolName,'ゲスト高校');
});
test('account A offline progress is isolated from account B',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('A高校'));cloud.records.set('b',row('B高校'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();cloud.setSaveError(Object.assign(Error('offline'),{code:'network'}));x.sync.getState().schoolName='A未同期';x.sync.save(x.sync.getState());await x.sync.flush();cloud.setUser(user('b'));await tick();await tick();assert.equal(x.sync.getState().schoolName,'B高校');assert.equal(JSON.parse(x.data.get(P.KEY+':account:a')).schoolName,'A未同期');assert.equal(x.sync.getStatus().pending,false);
});
test('reload detects dirty local state even when pending metadata did not persist',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('初期'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();const metaKey=P.KEY+':account:a-sync',oldMeta=x.data.get(metaKey);x.sync.getState().schoolName='メタ欠落';x.sync.save(x.sync.getState());x.data.set(metaKey,oldMeta);x.sync.dispose();const second=S.create(x.options);t.after(()=>second.dispose());await second.init();assert.equal(second.getStatus().pending,true);await second.flush();assert.equal(cloud.records.get('a').data.schoolName,'メタ欠落');
});
test('a same-account local-tab conflict cannot overwrite sync metadata or reach the cloud',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('初期'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();
  const key=P.KEY+':account:a',metaKey=key+'-sync',meta=x.data.get(metaKey);x.data.set(key,JSON.stringify(game('別タブ')));
  x.sync.getState().schoolName='古いタブ';assert.equal(x.sync.save(x.sync.getState()),false);assert.equal(x.data.get(metaKey),meta);assert.equal(await x.sync.flush(),false);assert.equal(cloud.calls.length,0);assert.equal(JSON.parse(x.data.get(key)).schoolName,'別タブ');
});
test('fingerprints ignore JSONB object-key ordering while preserving array order',()=>{
  assert.equal(S.fingerprint({a:1,z:{b:2,c:3},list:[{x:4,y:5},6]}),S.fingerprint({list:[{y:5,x:4},6],z:{c:3,b:2},a:1}));
  assert.notEqual(S.fingerprint({list:[1,2]}),S.fingerprint({list:[2,1]}));
});
test('JSONB reordering of an already committed offline change does not create a false conflict',async t=>{
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value;
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('初期'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();
  x.sync.getState().schoolName='コミット済み応答欠落';x.sync.save(x.sync.getState());cloud.records.set('a',{data:reorder(copy(x.sync.getState())),revision:2,updatedAt:'2026-10-08T12:00:00.000Z'});x.sync.dispose();
  const second=S.create(x.options);t.after(()=>second.dispose());await second.init();assert.equal(second.getStatus().phase,'ready');assert.equal(second.getStatus().pending,false);assert.equal(second.getStatus().revision,2);assert.equal(second.getState().schoolName,'コミット済み応答欠落');assert.equal(cloud.calls.length,0);
});
test('auth changes reject stale local writes before the account-switch microtask runs',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('A高校'));cloud.records.set('b',row('B高校'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();
  const key=P.KEY+':account:a',original=x.data.get(key),stale=x.sync.getState();cloud.setUser(user('b'));stale.schoolName='旧アカウントへ混入';
  assert.equal(x.sync.save(stale),false);assert.equal(x.data.get(key),original);await tick();await tick();assert.equal(x.sync.getState().schoolName,'B高校');assert.equal(cloud.calls.length,0);
});
test('flush checks actual local storage before sending even if the storage event is delayed',async t=>{
  const cloud=makeCloud(user('a'));cloud.records.set('a',row('初期'));const x=setup({cloud});t.after(()=>x.sync.dispose());await x.sync.init();
  x.sync.getState().schoolName='古いタブの未同期';x.sync.save(x.sync.getState());
  x.data.set(P.KEY+':account:a',JSON.stringify(game('別タブで進行')));
  assert.equal(await x.sync.flush(),false);assert.equal(cloud.calls.length,0);assert.equal(x.sync.getStatus().error.code,'local_save');
});
