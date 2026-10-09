/* One atomic week, presented as a live practice with a deliberate coaching choice. */
(function(root){
  'use strict';
  root.TrackTrainingPlayer={create};
  function create({E,Scene,esc,icon,getState,onCommit,onClose}){
    const dialog=document.createElement('dialog');
    dialog.id='practice-dialog';dialog.className='practice-theater';dialog.setAttribute('aria-labelledby','practice-title');
    document.body.append(dialog);
    let active=false,scene,frame,journey,visual,stamp,progress=0,speed=1,paused=false,phase='work',committed=false,result,targetId,lastTime=0,lastFocus;
    const reduced=()=>root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const q=s=>dialog.querySelector(s);
    const action=(id,label,cls='')=>`<button type="button" class="btn small ${cls}" data-training-action="${id}">${label}</button>`;
    function sceneData(){const day=Math.min(7,Math.floor(progress*7)+1),blockId=journey.days[day-1]?.blockId||journey.route[day<=2?0:day<=5?1:2];return {blockId,day,progress,phase,spotlightId:targetId,playbackRate:speed,paused:paused||phase==='decision'};}
    function update(){
      dialog.dataset.phase=phase;
      scene?.updateTraining(sceneData());
      const day=Math.min(7,Math.floor(progress*7)+1);
      q('[data-practice-day]').textContent=phase==='decision'?'監督の指導タイム':phase==='finish'?'1週間、おつかれさま。':`DAY ${day} / 7`;
      q('[data-practice-progress]').style.width=`${progress*100}%`;
      dialog.querySelectorAll('[data-practice-stop]').forEach((el,i)=>el.classList.toggle('current',i===day-1));
      const button=q('[data-training-action="pause"]');button.disabled=phase!=='work';button.textContent=paused?'再生する':'一時停止';button.setAttribute('aria-pressed',String(paused));
      q('[data-training-action="skip"]').textContent=committed?'成長を見る':'指導まで早送り';q('[data-training-action="skip"]').disabled=phase==='decision'||phase==='finish';
      q('[data-practice-close]').textContent=committed?'部室へ戻る':'練習をやめて戻る';
    }
    function instruction(){const a=visual.athletes.find(a=>a.id===targetId);return a&&targetId!==journey.event.athleteId?{title:'この選手の一歩を支えよう',text:`${a.name}に注目。今週の疲労は${Math.round(100-a.energy)}。後半に向けて、どんな言葉をかける？`}:journey.event;}
    function focusPanel(){if(root.innerWidth<=800)q('[data-practice-panel]').scrollIntoView({block:'nearest',behavior:'instant'});}
    function decision(){
      if(!active||committed)return;
      progress=.43;phase='decision';paused=false;
      const event=journey.event,story=instruction(),healthy=visual.athletes.filter(a=>!a.injury);
      q('[data-practice-caption]').textContent='どの選手に、どんな声をかける？ 指導を選ぶと、この1週間の成長が確定します。';
      q('[data-practice-panel]').innerHTML=`<div class="practice-decision-title"><span class="practice-kicker">COACH'S TIME</span><h3 data-instruction-title>${esc(story.title)}</h3><p data-instruction-text>${esc(story.text)}</p></div><label class="practice-target">声をかける選手<select data-practice-target aria-label="個別指導する選手">${healthy.map(a=>`<option value="${esc(a.id)}" ${a.id===targetId?'selected':''}>${esc(a.name)}${a.training==='rest'?'（休養中）':''} · 疲労 ${Math.round(100-a.energy)}</option>`).join('')||'<option value="">チーム全体を見守る</option>'}</select></label><div class="practice-choices">${event.choices.map(c=>`<button class="practice-choice" data-training-action="decide" data-decision="${esc(c.id)}"><strong>${esc(c.label)}</strong><span>${esc(c.description)}</span>${icon('arrow')}</button>`).join('')}</div><p class="practice-tiny">選手はグラウンドからも選べます。休養・療養中は個別指導の追加育成はありません。操作の速さは成績に影響しません。</p>`;
      update();q('[data-training-action="decide"]')?.focus({preventScroll:true});focusPanel();
    }
    function finish(){
      if(!active||!committed)return;
      progress=1;phase='finish';update();
      q('[data-practice-caption]').textContent=result.report.decisionText||'積み重ねた練習が、選手の力になりました。';
      q('[data-practice-panel]').innerHTML=`<div class="practice-decision-title"><span class="practice-kicker">WEEK COMPLETE</span><h3>積み重ねが、力になる。</h3></div><div class="practice-gains">${(result.report.highlights||[]).map(h=>`<div><span>${esc(h.name)}</span><strong>${esc(h.label||E.STAT_NAMES[h.key])} <b>+${Number(h.gain).toFixed(1)}</b></strong><small>${Math.floor(h.before)} → ${Math.floor(h.after)} ${h.rankBefore!==h.rankAfter?`<em>${esc(h.rankBefore)} → ${esc(h.rankAfter)} RANK UP</em>`:''}</small></div>`).join('')}</div><div class="practice-finish-action">${action('close','部室で成長を振り返る '+icon('arrow'),'primary')}</div>`;
      q('[data-training-action="skip"]').disabled=true;
      q('.practice-finish-action button')?.focus({preventScroll:true});focusPanel();
    }
    function tick(now){
      if(!active)return;
      const dt=Math.min(.08,Math.max(0,(now-lastTime)/1000));lastTime=now;
      if(phase==='work'&&!paused){progress+=dt*speed/(reduced()?1.5:11);if(!committed&&progress>=.43)decision();else if(committed&&progress>=1)finish();else update();}
      frame=requestAnimationFrame(tick);
    }
    function choose(id){
      if(!active||phase!=='decision'||committed)return;
      // Disable immediately: a double click must never advance another week.
      dialog.querySelectorAll('[data-decision]').forEach(b=>b.disabled=true);
      const chosenTarget=q('[data-practice-target]')?.value||undefined;
      let response;
      try{response=onCommit({decision:id,athleteId:chosenTarget,stamp});}catch(error){response={ok:false,message:'練習を確定できませんでした。部室で保存状況を確認してください。'};}
      if(!response?.ok){q('[data-practice-caption]').textContent=response?.message||'練習を確定できませんでした。';dialog.querySelectorAll('[data-decision]').forEach(b=>b.disabled=false);return;}
      committed=true;result=response;targetId=chosenTarget;phase='work';paused=false;
      visual.athletes=visual.athletes.map(a=>{const c=response.report.changes.find(c=>c.athleteId===a.id);return c?{...a,stats:{...c.after},energy:c.afterEnergy}:a;});
      scene?.setState(visual);
      q('[data-practice-caption]').textContent=response.report.decisionText||'その指導を、次の一本へ。';
      q('[data-practice-panel]').innerHTML=`<div class="practice-observation"><span class="practice-kicker">SECOND HALF</span><h3>選手たちが、もう一歩前へ。</h3><p>${esc(response.report.decisionText||'練習の成果を確かめながら、1週間を締めくくります。')}</p><p class="practice-tiny">1週間の進行は確定しました。ここで閉じても成長は残ります。</p></div>`;
      update();
    }
    function close({silent=false}={}){
      if(!active)return;
      active=false;cancelAnimationFrame(frame);scene?.destroy();scene=null;dialog.close();
      const finishedResult=result;dialog.innerHTML='';
      if(!silent)onClose?.({committed,result:finishedResult});
      if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});else document.querySelector('.week-button')?.focus({preventScroll:true});
    }
    function start(){
      if(active)return false;
      const state=getState();journey=E.getWeekJourney(state);
      stamp=state.totalWeeks;targetId=journey.event.athleteId;result=null;committed=false;progress=0;phase='work';paused=false;speed=1;
      visual={...state,athletes:state.athletes.map(a=>({...a,stats:{...a.stats}}))};lastFocus=document.activeElement;
      dialog.innerHTML=`<header class="practice-header"><div><span class="practice-kicker">AFTER SCHOOL · LIVE PRACTICE</span><h2 id="practice-title">${esc(E.getCalendar(state).monthName)}、今週のグラウンド</h2></div><button class="practice-close" data-training-action="close" aria-label="練習画面を閉じる">${icon('close')}<span data-practice-close>練習をやめて戻る</span></button></header><div class="practice-layout"><div class="practice-stage"><div class="practice-scene-wrap"><canvas width="1000" height="520" aria-label="7日間の練習風景。選手をクリックして指導対象に選べます。"></canvas><span class="practice-day" data-practice-day>DAY 1 / 7</span></div><div class="practice-timeline">${journey.days.map((d,i)=>`<div data-practice-stop><small>${esc(d.label||`DAY ${i+1}`)}</small><span>${esc(E.WEEK_BLOCKS.find(b=>b.id===d.blockId)?.name||d.blockId)}</span></div>`).join('')}<div class="practice-timeline-progress"><i data-practice-progress></i></div></div><div class="practice-controls">${action('pause','一時停止')}<div class="practice-speeds" role="group" aria-label="演出の再生速度">${[1,2,4].map(n=>`<button data-training-action="speed" data-speed="${n}" aria-pressed="${n===1}">${n}×</button>`).join('')}</div>${action('skip','指導まで早送り')}</div><p class="practice-caption" data-practice-caption aria-live="polite">まずは練習を観察。途中で選手への指導を決めます。</p></div><aside class="practice-side" data-practice-panel><div class="practice-observation"><span class="practice-kicker">WATCH YOUR TEAM</span><h3>今日の一歩を、<br>明日の自己ベストへ。</h3><p>${esc(journey.forecast.note)}</p><div class="practice-observation-icon">${icon('run')}</div><p>動くグラウンドで部員を選んで、気になる選手を追いかけよう。</p><p class="practice-tiny">指導を決める前なら、戻って練習コースを組み直せます。</p></div></aside></div>`;
      active=true;dialog.showModal();scene=new Scene(q('canvas'));scene.setState(visual);scene.setMode('training',sceneData());update();lastTime=performance.now();frame=requestAnimationFrame(tick);return true;
    }
    function selectAthlete(id){if(!active||committed)return;const a=visual.athletes.find(a=>a.id===id&&!a.injury);if(!a)return;targetId=id;const select=q('[data-practice-target]');if(select)select.value=id;const story=instruction();if(q('[data-instruction-title]')){q('[data-instruction-title]').textContent=story.title;q('[data-instruction-text]').textContent=story.text;}update();}
    dialog.addEventListener('click',event=>{const b=event.target.closest('[data-training-action]');if(!b||b.disabled)return;switch(b.dataset.trainingAction){case'close':close();break;case'pause':paused=!paused;update();break;case'speed':speed=Number(b.dataset.speed);dialog.querySelectorAll('[data-speed]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.speed)===speed)));break;case'skip':committed?finish():decision();break;case'decide':choose(b.dataset.decision);break;}});
    dialog.addEventListener('change',event=>{if(event.target.matches('[data-practice-target]'))selectAthlete(event.target.value);});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    return {start,isActive:()=>active,selectAthlete,cancel:()=>close({silent:true})};
  }
})(typeof globalThis!=='undefined'?globalThis:this);
