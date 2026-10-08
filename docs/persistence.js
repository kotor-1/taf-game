(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TrackSaveStore=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='hokago-track-club-save-v2';
  const BACKUP_KEY=KEY+'-backup';
  const META_KEY=KEY+'-meta';
  const RECOVERY_KEY=KEY+'-recovery';
  function create({storage,validate,now=()=>new Date().toISOString()}){
    let expectedRaw=null,initialized=false,blocked=false;
    let status={savedAt:null,backupAt:null,backupAvailable:false,persisted:false,error:null,conflict:false};
    function parse(raw){try{const value=JSON.parse(raw);return validate(value)?value:null;}catch{return null;}}
    function readMeta(s){try{return JSON.parse(s.getItem(META_KEY)||'{}')||{};}catch{return {};}}
    function preserve(s,raw){if(!raw)return true;try{s.setItem(RECOVERY_KEY,raw);return s.getItem(RECOVERY_KEY)===raw;}catch{return false;}}
    function load(){
      let notice='';
      try{
        const s=storage(),raw=s.getItem(KEY),backupRaw=s.getItem(BACKUP_KEY),meta=readMeta(s);
        expectedRaw=raw;initialized=true;
        const current=parse(raw),backup=parse(backupRaw);
        status={savedAt:current?meta.savedAt||null:null,backupAt:backup?meta.backupAt||null:null,backupAvailable:!!backup,persisted:!!current,error:null,conflict:false};
        if(current)return {state:current,notice};
        if(raw&&!preserve(s,raw)){blocked=true;status.error='recovery';}
        if(backup){notice='保存データを直前のバックアップから復旧しました。';return {state:backup,notice,recovered:true};}
        if(raw)notice=blocked?'保存データを読み込めません。元データを保護するため保存を停止しています。':'保存データを読み込めなかったため、新しい部活を始めました。元のデータは復旧用に保管しています。';
        return {state:null,notice};
      }catch{
        initialized=true;status.error='unavailable';
        return {state:null,notice:'このブラウザーでは自動保存を利用できません。設定からセーブを書き出してください。'};
      }
    }
    function save(value){
      if(blocked){status.error='recovery';return false;}
      if(!validate(value)){status.error='invalid';return false;}
      try{
        const s=storage(),raw=JSON.stringify(value),current=s.getItem(KEY);
        if(!initialized||current!==expectedRaw){status.error='conflict';status.conflict=true;return false;}
        if(raw===current){status.persisted=true;status.error=null;status.conflict=false;return true;}
        const stamp=now();
        // Keep the previous valid, distinct state before committing a new state.
        // A quota error here leaves the current save untouched.
        if(parse(current)){
          s.setItem(BACKUP_KEY,current);
          status.backupAvailable=true;status.backupAt=status.savedAt;
        }
        s.setItem(KEY,raw);
        if(s.getItem(KEY)!==raw)throw Error('write verification failed');
        expectedRaw=raw;status.savedAt=stamp;status.persisted=true;status.error=null;status.conflict=false;
        // Timestamp metadata is supplementary; losing it must not invalidate a save.
        try{s.setItem(META_KEY,JSON.stringify({savedAt:stamp,backupAt:status.backupAt}));}catch{}
        return true;
      }catch{status.error='unavailable';return false;}
    }
    function backup(){try{return parse(storage().getItem(BACKUP_KEY));}catch{return null;}}
    function hasConflict(){
      try{if(storage().getItem(KEY)!==expectedRaw){status.error='conflict';status.conflict=true;return true;}}catch{status.error='unavailable';}
      return false;
    }
    return {load,save,backup,hasConflict,getStatus:()=>({...status})};
  }
  return {KEY,BACKUP_KEY,META_KEY,RECOVERY_KEY,create};
});
