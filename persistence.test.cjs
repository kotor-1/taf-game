const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('./persistence.js');
const E=require('./engine.js');
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
