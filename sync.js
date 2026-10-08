(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./persistence.js'));
  else root.TrackAccountSync=factory(root.TrackSaveStore);
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function fingerprint(value){const raw=JSON.stringify(value,(_key,item)=>{if(item&&typeof item==='object'&&!Array.isArray(item)){const sorted={};for(const key of Object.keys(item).sort())sorted[key]=item[key];return sorted;}return item;});let a=2166136261,b=5381;for(let i=0;i<raw.length;i++){a=Math.imul(a^raw.charCodeAt(i),16777619);b=Math.imul(b,33)^raw.charCodeAt(i);}return `${raw.length}:${a>>>0}:${b>>>0}`;}
  function create({cloud,storage,validate,createGame,onState=()=>{},onStatus=()=>{},debounceMs=700}){
    const listeners=new Set();
    const guestStore=P.create({storage,validate}),guestLoad=guestStore.load();
    let guestState=guestLoad.state||createGame(),generation=0,started=false,timer=null,unsubscribe=null;
    let active={id:null,user:null,key:P.KEY,store:guestStore,state:guestState,phase:'guest',notice:guestLoad.notice,meta:{baseRevision:0,pending:false},remote:null,error:null,choice:null};
    function getStatus(){const c=active;return {phase:c.phase,account:c.user?{...c.user}:null,pending:!!c.meta.pending,error:c.error,choice:c.choice,localAvailable:!!c.localLoaded||!c.id,remoteAvailable:!!c.remote,remoteSummary:c.remote?{schoolName:c.remote.data.schoolName,year:c.remote.data.year,week:c.remote.data.week,updatedAt:c.remote.updatedAt}:null,revision:c.meta.baseRevision||0,syncedAt:c.meta.syncedAt||null,notice:c.notice||'',localStatus:c.store.getStatus()};}
    function emit(){const status=getStatus();onStatus(status);for(const fn of listeners)fn(status);}
    function current(c){return active===c&&c.generation===generation&&cloud.getStatus().user?.id===c.id;}
    function readMeta(key){try{const m=JSON.parse(storage().getItem(key+'-sync')||'null');if(m&&Number.isSafeInteger(m.baseRevision)&&m.baseRevision>=0&&typeof m.pending==='boolean')return m;}catch{}return {baseRevision:0,pending:false};}
    function writeMeta(c){try{storage().setItem(c.key+'-sync',JSON.stringify(c.meta));return true;}catch{return false;}}
    function replace(c,value){c.state=clone(value);if(active===c)onState(c.state);}
    function errorFor(error){return {code:error?.code||'network',message:error?.message||'クラウドに接続できません。'};}
    function markError(c,error){if(!current(c))return; c.error=errorFor(error);c.phase=c.error.code==='conflict'?'conflict':c.error.code==='network'&&c.localLoaded?'offline':'error';if(c.phase==='conflict')c.choice='conflict';emit();}
    function setConflict(c,remote){c.remote=remote;c.phase='conflict';c.choice='conflict';c.error={code:'conflict',message:'この端末とクラウドの両方に異なる進行があります。どちらを続けるか選んでください。'};emit();}
    function adoptRemote(c,remote){
      c.remote=remote;c.meta={baseRevision:remote.revision,pending:false,syncedHash:fingerprint(remote.data),syncedAt:remote.updatedAt||null,chosen:true};
      // Never overwrite a newer save from another browser tab.
      if(!c.store.save(remote.data)){c.phase='error';c.error={code:'local_save',message:'クラウドの進行をこのブラウザーに保存できません。保存状態を確認してください。'};emit();return false;}
      c.localLoaded=true;writeMeta(c);c.phase='ready';c.choice=null;c.error=null;replace(c,remote.data);emit();return true;
    }
    async function reconcile(c){
      if(!current(c))return false;
      c.phase='loading';c.error=null;emit();
      try{
        const remote=await cloud.load(c.id);if(!current(c))return false;
        if(remote&&(!validate(remote.data)||!Number.isSafeInteger(remote.revision)||remote.revision<1))throw Object.assign(Error('クラウドの保存データを読み込めません。'),{code:'invalid_save'});
        c.remote=remote;c.remoteChecked=true;
        const hash=fingerprint(c.state),dirty=c.localLoaded&&(c.meta.pending||c.meta.syncedHash!==hash);
        if(remote){
          if(!c.localLoaded||hash===fingerprint(remote.data)||!dirty)return adoptRemote(c,remote);
          if(c.meta.chosen&&c.meta.baseRevision===remote.revision){c.meta.pending=true;c.phase='ready';c.choice=null;c.error=null;writeMeta(c);emit();return true;}
          setConflict(c,remote);return false;
        }
        if(c.localLoaded&&c.meta.chosen&&c.meta.baseRevision===0){c.meta.pending=true;c.phase='ready';c.choice=null;c.error=null;writeMeta(c);emit();return true;}
        if(c.localLoaded){setConflict(c,null);return false;}
        c.phase='choose';c.choice='new-account';c.choiceLocal=clone(guestState);c.error=null;replace(c,c.choiceLocal);emit();return false;
      }catch(error){c.remoteChecked=false;markError(c,error);return false;}
    }
    function schedule(c){clearTimeout(timer);timer=setTimeout(()=>{timer=null;if(current(c))void flush();},debounceMs);}
    async function switchAccount(){
      const user=cloud.getStatus().user||null;
      if((user?.id||null)===active.id)return active.ready;
      clearTimeout(timer);timer=null;generation++;
      if(!active.id){guestState=active.state;guestStore.save(guestState);}
      if(!user){
        const loaded=guestStore.load();guestState=loaded.state||guestState;
        active={id:null,user:null,key:P.KEY,store:guestStore,state:guestState,phase:'guest',notice:loaded.notice,meta:{baseRevision:0,pending:false},remote:null,error:null,choice:null};
        onState(active.state);emit();return;
      }
      const key=P.KEY+':account:'+user.id,store=P.create({storage,validate,key}),loaded=store.load();
      const c={id:user.id,user:{...user},generation,key,store,state:loaded.state||createGame(),localLoaded:!!loaded.state,notice:loaded.notice,meta:readMeta(key),remote:null,remoteChecked:false,phase:'loading',error:null,choice:null};
      active=c;onState(c.state);emit();
      c.ready=reconcile(c);await c.ready;
      if(current(c)&&c.phase==='ready'&&c.meta.pending)schedule(c);
    }
    async function init(){
      if(!started){started=true;unsubscribe=cloud.subscribe(()=>{queueMicrotask(()=>{void switchAccount();});});await cloud.init();}
      await switchAccount();
      const cs=cloud.getStatus();if(!cs.user&&cs.error){active.error=errorFor(cs.error);emit();}
      return getStatus();
    }
    function save(value){
      const c=active;
      if(!validate(value))return false;
      if(c.id&&['loading','choose','conflict','error'].includes(c.phase))return false;
      const ok=c.store.save(value);c.state=value;
      if(!c.id){guestState=value;emit();return ok;}
      if(!current(c))return false;
      if(fingerprint(value)!==c.meta.syncedHash){c.meta.pending=true;if(ok)writeMeta(c);}
      if(ok){c.localLoaded=true;if(c.phase==='ready'||c.phase==='offline')schedule(c);}
      emit();return ok;
    }
    async function flush(){
      const c=active;
      if(!c.id)return c.store.save(c.state);
      if(!current(c))return false;
      if(c.store.getStatus().conflict){c.phase='error';c.error={code:'local_save',message:'別のタブで保存された進行があります。再読み込みしてから同期してください。'};emit();return false;}
      if(c.ready&&c.phase==='loading')await c.ready;
      if(!current(c)||['choose','conflict'].includes(c.phase))return false;
      if(c.writing)return c.writing;
      clearTimeout(timer);timer=null;
      c.writing=(async()=>{
        if(!c.remoteChecked||['offline','error'].includes(c.phase)){if(!await reconcile(c))return false;}
        while(current(c)&&c.meta.pending&&c.phase==='ready'){
          const snapshot=clone(c.state),hash=fingerprint(snapshot);
          try{
            const saved=await cloud.save(snapshot,c.meta.baseRevision,c.id);
            if(!current(c))return false;
            c.meta.baseRevision=saved.revision;c.meta.syncedAt=saved.updatedAt||null;c.meta.syncedHash=hash;c.meta.chosen=true;c.meta.pending=fingerprint(c.state)!==hash;
            writeMeta(c);c.error=null;c.remote={data:snapshot,revision:saved.revision,updatedAt:saved.updatedAt};emit();
          }catch(error){
            if(!current(c))return false;
            c.remoteChecked=false;
            if(error?.code==='conflict'){
              try{const latest=await cloud.load(c.id);if(current(c)){if(latest&&!validate(latest.data))throw Object.assign(Error('クラウドの保存データを読み込めません。'),{code:'invalid_save'});setConflict(c,latest);}}catch(loadError){markError(c,loadError);}
            }else markError(c,error);
            return false;
          }
        }
        return current(c)&&!c.meta.pending;
      })();
      try{return await c.writing;}finally{c.writing=null;}
    }
    async function selectLocal(){
      const c=active;if(!c.id||!current(c)||!['choose','conflict'].includes(c.phase))return false;
      const value=c.choice==='new-account'?c.choiceLocal:c.state;
      if(!c.store.save(value)){c.error={code:'local_save',message:'この端末に保存できません。セーブファイルを書き出してください。'};emit();return false;}
      c.localLoaded=true;c.meta={baseRevision:c.remote?.revision||0,pending:true,chosen:true,syncedHash:c.remote?fingerprint(c.remote.data):null,syncedAt:c.remote?.updatedAt||null};writeMeta(c);
      c.remoteChecked=true;c.phase='ready';c.choice=null;c.error=null;replace(c,value);emit();return flush();
    }
    async function selectRemote(){
      const c=active;if(!c.id||!current(c)||!['choose','conflict'].includes(c.phase))return false;
      if(c.remote)return adoptRemote(c,c.remote);
      // For a new account, the second explicit choice starts a separate new club.
      c.choiceLocal=createGame();c.choice='new-account';return selectLocal();
    }
    function dispose(){clearTimeout(timer);timer=null;unsubscribe?.();generation++;listeners.clear();}
    return {getState:()=>active.state,getLocalStore:()=>active.store,getStatus,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},init,save,flush,selectLocal,selectRemote,dispose};
  }
  return {create,fingerprint};
});
