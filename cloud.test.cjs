const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('./cloud.js');
const A={id:'11111111-1111-4111-8111-111111111111',email:'runner_1@id.taf-game.invalid'};
const B={id:'22222222-2222-4222-8222-222222222222',email:'runner_2@id.taf-game.invalid'};
const stamp='2026-10-08T07:00:00.000Z';
const payload=()=>({version:2,week:1,athletes:[]});
const tick=()=>new Promise(resolve=>setTimeout(resolve,1));
function fixture(options={}){
  let user=options.user===undefined?A:options.user,observer=null;
  let settings={external:{email:true},disable_signup:false,mailer_autoconfirm:true,...options.settings};
  const tokens=new Map([['token-'+A.id,A],['token-'+B.id,B]]),calls=[];
  const session=()=>user?{user,access_token:'token-'+user.id}:null;
  const auth={
    onAuthStateChange(fn){observer=fn;return {data:{subscription:{unsubscribe(){observer=null;}}}};},
    async getSession(){calls.push({type:'session'});return {data:{session:session()},error:null};},
    async getUser(token){calls.push({type:'verify',token});return {data:{user:tokens.get(token)},error:null};},
    async signUp(args){calls.push({type:'signup',args});user={...A,email:args.email};tokens.set('token-'+user.id,user);return {data:{user,session:session()},error:null};},
    async signInWithPassword(args){calls.push({type:'signin',args});user={...A,email:args.email};tokens.set('token-'+user.id,user);return {data:{user,session:session()},error:null};},
    async signOut(args){calls.push({type:'signout',args});user=null;return {error:null};}
  };
  const reply=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
  let route=options.route||((url,init)=>{
    if(url.includes('/auth/v1/settings'))return reply(settings);
    if(url.includes('/auth/v1/user'))return reply(user);
    if(url.includes('/rest/v1/taf_saves?'))return reply([{user_id:A.id,payload:payload(),revision:2,updated_at:stamp}]);
    if(url.includes('/rpc/taf_save_game'))return reply({revision:JSON.parse(init.body).p_expected_revision+1,updated_at:stamp});
    throw Error('Unexpected '+url);
  });
  const fetch=async(url,init)=>{calls.push({type:'fetch',url,init});return route(url,init);};
  const cloud=C.create({client:{auth},fetch,timeoutMs:options.timeoutMs||1000,...options.create});
  return {cloud,auth,calls,reply,setRoute(fn){route=fn;},setUser(next,event='SIGNED_IN'){user=next;if(next)tokens.set('token-'+next.id,next);if(observer)observer(event,session());},setSettings(value){settings=value;}};
}

test('IDs have one canonical spelling and cannot inject email addresses',()=>{
  assert.equal(C.normalizeId('  RUNNER_01  '),'runner_01');
  for(const id of ['abc','runner@example.com','runner.test','あいうえお','a'.repeat(21),'../user'])assert.throws(()=>C.normalizeId(id),{code:'invalid_id'});
});

test('initial session is server-verified and status never exposes the token',async()=>{
  const f=fixture(),status=await f.cloud.init();
  assert.equal(status.ready,true);assert.equal(status.configured,true);
  assert.deepEqual(status.user,{id:A.id,loginId:'runner_1'});
  assert.equal(status.emailConfirmationRequired,false);assert.equal(status.signupAllowed,true);
  assert.equal(JSON.stringify(status).includes('token-'),false);
  assert.ok(f.calls.some(x=>x.type==='verify'));
  assert.equal(await f.cloud.init(),status);
});

test('missing SDK shows an actionable configuration error without crashing',async()=>{
  const cloud=C.create({sdk:{},fetch:async()=>{throw Error('Should not fetch');}});
  const status=await cloud.init();assert.equal(status.ready,true);assert.equal(status.configured,false);assert.equal(status.error.code,'config');
});

test('registration refuses confirmation-required settings before creating an unreachable account',async()=>{
  const f=fixture({user:null,settings:{mailer_autoconfirm:false}});await f.cloud.init();
  await assert.rejects(f.cloud.signUp('runner_1','sufficient password'),{code:'confirmation_required'});
  assert.equal(f.calls.some(x=>x.type==='signup'),false);
});

test('registration checks current settings again and normalizes the ID',async()=>{
  const f=fixture({user:null});await f.cloud.init();
  const user=await f.cloud.signUp(' RUNNER_1 ','long enough password');
  assert.equal(user.loginId,'runner_1');
  assert.equal(f.calls.filter(x=>x.type==='fetch'&&x.url.includes('settings')).length,2);
  assert.deepEqual(f.calls.find(x=>x.type==='signup').args,{email:'runner_1@id.taf-game.invalid',password:'long enough password',options:{data:{login_id:'runner_1'}}});
});

test('disabled signup and short passwords never create accounts',async()=>{
  const f=fixture({user:null,settings:{disable_signup:true}});await f.cloud.init();
  await assert.rejects(f.cloud.signUp('runner_1','short'),{code:'weak_password'});
  await assert.rejects(f.cloud.signUp('runner_1','long enough'),{code:'signup_disabled'});
  assert.equal(f.calls.some(x=>x.type==='signup'),false);
});

