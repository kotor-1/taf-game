const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('./persistence.js');
const E=require('./engine.js');
const LZ=require('./vendor/lz-string-1.5.0.js');
let matureTemplate;
function matureGame(){
  if(!matureTemplate){
    const g=E.createGame(4);while(g.week<5){if(g.monthPlanPending)E.confirmMonthlyPlan(g);E.advanceWeek(g);}
    const entries={},used=new Set();for(const d of E.getMeetEvents(g)){
      if(d.teamSize)entries[d.key]=g.athletes.filter(a=>a.gender===d.gender).slice(0,4).map(a=>a.id);
      else{const athlete=g.athletes.find(a=>a.gender===d.gender&&!used.has(a.id));if(athlete){entries[d.key]=athlete.id;used.add(athlete.id);}}
    }
    assert.equal(E.runMeet(g,entries,'steady').ok,true);
    g.history=Array.from({length:60},()=>JSON.parse(JSON.stringify(g.lastMeet)));assert.equal(E.validateSave(g),true);matureTemplate=JSON.stringify(g);
  }
  return JSON.parse(matureTemplate);
}
function setup(initial={}){
  const data=new Map(Object.entries(initial));
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};
  const store=P.create({storage:()=>storage,validate:E.validateSave,now:()=> '2026-10-08T12:00:00.000Z'});
  return {store,storage,data};
}
test('new game is persisted and reload resumes the exact state',()=>{
  const {store,storage}=setup();assert.equal(store.load().state,null);
  const game=E.createGame();assert.equal(store.save(game),true);
  const reloaded=P.create({storage:()=>storage,validate:E.validateSave});
  assert.deepEqual(reloaded.load().state,game);assert.ok(reloaded.getStatus().savedAt);
});
test('distinct changes retain a valid previous state and redundant saves do not rotate it',()=>{
  const {store,data}=setup();store.load();const game=E.createGame();store.save(game);
  game.schoolName='育成高校';store.save(game);
  const backup=data.get(P.BACKUP_KEY);assert.notEqual(JSON.parse(backup).schoolName,game.schoolName);
  store.save(game);assert.equal(data.get(P.BACKUP_KEY),backup);
});
test('older valid saves without timestamp metadata are still reported as saved',()=>{
  const game=E.createGame(),{store}=setup({[P.KEY]:JSON.stringify(game)});
  assert.deepEqual(store.load().state,game);assert.equal(store.getStatus().persisted,true);assert.equal(store.getStatus().savedAt,null);
  assert.equal(store.save(game),true);assert.equal(store.getStatus().persisted,true);
});
test('corrupt primary automatically recovers backup and preserves the damaged source',()=>{
  const game=E.createGame(),{store,data}=setup({[P.KEY]:'broken json',[P.BACKUP_KEY]:JSON.stringify(game)});
  const loaded=store.load();assert.equal(loaded.recovered,true);assert.deepEqual(loaded.state,game);
  assert.equal(data.get(P.RECOVERY_KEY),'broken json');assert.equal(store.save(loaded.state),true);
  assert.equal(data.get(P.BACKUP_KEY),JSON.stringify(game));
});
test('corrupt-only save is preserved before a fresh game can be saved',()=>{
  const {store,data}=setup({[P.KEY]:'damaged'});assert.equal(store.load().state,null);
  assert.equal(data.get(P.RECOVERY_KEY),'damaged');assert.equal(store.save(E.createGame()),true);
});
test('a failed preservation never overwrites damaged user data',()=>{
  const {store,storage,data}=setup({[P.KEY]:'damaged'});storage.setItem=()=>{throw Error('quota');};
  store.load();assert.equal(store.save(E.createGame()),false);assert.equal(data.get(P.KEY),'damaged');
});
test('failed writes report failure while preserving last committed progress',()=>{
  const {store,storage,data}=setup();store.load();const game=E.createGame();store.save(game);const raw=data.get(P.KEY);
  game.schoolName='未保存高校';storage.setItem=()=>{throw Error('quota');};
  assert.equal(store.save(game),false);assert.equal(data.get(P.KEY),raw);assert.equal(store.getStatus().error,'unavailable');
});
test('unavailable storage never crashes loading or saving',()=>{
  const store=P.create({storage:()=>{throw Error('SecurityError');},validate:E.validateSave});
  assert.equal(store.load().state,null);assert.equal(store.save(E.createGame()),false);assert.equal(store.getStatus().error,'unavailable');
});
test('a second tab cannot overwrite a save written by the first tab',()=>{
  const {store,storage,data}=setup();store.load();const game=E.createGame();store.save(game);
  const second=P.create({storage:()=>storage,validate:E.validateSave});const other=second.load().state;
  game.schoolName='先に保存';store.save(game);const raw=data.get(P.KEY);
  other.schoolName='別タブ';assert.equal(second.hasConflict(),true);assert.equal(second.save(other),false);assert.equal(data.get(P.KEY),raw);
});
test('invalid state is rejected without changing an existing save',()=>{
  const {store,data}=setup();store.load();store.save(E.createGame());const raw=data.get(P.KEY);
  assert.equal(store.save({version:2}),false);assert.equal(data.get(P.KEY),raw);
});
test('account namespaces keep saves and backups separate from guest and other accounts',()=>{
  const {storage,data}=setup();const guest=P.create({storage:()=>storage,validate:E.validateSave});guest.load();const game=E.createGame();guest.save(game);
  const key=P.KEY+':account:user-1',account=P.create({storage:()=>storage,validate:E.validateSave,key});assert.equal(account.load().state,null);
  const accountGame=E.createGame();accountGame.schoolName='アカウント高校';account.save(accountGame);accountGame.schoolName='育成高校';account.save(accountGame);
  assert.equal(data.get(P.KEY),JSON.stringify(game));assert.equal(JSON.parse(data.get(key+'-backup')).schoolName,'アカウント高校');assert.equal(account.key,key);
  assert.equal(P.create({storage:()=>storage,validate:E.validateSave,key:P.KEY+':account:user-2'}).load().state,null);
});
test('full 60-meet histories compress without changing any athlete, result or record',()=>{
  const game=matureGame(),raw=JSON.stringify(game),packed=P.encode(game);
  assert.ok(packed.startsWith(P.PACKED_PREFIX));assert.ok(packed.length<raw.length/5);
  assert.deepEqual(P.decode(packed),game);assert.deepEqual(P.decode(raw),game);
  const {store,data}=setup({[P.KEY]:raw,[P.BACKUP_KEY]:raw});store.load();
  assert.equal(store.save(game),true);assert.ok(data.get(P.KEY).startsWith(P.PACKED_PREFIX));
  assert.equal(data.get(P.BACKUP_KEY),raw,'Encoding-only migration does not replace a prior-game backup');
  game.schoolName='長期育成高校';assert.equal(store.save(game),true);
  assert.ok(data.get(P.BACKUP_KEY).startsWith(P.PACKED_PREFIX));
  assert.equal(store.backup().schoolName,P.decode(raw).schoolName);
});
test('guest plus two mature account saves and backups fit within a 5 MiB browser quota',()=>{
  const game=matureGame(),raw=JSON.stringify(game),data=new Map(),limit=5*1024*1024;
  const storage={getItem:key=>data.get(key)??null,setItem(key,value){const next=new Map(data);next.set(key,String(value));const bytes=[...next].reduce((n,[k,v])=>n+2*(k.length+v.length),0);if(bytes>limit)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});data.set(key,String(value));}};
  assert.throws(()=>{for(let i=0;i<6;i++)storage.setItem('legacy-'+i,raw);},{name:'QuotaExceededError'},'Uncompressed copies exceed quota');
  data.clear();
  for(const key of [P.KEY,P.KEY+':account:a',P.KEY+':account:b']){
    const store=P.create({storage:()=>storage,validate:E.validateSave,key});store.load();
    assert.equal(store.save(game),true);const next={...game,schoolName:key.endsWith(':b')?'二校目長期保存':'長期保存'};assert.equal(store.save(next),true);
    assert.deepEqual(P.create({storage:()=>storage,validate:E.validateSave,key}).load().state,next);
  }
  assert.ok([...data.entries()].reduce((n,[k,v])=>n+(k.length+v.length)*2,0)<limit);
  assert.equal(P.decode(data.get(P.KEY)).history.length,60);
});
test('damaged compressed primary recovers the backup and keeps the damaged original',()=>{
  const game=matureGame(),packed=P.encode(game),damaged=packed.replace(/:[a-f0-9]+:/,':deadbeef:');
  const {store,data}=setup({[P.KEY]:damaged,[P.BACKUP_KEY]:packed});
  const loaded=store.load();assert.equal(loaded.recovered,true);assert.deepEqual(loaded.state,game);assert.equal(data.get(P.RECOVERY_KEY),damaged);
  assert.equal(store.save(loaded.state),true);assert.deepEqual(P.decode(data.get(P.KEY)),game);
});
test('compressed headers, checksums and decompression limits reject corrupted data',()=>{
  assert.equal(P.decode(P.PACKED_PREFIX+(P.MAX_SAVE_CHARACTERS+1)+':1:anything'),null);
  assert.equal(P.decode(P.PACKED_PREFIX+'1:1:'+LZ.compressToUTF16('x'.repeat(100000))),null);
  assert.throws(()=>LZ.decompressFromUTF16(LZ.compressToUTF16('x'.repeat(100000)),100),RangeError);
  assert.equal(P.decode(P.PACKED_PREFIX+'bad-header'),null);
  assert.equal(P.decode(P.encode(matureGame()).slice(0,-50)),null);
  assert.throws(()=>P.encode({large:'x'.repeat(P.MAX_SAVE_CHARACTERS)}),/save-size/);
});
test('a failed new write after legacy compaction keeps the exact previous progress',()=>{
  const game=matureGame(),raw=JSON.stringify(game),{store,storage,data}=setup({[P.KEY]:raw});store.load();
  const set=storage.setItem;let writes=0;storage.setItem=(key,value)=>{if(key===P.KEY&&++writes===2)throw Error('quota');set(key,value);};
  const next={...game,schoolName:'まだ保存されていない'};assert.equal(store.save(next),false);
  assert.deepEqual(P.decode(data.get(P.KEY)),game);assert.deepEqual(P.decode(data.get(P.BACKUP_KEY)),game);
  storage.setItem=set;assert.equal(store.save(next),true);assert.deepEqual(P.decode(data.get(P.KEY)),next);
});
test('another tab compacting unchanged progress is not mistaken for a gameplay conflict',()=>{
  const game=matureGame(),{store,storage}=setup({[P.KEY]:JSON.stringify(game)});store.load();
  const other=P.create({storage:()=>storage,validate:E.validateSave});other.load();assert.equal(other.save(game),true);
  assert.equal(store.hasConflict(),false);game.schoolName='同じ進行から続行';assert.equal(store.save(game),true);
  assert.equal(other.hasConflict(),true);
});
test('successful reload clears a previous recovery-preservation block',()=>{
  const {store,storage,data}=setup({[P.KEY]:'damaged'}),set=storage.setItem;storage.setItem=()=>{throw Error('quota');};store.load();assert.equal(store.save(E.createGame()),false);
  storage.setItem=set;const game=E.createGame();data.set(P.KEY,JSON.stringify(game));assert.deepEqual(store.load().state,game);game.schoolName='復旧後の続き';assert.equal(store.save(game),true);
});
