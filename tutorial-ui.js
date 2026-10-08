/* Non-blocking guide panels reuse the game's own screens and dialogs. */
(function(root){
  'use strict';
  root.TrackTutorialUI={create};
  function create({E,esc,icon}){
    const lessons={
      athlete:{title:'一人の選手を、よく見てみよう',body:'スピードなど7つの能力で、向いている種目が変わります。「適性1位」と体力を確認しましょう。好きな選手をクリックしても進められます。',action:'選手の能力を見る',success:'選手の能力画面を開きました。適性は育成で変えられます。'},
      plan:{title:'今月、どの能力を伸ばそう？',body:'選手ごとの「今月伸ばす能力」を選び、最後に「この方針で育てる」を押しましょう。迷ったら「全員の適性から育成案を作る」も使えます。',action:'育成ミーティングを開く',success:'今月の方針が決まりました。途中でも一人ずつ調整できます。'},
      card:{title:'今週の練習カードを1枚選ぼう',body:'カードは全員の成長と疲労に影響します。まずは費用なしの「基礎を積み重ねる」を選んでみましょう。個人の体力が少ないときは、月間育成画面でその選手を休養にできます。',action:'練習カードを見に行く',success:'練習カードを選びました。実際の練習は週を進めると行われます。'},
      week:{title:'1週間の成長を見届けよう',body:'「1週進める」で、実際に今の部活の時間が進みます。レポートで能力の伸び、体力、部費を確認しましょう。説明だけ読む場合は下のボタンで次へ進めます。',action:'実際に1週進める',success:'1週間が進みました。疲れた選手は休ませ、大会前に体力を整えましょう。'},
      calendar:{title:'次の大会から、育成を逆算しよう',body:'春は地区→県→地方→インターハイ。個人は1人1種目、リレーは男女別の4人で兼任できます。大会当日に出場条件を確認して選手を選びます。10月は来春に入部する中学生のスカウトもできます。',action:'大会カレンダーを見る',success:'日程を確認できました。予選通過や年齢・標準記録など、出場条件は大会ごとに異なります。'},
      career:{title:'今年の挑戦と、次の世代へ',body:'「部の歴史と目標」では年度目標、学校記録、卒業生を振り返れます。目標と通常／強豪校モードを選べるのは毎年4月1週。今は画面を見るだけで大丈夫です。',action:'部の歴史と目標を見る',success:'部の歴史を開きました。3年生が卒業しても、記録は後輩に受け継がれます。'},
      save:{title:'大切な部活を、セーブしよう',body:'普段は操作のあとに自動保存されます。設定を開き「今すぐセーブ」を押して、保存表示を確認しましょう。ゲストはこのブラウザーに保存。別端末で続ける場合はログインし、クラウド保存済みの表示を確認します。',action:'設定・セーブを開く',success:'この端末に保存できました。ログイン中はクラウド保存の表示も確認してから端末を切り替えましょう。'}
    };
    function button(action,text,cls=''){return `<button type="button" class="btn small ${cls}" data-tutorial-action="${action}">${text}</button>`;}
    function panel(status,state,{showDone=false,compact=false}={}){
      if(status.status==='new')return compact?'':`<section class="tutorial-welcome" data-tutorial-welcome><span class="tutorial-emblem">${icon('book')}</span><div><span class="tutorial-kicker">はじめての監督ガイド</span><h2>最初の一歩を、一緒に。</h2><p>7つのステップで、育成から大会・セーブまで。今の部活のまま、いつでも中断できます。</p></div><div class="tutorial-welcome-actions">${button('start','チュートリアルを始める','green')}${button('dismiss','あとで','subtle')}</div></section>`;
      if(status.status==='done'&&showDone)return `<section class="tutorial-finished" data-tutorial-done><span class="tutorial-emblem">${icon('flag')}</span><div><h2>準備はできました、監督。</h2><p>次は ${esc(E.getNextMeet(state).name)}。選手の得意を伸ばして、自分たちの目標へ進もう。ガイドは「遊び方」から何度でも見られます。</p></div>${button('dismiss','部活を続ける','green')}</section>`;
      if(status.status!=='active')return '';
      const lesson={...lessons[status.stepId]},next=E.getNextMeet(state);
      if(status.stepId==='week'&&!status.completed){
        if(state.pendingMeet){lesson.body='今は大会の開催中です。先に大会の出場・見送りを終えると、週を進められます。ガイドのために大会を見送る必要はありません。「説明だけで次へ」も選べます。';lesson.action='開催中の大会を確認する';}
        else if(state.monthPlanPending){lesson.body='月初の育成方針を確定してから、週を進めます。「この方針で育てる」を押したあと、このガイドの「実際に1週進める」を押しましょう。';lesson.action='今月の方針を確認する';}
      }
      return `<section class="tutorial-panel ${status.completed?'completed':''} ${compact?'compact':''}" data-tutorial-step="${status.stepId}" aria-label="チュートリアル ${status.step+1} / 7"><div class="tutorial-panel-head"><span class="tutorial-kicker">監督ガイド <b>${status.step+1} / 7</b></span><button type="button" class="tutorial-pause" data-tutorial-action="pause" aria-label="チュートリアルを中断する">中断する ×</button></div><div class="tutorial-progress" aria-hidden="true">${root.TrackTutorial.STEPS.map((_,i)=>`<i class="${i<=status.step?'on':''}"></i>`).join('')}</div><h2>${esc(lesson.title)}</h2><p>${esc(lesson.body)}</p>${status.stepId==='calendar'?`<p class="tutorial-tip">次の大会：${esc(next.name)} · ${next.nextYear?'来年度 ':''}${esc(next.dateLabel||'')}</p>`:''}${status.completed?`<p class="tutorial-success" role="status">${icon('check')}${esc(lesson.success)}</p>`:''}${status.stepId==='week'&&!status.completed&&state.week===1?`<p class="tutorial-tip">4月1週は年度目標と大会モードを選べます。先に決めておきたいときはこちら。</p>${button('year-plan','先に今年の目標を選ぶ')}`:''}<div class="tutorial-actions">${status.completed?button('next',status.step===6?'ガイドを完了する':'次のステップへ '+icon('arrow'),'green'):button('do',esc(lesson.action)+' '+icon('arrow'),'green')}${!status.completed?button('skip','説明だけで次へ','subtle'):''}</div>${!status.persisted?'<small class="tutorial-storage-note">このブラウザーではガイドの進捗を保存できません。画面を閉じるまでは続けられます。</small>':''}</section>`;
    }
    function help(status){return `<section class="tutorial-help" data-tutorial-help><span class="tutorial-kicker">操作しながら覚える</span><h3>監督チュートリアル</h3><p>今の部活から始められます。案内だけの移動では時間は進みません。実際に時間が進むのは、自分で週進行のボタンを押したときだけです。進行は自動保存されます。</p><div class="tutorial-actions">${['active','paused'].includes(status.status)?button('resume',`ステップ${status.step+1}から再開`,'green'):status.status==='done'?button('restart','もう一度、最初から見る','green'):button('start','チュートリアルを始める','green')}${['active','paused'].includes(status.status)?button('restart','案内を最初から見る') : ''}</div><small>ガイドの進捗はこのブラウザーに保存します。部活の進行はリセットしません。</small></section>`;}
    function targets(status,state){
      if(status.status!=='active'||status.completed)return [];
      const dialog=document.querySelector('#game-dialog[open]');
      const scope=dialog||document;
      const selectors={athlete:dialog?'.detail-profile':'.nav-btn[data-page="team"]',plan:dialog?'[data-action="confirm-plan"]':'[data-action="monthly-plan"]',card:'[data-action="practice-card"][data-id="basic"]',week:dialog?'[data-action="close"]':state.pendingMeet?'[data-action="enter-meet"]':state.monthPlanPending?'[data-action="monthly-plan"]':'.week-button[data-action="advance"]',calendar:'.nav-btn[data-page="calendar"]',career:'.nav-btn[data-page="career"]',save:dialog?'[data-action="manual-save"]':'.footer-save'};
      return [...scope.querySelectorAll(selectors[status.stepId])].slice(0,2);
    }
    return {panel,help,targets};
  }
})(typeof globalThis!=='undefined'?globalThis:this);
