(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(root);
  else root.TrackCloud=factory(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  // These are public browser credentials. Database permissions are enforced by RLS.
  const PROJECT_URL='https://jzjzjoabrqqijbynnkwa.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_ixqRTBAVrQ_3QWwt-Phuog_U2hugcaz';
  const EMAIL_DOMAIN='id.taf-game.invalid';
  const CONTACT_EMAIL='rkoto2810@gmail.com';
  const AUTH_STORAGE_KEY='taf-game-auth-v1';
  const MAX_SAVE_BYTES=20*1024*1024;

  class CloudError extends Error{
    constructor(code,message){super(message);this.name='CloudError';this.code=code;}
  }
  const failure=(code,message)=>new CloudError(code,message);
  function normalizeId(value){
    const id=String(value||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{4,20}$/.test(id))throw failure('invalid_id','IDは半角英小文字・数字・_ の4〜20文字で入力してください。');
    return id;
  }
  function validatePassword(value,creating=true){
    if(typeof value!=='string'||value.length<(creating?8:1)||value.length>128)
      throw failure('weak_password',creating?'パスワードは8〜128文字で入力してください。':'パスワードを入力してください。');
    return value;
  }
  function userInfo(user){
    if(!user||typeof user.id!=='string'||!user.id)return null;
    const match=String(user.email||'').toLowerCase().match(/^([a-z0-9_]{4,20})@id\.taf-game\.invalid$/);
    return match?{id:user.id,loginId:match[1]}:null;
  }
  function mapError(error){
    if(error instanceof CloudError)return error;
    const code=String(error&&error.code||'');
    const message=String(error&&error.message||'');
    if(message.includes('TAF_SAVE_CONFLICT'))return failure('conflict','別の端末で進行が更新されています。クラウドのセーブを確認してから再開してください。');
    if(message.includes('TAF_AUTH_REQUIRED')||code==='PGRST301'||code==='bad_jwt'||code==='session_not_found'||code==='refresh_token_not_found')return failure('auth','ログインの有効期限が切れました。もう一度ログインしてください。');
    if(message.includes('TAF_INVALID_SAVE')||message.includes('TAF_INVALID_REVISION'))return failure('invalid_save','セーブデータを確認できませんでした。端末のデータを保持しています。');
    if(['42P01','42883','PGRST202','PGRST205'].includes(code))return failure('setup','クラウド保存の準備がまだ完了していません。主催者にお問い合わせください。');
    if(code==='user_already_exists'||code==='email_exists'||/already registered/i.test(message))return failure('id_taken','このIDはすでに使われています。別のIDを選んでください。');
    if(code==='invalid_credentials'||/invalid login credentials/i.test(message))return failure('credentials','IDまたはパスワードが違います。忘れた場合は主催者にお問い合わせください。');
    if(code==='email_not_confirmed')return failure('confirmation_required','このIDはメール確認待ちになっています。主催者にお問い合わせください。');
    if(code==='signup_disabled'||code==='email_provider_disabled')return failure('signup_disabled','現在、新規登録は受け付けていません。主催者にお問い合わせください。');
    if(code==='weak_password'||/password.*(?:short|weak|characters)/i.test(message))return failure('weak_password','パスワードが短すぎるか安全性が不足しています。長めの別のパスワードを入力してください。');
    if(code==='same_password')return failure('same_password','現在と異なるパスワードを入力してください。');
    if(code==='over_request_rate_limit'||code==='over_email_send_rate_limit'||error&&error.status===429)return failure('rate_limit','操作が続いたため少し待つ必要があります。しばらくしてからもう一度お試しください。');
    if(code==='reauthentication_needed'||code==='reauthentication_not_valid')return failure('reauthentication','パスワード変更には再ログインが必要です。一度ログアウトしてからログインしてください。');
    if(code==='23505')return failure('id_taken','このIDはすでに使われています。別のIDを選んでください。');
    if(code==='42501')return failure('setup','クラウド保存の権限を確認できません。主催者にお問い合わせください。');
    if(error&&error.status===401)return failure('auth','ログインを確認できません。もう一度ログインしてください。');
    if(code==='unexpected_failure'||code==='database_error'||/database error/i.test(message))return failure('setup','アカウントの準備を完了できませんでした。主催者にお問い合わせください。');
    return failure('network','接続できませんでした。通信環境を確認してからもう一度お試しください。端末のセーブは保持されています。');
  }

  function create(options={}){
    const url=String(options.url||PROJECT_URL).replace(/\/$/,'');
    const publishableKey=options.publishableKey||PUBLISHABLE_KEY;
    const fetcher=options.fetch||root.fetch&&root.fetch.bind(root);
    const sdk=options.sdk||root.supabase;
    const timeoutMs=options.timeoutMs||15000;
    // Full meet histories can exceed 5 MB. Keep authentication responsive while
    // allowing a bounded, longer transfer window for cloud saves and downloads.
    const saveTimeoutMs=options.saveTimeoutMs||options.timeoutMs||60000;
    const subscribers=new Set();
    let client=options.client||null,subscription=null,disposed=false,epoch=0,initializing=null;
    let status={ready:false,configured:false,user:null,error:null,authSettingsChecked:false,emailConfirmationRequired:null,signupAllowed:null};
    function getStatus(){return {...status,user:status.user&&{...status.user},error:status.error&&{...status.error}};}
    function emit(event){
      if(disposed)return;
      const value=getStatus();
      for(const fn of subscribers){try{fn(value,event);}catch{/* UI observers cannot interrupt auth lifecycle. */}}
      if(typeof options.onAuthChange==='function'){try{options.onAuthChange(value,event);}catch{}}
    }
    function setUser(user,event,deferNotification=false){
      if((status.user&&status.user.id)!==(user&&user.id))epoch++;
      status.user=user;
      // Identity changes are visible immediately to in-flight request guards;
      // observers run later when this update originates inside the SDK lock.
      if(deferNotification)setTimeout(()=>emit(event),0);else emit(event);
    }
    function recordError(error){
      const mapped=mapError(error);status.error={code:mapped.code,message:mapped.message};emit('ERROR');return mapped;
    }
    function assertAvailable(){
      if(disposed)throw failure('disposed','クラウド接続を終了しています。画面を再読み込みしてください。');
      if(!client||!fetcher)throw failure('config','ログイン機能を読み込めませんでした。画面を再読み込みしてください。');
    }
    async function timedFetch(input,init={}){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      const abort=()=>controller.abort();
      if(init.signal){if(init.signal.aborted)controller.abort();else init.signal.addEventListener('abort',abort,{once:true});}
      try{return await fetcher(input,{...init,signal:controller.signal});}
      finally{clearTimeout(timer);if(init.signal)init.signal.removeEventListener('abort',abort);}
    }
    async function request(path,{method='GET',body,accessToken,deadlineMs=timeoutMs}={}){
      assertAvailable();
      const headers={apikey:publishableKey,Accept:'application/json'};
      if(accessToken)headers.Authorization='Bearer '+accessToken;
      if(body!==undefined)headers['Content-Type']='application/json';
      const controller=new AbortController();let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('network','通信が完了しませんでした。接続を確認してからもう一度お試しください。'));},deadlineMs);});
      const work=(async()=>{
        const response=await fetcher(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
        let data;
        try{data=await response.json();}catch{throw failure('network','サーバーの応答を読み込めませんでした。少し待ってからもう一度お試しください。');}
        if(!response.ok)throw mapError({...data,status:response.status});
        return data;
      })();
      // Headers can arrive while a long save body stalls. Keep the deadline in
      // force until JSON is fully read, not just until fetch resolves headers.
      try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);}
    }
    function checkIdentity(id,atEpoch){
      if(disposed||epoch!==atEpoch||!status.user||status.user.id!==id)
        throw failure('auth_changed','ログイン中のアカウントが変わりました。セーブの同期を停止しました。');
    }
    async function snapshot(expectedUserId){
      assertAvailable();
      const id=expectedUserId||status.user&&status.user.id,atEpoch=epoch;
      if(!id||!status.user)throw failure('auth','クラウド保存を使うにはログインしてください。');
      checkIdentity(id,atEpoch);
      const sessionResult=await client.auth.getSession();
      if(sessionResult.error)throw sessionResult.error;
      checkIdentity(id,atEpoch);
      const session=sessionResult.data&&sessionResult.data.session;
      if(!session||!session.access_token)throw failure('auth','ログインの有効期限が切れました。もう一度ログインしてください。');
      if(!session.user||session.user.id!==id)throw failure('auth_changed','アカウントが変わりました。画面を再読み込みしてください。');
      // Verify the exact token used below, rather than trusting localStorage data.
      const verified=await client.auth.getUser(session.access_token);
      if(verified.error)throw verified.error;
      checkIdentity(id,atEpoch);
      const user=userInfo(verified.data&&verified.data.user);
      if(!user||user.id!==id)throw failure('auth_changed','アカウントを確認できませんでした。もう一度ログインしてください。');
      return {id,atEpoch,accessToken:session.access_token};
    }
    async function operation(fn){
      try{const result=await fn();status.error=null;return result;}
      catch(error){throw recordError(error);}
    }
    async function checkAuthSettings(){
      const settings=await request('/auth/v1/settings');
      status.authSettingsChecked=true;
      status.emailConfirmationRequired=settings.mailer_autoconfirm!==true;
      status.signupAllowed=settings.disable_signup!==true&&settings.external&&settings.external.email===true;
      emit('SETTINGS');
      return settings;
    }
    function init(){
      if(initializing)return initializing;
      initializing=(async()=>{
        try{
          assertAvailable();
          if(!subscription){
            const result=client.auth.onAuthStateChange((event,session)=>{
              // Supabase invokes observers while holding its session lock. Do not
              // await SDK calls here; notify the UI after that lock is released.
              if(!disposed)setUser(userInfo(session&&session.user),event,true);
            });
            subscription=result.data&&result.data.subscription;
          }
          const result=await client.auth.getSession();
          if(result.error)throw result.error;
          const session=result.data&&result.data.session;
          if(session){
            const atEpoch=epoch;
            const verified=await client.auth.getUser(session.access_token);
            if(verified.error)throw verified.error;
            const user=userInfo(verified.data&&verified.data.user);
            if(!user)throw failure('auth','このゲーム用のIDでログインしてください。');
            if(epoch!==atEpoch&&(!status.user||status.user.id!==user.id))
              throw failure('auth_changed','ログイン中のアカウントが変わりました。もう一度状態を確認してください。');
            setUser(user,'INITIAL_SESSION');
          }else setUser(null,'INITIAL_SESSION');
          // Registration settings are checked again immediately before signup.
          try{await checkAuthSettings();}catch(error){recordError(error);}
        }catch(error){recordError(error);}
        status.ready=true;emit('READY');return getStatus();
      })();
      return initializing;
    }
    async function signUp(id,password){
      return operation(async()=>{
        assertAvailable();const loginId=normalizeId(id);validatePassword(password);
        if(status.user)throw failure('already_signed_in','新しいIDを作る前にログアウトしてください。');
        await checkAuthSettings();
        if(!status.signupAllowed)throw failure('signup_disabled','現在、新規登録は受け付けていません。主催者にお問い合わせください。');
        if(status.emailConfirmationRequired)throw failure('confirmation_required','主催者によるメール確認なしの設定がまだ完了していません。設定が終わるまで新規登録をお待ちください。');
        const result=await client.auth.signUp({email:loginId+'@'+EMAIL_DOMAIN,password,options:{data:{login_id:loginId}}});
        if(result.error)throw result.error;
        if(!result.data||!result.data.session)throw failure('confirmation_required','登録を完了できませんでした。主催者にアカウントの確認を依頼してください。');
        const user=userInfo(result.data.user||result.data.session.user);
        if(!user||user.loginId!==loginId)throw failure('auth','作成したIDを確認できませんでした。主催者にお問い合わせください。');
        setUser(user,'SIGNED_IN');return {...user};
      });
    }
    async function signIn(id,password){
      return operation(async()=>{
        assertAvailable();const loginId=normalizeId(id);validatePassword(password,false);
        if(status.user)throw failure('already_signed_in','別のIDでログインする前にログアウトしてください。');
        const result=await client.auth.signInWithPassword({email:loginId+'@'+EMAIL_DOMAIN,password});
        if(result.error)throw result.error;
        const user=userInfo(result.data&&result.data.user);
        if(!user||user.loginId!==loginId||!result.data.session)throw failure('auth','ログインを確認できませんでした。もう一度お試しください。');
        setUser(user,'SIGNED_IN');return {...user};
      });
    }
    async function signOut(){
      return operation(async()=>{
        assertAvailable();const result=await client.auth.signOut({scope:'local'});
        if(result.error)throw result.error;
        setUser(null,'SIGNED_OUT');return true;
      });
    }
    async function changePassword(password){
      return operation(async()=>{
        validatePassword(password);const context=await snapshot();
        // Use the same verified token even if another tab switches accounts.
        const result=await request('/auth/v1/user',{method:'PUT',body:{password},accessToken:context.accessToken});
        checkIdentity(context.id,context.atEpoch);
        if(!result||result.id!==context.id)throw failure('auth_changed','アカウントが変わったため変更を確認できませんでした。再ログインしてください。');
        return true;
      });
    }
    function parseMetadata(row){
      if(!row||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))
        throw failure('invalid_save','クラウドの保存情報を確認できませんでした。端末のデータを保持しています。');
      return {revision:row.revision,updatedAt:row.updated_at};
    }
    function validateSave(data){
      if(!data||Array.isArray(data)||typeof data!=='object'||data.version!==2||options.validate&&!options.validate(data))
        throw failure('invalid_save','セーブデータの形式が正しくありません。');
    }
    async function load(expectedUserId){
      return operation(async()=>{
        const context=await snapshot(expectedUserId);
        const rows=await request('/rest/v1/taf_saves?select=user_id,payload,revision,updated_at&user_id=eq.'+encodeURIComponent(context.id)+'&limit=1',{accessToken:context.accessToken,deadlineMs:saveTimeoutMs});
        checkIdentity(context.id,context.atEpoch);
        if(!Array.isArray(rows)||rows.length>1)throw failure('invalid_save','クラウドの応答が正しくありません。');
        if(rows.length===0)return null;
        const row=rows[0];
        if(row.user_id!==context.id)throw failure('auth_changed','別のアカウントのセーブは読み込めません。');
        validateSave(row.payload);
        return {data:row.payload,...parseMetadata(row)};
      });
    }
    async function save(data,expectedRevision=0,expectedUserId){
      // Freeze the state before the first await: training can continue while a
      // previous snapshot is uploading, without changing that snapshot midway.
      let payload;
      try{
        validateSave(data);
        if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw failure('invalid_save','クラウドの保存世代が正しくありません。');
        const json=JSON.stringify(data);
        const bytes=typeof TextEncoder==='function'?new TextEncoder().encode(json).length:new Blob([json]).size;
        if(bytes>MAX_SAVE_BYTES)throw failure('save_too_large','セーブが20MBを超えています。設定からファイルに書き出して保管してください。');
        payload=JSON.parse(json);
      }catch(error){throw recordError(error);}
      return operation(async()=>{
        const context=await snapshot(expectedUserId);
        const result=await request('/rest/v1/rpc/taf_save_game',{method:'POST',body:{p_payload:payload,p_expected_revision:expectedRevision},accessToken:context.accessToken,deadlineMs:saveTimeoutMs});
        checkIdentity(context.id,context.atEpoch);
        const metadata=parseMetadata(result);
        if(metadata.revision!==expectedRevision+1)throw failure('invalid_save','クラウドの保存世代を確認できませんでした。再読み込みして確認してください。');
        return metadata;
      });
    }
    function subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);}
    function dispose(){disposed=true;epoch++;if(subscription)subscription.unsubscribe();subscribers.clear();}
    try{
      if(!client&&sdk&&typeof sdk.createClient==='function'&&fetcher)
        client=sdk.createClient(url,publishableKey,{auth:{storageKey:AUTH_STORAGE_KEY,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:timedFetch}});
      status.configured=!!(client&&fetcher);
    }catch(error){status.error={code:'config',message:'ログイン機能を読み込めませんでした。画面を再読み込みしてください。'};}
    return {init,getStatus,subscribe,signUp,signIn,signOut,changePassword,load,save,checkAuthSettings,dispose};
  }
  return {PROJECT_URL,PUBLISHABLE_KEY,EMAIL_DOMAIN,CONTACT_EMAIL,AUTH_STORAGE_KEY,MAX_SAVE_BYTES,CloudError,normalizeId,create};
});
