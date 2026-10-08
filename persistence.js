(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/lz-string-1.5.0.js'));
  else root.TrackSaveStore=factory(root.LZString);
})(typeof globalThis!=='undefined'?globalThis:this,function(LZ){
  'use strict';
  const KEY='hokago-track-club-save-v2';
  const BACKUP_KEY=KEY+'-backup';
  const META_KEY=KEY+'-meta';
  const RECOVERY_KEY=KEY+'-recovery';
  const PACKED_PREFIX='TAF-LZ1:';
  const MAX_SAVE_CHARACTERS=20*1024*1024;
  const COMPRESSION_THRESHOLD=32*1024;
  function checksum(text){let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(16);}
  function pack(json){
    if(typeof json!=='string'||json.length>MAX_SAVE_CHARACTERS)throw Error('save-size');
    if(json.length<COMPRESSION_THRESHOLD)return json;
    if(!LZ)throw Error('save-codec');
    const packed=PACKED_PREFIX+json.length+':'+checksum(json)+':'+LZ.compressToUTF16(json);
    return packed.length<json.length?packed:json;
  }
  function unpack(raw){
    if(typeof raw!=='string'||raw.length>MAX_SAVE_CHARACTERS)return null;
    if(!raw.startsWith(PACKED_PREFIX))return raw;
    if(!LZ)throw Error('save-codec');
    const header=/^TAF-LZ1:([1-9][0-9]{0,7}):([a-f0-9]{1,8}):/.exec(raw);
    if(!header)return null;
    const length=Number(header[1]);
    if(length>MAX_SAVE_CHARACTERS)return null;
    // The vendored decoder stops as soon as output exceeds this header's
    // bounded length, so corrupted compressed data cannot expand unboundedly.
    let json;try{json=LZ.decompressFromUTF16(raw.slice(header[0].length),length);}catch{return null;}
    return typeof json==='string'&&json.length===length&&checksum(json)===header[2]?json:null;
  }
  function encode(value){return pack(JSON.stringify(value));}
  function decode(raw){try{const json=unpack(raw);return json===null?null:JSON.parse(json);}catch{return null;}}
  function create({storage,validate,key=KEY,now=()=>new Date().toISOString()}){
    const primaryKey=key,backupKey=key+'-backup',metaKey=key+'-meta',recoveryKey=key+'-recovery';
    let expectedRaw=null,expectedJson=null,expectedPacked=null,initialized=false,blocked=false;
    let status={savedAt:null,backupAt:null,backupAvailable:false,persisted:false,error:null,conflict:false};
    function parse(raw){const value=decode(raw);try{return validate(value)?value:null;}catch{return null;}}
    function readMeta(s){try{return JSON.parse(s.getItem(metaKey)||'{}')||{};}catch{return {};}}
    function preserve(s,raw){if(!raw)return true;try{s.setItem(recoveryKey,raw);return s.getItem(recoveryKey)===raw;}catch{return false;}}
    function matchesExpected(raw){
      if(raw===expectedRaw)return true;
      // Another tab may only have upgraded the same legacy JSON to compression.
      // Treat that as unchanged progress, while retaining strict conflict checks.
      if(expectedJson!==null&&unpack(raw)===expectedJson){expectedRaw=raw;expectedPacked=raw;return true;}
      return false;
    }
    function load(){
      let notice='';
      try{
        const s=storage(),raw=s.getItem(primaryKey),backupRaw=s.getItem(backupKey),meta=readMeta(s);
        expectedRaw=raw;expectedJson=unpack(raw);expectedPacked=raw?.startsWith(PACKED_PREFIX)?raw:null;initialized=true;blocked=false;
        const current=parse(raw),backup=parse(backupRaw);
        status={savedAt:current?meta.savedAt||null:null,backupAt:backup?meta.backupAt||null:null,backupAvailable:!!backup,persisted:!!current,error:null,conflict:false};
        if(current)return {state:current,notice};
        if(raw&&!preserve(s,raw)){blocked=true;status.error='recovery';}
        if(backup){notice='保存データを直前のバックアップから復旧しました。';return {state:backup,notice,recovered:true};}
        if(raw)notice=blocked?'保存データを読み込めません。元データを保護するため保存を停止しています。':'保存データを読み込めなかったため、新しい部活を始めました。元のデータは復旧用に保管しています。';
        return {state:null,notice};
      }catch{
        initialized=true;blocked=!!expectedRaw?.startsWith(PACKED_PREFIX)&&!LZ;status.error='unavailable';
        return {state:null,notice:'このブラウザーでは自動保存を利用できません。設定からセーブを書き出してください。'};
      }
    }
    function save(value){
      if(blocked){status.error='recovery';return false;}
      if(!validate(value)){status.error='invalid';return false;}
      try{
        const s=storage(),json=JSON.stringify(value),current=s.getItem(primaryKey);
        if(!initialized||!matchesExpected(current)){status.error='conflict';status.conflict=true;return false;}
        const raw=json===expectedJson&&expectedPacked?expectedPacked:pack(json);
        if(json===expectedJson){
          // Upgrade a legacy JSON slot without rotating its previous-game backup.
          if(raw!==current){s.setItem(primaryKey,raw);if(s.getItem(primaryKey)!==raw)throw Error('write verification failed');expectedRaw=raw;expectedPacked=raw;}
          status.persisted=true;status.error=null;status.conflict=false;return true;
        }
        const stamp=now();
        // Keep the previous valid, distinct state before committing a new state.
        // A quota error here leaves the current save untouched.
        if(parse(current)){
          const previous=expectedPacked||pack(expectedJson);
          // First compact the same old state in place. This frees quota before
          // creating a backup and never removes the last committed progress.
          if(previous.length<current.length){s.setItem(primaryKey,previous);if(s.getItem(primaryKey)!==previous)throw Error('write verification failed');expectedRaw=previous;expectedPacked=previous;}
          s.setItem(backupKey,previous);
          status.backupAvailable=true;status.backupAt=status.savedAt;
        }
        s.setItem(primaryKey,raw);
        if(s.getItem(primaryKey)!==raw)throw Error('write verification failed');
        expectedRaw=raw;expectedJson=json;expectedPacked=raw;status.savedAt=stamp;status.persisted=true;status.error=null;status.conflict=false;
        // Timestamp metadata is supplementary; losing it must not invalidate a save.
        try{s.setItem(metaKey,JSON.stringify({savedAt:stamp,backupAt:status.backupAt}));}catch{}
        return true;
      }catch{status.error='unavailable';return false;}
    }
    function backup(){try{return parse(storage().getItem(backupKey));}catch{return null;}}
    function hasConflict(){
      try{if(!matchesExpected(storage().getItem(primaryKey))){status.error='conflict';status.conflict=true;return true;}}catch{status.error='unavailable';}
      return false;
    }
    return {key:primaryKey,load,save,backup,hasConflict,getStatus:()=>({...status})};
  }
  return {KEY,BACKUP_KEY,META_KEY,RECOVERY_KEY,PACKED_PREFIX,MAX_SAVE_CHARACTERS,COMPRESSION_THRESHOLD,encode,decode,create};
});
