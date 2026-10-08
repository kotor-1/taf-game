(() => {
  'use strict';
  const E = window.TrackGame;
  const SAVE_KEY = 'hokago-track-club-save-v2';
  const LEGACY_KEY = 'hokago-track-club-save-v1';
  const PREF_KEY = 'hokago-track-club-prefs-v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('ja-JP').format(Math.round(value));
  const eventName = id => E.EVENTS.find(e => e.id === id)?.name || id;
  const trainingName = id => E.TRAININGS.find(t => t.id === id)?.name || '総合';
  const icons = {
    home:'M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8', run:'M14 4a1.5 1.5 0 1 0 0 .1M7 9l4-3 4 3 4 1M12 7l-3 6 5 3-2 5M9 13l-3 5H2', users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-3.9', build:'M3 21h18M5 21V6l7-3 7 3v15M9 8h1m4 0h1M9 12h1m4 0h1M10 21v-5h4v5', calendar:'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2M7 3v4m10-4v4M3 11h18M7 15h2m4 0h2m-8 3h2', book:'M12 6C9 3 5 3 2 5v15c4-2 7-2 10 0 3-2 6-2 10 0V5c-3-2-7-2-10 1Zm0 0v14', coin:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0M9 8l3 4 3-4M8 12h8m-8 3h8m-4-3v6', star:'m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z', trophy:'M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v5m-4 2h8m-6-2h4', arrow:'M5 12h14m-5-5 5 5-5 5', chevron:'m9 5 7 7-7 7', leaf:'M20 3C8 1 2 8 5 15s15 6 15-12ZM4 21 15 10M9 16v-5m0 5h5', sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2', help:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 1 1 4 2.8c-1 .5-1 1.2-1 2.2m0 3h.01', settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z', sound:'M11 4 6 8H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14', mute:'M11 4 6 8H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6', close:'m6 6 12 12M6 18 18 6', check:'m5 12 4 4L19 6', flag:'M4 22V3m0 0c5-5 11 5 16 0v10c-5 5-11-5-16 0', save:'M4 3h14l3 3v15H3V3h1Zm3 0v7h10V3M7 21v-7h10v7', heart:'M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-5 6 8 15 8 15S25 11 20 5Z', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5', bolt:'M13 2 4 14h7l-1 8 10-13h-8Z', clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2', reset:'M3 10a9 9 0 1 1 0 5m0-12v7h7', plus:'M12 5v14M5 12h14', map:'m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3V5Zm6-3v17m6-14v17'
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.star}"/></svg>`;
  const logo = `<svg class="brand-mark" viewBox="0 0 32 36" aria-hidden="true"><path fill="#426e52" d="M12 0h12v4h4v8h-4v4H12V0Z"/><path fill="#f2c87f" d="M16 5h8v7h-8z"/><path fill="#e88b55" d="M8 15h16v5h-4v8H8z"/><path fill="#467052" d="M4 17h4v8H0v-5h4zM19 24h5v5h5v5H18v-6h-7v5H3v-5h5v-5z"/><path fill="#fff3d2" d="M20 17h4v6h-4zM0 32h8v4H0zm22 0h10v4H22z"/></svg>`;
  const nav = [['overview','home','部室'],['training','run','月間育成方針'],['team','users','部員名簿'],['facilities','build','施設づくり'],['scouting','star','中学生スカウト'],['calendar','calendar','大会カレンダー'],['diary','book','活動日誌']];
  const pages = {
    overview:['CLUB HOUSE','今日も、トラックへ。','小さな一歩を重ねて、全国の舞台を目指そう。'],
    training:['MONTHLY DEVELOPMENT','月間育成方針','一人ひとりの才能を見極め、今月伸ばす能力を決めよう。'],
    team:['OUR TEAM','部員名簿','一人ひとりの才能が、このチームの可能性。'],
    facilities:['BUILD OUR CLUB','施設づくり','選手の毎日を支える、未来への投資。'],
    scouting:['THE NEXT GENERATION','中学生スカウト','10月に出会い、4月に仲間になる。未来のチームを育てよう。'],
    calendar:['RACE CALENDAR','大会カレンダー','地区から県、地方、そして全国へ。'],
    diary:['CLUB JOURNAL','活動日誌','自己ベストも、小さな成長も。青春の記録。']
  };
  let state, prefs = {sound:false, coach:true}, page = 'overview', mainScene, raceScene, raceTimer, toastTimer, raceActive = false, lastFocus, audioContext, viewedMeet, highlightMeet, genderFilter = 'all';
  const saveStore = window.TrackSaveStore.create({storage:()=>window.localStorage,validate:E.validateSave});
  const loadedSave = saveStore.load();
  let loadNotice = loadedSave.notice, lastSaveError = '';
  state = loadedSave.state;
  try { const storedPrefs=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');prefs.sound=storedPrefs.sound===true;prefs.coach=storedPrefs.coach!==false; } catch {}
  if (!state) { state = E.createGame(); try { if (!loadNotice && localStorage.getItem(LEGACY_KEY)) loadNotice = '新設校編を始めました。旧版のセーブは別に保管しています。'; } catch {} }
  const save = () => {
    const ok=saveStore.save(state);
    try {localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch{}
    updateSaveUI();
    const error=saveStore.getStatus().error;
    if(!ok && lastSaveError!==error)toast(error==='conflict'?'別のタブで保存されました。再読み込みして続きを遊んでください。':'保存できていません。設定からセーブを書き出してください。');
    lastSaveError=error||'';
    return ok;
  };
  const savedTime = value => {if(!value)return '時刻不明';const d=new Date(value);return Number.isNaN(d.getTime())?'時刻不明':d.toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});};
  function saveStatusText(){const status=saveStore.getStatus();return status.error?status.conflict?'別タブの保存あり · 未保存':'保存できていません':status.savedAt?`自動保存済み · ${savedTime(status.savedAt)}`:status.persisted?'自動保存済み（日時未記録）':'保存の準備中';}
  function saveAlertContent(){const status=saveStore.getStatus();if(!status.error)return '';return `<strong>${status.conflict?'別のタブで進行が保存されました。':'この進行をブラウザーに保存できていません。'}</strong><span>${status.conflict?'このタブの内容は書き出して残せます。最新の保存から続ける場合は再読み込みしてください。':'今の進行を残すには、セーブファイルを書き出してください。保存を再試行することもできます。'}</span><div class="save-tools"><button class="btn small" data-action="export">${icon('download')}セーブを書き出す</button><button class="btn small" data-action="${status.conflict?'reload-save':'manual-save'}">${status.conflict?'最新の保存を読み込む':'保存を再試行'}</button></div>`;}
  function updateSaveUI(){const status=saveStore.getStatus();document.querySelectorAll('[data-save-status]').forEach(el=>{el.textContent=saveStatusText();el.dataset.saveState=status.error?'error':'saved';});document.querySelectorAll('[data-save-alert]').forEach(el=>{el.hidden=!status.error;el.innerHTML=saveAlertContent();});}
  function toast(message) { $('#toast').textContent = message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3300); }
  function sound(type='click') { if(!prefs.sound)return;try {audioContext ||= new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();[0,1,...(type==='win'?[2,3]:[])].forEach((v,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain(),t=audioContext.currentTime+i*.085;o.type='sine';o.frequency.value=(type==='win'?[523,659,784,1046]:[520,700])[i];g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.001,t+.15);o.connect(g);g.connect(audioContext.destination);o.start(t);o.stop(t+.16);});}catch {} }
  const energy = a => `<div class="energy-row"><span>体力</span><div class="energy-track"><div class="energy-bar ${a.energy<35?'danger':a.energy<60?'low':''}" style="width:${Math.max(0,Math.min(100,a.energy))}%"></div></div><span>${Math.round(a.energy)}</span></div>`;
  const avatar = a => `<canvas class="avatar" data-avatar="${esc(a.id)}" width="86" height="88" aria-label="${esc(a.name)}のドット絵"></canvas>`;
  const genderLabel = gender => gender === 'girls' ? '女子' : '男子';
  const genderTag = a => `<span class="tag ${a.gender === 'girls' ? 'pink' : 'blue'}">${genderLabel(a.gender)}</span>`;
  const rankFor = value => value >= 90 ? 'S' : value >= 80 ? 'A' : value >= 70 ? 'B' : value >= 60 ? 'C' : value >= 50 ? 'D' : value >= 40 ? 'E' : 'F';
  const focusName = a => E.FOCUSES.find(f => f.id === a.focus)?.name || 'バランス';
  const aptitude = a => E.getSuitability(a);
  const miniStats = a => `<div class="mini-stats seven-stats">${E.STAT_KEYS.map(k => `<div class="mini-stat"><span>${E.STAT_NAMES[k]}</span><strong><em class="ability-rank rank-${rankFor(a.stats[k])}">${rankFor(a.stats[k])}</em>${Math.round(a.stats[k])}</strong><i><b style="width:${a.stats[k]}%"></b></i></div>`).join('')}</div>`;
  const focusSelect = a => `<select data-focus="${a.id}" aria-label="${esc(a.name)}の今月の育成方針">${E.FOCUSES.map(f => `<option value="${f.id}" ${a.focus === f.id ? 'selected' : ''}>${f.name}を伸ばす</option>`).join('')}</select>`;
  const athleteCard = (a, full = false) => {
    const suited = aptitude(a).slice(0, full ? 3 : 1);
    return `<article class="athlete-card ${full ? 'roster-card' : ''}" role="button" tabindex="0" data-action="athlete" data-id="${esc(a.id)}" aria-label="${esc(a.name)}の能力と種目適性"><div class="athlete-top">${avatar(a)}<div><div class="athlete-name">${esc(a.name)}</div><div class="athlete-meta">${genderTag(a)}${a.grade}年生 ${a.injury ? '<span class="tag red">療養中</span>' : ''}</div></div></div>${full ? miniStats(a) : ''}<div class="aptitude-chips">${suited.map((v, i) => `<span><b class="ability-rank rank-${v.rank}">${v.rank}</b>${esc(v.name)}${i === 0 ? '<small>適性1位</small>' : ''}</span>`).join('')}</div><div class="athlete-work"><span>今月：${focusName(a)}</span><span class="tag ${a.training === 'rest' ? 'blue' : a.energy < 40 ? 'orange' : ''}">${a.training === 'rest' ? '休養中' : trainingName(a.training)}</span></div>${energy(a)}${full ? `<div class="record-line"><span>${eventName(a.event)} ${a.best[a.event] ? '自己ベスト' : '予想'}</span><strong>${E.formatResult(a.best[a.event] || E.predictResult(a, a.event), a.event)}</strong></div>` : ''}</article>`;
  };
  function dateAt(week, year = state.year) { const c = E.getCalendar({...state, week, year}); return `${c.monthName} 第${c.weekOfMonth}週`; }
  function primaryAction() { return state.monthPlanPending ? 'monthly-plan' : state.pendingMeet ? 'enter-meet' : 'advance'; }
  function primaryLabel() { return state.monthPlanPending ? '今月の方針を決める' : state.pendingMeet ? '大会に出場する' : '1週進める'; }
  function coachText() {
    if (state.monthPlanPending) return '月初のミーティングです！ 能力と種目適性を見て、一人ずつ「今月伸ばす能力」を決めましょう。';
    if (state.pendingMeet) return '男女別にエントリーしよう。個人1種目とリレーを兼任できるけれど、疲労は次の種目にも残るよ。';
    const next = E.getNextMeet(state), low = state.athletes.find(a => a.energy < 50);
    if (low) return `${esc(low.name)}が少し疲れているみたい。個人メニューを休養にして、大会へ向けて調整しよう。`;
    if (E.getCalendar(state).month === 10) return '今月は中学3年生をスカウトできるよ。来春の新入生を見据えて、チームに足りない才能を探そう。';
    if (next.weeksUntil <= 2) return `${esc(next.name)}まであと${next.weeksUntil}週。練習カードと休養を組み合わせ、体力を整えよう。`;
    return '月間の個別育成と、毎週のチーム練習カードが成長の軸。能力のランクと種目適性は、成長に合わせて変わっていくよ。';
  }
  function goalInfo() {
    if (state.goal.nationalsWon) return {title:'インターハイの頂点へ！',desc:`創部${state.goal.wonYear}年目に全国優勝`,pct:100};
    if (state.goal.nationalsQualified) return {title:'インターハイで、金メダルを。',desc:'インターハイ出場を達成',pct:75};
    if (state.goal.prefectureQualified) return {title:'全国への切符をつかもう。',desc:'地方大会への進出を達成',pct:50};
    if (state.goal.districtQualified) return {title:'次は、県大会を突破しよう。',desc:'県大会への進出を達成',pct:25};
    return {title:'12人ではじまる、全国への道。',desc:'まずは5月の地区予選突破',pct:0};
  }
  function practiceCards() {
    return `<section class="practice-section"><div class="section-title"><h2>${icon('book')}今週の練習カード</h2><span class="subtext">1枚を選んで、1週進める</span></div><div class="practice-cards">${state.practiceCards.map(card => `<button class="practice-card ${state.selectedPracticeCard === card.id ? 'selected' : ''}" data-action="practice-card" data-id="${card.id}" aria-pressed="${state.selectedPracticeCard === card.id}"><span class="card-topline">${icon(card.id.includes('condition') || card.id.includes('rest') ? 'heart' : 'bolt')}<b>${esc(card.name)}</b><i>${state.selectedPracticeCard === card.id ? '選択中' : '選ぶ'}</i></span><p>${esc(card.description)}</p><span class="card-effects">${card.cost ? money(card.cost) + '円' : '費用なし'}<span>成長 ×${card.growth.toFixed(2)} / 疲労 ×${card.fatigue.toFixed(2)}</span></span></button>`).join('')}</div></section>`;
  }
  function monthBanner() { return `<div class="month-plan-banner ${state.monthPlanPending ? 'pending' : ''}"><div>${icon('calendar')}<div><strong>${E.getCalendar(state).monthName}の個別育成 ${state.monthPlanPending ? '方針を決めよう' : '実行中'}</strong><p>${state.monthPlanPending ? '選手の能力を見ながら、伸ばす力を一人ずつ選択。' : '個別の目標 × チームの練習で、才能を伸ばしていこう。'}</p></div></div><button class="btn small ${state.monthPlanPending ? 'primary' : ''}" data-action="monthly-plan">${state.monthPlanPending ? '育成ミーティング' : '方針を確認'} ${icon('arrow')}</button></div>`; }
  function overview() {
    const next = E.getNextMeet(state), goal = goalInfo(), timeline = E.MEETS.filter(m => m.week >= state.week).slice(0, 4);
    const featured = [...state.athletes.filter(a => a.gender === 'boys').slice(0,3), ...state.athletes.filter(a => a.gender === 'girls').slice(0,3)];
    return `${monthBanner()}<div class="overview-grid"><section class="panel"><div class="panel-header"><h2>${icon('leaf')}放課後のグラウンド</h2><span class="sub"><i class="live-dot"></i>創部${state.year}年目の青春</span></div><div class="scene-wrap"><canvas id="campus" class="scene-canvas" width="1000" height="520" role="img" aria-label="男女の部員が練習する高校のグラウンド"></canvas><div class="scene-badge">${icon('sun')}${E.getCalendar(state).season}のグラウンド · ${E.getCalendar(state).monthName} 第${E.getCalendar(state).weekOfMonth}週</div></div><div class="scene-bottom"><span class="campus-name">${icon('map')}${esc(state.schoolName)} 第1グラウンド</span><span>部員をクリックして能力を見る</span></div></section><aside class="right-stack"><section class="panel meet-panel"><div class="meet-eyebrow">${icon('flag')}NEXT COMPETITION</div><span class="meet-countdown">${state.pendingMeet ? '本日開催' : `あと ${next.weeksUntil} 週`}</span><h3>${esc(next.name)}</h3><p class="meet-date">${next.nextYear ? '来年度 ' : ''}${next.dateLabel || dateAt(next.week)}</p><div class="meet-track">${timeline.map(m => `<div class="meet-stage ${next.id === m.id ? 'current' : ''}"><i class="stage-dot"></i><span>${E.getCalendar({...state,week:m.week}).monthName}</span></div>`).join('')}</div><button class="btn ${state.pendingMeet ? 'primary' : ''}" data-action="${state.pendingMeet ? 'enter-meet' : 'navigate'}" data-page="calendar">${state.pendingMeet ? '出場条件を確認' : '年間スケジュール'} ${icon('arrow')}</button></section><section class="panel goal-panel"><div class="goal-title">${icon('star')}私たちの目標</div><h3>${goal.title}</h3><div class="progress-track"><div class="progress-fill" style="width:${goal.pct}%"></div></div><div class="goal-caption"><span>${goal.desc}</span><span>${goal.pct}%</span></div></section></aside></div>${prefs.coach ? `<div class="coach-note"><canvas class="coach-avatar" data-coach width="74" height="84" aria-hidden="true"></canvas><div class="coach-text"><strong>マネージャーのひとこと</strong>${coachText()}</div><button class="dismiss" data-action="dismiss-coach" aria-label="ヒントを閉じる">×</button></div>` : ''}${practiceCards()}<div class="section-title"><h2>${icon('users')}ともに育つ、仲間たち</h2><button class="text-link" data-action="navigate" data-page="team">全${state.athletes.length}人の能力を見る ${icon('arrow')}</button></div><div class="athlete-grid">${featured.map(a => athleteCard(a)).join('')}</div>`;
  }
  function focusRows(modalView = false) {
    return state.athletes.map(a => { const best = aptitude(a)[0]; return `<div class="focus-row ${modalView ? 'compact' : ''}"><button class="training-person" data-action="athlete" data-id="${a.id}">${avatar(a)}<div><strong>${esc(a.name)}</strong><div class="athlete-meta">${genderTag(a)}${a.grade}年</div></div></button><div class="focus-aptitude"><span class="ability-rank rank-${best.rank}">${best.rank}</span><strong>${best.name}</strong><small>現在の適性1位</small></div><div class="focus-select"><label>今月伸ばす能力</label>${focusSelect(a)}</div>${modalView ? '' : `<div class="focus-menu"><label>今週の個人メニュー</label><select data-training="${a.id}" aria-label="${esc(a.name)}の練習">${E.TRAININGS.map(t => `<option value="${t.id}" ${t.id === a.training ? 'selected' : ''}>${t.name}</option>`).join('')}</select>${energy(a)}</div><div class="focus-row-stats">${miniStats(a)}</div>`}</div>`; }).join('');
  }
  function training() {
    return `<div class="page-intro">${icon('star')}月初に一人ずつ重点能力を決め、毎週の練習で伸ばします。今月中の変更も可能。適性ランクは現在の能力から算出し、育成で変化します。</div>${monthBanner()}<div class="panel intensity-bar"><div><h3>チーム全体の練習強度</h3><p>個別の目標と今週の練習カードに組み合わせます。</p></div><div class="segmented" role="group" aria-label="練習強度">${[['easy','軽め'],['normal','ふつう'],['hard','追い込む']].map(([id,label]) => `<button class="segment ${state.intensity === id ? 'active' : ''}" data-action="intensity" data-id="${id}" aria-pressed="${state.intensity === id}">${label}</button>`).join('')}</div></div>${practiceCards()}<div class="section-title"><h2>${icon('users')}今月の選手別プラン</h2><button class="text-link" data-action="all-rest">${icon('heart')}全員を休養に</button></div><div class="focus-list">${focusRows()}</div><div class="all-rest"><button class="btn small" data-action="auto-training">${icon('bolt')}得意種目にメニューを合わせる</button></div><details class="training-reference"><summary>能力とトレーニングの関係を見る</summary><div class="training-legend">${E.TRAININGS.map(t => `<div class="legend-item"><strong>${t.name}</strong>${t.description}</div>`).join('')}</div></details>`;
  }
  function team() {
    const athletes = state.athletes.filter(a => genderFilter === 'all' || a.gender === genderFilter);
    return `<div class="page-intro">${icon('users')}男子${state.athletes.filter(a=>a.gender==='boys').length}人・女子${state.athletes.filter(a=>a.gender==='girls').length}人。創部時は1年生が各6人。毎春、新入生を迎えながら3学年のチームを育てます。</div><div class="roster-filter"><div class="segmented">${[['all','全員'],['boys','男子'],['girls','女子']].map(([g,label]) => `<button class="segment ${genderFilter === g ? 'active' : ''}" data-action="gender-filter" data-gender="${g}" aria-pressed="${genderFilter === g}">${label}</button>`).join('')}</div><span class="subtext">能力：S → A → B → C → D → E → F</span></div><div class="roster-grid">${athletes.map(a=>athleteCard(a,true)).join('')}</div>${['boys','girls'].map(g => `<div class="team-relay-record"><div>${icon('flag')}<div><strong>${genderLabel(g)}4×100mリレー · チームベスト</strong><p>同じ性別の4人でつなぐ、学校の記録。</p></div></div><span>${state.teamBest?.[g]?.relay ? E.formatResult(state.teamBest[g].relay,'relay') : '未出場'}</span></div>`).join('')}<div class="recruit-banner"><div><h3>来春の仲間を、10月に探そう。</h3><p>中学3年生をスカウト。入部するのは翌年4月です。</p></div><button class="btn green" data-action="navigate" data-page="scouting">スカウトを見る ${icon('arrow')}</button></div>`;
  }
  function scouting() {
    const open = E.getCalendar(state).month === 10, candidates = E.getCandidates(state), signed = state.scouted || [];
    return `<div class="scout-hero"><div class="eyebrow">OCTOBER SCOUTING</div><h2>まだ見ぬ才能を、来春の力に。</h2><p>中学3年生と出会い、能力と種目適性を見て勧誘します。<br>内定した選手は、翌年4月に1年生として入部。男女各3人まで。</p><span class="tag ${open ? 'orange' : ''}">${open ? '10月のスカウト受付中' : '毎年10月に解禁'}</span></div><div class="section-title"><h2>${icon('users')}入部内定 ${signed.length}人</h2><span class="subtext">男子${signed.filter(a=>a.gender==='boys').length} / 3 · 女子${signed.filter(a=>a.gender==='girls').length} / 3</span></div>${signed.length ? `<div class="scout-signed">${signed.map(a=>`<div>${genderTag(a)}<strong>${esc(a.name)}</strong><span>${eventName(a.event)}</span><span class="tag">来春入部</span></div>`).join('')}</div>` : '<div class="empty small-empty">まだ内定者はいません。10月に新しい才能を見つけよう。</div>'}<div class="section-title"><h2>${icon('star')}スカウト候補</h2></div>${open ? `<div class="scout-grid">${candidates.map(a => {const suited=aptitude(a).slice(0,3),taken=signed.some(x=>x.id===a.id);return `<article class="panel scout-card"><div class="athlete-top">${avatar(a)}<div><h3>${esc(a.name)}</h3><div class="athlete-meta">${genderTag(a)}中学3年生<span class="tag">${esc(a.trait)}</span></div></div></div>${miniStats(a)}<div class="aptitude-chips">${suited.map(v=>`<span><b class="ability-rank rank-${v.rank}">${v.rank}</b>${v.name}</span>`).join('')}</div><p>${esc(a.note || 'これからの成長が楽しみな選手。')}</p><div class="scout-footer"><span>勧誘活動費 ${money(a.cost)}円</span><button class="btn green small" data-action="recruit" data-id="${a.id}" ${taken || state.money<a.cost || signed.filter(x=>x.gender===a.gender).length>=3 ? 'disabled':''}>${taken?'入部内定':'スカウトする'}</button></div></article>`;}).join('') || '<div class="empty">今年の候補への勧誘を終えました。</div>'}</div>` : '<div class="empty">10月になると、中学3年生の候補が登場します。<br>それまでは部員の育成と大会で評判を高めよう。</div>'}`;
  }
  function facilityArt(id){const track='<path fill="#b8c595" d="M20 42h160v46H20z"/><rect x="15" y="25" width="170" height="65" rx="32" fill="#c76e55"/><rect x="22" y="32" width="156" height="51" rx="25" fill="none" stroke="#f3ddbd" stroke-width="2"/><rect x="30" y="40" width="140" height="35" rx="17" fill="none" stroke="#f3ddbd" stroke-width="2"/><rect x="38" y="48" width="124" height="19" rx="9" fill="#b6c78b"/><path stroke="#faedd1" stroke-width="2" d="M147 33v48m5-46v44"/><path fill="#e7c18e" d="M54 57h30v6H54z"/>';const building='<path fill="#c4cca5" d="M15 92h172v7H15z"/><path fill="#b09e7b" d="M35 35h132v57H35z"/><path fill="#efe4c9" d="M29 28h132v61H29z"/><path fill="#758677" d="M23 25h143v9H23z"/><path fill="#94adb0" d="M40 45h24v24H40zm36 0h24v24H76zm36 0h24v24H112z"/><path stroke="#ece4ce" stroke-width="3" d="M52 45v24m36-24v24m36-24v24"/><path fill="#49665b" d="M71 74h32v15H71z"/><path fill="#ede1bc" d="M76 77h22v4H76z"/>';const recovery='<path fill="#a4bfb0" d="M25 89h158v7H25z"/><path fill="#f5eee0" d="M28 28h143v61H28z"/><path fill="#6e9b89" d="M23 22h154v10H23z"/><path fill="#a6c8c1" d="M41 44h30v22H41zm87 0h30v22h-30z"/><path fill="#80a69a" d="M83 63h32v26H83z"/><path fill="#de8e78" d="M95 38h9v19h-9zm-5 5h19v9H90z"/>';const club='<path fill="#bfbc97" d="M20 91h165v6H20z"/><path fill="#ded1ad" d="M29 41h139v48H29z"/><path fill="#778b65" d="M18 41v-8h14v-8h132v8h16v10H18z"/><path fill="#aabbb2" d="M44 52h27v21H44zm70 0h37v21h-37z"/><path fill="#7b8463" d="M82 60h23v29H82z"/><path fill="#f6e9c8" d="M73 42h41v12H73z"/><path fill="#c6935f" d="M145 75h33v5h-33zm4 5h4v11h-4zm22 0h4v11h-4z"/>';return `<svg viewBox="0 0 200 115" shape-rendering="crispEdges" aria-hidden="true">${{track,gym:building,recovery,club}[id]}</svg>`;}
  function facilities(){return `<div class="page-intro">${icon('build')} 設備の効果はすべての部員に適用されます。最大レベルは5。練習を伸ばす設備と、回復・活動費を支える設備をバランスよく。</div><div class="facility-grid">${E.FACILITIES.map(f=>{const cost=E.getFacilityCost(state,f.id),level=state.facilities[f.id];return `<section class="panel"><div class="facility-art ${f.id}">${facilityArt(f.id)}</div><div class="facility-body"><div class="facility-heading"><h3>${f.name}</h3><span>LEVEL ${String(level).padStart(2,'0')}</span></div><p>${f.description}</p><div class="facility-footer"><div class="facility-levels" aria-label="レベル${level} / 5">${[1,2,3,4,5].map(n=>`<span class="${n<=level?'on':''}"></span>`).join('')}</div><button class="btn ${cost!==null&&state.money>=cost?'green':''}" data-action="upgrade" data-id="${f.id}" ${cost===null||state.money<cost?'disabled':''}>${cost===null?icon('check')+' 最大レベル':`増築する · ${money(cost)}円`}</button></div>${cost!==null&&state.money<cost?`<p class="subtext" style="min-height:0;margin-top:10px">あと${money(cost-state.money)}円で増築できます</p>`:''}</div></section>`;}).join('')}</div>`;}
  function calendar() {
    const next = E.getNextMeet(state);
    return `<div class="page-intro">${icon('calendar')}4月始まり・1か月4週の年間カレンダー。春はインターハイ、秋は新人戦と年代別選手権へ。男子・女子を分け、種目ごとに出場権と標準記録を判定します。</div><div class="season-calendar">${E.MEETS.map(m=>`<article class="season-meet ${next.id===m.id && !next.nextYear?'current':''}"><div class="meet-calendar-date"><strong>${E.getCalendar({...state,week:m.week}).monthName}</strong><span>第${E.getCalendar({...state,week:m.week}).weekOfMonth}週</span></div><div class="season-meet-info"><h3>${esc(m.name)}</h3><p>${esc(m.description || '')}</p><div class="athlete-meta"><span class="tag">${m.kind==='indoor'?'室内':'屋外'}</span>${m.category?`<span class="tag blue">${esc(m.category)}</span>`:''}${m.week===27||m.week===41?'<span class="tag orange">同週開催・一人1大会</span>':''}</div></div><span class="tag ${state.completedMeets.includes(m.id)?'blue':state.pendingMeet?.id===m.id?'orange':''}">${state.completedMeets.includes(m.id)?'開催済み':state.pendingMeet?.id===m.id?'受付中':m.id===next.id&&!next.nextYear?`あと${next.weeksUntil}週`:'予定'}</span></article>`).join('')}</div><div class="source-note">${icon('book')}<div><strong>2月の室内大会について</strong><p>大阪の実大会は2025年を最後に終了。本作では2025年の要項に基づく再現大会を開催します。60m・60mHなどの実施種目、男女別規格、年齢区分、申込標準を反映。申込定員・予選ラウンドはゲーム向けに簡略化しています。</p><a href="https://www.jaaf.or.jp/files/competition/document/1833-1.pdf" target="_blank" rel="noopener noreferrer">2025年 日本陸連公式要項 ↗</a><a href="https://www.jaaf.or.jp/news/article/21505/" target="_blank" rel="noopener noreferrer">大会終了の公式発表 ↗</a></div></div>${state.pendingMeet?`<div class="recruit-banner"><div><h3>${esc(state.pendingMeet.name)}、いよいよ開幕。</h3><p>同じ週に複数大会がある場合は、順に出場・見送りを決めます。</p></div><button class="btn primary" data-action="enter-meet">出場条件を確認 ${icon('arrow')}</button></div>`:''}<div class="section-title"><h2>${icon('trophy')}これまでの大会</h2></div>${state.history.length?`<div class="history-list">${state.history.map((m,index)=>`<div class="history-item"><div class="history-icon">${icon('trophy')}</div><div><h3>${esc(m.name)}</h3><p>創部${m.year}年目 · ${dateAt(m.week)} · ${m.results.filter(r=>r.rank<=3&&r.official!==false).length}種目入賞</p></div><button class="btn small" data-action="past-meet" data-index="${index}">結果を見る</button></div>`).join('')}</div>`:'<div class="empty">最初の舞台は5月第1週の地区予選。<br>12人の1年生から、部の歴史を刻もう。</div>'}`;
  }
  function diary(){return `<div class="page-intro">${icon('book')} ${esc(state.schoolName)}の歩み。直近100件の活動を記録しています。</div><div class="diary-list">${state.logs.map(l=>`<div class="diary-item"><div class="diary-date">${l.year}年目 ${dateAt(l.week)}<br>第${l.week}週</div><div class="diary-message">${esc(l.text)}</div></div>`).join('')}</div><div class="save-tools"><button class="btn" data-action="export">${icon('download')}セーブを書き出す</button><button class="btn" data-action="import">${icon('upload')}セーブを読み込む</button></div>`;}
  function render(){mainScene?.destroy();mainScene=null;const currentCalendar=E.getCalendar(state),title=pages[page],medals=Object.values(state.medals).reduce((a,b)=>a+b,0);$('#app').innerHTML=`<aside class="sidebar"><div class="brand">${logo}<div class="brand-title">放課後<br>トラック部<span>AFTER SCHOOL CLUB</span></div></div><div class="club-label">CLUB MANAGEMENT</div><nav class="nav-list" aria-label="メインメニュー">${nav.map(([id,i,label])=>`<button class="nav-btn ${page===id?'active':''}" data-action="navigate" data-page="${id}" title="${label}" aria-label="${label}" ${page===id?'aria-current="page"':''}>${icon(i)}<span>${label}</span>${id==='team'?`<span class="nav-count">${state.athletes.length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="season-note"><small>OUR LITTLE DREAM</small><p>小さなグラウンドから、<br>全国の舞台へ。</p></div><div class="sidebar-footer"><span>青春、1秒ずつ。</span><button data-action="settings" title="設定・セーブ" aria-label="設定・セーブ">${icon('settings')}</button></div></div></aside><main class="main"><header class="topbar"><div><div class="school-name">${icon('leaf')}${esc(state.schoolName)} 陸上部</div><p class="school-subtitle">HIGH SCHOOL TRACK & FIELD CLUB</p></div><div class="top-meta"><div class="date-block"><span class="year">創部${state.year}年</span><strong>${currentCalendar.monthName} 第${currentCalendar.weekOfMonth}週</strong></div><span class="weather">${icon('sun')}${currentCalendar.season}</span><span class="divider"></span><button class="icon-button" data-action="sound" aria-label="サウンドを${prefs.sound?'オフ':'オン'}にする" title="サウンド${prefs.sound?'ON':'OFF'}">${icon(prefs.sound?'sound':'mute')}</button><button class="icon-button" data-action="help" title="遊び方" aria-label="遊び方">${icon('help')}</button></div></header><div class="content"><div class="save-alert" data-save-alert role="alert" ${saveStore.getStatus().error?'':'hidden'}>${saveAlertContent()}</div><div class="page-heading"><div><div class="eyebrow">${title[0]}</div><h1>${title[1]}</h1><p>${title[2]}</p></div><div class="heading-actions"><button class="btn subtle" data-action="help">${icon('help')}遊び方</button><button class="btn primary week-button" data-action="${primaryAction()}">${primaryLabel()} ${icon('arrow')}<span class="keycap">SPACE</span></button></div></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon">${icon('coin')}</div><div><div class="stat-label">部の活動費</div><div class="stat-value">${(state.money/10000).toFixed(1)}<small>万円</small></div></div><span class="stat-mini">計画的に使おう</span></div><div class="stat-card"><div class="stat-icon">${icon('users')}</div><div><div class="stat-label">いっしょに走る仲間</div><div class="stat-value">${state.athletes.length}<small>人</small></div></div><span class="stat-mini">男子${state.athletes.filter(a=>a.gender==='boys').length} · 女子${state.athletes.filter(a=>a.gender==='girls').length}</span></div><div class="stat-card"><div class="stat-icon">${icon('star')}</div><div><div class="stat-label">学校の評判</div><div class="stat-value">${Math.round(state.reputation)}<small>pt</small></div></div><span class="stat-mini">${state.reputation<20?'かけだしの陸上部':state.reputation<60?'注目の陸上部':'全国に響く名前'}</span></div><div class="stat-card"><div class="stat-icon">${icon('trophy')}</div><div><div class="stat-label">獲得メダル</div><div class="stat-value">${medals}<small>個</small></div></div><span class="stat-mini">金 ${state.medals.gold} · 銀 ${state.medals.silver} · 銅 ${state.medals.bronze}</span></div></div>${({overview,training,team,facilities,scouting,calendar,diary}[page])()}<footer class="bottomline"><span><button class="footer-save" data-action="manual-save" title="今すぐセーブする">${icon('save')}<span data-save-status data-save-state="${saveStore.getStatus().error?'error':'saved'}">${saveStatusText()}</span></button> <span class="keyboard-hint">· 第${state.week}週 / 48</span></span><span>放課後トラック部 <span>·</span> A LITTLE CLUB, A BIG DREAM.</span></footer></div></main>`;drawAvatars();if($('#campus')){mainScene=new TrackScene($('#campus'));mainScene.setState(state);} }
  function drawAvatars(scope=document){scope.querySelectorAll('[data-avatar]').forEach(c=>{const a=state.athletes.find(a=>a.id===c.dataset.avatar)||E.getCandidates(state).find(a=>a.id===c.dataset.avatar)||(state.scouted||[]).find(a=>a.id===c.dataset.avatar);if(a)TrackScene.drawPortrait(c,a);});scope.querySelectorAll('[data-coach]').forEach(c=>TrackScene.drawPortrait(c,{id:'coach',name:'マネージャー',color:'#688568'}));}
  const dialog = $('#game-dialog');
  function modal(title, subtitle, body, footer='', wide=false){if(!dialog.open)lastFocus=document.activeElement;dialog.style.maxWidth=wide?'760px':'620px';dialog.innerHTML=`<div class="dialog-header"><div><h2 id="dialog-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button class="icon-button" data-action="${raceActive?'race-skip':'close'}" aria-label="${raceActive?'結果を見る':'閉じる'}">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-footer">${footer}</div>`:''}`;if(!dialog.open)dialog.showModal();drawAvatars(dialog);dialog.querySelector('.dialog-body')?.scrollTo(0,0);}
  function closeModal(){clearTimeout(raceTimer);raceScene?.destroy();raceScene=null;raceActive=false;dialog.close();if(lastFocus?.isConnected)lastFocus.focus();else document.querySelector('.week-button')?.focus();}
  function showHelp() {
    modal('新設校、12人からの挑戦。','月間育成 × 練習カード × 大会 × 次世代スカウト',`<div class="help-grid"><div class="help-step"><strong><span class="step-no">01</span>能力を見極める</strong>全員1年生の男子6人・女子6人から創部。7つの能力にS〜Fの評価がつき、種目適性の上位3つを表示します。適性は固定ではなく、育成によって変わります。</div><div class="help-step"><strong><span class="step-no">02</span>月初に育成方針を決める</strong>一人ずつ今月伸ばす能力を設定し、方針を確定。毎週はチームの練習カードを1枚選び、個人メニュー・強度・休養を調整して週を進めます。</div><div class="help-step"><strong><span class="step-no">03</span>男女別の大会に挑む</strong>男子ハードルは110m、女子は100m。個人1種目と同性4人リレーを兼任できます。新人戦は1・2年生。年代別選手権は年齢と標準記録が条件です。</div><div class="help-step"><strong><span class="step-no">04</span>次の世代へつなぐ</strong>10月だけ中学3年生をスカウトでき、翌4月に入部。毎春の男女各6人の新入生には内定者が含まれます。先輩が卒業しても施設と部の記録が残ります。</div></div><div class="help-note">年間日程と屋外選手権の参加標準はゲーム独自の設定です。2月の室内は2025年の実大会を再現し、60m・60mHなどへ切り替えます。室内にはリレーや1500m、年代別の走高跳はありません。大会ごとの出場条件はエントリー画面で確認できます。<br>自動保存対応。Space：方針確認／大会／1週進行、Esc：閉じる。</div>`,`<button class="btn primary" data-action="close">12人の物語を始めよう ${icon('arrow')}</button>`);
  }
  function showAthlete(id) {
    const a=state.athletes.find(a=>a.id===id); if(!a)return;
    const suitability=aptitude(a), best=suitability[0];
    modal('選手能力と種目適性',`${esc(state.schoolName)} 陸上部`,`<div class="detail-profile">${avatar(a)}<div><h3>${esc(a.name)}</h3><p>${genderLabel(a.gender)} · ${a.grade}年生 · ${a.birthYear}年${a.birthMonth}月生まれ</p><div class="athlete-meta"><span class="tag">${esc(a.trait)}</span>${a.injury?`<span class="tag red">療養 あと${a.injury}週</span>`:''}</div></div></div>${miniStats(a)}${energy(a)}<div class="detail-trait" style="margin-top:18px"><strong>${esc(a.trait)}</strong>${esc(a.traitDescription)}</div><div class="section-title"><h2>${icon('star')}現在の種目適性</h2><span class="subtext">能力の組み合わせから判定</span></div><div class="suitability-list">${suitability.map((v,i)=>`<div class="suitability-row"><span class="suitability-place">${i+1}</span><b class="ability-rank rank-${v.rank}">${v.rank}</b><strong>${v.name}</strong><div class="suitability-bar"><i style="width:${v.rating}%"></i></div><span>${Math.round(v.rating)}</span></div>`).join('')}</div><p class="suitability-description">${esc(best.description)} 重点育成を変えると、向いている種目も変わります。</p><div class="detail-records">${suitability.map(e=>`<div class="detail-record"><span>${e.name} ${a.best[e.eventId]?'ベスト（参考含む）':'予想'}</span><strong>${E.formatResult(a.best[e.eventId]||E.predictResult(a,e.eventId),e.eventId)}</strong></div>`).join('')}</div><div class="profile-focus"><label class="settings-label">${E.getCalendar(state).monthName}に伸ばす能力</label>${focusSelect(a)}<label class="settings-label" for="detail-training" style="margin-top:16px">今週の個人メニュー</label><select id="detail-training" data-training="${a.id}">${E.TRAININGS.map(t=>`<option value="${t.id}" ${t.id===a.training?'selected':''}>${t.name} — ${t.description}</option>`).join('')}</select></div>`,`<button class="btn green" data-action="close">育成に活かそう ${icon('check')}</button>`,true);
  }
  function showMonthlyPlan() {
    modal(`${E.getCalendar(state).monthName}の育成ミーティング`,`${state.athletes.length}人それぞれの「伸ばす能力」を決めよう。`,`<p class="subtext" style="margin-bottom:18px">種目適性と今の能力を参考に目標を設定。選んだ能力は今月の練習で重点的に伸びます。途中で変更しても、次の週から反映されます。</p><div class="focus-list">${focusRows(true)}</div>`,`<p>${state.monthPlanPending?'今月はまだ方針を確定していません':'今月の方針は確定済みです'}</p><button class="btn primary" data-action="confirm-plan">この方針で育てる ${icon('check')}</button>`,true);
  }
  function advance() {
    if(dialog.open||raceActive)return;
    if(state.monthPlanPending){showMonthlyPlan();return;}
    const result=E.advanceWeek(state);if(!result.ok){toast(result.message);return;}
    save();sound();render();const r=result.report;
    modal(r.title||'今週の活動レポート',r.weekLabel||E.getCalendar(state).label,`<div class="report-finance"><span>収入 ＋${money(r.income)}円</span><span>支出 −${money(r.expenses)}円</span><strong>差引 ${r.balance>=0?'+':''}${money(r.balance)}円</strong></div>${r.changes.map(c=>`<div class="report-line"><strong>${esc(c.name)}</strong><span>${trainingName(c.trainingId)}</span><span class="gains">${Object.entries(c.statGains).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>`${E.STAT_NAMES[k]} +${Number(v).toFixed(1)}`).join(' / ')||'コンディション調整'}</span><span>体力 ${c.energyChange>=0?'+':''}${Math.round(c.energyChange)}</span></div>${c.injury?`<p class="report-event">${esc(c.message)}</p>`:''}`).join('')}${r.events.map(e=>`<div class="report-event">${esc(e)}</div>`).join('')}${state.monthPlanPending?'<div class="goal-complete">新しい月になりました。次の育成方針を決めよう。</div>':state.pendingMeet?`<div class="goal-complete">${esc(state.pendingMeet.name)}の開催日です。</div>`:''}`,`<p>今週の成長を、次の一歩に。</p><button class="btn primary" data-action="${state.monthPlanPending?'monthly-plan':state.pendingMeet?'enter-meet':'close'}">${state.monthPlanPending?'来月の育成方針へ':state.pendingMeet?'出場条件を確認':'部活に戻る'} ${icon('arrow')}</button>`);
  }
  function showRecruit() { closeModal();page='scouting';render();window.scrollTo({top:0,behavior:'instant'}); }

  function suggestRelay(gender, division) {
    const available = division ? E.getEligibleAthletes(state,division,state.pendingMeet) : state.athletes.filter(a=>!a.injury&&a.gender===gender);
    const squad = available.filter(a=>a.gender===gender).sort((a,b)=>E.getAthleteRating(b,'relay')*(.7+b.energy/333)-E.getAthleteRating(a,'relay')*(.7+a.energy/333)).slice(0,4);
    if(squad.length<4)return squad.map(a=>a.id);
    let best=squad,score=-Infinity;
    function arrange(order,remaining){if(!remaining.length){const value=E.getRelayRating(order);if(value>score){score=value;best=order;}}else remaining.forEach((a,i)=>arrange([...order,a],remaining.filter((_,j)=>i!==j)));}
    arrange([],squad);return best.map(a=>a.id);
  }
  function updateRelayPreview() {
    dialog.querySelectorAll('input[data-relay-gender]').forEach(toggle=>{
      const gender=toggle.dataset.relayGender,fields=$(`#relay-fields-${gender}`);fields.hidden=!toggle.checked;if(!toggle.checked)return;
      const ids=[...dialog.querySelectorAll(`select[data-relay-leg][data-gender="${gender}"]`)].map(s=>s.value);
      const prediction=E.predictRelayResult(state,ids);
      const individualIds=[...dialog.querySelectorAll('[data-entry]')].map(s=>s.value).filter(Boolean);
      const overlap=ids.filter(id=>individualIds.includes(id)).length;
      $(`#relay-prediction-${gender}`).textContent=prediction===null?'異なる4人を選ぶと予想記録を表示します。':`予想 ${E.formatResult(prediction,'relay')} · 現在の体力で計算`;
      $(`#relay-fatigue-${gender}`).textContent=overlap?`個人種目と兼任：${overlap}人。本番では個人種目後の疲労が反映されます。`:'全員がリレーに専念。個人種目の疲労を受けません。';
    });
  }
  function relayEntry(division, healthy) {
    const gender=division.gender,relay=suggestRelay(gender,division),roles=['技術・集中力で好スタート','直線をスピードで押し切る','技術・パワーでカーブ攻略','速さ・集中力で勝負を決める'];
    return `<section class="relay-entry-panel"><div class="relay-heading"><div><strong>${icon('flag')}${genderLabel(gender)}4×100mリレー</strong><p>同じ性別の4人で、想いをつなぐ。</p></div><label class="relay-toggle"><input type="checkbox" data-relay-gender="${gender}" data-division-key="${division.key}" ${healthy.length<4?'disabled':''}>リレーに出場する</label></div>${healthy.length<4?`<p class="relay-unavailable">出場可能な${genderLabel(gender)}が4人必要です（現在${healthy.length}人）。</p>`:''}<div id="relay-fields-${gender}" hidden><div class="relay-legs">${[0,1,2,3].map(leg=>`<div class="relay-leg"><label for="relay-${gender}-${leg}"><span>${leg+1}</span>${leg===3?'アンカー':'第'+(leg+1)+'走者'}</label><select id="relay-${gender}-${leg}" data-relay-leg="${leg}" data-gender="${gender}" aria-label="${genderLabel(gender)}リレー第${leg+1}走者"><option value="">走者を選択</option>${healthy.map(a=>`<option value="${a.id}" ${relay[leg]===a.id?'selected':''}>${esc(a.name)} · 体力${Math.round(a.energy)}</option>`).join('')}</select><p>${roles[leg]}</p></div>`).join('')}</div><div class="relay-estimate"><strong id="relay-prediction-${gender}" aria-live="polite"></strong><button class="text-link" data-action="relay-suggest" data-gender="${gender}">走順をおまかせ ${icon('reset')}</button></div><p class="subtext" id="relay-fatigue-${gender}"></p></div></section>`;
  }
  function showEntry() {
    const meet=state.pendingMeet;if(!meet){toast('次の大会は年間カレンダーから確認できます。');return;}
    const divisions=E.getMeetEvents(state,meet),used=new Set(),entries={};
    for(const d of divisions.filter(d=>!d.teamSize)){
      const available=E.getEligibleAthletes(state,d,meet).filter(a=>!used.has(a.id)).sort((a,b)=>{
        const bo=E.getEntryStatus(state,b,d,meet).official?1:0,ao=E.getEntryStatus(state,a,d,meet).official?1:0;
        return bo-ao||E.getAthleteRating(b,d.id)*b.energy-E.getAthleteRating(a,d.id)*a.energy;
      });
      if(available[0]){entries[d.key]=available[0].id;used.add(available[0].id);}
    }
    const genders=['boys','girls'];
    modal(`${esc(meet.name)}にエントリー`,`${meet.dateLabel||dateAt(meet.week)} · 男女別の出場条件を確認`,`${meet.kind==='indoor'?'<div class="indoor-entry-note">2025日本室内大阪を再現。年齢は開催暦年で判定し、実施規格の屋外公認記録で標準を判定します。400m・1500m・リレー・年代別走高跳はありません。</div>':''}<p class="subtext" style="margin-bottom:15px">${meet.kind==='indoor'?'室内は1人1種目。':'個人1種目＋同性4人リレーに出場可能。'}年代別大会を同じ週に2つ開催する場合も、一人が出場できる大会は一つです。</p><div class="entry-gender-tabs segmented">${genders.map((g,i)=>`<button class="segment ${!i?'active':''}" data-action="entry-gender" data-gender="${g}">${genderLabel(g)}のエントリー</button>`).join('')}</div>${genders.map((gender,gi)=>`<div data-entry-panel="${gender}" ${gi?'hidden':''}><div class="entry-heading">${icon('run')}${genderLabel(gender)}個人種目<span>${divisions.filter(d=>d.gender===gender&&!d.teamSize).length} EVENTS</span></div>${divisions.filter(d=>d.gender===gender&&!d.teamSize).map(d=>{
      const athletes=state.athletes.filter(a=>a.gender===gender);
      const standard=d.standard!=null?`申込標準：${eventName(d.standardEvent||d.id)} ${E.formatResult(d.standard,d.standardEvent||d.id)}`:'';
      return `<div class="division-entry"><div class="meet-entry"><strong>${eventName(d.id)}</strong><select data-entry="${d.key}" data-gender="${gender}" aria-label="${genderLabel(gender)}${eventName(d.id)}の出場選手"><option value="">出場しない</option>${athletes.map(a=>{const status=E.getEntryStatus(state,a,d,meet);return `<option value="${a.id}" ${entries[d.key]===a.id?'selected':''} ${!status.eligible?'disabled':''}>${esc(a.name)} · ${status.eligible?E.formatResult(E.predictResult(a,d.id,d),d.id)+(status.open?'（記録会）':''):'出場不可：'+esc(status.reason)}</option>`;}).join('')}</select></div><p class="division-requirements">${d.hurdleHeight?`ハードル高 ${d.hurdleHeight<2?Math.round(d.hurdleHeight*1000)/10:d.hurdleHeight}cm · `:''}${standard}${d.category?' · '+esc(d.category):''}</p><details class="entry-status-details"><summary>出場条件と各選手の判定</summary><div>${athletes.map(a=>{const status=E.getEntryStatus(state,a,d,meet);return `<p><strong>${esc(a.name)}</strong><span class="${status.eligible?'eligible':'ineligible'}">${status.eligible?(status.open?'記録会として参加可':'出場可'):'出場不可'}</span><small>${esc(status.reason||'条件を満たしています')}</small></p>`;}).join('')}</div></details></div>`;
    }).join('')}${divisions.filter(d=>d.gender===gender&&d.teamSize).map(d=>relayEntry(d,E.getEligibleAthletes(state,d,meet))).join('')}</div>`).join('')}<div class="meet-tactics"><h3>今日のチームの作戦</h3><div class="tactics">${[['steady','堅実に','安定した記録を狙う'],['balanced','いつも通り','普段の実力を発揮'],['aggressive','勝負をかける','好記録も失敗も増える']].map(([id,label,desc])=>`<label class="tactic"><input type="radio" name="tactic" value="${id}" ${id==='balanced'?'checked':''}>${label}<small>${desc}</small></label>`).join('')}</div></div>`,`<button class="btn subtle small" data-action="skip-meet-confirm">今回は見送る</button><button class="btn primary" data-action="start-meet">大会を始める ${icon('flag')}</button>`,true);
  }
  function startMeet() {
    const entries={};dialog.querySelectorAll('[data-entry]').forEach(s=>{if(s.value)entries[s.dataset.entry]=s.value;});
    dialog.querySelectorAll('input[data-relay-gender]:checked').forEach(input=>{
      entries[input.dataset.divisionKey]=[...dialog.querySelectorAll(`select[data-relay-leg][data-gender="${input.dataset.relayGender}"]`)].map(s=>s.value);
    });
    const result=E.runMeet(state,entries,dialog.querySelector('[name=tactic]:checked')?.value||'balanced');
    if(!result.ok){toast(result.message);return;}save();render();sound('win');playHighlight(state.lastMeet,0);
  }
  function playHighlight(meet, index) {
    const result = meet?.results[index];
    if (!result) return;
    clearTimeout(raceTimer); raceScene?.destroy(); raceScene = null;
    highlightMeet = meet; raceActive = true;
    const athlete = state.athletes.find(a => a.id === result.athleteId);
    const player = result.participants.find(p => p.isPlayer);
    const members = result.members || player?.members || [];
    const color = members[0]?.color || athlete?.color || '#e76e45';
    const titles = { polevault:'しなるポールに、夢を乗せて。',triplejump:'ホップ、ステップ、そして未来へ。','100mh':'一台ずつ、壁を越えて。','60mh':'5台の先へ、駆け抜けろ。','60m':'60m、一瞬に懸ける。', longjump:'助走に、想いをのせて。', highjump:'その先の高さへ、跳べ。', '110mh':'一台ずつ、壁を越えて。', relay:'4人の想いを、一本のバトンに。' };
    const cheers = { longjump:'その一歩を、もっと遠くへ！', highjump:'自分の高さを、越えていこう！', '110mh':'リズムをつないで、ゴールへ！', relay:'最後の一人まで、想いをつなげ！' };
    modal(titles[result.eventId] || '号砲が鳴る。青春が走り出す。', `${esc(meet.name)} · ${esc(result.eventName)}のハイライト`, `
      <canvas id="race-canvas" class="race-canvas" data-event="${result.eventId}" width="1000" height="520" aria-label="${result.eventName}のハイライトアニメーション"></canvas>
      <p class="race-caption">${esc(result.athleteName)}、${cheers[result.eventId] || '最後まで駆け抜けろ！'}</p>
      ${members.length ? `<div class="relay-race-order">${members.map((m, i) => `<span><b>${i + 1}走</b>${esc(m.name)}</span>`).join('<i>→</i>')}</div>` : ''}
      <div class="race-progress"><div></div></div><div class="race-legend"><span><i style="background:${esc(color)}"></i>${esc(player?.school || state.schoolName)}</span><span><i style="background:#87aebb"></i>ライバル校</span></div>`,
      `<p>ハイライト演出 · 記録は結果画面で確認できます</p><button class="btn green" data-action="race-skip">結果を見る ${icon('arrow')}</button>`, true);
    raceScene = new TrackScene($('#race-canvas')); raceScene.setState(state);
    raceScene.setMode('race', {eventId:result.eventId, indoor:!!(result.indoor||meet.indoor||meet.kind==='indoor'), gender:result.gender, category:result.category, hurdleHeight:result.hurdleHeight, runners:result.participants.map((r, i) => ({
      name:r.name || r.athleteName || r.school,
      color:r.isPlayer ? color : ['#77a3b9','#c4a877','#ad95ba','#78a790','#b78074','#98a168','#829fb0'][i % 7],
      isPlayer:r.isPlayer, place:r.rank || i + 1, value:r.value,
      members:r.isPlayer ? members : r.members
    })), duration:8000});
    raceTimer = setTimeout(finishRace, 8200);
  }
  function finishRace() {
    if (!raceActive) return;
    clearTimeout(raceTimer); raceScene?.destroy(); raceScene = null; raceActive = false;
    showResults(highlightMeet || state.lastMeet);
  }
  function showResults(meet) {
    if (!meet) return;
    viewedMeet = meet;
    const s = meet.summary;
    modal(`${esc(meet.name)} 結果`, `${meet.year}年目 · ${dateAt(meet.week)}`, `
      <div class="result-summary"><span class="trophy">${s.gold ? '🏆' : s.silver || s.bronze ? '🏅' : '🏁'}</span><h3>${esc(s.title || 'おつかれさま、陸上部。')}</h3><p>${esc(s.message)}</p></div>
      ${meet.results.map((r, index) => `<section class="event-result" data-result-event="${r.divisionKey||r.eventId}">
        <div class="result-row"><div class="result-rank ${r.rank <= 3 ? 'medal' : ''}">${r.rank}<small>位</small></div><div class="result-person">${esc(r.athleteName)}<small>${genderLabel(r.gender)} ${r.eventName} ${r.category||''} ${r.official===false?'· 記録会':r.qualified?'· 入賞':''}</small></div><div class="result-value">${esc(r.formatted)}${r.newBest ? `<small>${r.eventId === 'relay' ? 'NEW TEAM BEST!' : 'NEW PERSONAL BEST!'}</small>` : ''}</div></div>
        ${r.members?.length ? `<div class="result-relay-members">${r.members.map((m, leg) => `<span><b>${leg + 1}走</b>${esc(m.name)}</span>`).join('')}</div>` : ''}
        <div class="result-actions"><details class="result-expand"><summary>${r.eventName}の全順位を見る</summary><table class="ranking-table"><thead><tr><th>順位</th><th>${r.eventId === 'relay' ? '学校' : '選手 / 学校'}</th><th>記録</th></tr></thead><tbody>${r.participants.map((p, i) => `<tr class="${p.isPlayer ? 'ours' : ''}"><td>${p.rank || i + 1}</td><td>${esc(p.name || p.athleteName || p.school)}${p.school && p.school !== p.name && r.eventId !== 'relay' ? ' / ' + esc(p.school) : ''}</td><td>${esc(p.formatted || E.formatResult(p.value, r.eventId))}</td></tr>`).join('')}</tbody></table></details><button class="text-link replay-event" data-action="replay-event" data-index="${index}" aria-label="${r.eventName}のハイライトを見る">${icon('run')}ハイライト</button></div>
      </section>`).join('')}
      <div class="result-reward"><span>活動費 ＋${money(s.prize)}円</span><span>学校の評判 ＋${s.reputation}pt</span></div>
      ${state.goal.nationalsWon && meet.summary.stageId === 'nationals' && s.gold ? `<div class="goal-complete">全国優勝、おめでとう！<br>${state.goal.wonYear}年目、小さな陸上部の夢が実を結びました。<br>後輩たちと、次の物語を続けよう。</div>` : ''}`,
      `${state.pendingMeet?`<button class="btn" data-action="enter-meet">同週の次の大会へ</button>`:''}<button class="btn primary" data-action="close">部活に戻る ${icon('arrow')}</button>`);
  }
  function showSettings(){modal('部の設定','進行は操作のたびに自動保存され、同じブラウザーで続きを遊べます。',`<div class="settings-group"><label class="settings-label" for="school-name">学校名</label><input id="school-name" type="text" maxlength="16" value="${esc(state.schoolName)}"><p>最大16文字。あなたの高校を育てよう。</p></div><div class="settings-group"><label class="settings-label">サウンド・ヒント</label><div class="save-tools"><button class="btn small" data-action="settings-sound">${icon(prefs.sound?'sound':'mute')}サウンド ${prefs.sound?'ON':'OFF'}</button><button class="btn small" data-action="settings-coach">${icon('help')}マネージャーのヒント ${prefs.coach?'ON':'OFF'}</button></div></div><div class="settings-group"><label class="settings-label">セーブデータ</label><div class="save-detail"><span data-save-status data-save-state="${saveStore.getStatus().error?'error':'saved'}">${saveStatusText()}</span><button class="btn small green" data-action="manual-save">${icon('save')}今すぐセーブ</button></div><div class="save-alert" data-save-alert role="alert" ${saveStore.getStatus().error?'':'hidden'}>${saveAlertContent()}</div><p>セーブは端末・ブラウザー・サイトごとに保存されます。別の端末や公開版へ移すときは「書き出す」→移行先で「読み込む」を使ってください。ブラウザーのデータ削除やプライベートモード終了で消えることがあるため、時々ファイルにも残しましょう。</p><div class="save-tools"><button class="btn small" data-action="export">${icon('download')}書き出す</button><button class="btn small" data-action="import">${icon('upload')}読み込む</button><button class="btn small" data-action="restore-backup" ${saveStore.backup()?'':'disabled'}>${icon('reset')}直前のセーブに戻す</button></div><p>前回の変更前のセーブも自動で1つ保管します。読み込み時に破損が見つかった場合は自動復旧します。</p></div><div class="legacy-backup"><button class="text-link" data-action="export-legacy">旧版（24週制）の保存データを書き出す</button><p>新設校編は別の保存枠です。旧版の進行は上書きしません。</p></div><div class="danger-zone"><button data-action="reset-confirm">最初から部活を始める</button></div>`,`<button class="btn green" data-action="save-settings">設定を保存する ${icon('check')}</button>`);}
  function showBackup(){const backup=saveStore.backup();if(!backup){toast('復元できるバックアップはありません。');return;}modal('直前のセーブに戻しますか？',`${esc(backup.schoolName)} · ${backup.year}年目 第${backup.week}週`,`<p>現在の進行を、前回の変更前のセーブに置き換えます。${saveStore.getStatus().backupAt?`<br>保存日時：${savedTime(saveStore.getStatus().backupAt)}`:''}</p>`,`<button class="btn" data-action="export">現在のデータを書き出す</button><button class="btn" data-action="settings">戻る</button><button class="btn green" id="confirm-restore">このセーブに戻す</button>`);$('#confirm-restore').addEventListener('click',()=>{state=backup;page='overview';const ok=save();closeModal();render();toast(ok?'直前のセーブから復元しました。':'バックアップを読み込みましたが、保存できていません。ファイルを書き出してください。');},{once:true});}
  function exportSave(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`放課後トラック部_${state.year}年目_${state.week}週.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('セーブデータを書き出しました。');}
  function exportLegacy() {
    let raw;try{raw=localStorage.getItem(LEGACY_KEY);}catch{}
    if(!raw){toast('このブラウザーに旧版の保存データはありません。');return;}
    const blob=new Blob([raw],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='放課後トラック部_旧版バックアップ.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('旧版のデータを書き出しました。');
  }
  function action(button) {
    const id=button.dataset.id;
    switch(button.dataset.action){
      case'navigate':page=button.dataset.page;render();window.scrollTo({top:0,behavior:'instant'});break;
      case'advance':advance();break;
      case'monthly-plan':showMonthlyPlan();break;
      case'confirm-plan':{const r=E.confirmMonthlyPlan(state);if(r.ok){save();closeModal();render();toast('今月の育成方針を決めました。');}else toast(r.message);break;}
      case'practice-card':{const r=E.choosePracticeCard(state,id);if(r.ok){save();render();sound();}else toast(r.message);break;}
      case'gender-filter':genderFilter=button.dataset.gender;render();break;
      case'entry-gender':dialog.querySelectorAll('[data-entry-panel]').forEach(el=>el.hidden=el.dataset.entryPanel!==button.dataset.gender);dialog.querySelectorAll('[data-action="entry-gender"]').forEach(el=>el.classList.toggle('active',el.dataset.gender===button.dataset.gender));break;
      case'close':closeModal();break;
      case'help':showHelp();break;
      case'athlete':showAthlete(id);break;
      case'intensity':E.setIntensity(state,id);save();render();sound();break;
      case'all-rest':state.athletes.forEach(a=>E.setTraining(state,a.id,'rest'));save();render();toast('全員の個人メニューを休養にしました。');break;
      case'auto-training':state.athletes.forEach(a=>E.setTraining(state,a.id,a.injury||a.energy<40?'rest':E.getDefaultTraining(aptitude(a)[0].eventId)));save();render();toast('現在の適性と体力に合わせて練習を設定しました。');break;
      case'upgrade':{const r=E.upgradeFacility(state,id);if(r.ok){save();sound('win');render();}toast(r.message);break;}
      case'recruit-list':showRecruit();break;
      case'recruit':{const r=E.recruitAthlete(state,id);if(r.ok){save();render();sound('win');}toast(r.message);break;}
      case'enter-meet':showEntry();break;
      case'start-meet':startMeet();break;
      case'skip-meet-confirm':modal('今回の大会を見送りますか？','選手のコンディションを優先します。','<p class="notice-danger">この大会の記録・賞金・出場権は獲得できません。同週の別の大会や、次の週へ進めます。</p>',`<button class="btn" data-action="enter-meet">エントリーに戻る</button><button class="btn green" data-action="skip-meet">見送って次へ</button>`);break;
      case'skip-meet':{const r=E.skipMeet(state);if(r.ok){save();render();showResults(state.lastMeet);}else toast(r.message);break;}
      case'race-skip':finishRace();break;
      case'replay-event':playHighlight(viewedMeet,Number(button.dataset.index));break;
      case'relay-suggest':{const gender=button.dataset.gender,d=E.getMeetEvents(state,state.pendingMeet).find(d=>d.gender===gender&&d.teamSize),ids=suggestRelay(gender,d);dialog.querySelectorAll(`select[data-relay-leg][data-gender="${gender}"]`).forEach((select,i)=>select.value=ids[i]||'');updateRelayPreview();break;}
      case'past-meet':showResults(state.history[Number(button.dataset.index)]);break;
      case'dismiss-coach':prefs.coach=false;save();render();break;
      case'sound':prefs.sound=!prefs.sound;save();render();sound();toast(`サウンドを${prefs.sound?'オン':'オフ'}にしました。`);break;
      case'settings':showSettings();break;
      case'manual-save':if(save())toast('セーブしました。このブラウザーで続きから遊べます。');break;
      case'restore-backup':showBackup();break;
      case'reload-save':window.location.reload();break;
      case'settings-sound':{const draft=$('#school-name').value;prefs.sound=!prefs.sound;save();sound();showSettings();$('#school-name').value=draft;break;}
      case'settings-coach':{const draft=$('#school-name').value;prefs.coach=!prefs.coach;save();render();showSettings();$('#school-name').value=draft;break;}
      case'save-settings':{const name=$('#school-name').value.trim();if(!name){toast('学校名を入力してください。');break;}state.schoolName=name;const ok=save();render();closeModal();toast(ok?'設定を保存しました。':'設定は変更しましたが、保存できていません。ファイルを書き出してください。');break;}
      case'export':exportSave();break;
      case'export-legacy':exportLegacy();break;
      case'import':$('#import-save').click();break;
      case'reset-confirm':modal('新しい高校の陸上部を始めますか？','男子6人・女子6人、全員1年生からスタートします。','<p class="notice-danger">現在の新設校編の進行は上書きされます。残しておく場合は先にセーブを書き出してください。旧版の保存枠は変更しません。</p>',`<button class="btn" data-action="export">セーブを書き出す</button><button class="btn" data-action="settings">戻る</button><button class="btn danger" data-action="reset">新しく創部する</button>`);break;
      case'reset':state=E.createGame();page='overview';genderFilter='all';prefs.coach=true;save();closeModal();render();toast('12人の1年生から、新しい物語が始まりました。');break;
    }
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button&&!button.disabled)action(button);});
  document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[role=button][data-action]')){event.preventDefault();action(event.target);}if(event.code==='Space'&&!event.repeat&&!dialog.open&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName)){event.preventDefault();state.monthPlanPending?showMonthlyPlan():state.pendingMeet?showEntry():advance();}});
  document.addEventListener('change', event => {
    const input=event.target;
    if(input.dataset.focus){const result=E.setFocus(state,input.dataset.focus,input.value);if(result.ok){save();render();}else toast(result.message);}
    if(input.dataset.training){const result=E.setTraining(state,input.dataset.training,input.value);if(result.ok){save();render();}toast(result.message);}
    if(input.dataset.entry){if(input.value)dialog.querySelectorAll('[data-entry]').forEach(other=>{if(other!==input&&other.value===input.value)other.value='';});updateRelayPreview();}
    if(input.hasAttribute('data-relay-leg')){if(input.value)dialog.querySelectorAll(`select[data-relay-leg][data-gender="${input.dataset.gender}"]`).forEach(other=>{if(other!==input&&other.value===input.value)other.value='';});updateRelayPreview();}
    if(input.hasAttribute('data-relay-gender'))updateRelayPreview();
  });
  document.addEventListener('athleteselect',event=>{if(!dialog.open)showAthlete(event.detail.id);});
  dialog.addEventListener('cancel',event=>{event.preventDefault();raceActive?finishRace():closeModal();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){raceActive?finishRace():closeModal();}}});
  $('#import-save').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>20000000){toast('セーブファイルが大きすぎます（最大20MB）。');return;}try{const data=JSON.parse(await file.text());if(data.version===1){toast('旧版は24週制のため新設校編には読み込めません。元のファイルは保管してください。');return;}if(!E.validateSave(data))throw Error('invalid');modal('セーブデータを読み込みますか？',`${esc(data.schoolName)} · ${data.year}年目 第${data.week}週`,`<p class="notice-danger">現在の部活を、このセーブデータで置き換えます。<br>残しておきたい場合は、現在のデータを先に書き出してください。</p>`,`<button class="btn" data-action="export">現在のデータを書き出す</button><button class="btn" data-action="close">戻る</button><button class="btn green" id="confirm-import">読み込む</button>`);$('#confirm-import').addEventListener('click',()=>{state=data;page='overview';const ok=save();closeModal();render();toast(ok?'セーブデータを読み込みました。':'セーブデータを読み込みましたが、保存できていません。ファイルを書き出してください。');},{once:true});}catch{toast('このファイルは有効なセーブデータではありません。');}});
  window.addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});
  window.addEventListener('storage',event=>{if(event.key===SAVE_KEY||event.key===null){saveStore.hasConflict();updateSaveUI();}});
  render();save();if(loadNotice)setTimeout(()=>toast(loadNotice),300);
})();