test('settings network failure blocks signup without changing guest state',async()=>{
  const f=fixture({user:null});await f.cloud.init();f.setRoute(()=>{throw new TypeError('Failed to fetch');});
  await assert.rejects(f.cloud.signUp('runner_1','long enough'),{code:'network'});
  assert.equal(f.cloud.getStatus().user,null);assert.equal(f.calls.some(x=>x.type==='signup'),false);
});

test('login uses ID/password and maps bad credentials to a readable error',async()=>{
  const f=fixture({user:null});await f.cloud.init();
  f.auth.signInWithPassword=async()=>({error:{code:'invalid_credentials',message:'Invalid login credentials'}});
  await assert.rejects(f.cloud.signIn('runner_1','wrong pass'),{code:'credentials'});
  assert.equal(f.cloud.getStatus().user,null);
});

test('existing account must sign out before selecting a different ID',async()=>{
  const f=fixture();await f.cloud.init();
  await assert.rejects(f.cloud.signIn('runner_2','long enough'),{code:'already_signed_in'});
  await assert.rejects(f.cloud.signUp('runner_2','long enough'),{code:'already_signed_in'});
});

test('load verifies the exact bearer token, selects only the account UUID and validates payload',async()=>{
  const f=fixture();await f.cloud.init();const loaded=await f.cloud.load(A.id);
  assert.deepEqual(loaded,{data:payload(),revision:2,updatedAt:stamp});
  const request=f.calls.find(x=>x.type==='fetch'&&x.url.includes('/rest/v1/'));
  assert.ok(request.url.includes('user_id=eq.'+A.id));
  assert.equal(request.init.headers.Authorization,'Bearer token-'+A.id);
  assert.equal(f.calls.filter(x=>x.type==='verify').at(-1).token,'token-'+A.id);
});

test('a missing save remains null and is distinguishable from broken setup',async()=>{
  const f=fixture();await f.cloud.init();f.setRoute(()=>f.reply([]));
  assert.equal(await f.cloud.load(),null);
  f.setRoute(()=>f.reply({code:'PGRST205',message:'missing table'},404));
  await assert.rejects(f.cloud.load(),{code:'setup'});
});

test('load rejects a foreign account, malformed revision and incompatible save',async()=>{
  const f=fixture();await f.cloud.init();
  f.setRoute(()=>f.reply([{user_id:B.id,payload:payload(),revision:2,updated_at:stamp}]));
  await assert.rejects(f.cloud.load(),{code:'auth_changed'});
  f.setRoute(()=>f.reply([{user_id:A.id,payload:payload(),revision:'2',updated_at:stamp}]));
  await assert.rejects(f.cloud.load(),{code:'invalid_save'});
  f.setRoute(()=>f.reply([{user_id:A.id,payload:{version:1},revision:2,updated_at:stamp}]));
  await assert.rejects(f.cloud.load(),{code:'invalid_save'});
});

test('save snapshots data before awaiting auth and uses optimistic revision',async()=>{
  const f=fixture();await f.cloud.init();const data=payload();
  const promise=f.cloud.save(data,7,A.id);data.week=99;
  assert.deepEqual(await promise,{revision:8,updatedAt:stamp});
  const request=f.calls.find(x=>x.type==='fetch'&&x.url.includes('/rpc/'));
  assert.equal(JSON.parse(request.init.body).p_payload.week,1);
  assert.equal(JSON.parse(request.init.body).p_expected_revision,7);
  assert.equal(request.init.headers.Authorization,'Bearer token-'+A.id);
});

test('revision conflicts never retry or overwrite a newer cloud save',async()=>{
  const f=fixture();await f.cloud.init();f.setRoute(()=>f.reply({code:'P0001',message:'TAF_SAVE_CONFLICT'},400));
  await assert.rejects(f.cloud.save(payload(),1),{code:'conflict'});
  assert.equal(f.calls.filter(x=>x.type==='fetch'&&x.url.includes('/rpc/')).length,1);
  assert.equal(f.cloud.getStatus().error.code,'conflict');
});

test('invalid revision and oversized payload are rejected before remote writes',async()=>{
  const f=fixture();await f.cloud.init();
  for(const revision of [-1,1.5,'1',Number.MAX_SAFE_INTEGER+1])await assert.rejects(f.cloud.save(payload(),revision),{code:'invalid_save'});
  await assert.rejects(f.cloud.save({version:2,tooLarge:'x'.repeat(C.MAX_SAVE_BYTES)},0),{code:'save_too_large'});
  assert.equal(f.calls.some(x=>x.type==='fetch'&&x.url.includes('/rpc/')),false);
});

test('unexpected returned revision is not treated as successful synchronization',async()=>{
  const f=fixture();await f.cloud.init();f.setRoute(()=>f.reply({revision:22,updated_at:stamp}));
  await assert.rejects(f.cloud.save(payload(),2),{code:'invalid_save'});
});

test('expected-account guard rejects stale coordinator calls before any remote write',async()=>{
  const f=fixture();await f.cloud.init();
  await assert.rejects(f.cloud.save(payload(),0,B.id),{code:'auth_changed'});
  assert.equal(f.calls.some(x=>x.type==='fetch'&&x.url.includes('/rpc/')),false);
});

