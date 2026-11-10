/* Minimal product metrics. This script runs before WebGL so failed boots still count as opens. */
(() => {
  'use strict';
  const ENDPOINT='https://minxing-ai.190782129-44b.workers.dev/api/analytics/events';
  const VISITOR_KEY='minxing.analytics.visitor.v1',PREFERENCE_KEY='minxing.analytics.preference.v1';
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const production=location.origin==='https://buu206.github.io'&&location.pathname.startsWith('/minxing/');
  const privacySignal=navigator.globalPrivacyControl===true;
  let storageAvailable=true,excluded=false,visitorId=null,sessionId=null,opened=false,entered=false,entryDetail=null;
  const retries=new Set(),requests=new Set();
  function read(key){try{return localStorage.getItem(key);}catch{storageAvailable=false;return null;}}
  function write(key,value){try{localStorage.setItem(key,value);return true;}catch{storageAvailable=false;return false;}}
  function uuid(){
    try{
      if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
      const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const s=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);
    }catch{return null;}
  }
  excluded=read(PREFERENCE_KEY)==='off';
  try{
    const url=new URL(location.href),preference=url.searchParams.get('analytics');
    if(preference==='off'||preference==='on'){
      excluded=preference==='off';write(PREFERENCE_KEY,preference);
      // A developer's exclusion URL must not accidentally exclude everyone they share it with.
      url.searchParams.delete('analytics');history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    }
  }catch{}
  function enabled(){return production&&!excluded&&!privacySignal;}
  function identity(){
    if(!enabled())return null;
    if(!visitorId){const stored=read(VISITOR_KEY);visitorId=UUID.test(stored||'')?stored:uuid();if(visitorId&&visitorId!==stored)write(VISITOR_KEY,visitorId);}
    sessionId||=uuid();const eventId=uuid();
    return visitorId&&sessionId&&eventId?{visitorId,sessionId,eventId}:null;
  }
  function send(event,attempt=0){
    if(!enabled())return;
    let controller,timeout;
    try{
      controller=new AbortController();requests.add(controller);
      timeout=setTimeout(()=>controller.abort(),5000);
      Promise.resolve(fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,signal:controller.signal,body:JSON.stringify({events:[event]})}))
        .then(response=>{if(response.status>=500)throw new Error('analytics unavailable');})
        .catch(()=>{
          if(!enabled()||attempt!==0||retries.size>=5)return;
          const timer=setTimeout(()=>{retries.delete(timer);send(event,1);},1500);retries.add(timer);
        })
        .finally(()=>{clearTimeout(timeout);requests.delete(controller);});
    }catch{clearTimeout(timeout);if(controller)requests.delete(controller);}
  }
  function track(type,detail){
    if(!['page_open','home_entered','culture_started'].includes(type))return false;
    const ids=identity();if(!ids)return false;
    const event={...ids,type};
    if(type==='home_entered'&&['completed','skipped','reduced'].includes(detail))event.detail=detail;
    send(event);return true;
  }
  function open(){if(!opened&&enabled())opened=track('page_open');}
  function enter(){
    const home=document.getElementById('homePage');
    if(entered||!entryDetail||document.hidden||!home||home.hidden||home.inert)return;
    if(enabled()){open();entered=track('home_entered',entryDetail);}
  }
  function render(){
    const button=document.getElementById('homeAnalyticsToggle'),status=document.getElementById('homeAnalyticsStatus');
    if(!button||!status)return;
    button.disabled=!production||privacySignal;
    button.textContent=enabled()?'关闭使用统计':'开启使用统计';
    button.setAttribute('aria-pressed',String(enabled()));
    status.textContent=!production?'本地预览不记录使用统计。':privacySignal?'已遵循浏览器隐私设置，关闭使用统计。':enabled()?(storageAvailable?'使用统计已开启；同一浏览器按随机编号去重。':'使用统计仅使用本页临时编号，浏览器未允许保存编号。'):(storageAvailable?'此浏览器已关闭使用统计。':'本页已关闭使用统计；浏览器未允许保存设置。');
  }
  function setEnabled(value){
    excluded=!value;write(PREFERENCE_KEY,value?'on':'off');
    if(!enabled()){
      for(const timer of retries)clearTimeout(timer);retries.clear();
      for(const controller of requests)controller.abort();requests.clear();
    }else{open();enter();}
    render();
  }
  document.addEventListener('home-intro-finished',event=>{
    const reason=event.detail?.reason;
    if(reason==='route'||reason==='restart')return;
    entryDetail=reason==='reduced-motion'?'reduced':['skip','escape','hidden'].includes(reason)?'skipped':'completed';
    enter();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)enter();});
  window.addEventListener('storage',event=>{
    if(event.key!==PREFERENCE_KEY)return;
    excluded=event.newValue==='off';
    if(!enabled()){
      for(const timer of retries)clearTimeout(timer);retries.clear();
      for(const controller of requests)controller.abort();requests.clear();
    }else{open();enter();}
    render();
  });
  const button=document.getElementById('homeAnalyticsToggle');
  if(button)button.addEventListener('click',()=>setEnabled(!enabled()));
  window.HomeAnalytics={context:identity,track,setEnabled,get enabled(){return enabled();}};
  render();open();
})();
