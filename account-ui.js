(function(root){
  'use strict';
  root.TrackAccountUI={create};
  function create({cloud,sync,modal,closeModal,toast,esc,icon,exportSave}){
    let busy=false,view='signin';
    const contact=root.TrackCloud.CONTACT_EMAIL||'rkoto2810@gmail.com';
    const support=()=>`<div class="account-support"><strong>ID・パスワードを忘れたとき</strong><p>主催者へお問い合わせください。本人確認後に再設定します。</p><a href="mailto:${esc(contact)}?subject=${encodeURIComponent('放課後トラック部 ログインについて')}">${esc(contact)}</a><small>パスワードはメールに書かないでください。</small></div>`;
    function isBlocked(){const s=sync.getStatus();return !!s.account&&['loading','choose','conflict','error'].includes(s.phase);}
    function statusText(){
      const s=sync.getStatus();
      if(!s.account)return 'このブラウザーに保存しています';
      if(s.phase==='loading')return 'クラウドのセーブを確認中…';
      if(s.phase==='choose')return '最初に引き継ぐ部活を選んでください';
      if(s.phase==='conflict')return '異なる進行があります。続けるセーブを選んでください';
      if(s.phase==='error')return s.error?.message||'クラウド保存を確認できません';
      if(s.phase==='offline')return '通信待ち · 進行はこの端末に保存しています';
      if(s.pending)return 'クラウドへ保存中…';
      return s.syncedAt?`クラウド保存済み · ${new Date(s.syncedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'クラウドに接続しています';
    }
    function barHTML(){
      const s=sync.getStatus();
      return `<div class="account-strip ${['conflict','error','offline'].includes(s.phase)?'account-attention':''}"><div class="account-strip-icon">${icon('users')}</div><div class="account-strip-copy"><strong>${s.account?esc(s.account.loginId):'ゲストでプレイ中'}</strong><span data-cloud-status role="status">${esc(statusText())}</span></div><button class="btn small ${s.account?'':'green'}" data-account-action="open">${s.account?'アカウント':'ログイン・登録'}</button></div>`;
    }
    function settingsHTML(){return `<div class="settings-group"><label class="settings-label">アカウントとクラウド保存</label><p data-cloud-status>${esc(statusText())}</p><button class="btn small green" data-account-action="open">${sync.getStatus().account?'アカウントを開く':'ログイン・新規登録'}</button></div>`;}
    function update(){
      document.querySelectorAll('[data-account-bar]').forEach(el=>el.innerHTML=barHTML());
      document.querySelectorAll('[data-cloud-status]').forEach(el=>el.textContent=statusText());
      document.querySelectorAll('[data-game-area]').forEach(el=>el.inert=isBlocked());
      document.querySelectorAll('[data-cloud-blocker]').forEach(el=>{el.hidden=!isBlocked();el.innerHTML=isBlocked()?`<p>${esc(statusText())}</p><button class="btn green" data-account-action="open">セーブを確認する</button>`:'';});
      if(document.querySelector('[data-account-panel]'))showAccount();
    }
    function show(){sync.getStatus().account?showAccount():showAuth(view);}
    function showAuth(mode='signin'){
      view=mode;const registering=mode==='signup';
      modal(registering?'12人の青春を、アカウントに。':'おかえりなさい、監督。','ID・パスワードでログインすると、別の端末でも続きを遊べます。',`
        <div class="segmented auth-tabs"><button class="segment ${!registering?'active':''}" data-account-action="signin-tab">ログイン</button><button class="segment ${registering?'active':''}" data-account-action="signup-tab">新規登録</button></div>
        <form id="account-form" data-auth-mode="${mode}">
          <label class="settings-label" for="login-id">ログインID</label><input id="login-id" name="username" type="text" minlength="4" maxlength="20" pattern="[A-Za-z0-9_]{4,20}" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="例：aoba_track"><p class="field-help">半角英数字・_ の4〜20文字。大文字と小文字は同じIDとして扱います。</p>
          <label class="settings-label" for="login-password">パスワード</label><input id="login-password" name="password" type="password" ${registering?'minlength="8"':''} maxlength="128" autocomplete="${registering?'new-password':'current-password'}" required ${registering?'placeholder="8文字以上"':''}>
          ${registering?'<label class="settings-label" for="login-password-confirm">パスワード（もう一度）</label><input id="login-password-confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><p class="field-help">メールアドレスの入力・確認はありません。IDとパスワードは控えておいてください。</p>':''}
          <p class="auth-error" id="auth-error" role="alert" hidden></p><button type="submit" class="btn primary auth-submit">${registering?'IDを作成して始める':'ログインする'} ${icon('arrow')}</button>
        </form>${support()}`,
        '<button class="btn" data-action="close">ゲストのまま遊ぶ</button>');
    }
    function summary(data){return data?`${esc(data.schoolName)} · 創部${Number(data.year)}年 第${Number(data.week)}週`:'保存データなし';}
    function showAccount(){
      const s=sync.getStatus();if(!s.account){showAuth(view);return;}
      const choosing=['choose','conflict'].includes(s.phase),first=s.choice==='new-account';
      let content='';
      if(choosing){
        content=`<div class="cloud-choice"><h3>${first?'このアカウントで育てる部活':'どちらの進行で続けますか？'}</h3><p>${first?'ゲストで育てた部活を引き継ぐか、新しい部活を始められます。ゲストの元データもこの端末に残ります。':'この端末とクラウドに異なるセーブがあります。選ぶまでは上書きしません。先に現在の進行を書き出すこともできます。'}</p><div class="choice-summary"><small>この端末の進行</small><strong>${summary(sync.getState())}</strong></div>${!first&&s.remoteSummary?`<div class="choice-summary"><small>クラウドの進行</small><strong>${summary(s.remoteSummary)}</strong><small>${esc(new Date(s.remoteSummary.updatedAt).toLocaleString('ja-JP'))}</small></div>`:''}<div class="account-actions"><button class="btn green" data-account-action="use-local">${first?'今の部活を引き継ぐ':'この端末の進行をクラウドへ保存'}</button><button class="btn" data-account-action="use-remote">${first?'新しい部活を始める':s.remoteAvailable?'クラウドの進行を読み込む':'新しい部活を始める'}</button><button class="btn subtle" data-account-action="export">${icon('download')}現在の進行を書き出す</button></div></div>`;
      }else{
        content=`<div class="account-save-panel"><p data-cloud-status>${esc(statusText())}</p>${s.phase==='loading'?'<p>保存内容の確認が終わるまでお待ちください。</p>':`<button class="btn green" data-account-action="sync">${s.pending||s.error?'接続して保存を再試行':'今すぐクラウドに保存'}</button>`}</div>`;
      }
      modal('アカウントとセーブ',`${esc(s.account.loginId)} としてログイン中`,`<div data-account-panel><div class="account-id"><span>ログインID</span><strong>${esc(s.account.loginId)}</strong></div>${content}<p class="auth-error" id="auth-error" role="alert" hidden></p><div class="account-reference"><span>問い合わせ用アカウント番号</span><code>${esc(s.account.id)}</code><small>IDとこの番号を控えておくと、主催者がアカウントを探しやすくなります。</small></div><div class="account-actions"><button class="btn small" data-account-action="password">パスワードを変更</button><button class="btn small" data-account-action="logout-confirm">ログアウト</button></div>${support()}</div>`,`<button class="btn green" data-action="close">閉じる</button>`);
    }
    function setBusy(value){busy=value;document.querySelectorAll('#account-form input,#account-form button,#password-form input,#password-form button').forEach(el=>el.disabled=value);}
    function errorMessage(error){const el=document.getElementById('auth-error');if(el){el.textContent=error?.message||'操作を完了できませんでした。もう一度お試しください。';el.hidden=false;}else toast(error?.message||'操作を完了できませんでした。');}
    async function submitAuth(form){
      if(busy)return;const id=form.querySelector('#login-id').value,password=form.querySelector('#login-password').value,registering=form.dataset.authMode==='signup';
      if(registering&&password!==form.querySelector('#login-password-confirm').value){errorMessage({message:'パスワードが一致していません。'});return;}
      setBusy(true);
      try{await (registering?cloud.signUp(id,password):cloud.signIn(id,password));await sync.init();showAccount();toast(registering?'IDを作成しました。続ける部活を選びましょう。':'ログインしました。');}
      catch(error){errorMessage(error);}finally{setBusy(false);}
    }
    function showPassword(){modal('パスワードを変更','新しいパスワードは8文字以上です。',`<form id="password-form"><label class="settings-label" for="new-password">新しいパスワード</label><input id="new-password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><label class="settings-label" for="new-password-confirm">新しいパスワード（もう一度）</label><input id="new-password-confirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" required><p class="auth-error" id="auth-error" role="alert" hidden></p><button class="btn primary auth-submit" type="submit">パスワードを変更する</button></form>`,`<button class="btn" data-account-action="open">戻る</button>`);}
    async function submitPassword(form){
      if(busy)return;const password=form.querySelector('#new-password').value;if(password!==form.querySelector('#new-password-confirm').value){errorMessage({message:'パスワードが一致していません。'});return;}
      setBusy(true);try{await cloud.changePassword(password);showAccount();toast('パスワードを変更しました。');}catch(error){errorMessage(error);}finally{setBusy(false);}
    }
    async function handle(action){
      if(busy)return;
      if(action==='open')return show();
      if(action==='signin-tab'||action==='signup-tab')return showAuth(action==='signup-tab'?'signup':'signin');
      if(action==='export')return exportSave();
      if(action==='password')return showPassword();
      if(action==='logout-confirm')return modal('ログアウトしますか？','ログアウトするとゲストの部活に戻ります。',`<p>このアカウントの端末内セーブは残ります。${sync.getStatus().pending?'まだクラウドに保存されていない進行があります。別の端末で続ける前に同期してください。':'次回も同じIDでログインして続きを遊べます。'}</p>`,`<button class="btn" data-account-action="open">戻る</button><button class="btn green" data-account-action="logout">ログアウトする</button>`);
      setBusy(true);
      try{
        if(action==='logout'){await cloud.signOut();await sync.init();closeModal();toast('ログアウトしました。ゲストの部活に戻りました。');}
        else if(action==='sync'){const ok=await sync.flush();showAccount();if(ok)toast('クラウドに保存しました。');}
        else if(action==='use-local'||action==='use-remote'){const ok=await (action==='use-local'?sync.selectLocal():sync.selectRemote());if(ok){closeModal();toast('この進行で再開します。');}else showAccount();}
      }catch(error){errorMessage(error);}finally{setBusy(false);}
    }
    document.addEventListener('click',event=>{const target=event.target.closest('[data-account-action]');if(target&&!target.disabled){event.preventDefault();void handle(target.dataset.accountAction);}});
    document.addEventListener('submit',event=>{if(event.target.id==='account-form'){event.preventDefault();void submitAuth(event.target);}else if(event.target.id==='password-form'){event.preventDefault();void submitPassword(event.target);}});
    return {barHTML,settingsHTML,update,show,isBlocked,statusText};
  }
})(typeof globalThis!=='undefined'?globalThis:this);