test('switching accounts during an upload cannot save to the new account',async()=>{
  const f=fixture();await f.cloud.init();let finish;
  f.setRoute((url,init)=>new Promise(resolve=>{finish=()=>resolve(f.reply({revision:1,updated_at:stamp}));}));
  const pending=f.cloud.save(payload(),0,A.id);
  while(!finish)await tick();
  f.setUser(B);await tick();finish();
  await assert.rejects(pending,{code:'auth_changed'});
  const request=f.calls.find(x=>x.type==='fetch'&&x.url.includes('/rpc/'));
  assert.equal(request.init.headers.Authorization,'Bearer token-'+A.id);
  assert.equal(f.cloud.getStatus().user.id,B.id);
});

test('same-account token refresh does not create a false save conflict',async()=>{
  const f=fixture();await f.cloud.init();let finish;
  f.setRoute(()=>new Promise(resolve=>{finish=()=>resolve(f.reply({revision:1,updated_at:stamp}));}));
  const pending=f.cloud.save(payload());while(!finish)await tick();
  f.setUser(A,'TOKEN_REFRESHED');await tick();finish();
  assert.equal((await pending).revision,1);
});

test('password change uses verified account token and never stores plaintext locally',async()=>{
  const f=fixture();await f.cloud.init();assert.equal(await f.cloud.changePassword('new secure passphrase'),true);
  const request=f.calls.find(x=>x.type==='fetch'&&x.url.includes('/auth/v1/user'));
  assert.equal(request.init.method,'PUT');assert.equal(request.init.headers.Authorization,'Bearer token-'+A.id);
  assert.deepEqual(JSON.parse(request.init.body),{password:'new secure passphrase'});
  assert.equal(JSON.stringify(f.cloud.getStatus()).includes('passphrase'),false);
});

test('signout affects this session and reports failures without pretending success',async()=>{
  const f=fixture();await f.cloud.init();
  f.auth.signOut=async()=>({error:{message:'Network request failed'}});
  await assert.rejects(f.cloud.signOut(),{code:'network'});assert.equal(f.cloud.getStatus().user.id,A.id);
  f.auth.signOut=async(args)=>{assert.deepEqual(args,{scope:'local'});return {error:null};};
  await f.cloud.signOut();assert.equal(f.cloud.getStatus().user,null);
  await assert.rejects(f.cloud.load(),{code:'auth'});
});

test('subscriptions defer SDK callbacks and dispose unsubscribes safely',async()=>{
  const f=fixture();await f.cloud.init();const changes=[];
  const unsubscribe=f.cloud.subscribe((status,event)=>changes.push({id:status.user&&status.user.id,event}));
  f.setUser(B);assert.equal(changes.length,0);await tick();assert.equal(changes.at(-1).id,B.id);
  unsubscribe();f.setUser(A);await tick();assert.equal(changes.length,1);
  f.cloud.dispose();await assert.rejects(f.cloud.load(),{code:'disposed'});
});

test('rapid account changes update identity immediately and never replay stale identity',async()=>{
  const f=fixture();await f.cloud.init();const users=[];
  f.cloud.subscribe(status=>users.push(status.user&&status.user.id));
  f.setUser(B);assert.equal(f.cloud.getStatus().user.id,B.id);
  f.setUser(null,'SIGNED_OUT');assert.equal(f.cloud.getStatus().user,null);
  await assert.rejects(f.cloud.save(payload(),0,A.id),{code:'auth'});
  await tick();assert.equal(f.cloud.getStatus().user,null);
  assert.ok(users.every(id=>id===null));
});

test('session verification finishing after an account switch cannot restore the old user',async()=>{
  const f=fixture();let release;
  f.auth.getUser=()=>new Promise(resolve=>{release=()=>resolve({data:{user:A},error:null});});
  const pending=f.cloud.init();while(!release)await tick();
  f.setUser(B);release();await pending;
  assert.equal(f.cloud.getStatus().user.id,B.id);
  assert.equal(f.cloud.getStatus().error.code,'auth_changed');
});

test('network timeouts preserve the account and provide a retriable error',async()=>{
  const f=fixture({timeoutMs:10});await f.cloud.init();
  f.setRoute((url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('Aborted')))));
  await assert.rejects(f.cloud.load(),{code:'network'});assert.equal(f.cloud.getStatus().user.id,A.id);
});

test('injected game validation rejects structurally corrupt remote saves',async()=>{
  const f=fixture({create:{validate:data=>Array.isArray(data.athletes)&&data.athletes.length===12}});await f.cloud.init();
  await assert.rejects(f.cloud.load(),{code:'invalid_save'});
});
test('the cloud deadline also covers a stalled large-save response body',async()=>{
  const f=fixture({timeoutMs:10});await f.cloud.init();
  f.setRoute(()=>({ok:true,status:200,json:()=>new Promise(()=>{})}));
  await assert.rejects(f.cloud.load(),{code:'network'});assert.equal(f.cloud.getStatus().user.id,A.id);
});
