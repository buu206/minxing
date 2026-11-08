const HomeLanding=(()=>{
  const page=document.getElementById('homePage'),hero=document.getElementById('homeUniverse'),observation=document.getElementById('homeObservationScene');
  const journey=document.getElementById('homeJourney'),landscape=document.getElementById('homeLifeMount'),sticky=journey.querySelector('.home-visual-sticky');
  const input=document.getElementById('homeAssistantInput'),caption=document.getElementById('homeLifeCaption'),motion=matchMedia('(prefers-reduced-motion: reduce)');
  let alignTimer=0,homeTouch=null,visualVisible=true,observationVisible=false,moodTimer=0,featured='pen',scrollFrame=0,lastProgress=0;
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),ease=n=>{n=clamp(n);return n*n*(3-2*n);};
  const sectionTop=node=>node.getBoundingClientRect().top-page.getBoundingClientRect().top+page.scrollTop;
  const idleCaption=()=>motion.matches?'从一个问题开始':matchMedia('(pointer: coarse)').matches?'轻触菌落，观察细节':'移动鼠标，观察生长的边缘';
  const scrollTo=id=>page.scrollTo({top:Math.max(0,sectionTop(document.getElementById(id))),behavior:motion.matches?'auto':'smooth'});
  function feature(id){
    const sp=SP[IDX[id]];if(!sp)return;featured=id;
    document.getElementById('homeFeaturedImage').src=appAsset(id);document.getElementById('homeFeaturedImage').alt=sp.name+'的菌落形态';
    document.getElementById('homeFeaturedName').textContent=sp.name;document.getElementById('homeFeaturedLatin').textContent=sp.latin;
    document.getElementById('homeFeaturedState').textContent=appAllLit().includes(id)?'已点亮':'待点亮';
    document.getElementById('homeFeaturedSpecimen').setAttribute('aria-label','在图鉴中查看'+sp.name);
    document.querySelector('.home-featured-index').textContent='SPECIMEN / '+String(IDX[id]+1).padStart(2,'0');
  }
  function render(){
    const own=firstRecord,summary=own?.life?Life.summary(own):null;
    document.getElementById('homeDishLabel').textContent=own?(own.name||'我的培养皿')+' · '+appMedia[own.medium||'pda'].name:'青霉 + 黑曲霉 · 展示皿';
    document.getElementById('homeLiveLabel').textContent=own?'YOUR LIVING WORLD':'DEMONSTRATION / 展示示例';
    document.getElementById('homeLifeFact').textContent=summary?summary.phase+' · 营养 '+Math.round(summary.nutrient*100)+'%':'尚未创建自己的培养记录';
    const checked=appMeta.checkins.includes(appDate());
    document.getElementById('homeHint').textContent=checked?'雾气散开了。换个角度，再看一眼。':'擦去一点雾气，和生命打个照面。';
    document.getElementById('wipeFogBtn').textContent=checked?'✓ 今日已观察':'擦开皿盖 ↗';document.getElementById('wipeFogBtn').disabled=checked;
    document.getElementById('enterCultureBtn').textContent=own?'回到我的培养室 ↗':'开始我的第一皿 ↗';
    const continueButton=document.getElementById('homeHeroContinueBtn');if(continueButton)continueButton.textContent=own?'继续我的培养':'开始我的第一皿';
    document.querySelector('.home-scene-hint').textContent=checked?'拖动旋转 · 走近生命':'擦去雾气 · 记录今日观察';
    if(document.activeElement!==input)caption.textContent=idleCaption();
    HomeAssistant.render();feature(featured);
  }
  function syncVisual(){const active=appRoute==='home'&&!document.hidden&&(HomeIntro.active||(visualVisible&&lastProgress<.999));if(HomeLifeVisual.active!==active)HomeLifeVisual.setActive(active);}
  function enter(){
    observation.prepend(canvas);resize();const target=CAMS.hero();controls.maxDistance=Math.max(34,target.p.distanceTo(target.t)*1.15);goCam('hero');
    clearTimeout(alignTimer);alignTimer=setTimeout(()=>{if(appRoute==='home')drawHomeFog();},1750);HomeLifeVisual.resize();syncVisual();updateScroll();
  }
  function leave(){
    clearTimeout(alignTimer);clearTimeout(moodTimer);
    if(homeTouch){controls.enabled=homeTouch.enabled;if(canvas.hasPointerCapture(homeTouch.id))canvas.releasePointerCapture(homeTouch.id);homeTouch=null;}
    HomeAssistant.close();HomeIntro.finish({reason:'route',restoreFocus:false});HomeLifeVisual.setActive(false);document.body.classList.remove('home-scrolled');
    document.body.prepend(canvas);resize();controls.maxDistance=34;
  }
  function replay(){HomeAssistant.close();page.scrollTop=0;updateScroll();HomeLifeVisual.setFocus('explore');HomeIntro.start({force:true});}
  function answer(){clearTimeout(moodTimer);HomeLifeVisual.setFocus('ask');HomeLifeVisual.setMood('answer');HomeLifeVisual.pulse();caption.textContent='从你的问题，开始探索';moodTimer=setTimeout(()=>HomeLifeVisual.setMood(HomeAssistant.isOpen?'listening':'idle'),2600);}
  function updateScroll(){
    scrollFrame=0;if(appRoute!=='home'||!hero.offsetHeight)return;
    const h=hero.offsetHeight,w=page.clientWidth,mobile=w<=800,p=clamp(page.scrollTop/h),q=ease(p/.72),live=ease((p-.72)/.28);
    lastProgress=p;journey.style.setProperty('--scene-height',h+'px');journey.style.setProperty('--story-progress',p.toFixed(4));
    journey.style.setProperty('--hero-ink',(1-ease(p/.35)).toFixed(4));
    journey.style.setProperty('--live-view',motion.matches||mobile?'1':live.toFixed(4));
    journey.style.setProperty('--story-caption',(ease((p-.1)/.14)*(1-ease((p-.44)/.15))).toFixed(4));
    journey.style.setProperty('--observation-ink',motion.matches||mobile?'1':ease((p-.38)/.3).toFixed(4));
    journey.style.setProperty('--observation-drift',(motion.matches?0:32*(1-ease((p-.35)/.4)))+'px');
    const heroGone=motion.matches||mobile?p>=1:p>.34;
    for(const el of [hero.querySelector('.home-main-actions'),hero.querySelector('.home-hero-foot')])el.inert=heroGone||(el.classList.contains('home-main-actions')&&HomeAssistant.isOpen);
    document.getElementById('homeMeetAI').inert=p>.34;
    observation.inert=!motion.matches&&!mobile&&live<.95;
    journey.dataset.progress=p.toFixed(4);syncVisual();
    HomeLifeVisual.setScrollProgress?.(motion.matches?0:p);
    if(motion.matches||mobile){
      landscape.style.transform='none';landscape.style.borderRadius='0';landscape.style.opacity=motion.matches?'1':String(1-ease((p-.3)/.7));
      landscape.style.setProperty('--frame-opacity','0');
    }else{
      const target=observation.getBoundingClientRect(),origin=sticky.getBoundingClientRect();
      const targetY=target.top-origin.top,settledY=targetY-(1-p)*h,follow=ease((p-.35)/.37);
      const x=(target.left-origin.left)*q,y=(settledY+(targetY-settledY)*follow)*q,sx=1+(target.width/w-1)*q,sy=1+(target.height/h-1)*q;
      landscape.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${sx.toFixed(5)},${sy.toFixed(5)})`;
      landscape.style.borderRadius=`${46*q}% ${46*q}% ${22*q}px ${22*q}px`;
      landscape.style.opacity=String(1-live);landscape.style.setProperty('--frame-opacity',String(q*.45));
    }
    document.body.classList.toggle('home-scrolled',page.scrollTop>70);
    const at=page.scrollTop+page.clientHeight*.4;let current='homeUniverse';
    for(const id of ['homeObservation','homeDiscover','homeCreate'])if(sectionTop(document.getElementById(id))<=at)current=id;
    page.querySelectorAll('[data-home-chapter]').forEach(button=>button.setAttribute('aria-current',String(button.dataset.homeChapter===current)));
    for(const id of ['homeDiscover','homeCreate']){
      const section=document.getElementById(id),rect=section.getBoundingClientRect(),top=page.getBoundingClientRect().top;
      const progress=clamp((page.clientHeight-(rect.top-top))/(page.clientHeight+Math.min(rect.height,page.clientHeight)));
      section.style.setProperty('--chapter-drift',(motion.matches?0:(.5-progress)*38)+'px');
      section.style.setProperty('--chapter-reveal',motion.matches?'1':String(.55+.45*ease(progress/.32)));
    }
  }
  function scheduleScroll(){if(!scrollFrame)scrollFrame=requestAnimationFrame(updateScroll);}
  async function artStudy(){
    const holder=document.querySelector('.home-art-paper');holder.replaceChildren();
    const art=document.createElement('canvas');art.width=900;art.height=750;art.setAttribute('role','img');art.setAttribute('aria-label','由红、黄、紫三种菌落纹理组成的色彩灵感图，非已保存作品');holder.append(art);
    const ctx=art.getContext('2d');ctx.fillStyle='#0b171b';ctx.fillRect(0,0,900,750);
    const sprites=await Promise.all(['serr','micro','chromo'].map(id=>new Promise(resolve=>{const image=new Image();image.onload=()=>{const s=document.createElement('canvas');s.width=s.height=160;const c=s.getContext('2d');c.drawImage(image,65,65,190,190,0,0,160,160);const pixels=c.getImageData(0,0,160,160);for(let y=0;y<160;y++)for(let x=0;x<160;x++){const i=(y*160+x)*4,d=Math.hypot(x-80,y-80)/80;const cream=pixels.data[i]>195&&pixels.data[i+1]>185&&pixels.data[i+2]>135;pixels.data[i+3]*=Math.max(0,Math.min(1,(1-d)*7))*(cream?.04:1);}c.putImageData(pixels,0,0);resolve(s);};image.onerror=()=>resolve(null);image.src=appAsset(id);} )));
    const glow=ctx.createRadialGradient(430,330,20,450,375,340);glow.addColorStop(0,'#a1baaf0e');glow.addColorStop(1,'#00000000');ctx.fillStyle=glow;ctx.fillRect(0,0,900,750);
    ctx.strokeStyle='#a7c3b638';ctx.lineWidth=1;ctx.beginPath();ctx.arc(450,375,276,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#a7c3b611';ctx.beginPath();ctx.arc(450,375,291,0,Math.PI*2);ctx.stroke();
    for(let p=0;p<3;p++)for(let n=0;n<72;n++){
      const t=n/71,a=t*Math.PI*2.05+p*Math.PI*2/3,r=33+t*199,x=450+Math.cos(a)*r,y=375+Math.sin(a)*r*.92;
      const size=8+Math.sin(t*Math.PI)*20+Math.sin(n*1.8)*3;
      ctx.save();ctx.translate(x,y);ctx.rotate(a*.7);ctx.globalAlpha=.85;
      if(sprites[p])ctx.drawImage(sprites[p],-size,-size,size*2,size*2);ctx.restore();
    }
    ctx.fillStyle='#91afa062';ctx.font='10px monospace';ctx.fillText('COLOUR STUDY — 01',38,710);ctx.fillText('MINXING / STUDIO',670,710);
  }
  function init(){
    const navAI=document.createElement('button');navAI.id='homeNavAI';navAI.type='button';navAI.setAttribute('data-home-ai-open','');navAI.innerHTML='<i aria-hidden="true"></i> 萤萤 AI <span aria-hidden="true">↗</span>';document.getElementById('appNav').append(navAI);
    HomeLifeVisual.init();HomeAssistant.init();
    // Keep the shared texture URL below CSS custom-property size limits.
    fetch(COLONY_LANDSCAPE).then(response=>response.blob()).then(blob=>{
      page.style.setProperty('--colony-texture',`url("${URL.createObjectURL(blob)}")`);
    }).catch(()=>{});
    new IntersectionObserver(entries=>{visualVisible=entries[0].isIntersecting;syncVisual();},{root:page,threshold:0}).observe(journey);
    new IntersectionObserver(entries=>{observationVisible=entries[0].isIntersecting;},{root:page,threshold:0}).observe(observation);
    new ResizeObserver(()=>{if(appRoute!=='home'||!observation.clientWidth)return;resize();if(!focusedCol)goCam('hero');clearTimeout(alignTimer);alignTimer=setTimeout(()=>{if(appRoute==='home')drawHomeFog();},1750);}).observe(observation);
    canvas.addEventListener('wheel',event=>{if(appRoute!=='home'||event.ctrlKey)return;const scale=event.deltaMode===1?20:event.deltaMode===2?page.clientHeight:1;page.scrollTop+=event.deltaY*scale;event.preventDefault();event.stopImmediatePropagation();},{capture:true,passive:false});
    canvas.addEventListener('pointerdown',event=>{if(appRoute!=='home'||event.pointerType!=='touch'||!event.isPrimary)return;homeTouch={id:event.pointerId,y:event.clientY,enabled:controls.enabled};controls.enabled=false;canvas.setPointerCapture(event.pointerId);},true);
    canvas.addEventListener('pointermove',event=>{if(!homeTouch||homeTouch.id!==event.pointerId||appRoute!=='home')return;page.scrollTop+=homeTouch.y-event.clientY;homeTouch.y=event.clientY;event.preventDefault();},{capture:true,passive:false});
    for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,event=>{if(!homeTouch||homeTouch.id!==event.pointerId)return;if(appRoute==='home')controls.enabled=homeTouch.enabled;homeTouch=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);},true);
    for(const button of document.querySelectorAll('[data-life-focus]')){
      const activate=()=>{HomeLifeVisual.setFocus(button.dataset.lifeFocus);caption.textContent={ask:'一个问题，一段新的探索',observe:'走近一点，看看生命的变化',create:'让生命的颜色，流向你的想象'}[button.dataset.lifeFocus];};
      const release=()=>{HomeLifeVisual.setFocus(HomeAssistant.isOpen?'ask':'explore');caption.textContent=idleCaption();};
      button.addEventListener('pointerenter',activate);button.addEventListener('focus',activate);button.addEventListener('pointerleave',release);button.addEventListener('blur',release);
    }
    input.addEventListener('focus',()=>{HomeLifeVisual.setFocus('ask');HomeLifeVisual.setMood('listening');caption.textContent='从一个问题开始';});
    input.addEventListener('blur',()=>{if(!HomeAssistant.isOpen){HomeLifeVisual.setFocus('explore');HomeLifeVisual.setMood('idle');caption.textContent=idleCaption();}});
    input.addEventListener('input',()=>HomeLifeVisual.pulse());
    document.addEventListener('home-assistant-state',event=>{const gone=motion.matches||page.clientWidth<=800?lastProgress>=1:lastProgress>.34;document.querySelector('.home-main-actions').inert=event.detail.open||gone;HomeLifeVisual.setFocus(event.detail.open?'ask':'explore');HomeLifeVisual.setMood(event.detail.open?'listening':'idle');if(!event.detail.open&&gone)requestAnimationFrame(()=>{if(appRoute==='home')document.getElementById('homeNavAI').focus({preventScroll:true});});});
    document.getElementById('homeMeetAI').onclick=()=>HomeAssistant.open();
    document.getElementById('homeHeroContinueBtn').onclick=()=>document.getElementById('enterCultureBtn').click();
    document.getElementById('homeReplayIntro').onclick=replay;document.getElementById('homeFooterIntro').onclick=replay;
    document.getElementById('homeScrollExplore').onclick=document.getElementById('homePortalObserve').onclick=()=>scrollTo('homeObservation');
    page.querySelectorAll('[data-home-chapter]').forEach(button=>button.onclick=()=>scrollTo(button.dataset.homeChapter));
    page.addEventListener('scroll',scheduleScroll,{passive:true});
    new ResizeObserver(scheduleScroll).observe(page);
    motion.addEventListener?.('change',scheduleScroll);
    document.addEventListener('home-intro-finished',scheduleScroll);
    document.getElementById('homeFeaturedSpecimen').onclick=()=>{appNavigate('dex');selectDexSpecimen(featured);};
    const wall=document.getElementById('homeDexWall');for(const event of ['pointerover','focusin'])wall.addEventListener(event,e=>{const button=e.target.closest('[data-home-species]');if(button)feature(button.dataset.homeSpecies);});
    document.getElementById('homeSpecimensPrev').onclick=()=>wall.scrollBy({left:-250,behavior:motion.matches?'auto':'smooth'});
    document.getElementById('homeSpecimensNext').onclick=()=>wall.scrollBy({left:250,behavior:motion.matches?'auto':'smooth'});
    document.addEventListener('visibilitychange',syncVisual);document.addEventListener('home-intro-finished',syncVisual);
    artStudy();render();
  }
  return {init,render,enter,leave,answer,get observationVisible(){return observationVisible;},get scrollState(){return {progress:lastProgress,scrollTop:page.scrollTop,visualVisible};}};
})();
