/* One uninterrupted camera move over the live homepage surface. */
const HomeIntro=(()=>{
  const root=document.getElementById('homeIntro'),skip=document.getElementById('homeIntroSkip'),hint=document.getElementById('homeIntroHint');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),SESSION_KEY='minxing.home-intro.constellation-v1';
  const clamp=n=>Math.max(0,Math.min(1,n)),ease=n=>{n=clamp(n);return n*n*(3-2*n);};
  let active=false,played=false,frame=0,startAt=0,readyDeadline=0,elapsed=0,duration=7.6,mode='full',previousInert=[],priorFocus=null,callback=null;
  let pointerX=0,pointerY=0;
  const readSeen=()=>{try{return localStorage.getItem(SESSION_KEY)==='1';}catch{return played;}};
  function markSeen(){played=true;try{localStorage.setItem(SESSION_KEY,'1');}catch{}}
  function finish({reason='skip',restoreFocus=true}={}){
    const wasActive=active;active=false;cancelAnimationFrame(frame);
    EntryConstellation.clear();HomeLifeVisual.setEntryBridge(false);HomeLifeVisual.setJourney(1);root.hidden=true;root.dataset.phase='finished';
    for(const [element,value]of previousInert)element.inert=value;previousInert=[];
    document.body.classList.remove('home-intro-playing','home-intro-preparing');
    for(const name of ['--entry-nav','--entry-title','--entry-actions','--entry-details','--entry-world'])document.body.style.removeProperty(name);
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
    const returning=mode==='return',growth=ease((p-.74)/.26);
    const journey=returning?.84+.16*p:.60+.40*growth;
    HomeLifeVisual.setJourney(journey);HomeLifeVisual.setEntryBridge(!returning,growth);HomeLifeVisual.setActive(returning||p>=.70);
    root.style.setProperty('--journey',p.toFixed(4));root.dataset.progress=p.toFixed(4);
    root.style.setProperty('--entry-veil',returning?'0':(1-ease((p-.73)/.25)).toFixed(4));
    document.body.style.setProperty('--entry-world',returning?'1':ease((p-.72)/.16).toFixed(4));
    const phase=p<.28?'drift':p<.52?'connect':p<.74?'gather':p<.88?'germinate':'arrive';
    const ranges={drift:[.04,.13,.23,.28],connect:[.28,.34,.46,.52],gather:[.52,.57,.68,.74]};
    const r=ranges[phase];
    root.style.setProperty('--entry-copy',returning||!r?'0':(ease((p-r[0])/(r[1]-r[0]))*(1-ease((p-r[2])/(r[3]-r[2])))).toFixed(4));
    root.style.setProperty('--entry-ui',(1-ease((p-.79)/.14)).toFixed(4));
    if(!returning){
      const target=HomeLifeVisual.state.entryAnchor;
      EntryConstellation.render(p,target,{pointerX,pointerY});
      const anchor=EntryConstellation.state.anchor||target;
      root.style.setProperty('--core-x',anchor.x+'px');root.style.setProperty('--core-y',anchor.y+'px');
    }
    root.style.setProperty('--core-label',returning?'0':(ease((p-.55)/.06)*(1-ease((p-.69)/.07))).toFixed(4));
    for(const [name,start,end]of [['nav',.87,.97],['title',.89,.99],['actions',.92,1],['details',.97,1]]){
      const value=returning?ease((p-.12)/.88):ease((p-start)/(end-start));
      document.body.style.setProperty('--entry-'+name,value.toFixed(4));
    }
    if(root.dataset.phase!==phase){
      root.dataset.phase=phase;
      const copy={drift:['每一点微光，都是一次发现。','让万千好奇，在此相遇。'],connect:['让好奇，彼此连接。','不同的发现，生长出新的理解。'],gather:['万千灵感，汇成萤萤。','你的 AI 伙伴，和你一起探索。']};
      if(copy[phase]){document.getElementById('homeIntroTitle').textContent=copy[phase][0];document.getElementById('homeIntroDescription').textContent=copy[phase][1];}
      hint.textContent=returning?'欢迎回来，生命仍在生长':({drift:'移动鼠标，穿行微光之间',connect:'从星星点点，到彼此相连',gather:'萤萤，与你相遇',germinate:'让一个问题，生长成一个世界',arrive:'把好奇，养成生命。'})[phase];
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
    mode=!force&&(played||readSeen())?'return':'full';duration=mode==='return'?1.1:7.6;
    if(mode==='full'&&!EntryConstellation.init(document.getElementById('homeConstellation'))){mode='return';duration=1.1;}
    priorFocus=document.activeElement;active=true;elapsed=0;startAt=0;readyDeadline=performance.now()+6000;
    document.getElementById('homePage').scrollTop=0;
    document.body.classList.add('home-intro-playing');root.hidden=false;root.dataset.mode=mode;root.dataset.phase='preparing';
    root.style.setProperty('--entry-copy','0');root.style.setProperty('--entry-ui','1');root.style.setProperty('--core-label','0');root.style.setProperty('--entry-veil',mode==='return'?'0':'1');
    pointerX=pointerY=0;document.body.style.setProperty('--entry-world',mode==='return'?'1':'0');
    for(const name of ['nav','title','actions','details'])document.body.style.setProperty('--entry-'+name,'0');
    HomeLifeVisual.setScrollProgress(0);HomeLifeVisual.setEntryBridge(mode==='full',0);HomeLifeVisual.setJourney(mode==='return'?.84:.60);HomeLifeVisual.setActive(true);
    previousInert=Array.from(document.body.children).filter(node=>node!==root&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>[node,node.inert]);
    for(const [element]of previousInert)element.inert=true;
    root.focus({preventScroll:true});frame=requestAnimationFrame(tick);return true;
  }
  root.addEventListener('pointermove',event=>{pointerX=(event.clientX/innerWidth-.5)*2;pointerY=(event.clientY/innerHeight-.5)*2;},{passive:true});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();finish({reason:'escape'});}else if(event.key==='Tab'){event.preventDefault();skip.focus();}});
  document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)finish({reason:'hidden',restoreFocus:false});});
  reduced.addEventListener?.('change',()=>{if(reduced.matches&&active)finish({reason:'reduced-motion'});});
  const api={start,finish,get active(){return active;},get progress(){return clamp(elapsed/duration);},get mode(){return mode;},get visual(){return EntryConstellation.state;},get duration(){return duration;},get shouldPlay(){return !reduced.matches;},sessionKey:SESSION_KEY};
  window.__homeIntro=api;return api;
})();
