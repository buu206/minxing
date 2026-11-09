/* One uninterrupted camera move over the live homepage surface. */
const HomeIntro=(()=>{
  const root=document.getElementById('homeIntro'),skip=document.getElementById('homeIntroSkip'),hint=document.getElementById('homeIntroHint');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),SESSION_KEY='minxing.home-intro.awakening-v1';
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{n=clamp(n);return n*n*(3-2*n);};
  let active=false,played=false,frame=0,startAt=0,readyDeadline=0,elapsed=0,duration=4,mode='full',previousInert=[],priorFocus=null,callback=null;
  const readSeen=()=>{try{return localStorage.getItem(SESSION_KEY)==='1';}catch{return played;}};
  function markSeen(){played=true;try{localStorage.setItem(SESSION_KEY,'1');}catch{}}
  function finish({reason='skip',restoreFocus=true}={}){
    const wasActive=active;active=false;cancelAnimationFrame(frame);
    HomeLifeVisual.setJourney(1);root.hidden=true;root.dataset.phase='finished';
    for(const [element,value]of previousInert)element.inert=value;previousInert=[];
    document.body.classList.remove('home-intro-playing','home-intro-preparing');
    for(const name of ['--entry-nav','--entry-title','--entry-actions','--entry-details'])document.body.style.removeProperty(name);
    if(wasActive||reason==='reduced-motion')markSeen();
    HomeLifeVisual.setActive(appRoute==='home'&&!document.hidden);
    if(wasActive&&restoreFocus){
      const visible=node=>node?.isConnected&&node.getClientRects().length&&!node.closest('[hidden],[inert]');
      const target=visible(priorFocus)&&priorFocus!==document.body&&!root.contains(priorFocus)?priorFocus:document.querySelector('[data-home-intro-focus]');
      if(visible(target))target.focus({preventScroll:true});else if(root.contains(document.activeElement))document.activeElement.blur();
    }
    const done=callback;callback=null;if(done)done({reason});
    document.dispatchEvent(new CustomEvent('home-intro-finished',{detail:{reason}}));
  }
  function render(p){
    // Returning visitors see only the final camera settle, never the full opening.
    const journey=mode==='return'?.78+.22*p:p;HomeLifeVisual.setJourney(journey);
    root.style.setProperty('--journey',p.toFixed(4));root.dataset.progress=p.toFixed(4);
    const copy=mode==='return'?0:ease((p-.06)/.16)*(1-ease((p-.48)/.16));
    root.style.setProperty('--entry-copy',copy.toFixed(4));
    root.style.setProperty('--entry-ui',(1-ease((p-.65)/.2)).toFixed(4));
    for(const [name,start,end]of [['nav',.64,.84],['title',.70,.91],['actions',.79,1],['details',.86,1]]){
      const value=mode==='return'?ease((p-.12)/.88):ease((p-start)/(end-start));
      document.body.style.setProperty('--entry-'+name,value.toFixed(4));
    }
    const phase=p<.28?'spark':p<.65?'bloom':'arrive';
    if(root.dataset.phase!==phase){
      root.dataset.phase=phase;
      hint.textContent=mode==='return'?'欢迎回来，生命仍在生长':({spark:'一束微光，唤醒好奇',bloom:'沿着菌丝，看见生长',arrive:'和萤萤一起，走进微观世界'})[phase];
    }
  }
  function tick(now){
    if(!active)return;
    if(!startAt){
      const visual=HomeLifeVisual.state;
      if(!visual.loaded&&!visual.failed&&now<readyDeadline){frame=requestAnimationFrame(tick);return;}
      if(visual.failed||!visual.loaded)return finish({reason:'visual-unavailable',restoreFocus:false});
      startAt=now;document.body.classList.remove('home-intro-preparing');render(0);
    }
    elapsed=(now-startAt)/1000;const p=clamp(elapsed/duration);render(p);
    if(p>=1)return finish({reason:'complete'});
    frame=requestAnimationFrame(tick);
  }
  function start({force=false,onFinish=null}={}){
    if(active)finish({reason:'restart',restoreFocus:false});callback=onFinish;
    if(reduced.matches){finish({reason:'reduced-motion',restoreFocus:false});return false;}
    if(root.dataset.skipped==='true'&&!force){finish({reason:'skip',restoreFocus:false});return false;}
    mode=!force&&(played||readSeen())?'return':'full';duration=mode==='return'?1.05:4;
    priorFocus=document.activeElement;active=true;elapsed=0;startAt=0;readyDeadline=performance.now()+6000;
    document.getElementById('homePage').scrollTop=0;
    document.body.classList.add('home-intro-playing');root.hidden=false;root.dataset.mode=mode;root.dataset.phase='preparing';
    root.style.setProperty('--entry-copy','0');root.style.setProperty('--entry-ui','1');
    for(const name of ['nav','title','actions','details'])document.body.style.setProperty('--entry-'+name,'0');
    HomeLifeVisual.setScrollProgress(0);HomeLifeVisual.setJourney(mode==='return'?.78:0);HomeLifeVisual.setActive(true);
    previousInert=Array.from(document.body.children).filter(node=>node!==root&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>[node,node.inert]);
    for(const [element]of previousInert)element.inert=true;
    root.focus({preventScroll:true});frame=requestAnimationFrame(tick);return true;
  }
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();finish({reason:'escape'});}else if(event.key==='Tab'){event.preventDefault();skip.focus();}});
  document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)finish({reason:'hidden',restoreFocus:false});});
  reduced.addEventListener?.('change',()=>{if(reduced.matches&&active)finish({reason:'reduced-motion'});});
  const api={start,finish,get active(){return active;},get progress(){return clamp(elapsed/duration);},get mode(){return mode;},get duration(){return duration;},get shouldPlay(){return !reduced.matches;},sessionKey:SESSION_KEY};
  window.__homeIntro=api;return api;
})();
