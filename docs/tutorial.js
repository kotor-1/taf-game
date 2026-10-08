(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.TrackTutorial=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='hokago-track-club-tutorial-v1';
  const STEPS=Object.freeze(['athlete','plan','card','week','calendar','career','save'].map(id=>Object.freeze({id})));
  const PHASES=new Set(['new','active','paused','done','dismissed']);
  const fresh=()=>({version:1,status:'new',step:0,completed:false});
  function valid(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!PHASES.has(value.status)||!Number.isInteger(value.step)||value.step<0||value.step>=STEPS.length||typeof value.completed!=='boolean')return false;
    if(['new','dismissed'].includes(value.status)&&(value.step!==0||value.completed))return false;
    if(value.status==='done'&&(value.step!==STEPS.length-1||!value.completed))return false;
    return true;
  }
  function create({storage,onChange=()=>{}}={}){
    let state=fresh(),persisted=false;
    try{
      const raw=storage().getItem(KEY),saved=raw===null?null:JSON.parse(raw);
      if(valid(saved)){state={version:1,status:saved.status,step:saved.step,completed:saved.completed};persisted=true;}
    }catch{}
    function getStatus(){return {...state,stepId:STEPS[state.step].id,persisted};}
    function commit(next){
      if(state.status===next.status&&state.step===next.step&&state.completed===next.completed)return getStatus();
      state={version:1,status:next.status,step:next.step,completed:next.completed};
      try{const store=storage(),raw=JSON.stringify(state);store.setItem(KEY,raw);persisted=store.getItem(KEY)===raw;}catch{persisted=false;}
      const status=getStatus();if(typeof onChange==='function')onChange(status);return status;
    }
    function start(restart=false){
      if(restart)return commit({...fresh(),status:'active'});
      if(state.status==='done'||state.status==='active')return getStatus();
      return commit({...state,status:'active'});
    }
    function pause(){return state.status==='active'?commit({...state,status:'paused'}):getStatus();}
    function dismiss(){return state.status==='new'?commit({...state,status:'dismissed'}):getStatus();}
    function advance(){
      return state.step===STEPS.length-1?commit({...state,status:'done',completed:true}):commit({...state,step:state.step+1,completed:false});
    }
    function next(){return state.status==='active'&&state.completed?advance():getStatus();}
    function skip(){return state.status==='active'?advance():getStatus();}
    function complete(id){return state.status==='active'&&STEPS[state.step].id===id?commit({...state,completed:true}):getStatus();}
    return {getStatus,start,pause,dismiss,next,skip,complete};
  }
  return {KEY,STEPS,create};
});
