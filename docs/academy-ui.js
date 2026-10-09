/* The athlete notebook and the seven days between meets. Rendering only. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.TrackAcademyUI=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEYS=['acceleration','speed','speedEndurance','stamina','power','technique','agility','flexibility','mental'];
  const NAMES={acceleration:'加速力',speed:'最高速度',speedEndurance:'スピード持久力',stamina:'有酸素持久力',power:'瞬発力',technique:'種目技術',agility:'動作制御',flexibility:'可動性',mental:'集中力'};
  const SHORT={acceleration:'加速',speed:'最高速',speedEndurance:'速度持久',stamina:'有酸素',power:'瞬発',technique:'技術',agility:'動作',flexibility:'可動',mental:'集中'};
  const EXPLAIN={acceleration:'スタートから速度を上げる力',speed:'全力走で到達できる速さ',speedEndurance:'高速を保ち、減速を抑える力',stamina:'長くペースを保つ持久力',power:'短い時間で力を発揮する能力',technique:'ハードル・踏切・バトンなどの習熟',agility:'動作をつなぐリズムとバランス',flexibility:'種目に必要な関節の可動性',mental:'本番で動作や判断を安定させる力'};
  const FALLBACK_BLOCKS=[
    {id:'basic',name:'基礎を固める',description:'個人の育成方針に沿って、丁寧に反復。',kind:'training',growth:1,fatigue:1,stats:{}},
    {id:'technical',name:'動きを磨く',description:'フォームとリズムを整える。',kind:'technique',growth:.95,fatigue:.8,stats:{technique:.3,agility:.2}},
    {id:'condition',name:'回復と調整',description:'疲労を抜き、次の練習と大会に備える。',kind:'recovery',growth:.6,fatigue:.3,stats:{flexibility:.2}}
  ];
  const isRecord=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
  const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,finite(v)));
  const defaultEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fallbackRank=v=>v>=90?'S':v>=80?'A':v>=70?'B':v>=60?'C':v>=50?'D':v>=40?'E':v>=20?'F':'G';
  function create({E={},esc=defaultEsc,icon=()=>''}={}){
    const statName=k=>NAMES[k]||E.STAT_NAMES?.[k]||k;
    const keys=()=>KEYS.concat((E.STAT_KEYS||[]).filter(k=>!KEYS.includes(k)));
    function stat(a,k){
      if(E.getStat){const value=E.getStat(a,k);if(Number.isFinite(value))return clamp(value);}
      const s=a?.stats||{};
      if(Number.isFinite(s[k]))return clamp(s[k]);
      if(k==='acceleration')return clamp(finite(s.speed)*.5+finite(s.power)*.3+finite(s.agility)*.2);
      if(k==='speedEndurance')return clamp(finite(s.speed)*.55+finite(s.stamina)*.45);
      return 0;
    }
    function rank(v){const r=E.getAbilityRank?.(v),label=typeof r==='string'?r:r?.rank||r?.label;return /^[SABCDEFG]$/.test(label||'')?label:fallbackRank(v);}
    const rankBadge=v=>`<b class="academy-rank academy-rank-${rank(v)}" aria-label="${rank(v)}ランク">${rank(v)}</b>`;
    function radar(a){
      const k=keys(),cx=150,cy=140,r=84,point=(i,p)=>{const angle=-Math.PI/2+i*Math.PI*2/k.length;return [(cx+Math.cos(angle)*r*p).toFixed(1),(cy+Math.sin(angle)*r*p).toFixed(1)];};
      const polygon=p=>k.map((_,i)=>point(i,p).join(',')).join(' ');
      return `<svg class="academy-radar" viewBox="0 0 300 280" aria-hidden="true" focusable="false">${[.25,.5,.75,1].map(p=>`<polygon class="academy-radar-grid" points="${polygon(p)}"/>`).join('')}${k.map((_,i)=>{const [x,y]=point(i,1);return `<line class="academy-radar-axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;}).join('')}<polygon class="academy-radar-fill" points="${k.map((key,i)=>point(i,stat(a,key)/100).join(',')).join(' ')}"/>${k.map((key,i)=>{const [x,y]=point(i,stat(a,key)/100),[tx,ty]=point(i,1.29);return `<circle class="academy-radar-dot" cx="${x}" cy="${y}" r="3"/><text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle">${esc(SHORT[key]||statName(key))}</text>`;}).join('')}<text class="academy-radar-center" x="150" y="145" text-anchor="middle">0</text></svg>`;
    }
    function abilityCard(athlete,{compact=false}={}){
      const fatigue=Math.round(100-clamp(athlete.energy)),morale=Math.round(clamp(athlete.morale)),best=keys().slice().sort((a,b)=>stat(athlete,b)-stat(athlete,a))[0];
      return `<section class="academy-ability ${compact?'is-compact':''}" aria-label="${esc(athlete.name||'選手')}の能力"><div class="academy-ability-heading"><div><span class="academy-eyebrow">ATHLETE ABILITIES</span><h3>積み重ねた、9つの力。</h3></div><span class="academy-best">いちばんの強み <b>${esc(statName(best))}</b></span></div><div class="academy-ability-main"><div class="academy-radar-wrap">${radar(athlete)}<small>能力のバランス · 外周100</small></div><dl class="academy-stat-list">${keys().map(k=>{const v=Math.floor(stat(athlete,k));return `<div class="academy-stat" data-ability="${esc(k)}" title="${esc(EXPLAIN[k]||statName(k))}"><dt>${esc(statName(k))}</dt><dd><strong>${v}</strong>${rankBadge(v)}<span class="academy-stat-track" aria-hidden="true"><i style="width:${v}%" class="academy-stat-fill academy-rank-${rank(v)}"></i></span></dd></div>`;}).join('')}</dl></div><div class="academy-condition" aria-label="一時的なコンディション"><div class="academy-condition-title"><b>今日のコンディション</b><span>能力とは別に変化します</span></div><div class="academy-condition-metric ${fatigue>=65?'is-tired':''}"><span>疲労</span><strong>${fatigue}<small>/100</small></strong><i aria-hidden="true"><b style="width:${fatigue}%"></b></i><small>${fatigue>=65?'回復を優先':fatigue>=40?'少し疲れが残る':'余力あり'}</small></div><div class="academy-condition-metric"><span>調子</span><strong>${morale}<small>/100</small></strong><i aria-hidden="true"><b style="width:${morale}%"></b></i><small>${morale>=80?'好調':morale>=55?'いつも通り':'整えたい'}</small></div>${athlete.injury?`<p class="academy-injury">療養中 · あと${finite(athlete.injury)}週。回復を待って練習へ。</p>`:''}</div>${!compact?'<p class="academy-rating-key">S 90–100 · A 80–89 · B 70–79 · C 60–69 · D 50–59 · E 40–49 · F 20–39 · G 0–19</p><p class="academy-fineprint">能力値はゲーム独自の指標です。実際の身体測定値ではありません。</p>':''}</section>`;
    }
    function journey(state){
      if(E.getWeekJourney)return E.getWeekJourney(state);
      return {route:state.weekRoute||['basic','technical','condition'],forecast:{growth:1,fatigue:1,note:'練習・技術・回復を組み合わせ、1週間をつくろう。'},days:[]};
    }
    function kind(block){
      if(/recover|rest|condition|taper/.test(block.kind+' '+block.id))return 'recovery';
      if(/power|intens|hard|camp/.test(block.kind+' '+block.id))return 'power';
      if(/team|relay/.test(block.kind+' '+block.id))return 'team';
      return 'training';
    }
    function routeBoard(state){
      const blocks=E.WEEK_BLOCKS?.length?E.WEEK_BLOCKS:FALLBACK_BLOCKS,j=journey(state)||{},route=Array.isArray(j.route)?j.route.slice(0,3):blocks.slice(0,3).map(b=>b.id),forecast=j.forecast||{},calendar=E.getCalendar?.(state)||{},next=E.getNextMeet?.(state),lengths=[2,3,2],labels=['月・火','水・木・金','土・日'],allDays=['月','火','水','木','金','土','日'];
      while(route.length<3)route.push(blocks[0].id);
      const chosen=route.map(id=>blocks.find(b=>b.id===id)||blocks[0]),athletes=state.athletes||[],tired=athletes.filter(a=>a.energy<35&&!a.injury).length,injured=athletes.filter(a=>a.injury).length;
      const meetWeeks=next?Number.isFinite(next.weeksAway)?next.weeksAway:Number.isFinite(next.weeksUntil)?next.weeksUntil:((next.week-state.week+48)%48):null;
      const action=state.monthPlanPending?'monthly-plan':state.pendingMeet?'enter-meet':'start-training',button=state.monthPlanPending?'今月の育成方針を決める':state.pendingMeet?'大会のスタートラインへ':'この1週間を始める';
      const growth=finite(forecast.growth,1),fatigue=finite(forecast.fatigue,1),growthText=`${Math.round(growth*100)}%`,fatigueText=`${Math.round(fatigue*100)}%`;
      let cursor=0;
      return `<section class="academy-route ${state.pendingMeet?'is-locked':''}" data-week-board><header class="academy-route-heading"><div><span class="academy-eyebrow">YOUR NEXT SEVEN DAYS</span><h2>今週は、どう強くなる？</h2><p>前半・中盤・週末を組み合わせて、育成と回復の流れをつくろう。</p></div><span class="academy-week-label">${icon('calendar')}${esc(calendar.label||'今週の部活動')}</span></header><div class="academy-week-strip" aria-label="月曜日から日曜日の練習予定">${chosen.map((b,index)=>Array.from({length:lengths[index]},()=>{const label=allDays[cursor++];return `<div class="academy-day is-${kind(b)}"><span>${label}</span><i aria-hidden="true"></i><small>${esc(b.name)}</small></div>`;})).flat().join('')}</div><div class="academy-route-slots">${chosen.map((b,index)=>`<article class="academy-route-slot is-${kind(b)}" data-route-slot="${index}" draggable="${!state.pendingMeet}" aria-label="${labels[index]}の練習 ${esc(b.name)}"><div class="academy-slot-top"><span><b>0${index+1}</b> ${labels[index]}</span><span class="academy-slot-length">${lengths[index]}日間</span></div><label for="academy-week-block-${index}" class="academy-sr-only">${labels[index]}の練習ブロック</label><select id="academy-week-block-${index}" data-week-block="${index}" ${state.pendingMeet?'disabled':''}>${blocks.map(option=>`<option value="${esc(option.id)}" ${option.id===b.id?'selected':''}>${esc(option.name)}</option>`).join('')}</select><p>${esc(b.description||'個人の育成方針に沿って取り組む。')}</p><div class="academy-block-focus">${Object.keys(b.stats||{}).filter(k=>b.stats[k]>0).slice(0,3).map(k=>`<span>${esc(statName(k))}</span>`).join('')||`<span>${kind(b)==='recovery'?'疲労を整える':'個人の重点育成'}</span>`}</div><div class="academy-slot-bottom"><span class="academy-drag-hint" aria-hidden="true">⋮⋮ 並べ替え</span><div>${index>0?`<button type="button" data-action="route-swap" ${state.pendingMeet?'disabled':''} data-from="${index}" data-to="${index-1}" aria-label="${esc(b.name)}を前の枠と入れ替える">←</button>`:''}${index<2?`<button type="button" data-action="route-swap" ${state.pendingMeet?'disabled':''} data-from="${index}" data-to="${index+1}" aria-label="${esc(b.name)}を次の枠と入れ替える">→</button>`:''}</div></div></article>`).join('')}</div><div class="academy-route-hint"><span>${state.pendingMeet?'大会を終えると、次の1週間の練習を変更できます。':'並び順も作戦。練習の後に回復を挟むと、次の一歩へつながります。'}</span><details class="academy-block-library"><summary>使える練習を見る</summary><div>${blocks.map(b=>`<span class="academy-route-pick is-${kind(b)}" draggable="${!state.pendingMeet}" data-route-pick="${esc(b.id)}" title="${esc(b.description||'')}">${esc(b.name)}</span>`).join('')}</div><p>各枠のメニューから選択。PCではここから枠へドラッグもできます。</p></details></div><div class="academy-week-forecast"><div><span>育成の見込み</span><strong>${growthText}</strong><small>標準の週との比較</small></div><div><span>疲労の見込み</span><strong>${fatigueText}</strong><small>低いほど疲れにくい</small></div><p>${esc(forecast.note||'育成方針と組み合わせて、自分たちの1週間に。')}</p></div>${tired||injured?`<p class="academy-route-alert">${tired?`疲労が強い選手 ${tired}人。` :''}${injured?`療養中 ${injured}人。` :''}個人メニューの休養や、回復ブロックも活用しよう。</p>`:''}<footer class="academy-route-footer"><div><span class="academy-next-meet">${state.pendingMeet?'今日は大会の日':next?`${esc(next.name)}まで${meetWeeks===0?'、今週':` あと${meetWeeks}週`}`:'今週の積み重ねが、次の大会につながる'}</span><p>${state.monthPlanPending?'月初は、一人ひとりの伸ばす能力を決めよう。':state.pendingMeet?'出場選手と作戦を決めて、大会に挑もう。':'日々の練習を見守り、途中で選手に声をかけよう。'}</p></div><button type="button" class="academy-start" data-action="${action}"><span>${button}</span>${icon('arrow')}</button></footer></section>`;
    }
    function summary(state,report={}){
      report=isRecord(report)?report:{};
      const changes=(Array.isArray(report.changes)?report.changes:[]).filter(c=>isRecord(c)&&isRecord(c.statGains)&&Object.values(c.statGains).every(v=>typeof v==='number'&&Number.isFinite(v))),athletes=state.athletes||[],reportHighlights=Array.isArray(report.highlights)?report.highlights:[],events=(Array.isArray(report.events)?report.events:[]).filter(v=>typeof v==='string');
      function progress(change){
        const athlete=athletes.find(a=>a.id===change.athleteId)||{stats:{}};
        return Object.entries(change.statGains||{}).filter(([,gain])=>finite(gain)>0).map(([key,gain])=>{
          const after=clamp(change.after?.stats?.[key]??change.after?.[key]??change.newValues?.[key]??change.afterStats?.[key]??stat(athlete,key));
          const before=clamp(change.before?.stats?.[key]??change.before?.[key]??change.oldValues?.[key]??change.beforeStats?.[key]??after-finite(gain));
          return {key,gain:finite(gain),before,after,rankUp:rank(after)!==rank(before)};
        }).sort((a,b)=>Number(b.rankUp)-Number(a.rankUp)||b.gain-a.gain);
      }
      const highlightIds=reportHighlights.filter(isRecord).map(h=>h.athleteId),priority=id=>highlightIds.includes(id)?highlightIds.indexOf(id):100;
      const all=changes.map(change=>({change,gains:progress(change)})),highlights=all.slice().sort((a,b)=>priority(a.change.athleteId)-priority(b.change.athleteId)||Number(!!b.change.coached)-Number(!!a.change.coached)||b.gains.filter(g=>g.rankUp).length-a.gains.filter(g=>g.rankUp).length||b.gains.reduce((n,g)=>n+g.gain,0)-a.gains.reduce((n,g)=>n+g.gain,0)).slice(0,3),upCount=all.reduce((n,c)=>n+c.gains.filter(g=>g.rankUp).length,0),growthCount=all.filter(c=>c.gains.length).length;
      function growthLine(g){return `<div class="academy-growth-line ${g.rankUp?'is-rank-up':''}"><span>${esc(statName(g.key))}</span><span class="academy-growth-values"><small>${Math.floor(g.before)}</small><i aria-hidden="true">→</i><strong>${Math.floor(g.after)}</strong>${rankBadge(Math.floor(g.after))}</span><b class="academy-growth-amount">+${g.gain.toFixed(1)}</b>${g.rankUp?'<em>RANK UP</em>':''}</div>`;}
      function condition(change){const fatigue=-Math.round(finite(change.energyChange));return `<span class="${fatigue<0?'academy-recovered':''}">疲労 ${fatigue>0?'+':''}${fatigue}</span>`;}
      return `<section class="academy-summary"><header class="academy-summary-heading"><span class="academy-eyebrow">A WEEK TO REMEMBER</span><h2>一週間が、力になった。</h2><p>${esc(report.weekLabel||'今週')} · ${growthCount}人が成長${upCount?` · ${upCount}項目でランクアップ！`:''}</p></header><div class="academy-highlights">${highlights.map(({change,gains})=>`<article class="academy-highlight"><div class="academy-highlight-athlete"><canvas class="avatar" data-avatar="${esc(change.athleteId)}" width="86" height="88" aria-label="${esc(change.name)}のドット絵"></canvas><div><span>${gains.some(g=>g.rankUp)?'今週のランクアップ':change.coached?'指導が、力になった。':gains.length?'伸びた、得意な力。':'次の一歩へ、調整。'}</span><h3>${esc(change.name)}</h3></div></div>${gains.slice(0,2).map(growthLine).join('')||`<p class="academy-growth-rest">${esc(change.message||'コンディションを整えました。')}</p>`}<div class="academy-highlight-foot">${condition(change)}<span>${esc(change.training||E.TRAININGS?.find(t=>t.id===change.trainingId)?.name||'個人練習')}</span></div>${change.injury?`<p class="academy-injury">${esc(change.message||'回復のため、練習を休みます。')}</p>`:''}</article>`).join('')}</div>${reportHighlights.filter(v=>typeof v==='string').map(v=>`<p class="academy-story-line">${esc(v)}</p>`).join('')}${events.map(v=>`<p class="academy-story-line">${esc(typeof v==='string'?v:v.text||v.title||'')}</p>`).join('')}<details class="academy-all-progress"><summary>部員全員の変化を見る <span>${changes.length}人</span></summary><div>${all.map(({change,gains})=>`<article><div class="academy-all-person"><strong>${esc(change.name)}</strong>${condition(change)}</div>${gains.map(growthLine).join('')||`<p>${esc(change.message||'コンディション調整')}</p>`}${change.message&&gains.length?`<p>${esc(change.message)}</p>`:''}</article>`).join('')}</div></details>${state.monthPlanPending?'<p class="academy-next-chapter">新しい月へ。次に伸ばす力を決めよう。</p>':state.pendingMeet?`<p class="academy-next-chapter">${esc(state.pendingMeet.name)}へ。積み重ねた力を、スタートラインで。</p>`:''}</section>`;
    }
    function scienceHelp(){
      return `<section class="academy-science"><span class="academy-eyebrow">TRAIN. RECOVER. GROW.</span><h3>鍛える力と、今日の調子。</h3><p>加速・最高速度・スピード持久力は別の強み。有酸素持久力や瞬発力、動作制御も合わせて、一人ひとりの種目適性をつくります。</p><div class="academy-science-cycle"><span>練習で刺激</span><b>→</b><span>回復で整える</span><b>→</b><span>成長を次の大会へ</span></div><p>疲労と調子は一時的な状態です。能力が高くても疲れが強ければ力を発揮しにくくなります。練習の順序と個人メニューを組み合わせ、大会前には回復や調整も考えよう。</p><details><summary>能力とトレーニングの考え方</summary><dl>${keys().map(k=>`<div><dt>${esc(statName(k))}</dt><dd>${esc(EXPLAIN[k]||'種目で生かす能力')}</dd></div>`).join('')}</dl><p>青少年の個別性、多様な能力の育成、負荷と回復を重視する <a href="https://www.nsca.com/education/articles/nsca-position-statement-on-long-term-athletic-development/" target="_blank" rel="noopener noreferrer">NSCAの長期育成声明</a>、<a href="https://bjsm.bmj.com/content/49/13/843" target="_blank" rel="noopener noreferrer">IOCの青少年育成声明</a>、<a href="https://pubmed.ncbi.nlm.nih.gov/21364480/" target="_blank" rel="noopener noreferrer">短距離の加速に関する研究</a>を参考にしています。</p></details><small>能力値・ランク・練習効果はゲーム用の表現です。実際の身体測定値や練習処方とは異なります。</small></section>`;
    }
    return {abilityCard,routeBoard,summary,scienceHelp};
  }
  return {create};
});
