/* A short illustrative entry. The same visual stays with the home assistant. */
const HomeIntro=(()=>{
  const root=document.getElementById('homeIntro'),skip=document.getElementById('homeIntroSkip'),hint=document.getElementById('homeIntroHint');
  const copy=root.querySelector('.home-intro-copy'),visual=document.getElementById('homeLifeCanvas');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),SESSION_KEY='minxing.home-intro.colony-c2';
  let active=false,played=false,frame=0,startAt=0,elapsed=0,previousInert=[],priorFocus=null,callback=null,revealed=false;
  const readSeen=()=>{try{return sessionStorage.getItem(SESSION_KEY)==='1';}catch{return played;}};
  function markSeen(){played=true;try{sessionStorage.setItem(SESSION_KEY,'1');}catch{}}
  function mountHome(){
    const mount=document.getElementById('homeLifeMount');
    if(visual.parentElement!==mount)mount.append(visual);
    HomeLifeVisual.setJourney(1);HomeLifeVisual.resize();
  }
  function finish({reason='skip',restoreFocus=true}={}){
    const wasActive=active;active=false;cancelAnimationFrame(frame);mountHome();
    root.hidden=true;root.classList.remove('is-leaving');root.dataset.phase='finished';markSeen();
    for(const [element,value]of previousInert)element.inert=value;previousInert=[];
    document.body.classList.remove('home-intro-playing');
    HomeLifeVisual.setActive(appRoute==='home'&&!document.hidden);
    if(wasActive&&restoreFocus){
      const visible=node=>node?.isConnected&&node.getClientRects().length&&!node.closest('[hidden],[inert]');
      const target=visible(priorFocus)&&priorFocus!==document.body&&!root.contains(priorFocus)?priorFocus:document.querySelector('[data-home-intro-focus]');
      if(visible(target))target.focus({preventScroll:true});else if(root.contains(document.activeElement))document.activeElement.blur();
    }
    const done=callback;callback=null;if(done)done({reason});
    document.dispatchEvent(new CustomEvent('home-intro-finished',{detail:{reason}}));
  }
  function tick(now){
    if(!active)return;elapsed=(now-startAt)/1000;
    const journey=Math.min(1,elapsed/2.4);HomeLifeVisual.setJourney(journey);root.style.setProperty('--journey',journey);
    root.dataset.progress=String(Math.min(1,elapsed/3));
    root.dataset.phase=elapsed<.85?'close-up':elapsed<2.4?'pulling-back':'revealing';
    hint.textContent=elapsed<1.3?'沿着细密的菌丝，靠近一点':'把好奇，养成生命。';
    if(elapsed>.18&&elapsed<1.85){copy.style.opacity='1';copy.style.transform='translateY(0)';}
    if(elapsed>=1.85){copy.style.opacity='0';copy.style.transform='translateY(-7px)';}
    if(elapsed>=2.4&&!revealed){revealed=true;mountHome();root.classList.add('is-leaving');}
    if(elapsed>=3)return finish({reason:'complete'});
    frame=requestAnimationFrame(tick);
  }
  function start({force=false,onFinish=null}={}){
    if(active)finish({reason:'restart',restoreFocus:false});callback=onFinish;
    if(reduced.matches){finish({reason:'reduced-motion',restoreFocus:false});return false;}
    if(!force&&(played||readSeen()||root.dataset.skipped==='true')){finish({reason:'seen',restoreFocus:false});return false;}
    priorFocus=document.activeElement;root.hidden=false;root.classList.remove('is-leaving');copy.style.opacity='0';copy.style.transform='translateY(7px)';
    active=true;revealed=false;elapsed=0;root.dataset.phase='arrival';root.dataset.progress='0';
    document.getElementById('homeIntroVisualMount').append(visual);HomeLifeVisual.resize();HomeLifeVisual.setJourney(0);HomeLifeVisual.setActive(true);
    previousInert=Array.from(document.body.children).filter(node=>node!==root&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>[node,node.inert]);
    for(const [element]of previousInert)element.inert=true;
    document.body.classList.add('home-intro-playing');skip.focus({preventScroll:true});startAt=performance.now();frame=requestAnimationFrame(tick);return true;
  }
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();finish({reason:'escape'});}else if(event.key==='Tab'){event.preventDefault();skip.focus();}});
  document.addEventListener('visibilitychange',()=>{if(active&&document.hidden)finish({reason:'hidden',restoreFocus:false});});
  reduced.addEventListener?.('change',()=>{if(reduced.matches&&active)finish({reason:'reduced-motion'});});
  const api={start,finish,get active(){return active;},get progress(){return Math.min(1,elapsed/3);},get shouldPlay(){return !played&&!readSeen()&&!reduced.matches;},sessionKey:SESSION_KEY};
  window.__homeIntro=api;return api;
})();
