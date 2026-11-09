/* A choreographed constellation, projected in depth and gathered into Yingying.
   It shares the entry timeline; no timers, network assets, or extra WebGL context. */
const EntryConstellation=(()=>{
  const TAU=Math.PI*2,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
  const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
  const random=n=>{const f=Math.sin(n*127.1+419.7)*43758.5453123;return f-Math.floor(f);};
  const colours=[[125,246,184],[241,226,142],[111,225,244],[185,150,246]];
  let canvas,ctx,width=0,height=0,dpr=1,stars=[],points=[],order=[],glows=[],mist=[],progress=0,draws=0,anchor={x:0,y:0},failed=false;
  let strandCount=7,perStrand=110;
  const rgba=(colour,a)=>`rgba(${colour[0]},${colour[1]},${colour[2]},${a})`;
  function sprite(colour,soft=false){
    const c=document.createElement('canvas');c.width=c.height=96;const g=c.getContext('2d');
    const light=g.createRadialGradient(48,48,0,48,48,48);
    if(soft){light.addColorStop(0,rgba(colour,.36));light.addColorStop(.22,rgba(colour,.19));light.addColorStop(.65,rgba(colour,.035));}
    else{light.addColorStop(0,'rgba(249,250,221,.98)');light.addColorStop(.045,rgba(colour,.94));light.addColorStop(.15,rgba(colour,.4));light.addColorStop(.38,rgba(colour,.10));light.addColorStop(.7,rgba(colour,.022));}
    light.addColorStop(1,rgba(colour,0));g.fillStyle=light;g.fillRect(0,0,96,96);return c;
  }
  function build(){
    perStrand=width<700?52:112;stars=[];points=[];order=[];
    for(let strand=0;strand<strandCount;strand++)for(let j=0;j<perStrand;j++){
      const i=stars.length,t=(j+random(i+19)*.6)/perStrand;
      const tint=strand===3?3:strand===1||strand===5?1:strand===4?2:0;
      stars.push({strand,t,colour:tint,seed:random(i+51),phase:random(i+91)*TAU,size:.6+random(i+111)*1.3,
        radial:.48+Math.sin(t*TAU*1.2+strand)*.07+(random(i+157)-.5)*.035,depth:.72+t*3.8+random(i+191)*.04,scatter:random(i+219)-.5});
    }
    const dust=width<700?86:220;
    for(let j=0;j<dust;j++){
      const i=stars.length;
      stars.push({strand:-1,t:random(i+31),colour:j%13===0?3:j%4===0?1:0,seed:random(i+51),phase:random(i+91)*TAU,
        size:.45+random(i+111)*1.2,radial:.3+random(i+157)*1.1,depth:.5+random(i+191)*4.5,scatter:random(i+219)-.5});
    }
    stars.forEach((_,i)=>{points.push({x:0,y:0,z:0,r:0,alpha:0});order.push(i);});
  }
  function resize(){
    if(!canvas||!ctx)return false;
    const rect=canvas.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height);
    if(w<1||h<1)return false;
    const ratio=Math.min(devicePixelRatio||1,1.5,Math.sqrt(1800000/(w*h)));
    if(w!==width||h!==height||ratio!==dpr){
      width=w;height=h;dpr=ratio;canvas.width=Math.max(1,Math.round(w*dpr));canvas.height=Math.max(1,Math.round(h*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);build();
    }
    return true;
  }
  function init(element){
    if(canvas===element&&ctx)return true;
    canvas=element;
    try{ctx=canvas?.getContext('2d',{alpha:true});if(!ctx)throw Error('Entry canvas unavailable');}
    catch{failed=true;return false;}
    if(!glows.length){glows=colours.map(c=>sprite(c));mist=colours.map(c=>sprite(c,true));}
    failed=false;resize();return true;
  }
  function glow(x,y,r,colour,alpha,soft=false){
    if(alpha<.001||r<.01)return;
    ctx.globalAlpha=clamp(alpha);ctx.drawImage((soft?mist:glows)[colour],x-r,y-r,r*2,r*2);
  }
  function centre(){return {x:width*.5,y:height*(width<700?.43:.445)};}
  function moveCore(p,target){
    const origin=centre(),q=ease((p-.60)/.14),lift=Math.min(height*.12,90);
    const end={x:clamp(Number.isFinite(target?.x)?target.x:width*.615,0,width),y:clamp(Number.isFinite(target?.y)?target.y:height*.28,0,height)};
    const c1={x:origin.x+(end.x-origin.x)*.18,y:origin.y-lift},c2={x:origin.x+(end.x-origin.x)*.72,y:end.y-lift*.5},k=1-q;
    return {x:k*k*k*origin.x+3*k*k*q*c1.x+3*k*q*q*c2.x+q*q*q*end.x,
      y:k*k*k*origin.y+3*k*k*q*c1.y+3*k*q*q*c2.y+q*q*q*end.y,q};
  }
  function project(star,p,pointerX,pointerY){
    const c=centre(),formation=ease((p-.19-star.seed*.025)/.30),collapse=ease((p-.50)/.10);
    const camera=p*1.15,theta=(star.strand<0?star.phase:star.strand/strandCount*TAU+star.t*TAU*1.7+(star.seed-.5)*.025);
    const z=Math.max(.30,star.depth-camera*.33),perspective=1.15/(z+.35),focal=Math.min(width*.53,height*.88);
    const swirl=theta+p*.96,vertical=width<700?.60:.67;
    const fieldX=Math.cos(swirl)*star.radial*focal*perspective*(width<700?1.04:1.66);
    const fieldY=Math.sin(swirl)*star.radial*focal*perspective*vertical+(star.t-.5)*height*.09;
    // Different latitudes form seven intertwined volumes, not a flat circular ring.
    const latitude=Math.acos(1-2*star.t),spin=theta+p*2.6+collapse*3.2;
    const radius=Math.min(width*.34,height*.275)*(1-Math.pow(collapse,.9));
    const ballX=Math.sin(latitude)*Math.cos(spin),ballZ=Math.sin(latitude)*Math.sin(spin),ballY=Math.cos(latitude);
    const perspectiveBall=1/(1-ballZ*.23),jitter=(1-formation)*star.scatter*14;
    const orbX=(ballX*radius+star.scatter*radius*.08)*perspectiveBall;
    const orbY=(ballY*radius*.92+Math.sin(theta*2)*radius*.055)*perspectiveBall;
    const depth=mix(z,2-ballZ,formation),r=clamp(star.size*mix(perspective,.84+ballZ*.38,formation),.35,4.8);
    const edgeOpacity=clamp(Math.min((c.x+mix(fieldX,orbX,formation))/45,(width-c.x-mix(fieldX,orbX,formation))/45));
    return {x:c.x+mix(fieldX,orbX,formation)+pointerX*9*(1-formation)*perspective+jitter,
      y:c.y+mix(fieldY,orbY,formation)+pointerY*7*(1-formation)*perspective,
      z:depth,r,alpha:(.35+.65*clamp(perspective))*(.7+.3*Math.sin(star.phase+p*5)**2)*edgeOpacity*(1-ease((p-.55)/.05)),formation,collapse};
  }
  function drawConnections(p){
    const visibility=ease((p-.28)/.16)*(1-ease((p-.50)/.10));if(visibility<.001)return;
    const step=width<700?4:5;
    ctx.lineWidth=.55;ctx.lineCap='round';
    for(let strand=0;strand<strandCount;strand++)for(let j=step;j<perStrand;j+=step){
      const i=strand*perStrand+j,a=points[i-step],b=points[i],seed=stars[i].seed;
      const growth=ease((p-.14-seed*.10)/.13),alpha=visibility*(.08+.13*seed)*Math.min(a.alpha,b.alpha);
      if(alpha<.003||Math.hypot(b.x-a.x,b.y-a.y)>width*.33)continue;
      ctx.globalAlpha=alpha;ctx.strokeStyle=rgba(colours[stars[i].colour],1);
      ctx.beginPath();ctx.moveTo(a.x,a.y);
      const ex=mix(a.x,b.x,growth),ey=mix(a.y,b.y,growth);
      ctx.quadraticCurveTo((a.x+ex)*.5+(ey-a.y)*.07,(a.y+ey)*.5-(ex-a.x)*.07,ex,ey);ctx.stroke();
      // A small packet follows the growing connection, then subsides into the nodes.
      const travel=clamp((p-.2-seed*.08)/.24);
      if(travel>0&&travel<1)glow(mix(a.x,b.x,travel),mix(a.y,b.y,travel),3.4,stars[i].colour,visibility*.25*Math.sin(travel*Math.PI));
    }
  }
  function drawStreams(p){
    const alpha=(.65+.35*ease(p/.12))*(1-ease((p-.50)/.10));if(alpha<.001)return;
    ctx.lineCap='round';ctx.lineJoin='round';
    // Continuous ribbons, each with a soft coloured envelope and fine bright fibres.
    for(let strand=0;strand<strandCount;strand++){
      const start=strand*perStrand,colour=colours[stars[start].colour],nodes=[];
      for(let j=0;j<perStrand;j+=2){const a=points[start+j];nodes.push(a);}
      for(const pass of [{width:12,alpha:.022},{width:5,alpha:.055},{width:1.1,alpha:.30},{width:.40,alpha:.48}]){
        ctx.globalAlpha=alpha*pass.alpha;ctx.strokeStyle=rgba(colour,1);ctx.lineWidth=pass.width;
        ctx.beginPath();let joined=false;
        for(let j=0;j<nodes.length;j++){
          const a=nodes[j],b=nodes[Math.min(j+1,nodes.length-1)];
          if(a.x< -10||a.x>width+10||a.y<height*.14||a.y>height*.72){joined=false;continue;}
          if(!joined){ctx.moveTo(a.x,a.y);joined=true;}
          else ctx.quadraticCurveTo(a.x,a.y,(a.x+b.x)*.5,(a.y+b.y)*.5);
        }
        ctx.stroke();
      }
      // The brightest filaments are narrow local echoes, not another web of chords.
      for(let offset=-1;offset<=1;offset+=2){
        ctx.globalAlpha=alpha*.10;ctx.strokeStyle=rgba(colour,1);ctx.lineWidth=.45;ctx.beginPath();
        for(let j=0;j<nodes.length;j++){
          const a=nodes[j],n=Math.sin(j*.31+strand)*offset*2.2,x=a.x+n,y=a.y+n*.6;
          if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
    }
  }
  function drawCore(p,target){
    const c=moveCore(p,target),gather=ease((p-.42)/.18),vanish=1-ease((p-.91)/.09);
    anchor={x:c.x,y:c.y};if(gather<=0)return;
    const arrival=ease((p-.60)/.14),radius=mix(9.2,4.3,arrival),pulse=1+Math.sin(p*42)*.055*(1-arrival);
    // The final light retains the homepage's exact size and colour until handoff.
    const burst=Math.exp(-Math.pow((p-.595)/.020,2)),halo=38+gather*46*(1-arrival);
    glow(c.x,c.y,halo*2.3,0,gather*.24*vanish,true);
    glow(c.x,c.y,halo+burst*24,1,gather*(.7+burst*.12));
    if(p>.60&&p<.78){
      const trail=ease((p-.60)/.04)*(1-ease((p-.71)/.07));
      for(let i=15;i>=1;i--){const tail=moveCore(Math.max(.60,p-i*.002),target),alpha=trail*(1-i/16)*.2;
        glow(tail.x,tail.y,12*(1-i/25),1,alpha);}
    }
    ctx.globalAlpha=gather;ctx.fillStyle='#e0efac';ctx.beginPath();ctx.arc(c.x,c.y,radius*pulse*gather,0,TAU);ctx.fill();
    ctx.globalAlpha=gather*(1-arrival)*.72;ctx.fillStyle='#fffde4';ctx.beginPath();ctx.arc(c.x-radius*.14,c.y-radius*.18,radius*.32,0,TAU);ctx.fill();
  }
  function render(value,target,{pointerX=0,pointerY=0}={}){
    if(failed||!ctx||!resize())return false;
    progress=clamp(Number.isFinite(value)?value:0);const p=progress;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.clearRect(0,0,width,height);
    if(p>=1){draws++;return true;}
    const c=centre(),visible=1-ease((p-.50)/.10),formation=ease((p-.19)/.30);
    ctx.globalCompositeOperation='lighter';
    // Large, low-intensity clouds provide optical depth without obscuring the scene.
    if(visible>.001){
      glow(c.x-width*.16*(1-formation),c.y+height*.04,width*.38,0,.34*visible,true);
      glow(c.x+width*.18*(1-formation),c.y-height*.06,width*.29,3,.22*visible,true);
      glow(c.x,c.y,Math.min(width,height)*.38,1,.22*formation*visible,true);
      // Six near-lens lights pass across the volume at a different speed from its stars.
      const passing=1-ease((p-.22)/.18);
      if(passing>.001)for(let i=0;i<6;i++){
        const seed=random(i+460),side=i%2?1:-1;
        const x=width*(.12+seed*.76)+side*p*width*.45+pointerX*20;
        const y=height*(.22+random(i+480)*.35)+Math.sin(p*3+i)*height*.055;
        const r=(18+random(i+490)*29)*(1+p*.7);
        glow(x,y,r,i%4,passing*.72,true);glow(x,y,r*.46,i%4,passing*.42,true);
      }
      for(let i=0;i<stars.length;i++)points[i]=project(stars[i],p,clamp(pointerX,-1,1),clamp(pointerY,-1,1));
      drawStreams(p);drawConnections(p);
      order.sort((a,b)=>points[b].z-points[a].z);
      for(const i of order){
        const a=points[i],star=stars[i];
        if(a.alpha<.005||a.x< -35||a.x>width+35||a.y<height*.12||a.y>height*.76)continue;
        const near=star.strand<0&&a.z<1.2,focus=near?(1-formation):0;
        if(focus>.05){glow(a.x,a.y,14+a.r*10,star.colour,a.alpha*.60*focus,true);}
        const hero=i%31===0&&star.strand>=0,heroRadius=hero?(2.2+star.seed*1.5)*(1-a.collapse):0;
        const radius=hero?22+heroRadius*3:a.r*(near?14:8.5);
        glow(a.x,a.y,radius,star.colour,a.alpha*(near?.75:hero?.98:.88));
        if(hero&&heroRadius>.1){
          glow(a.x,a.y,48,star.colour,a.alpha*.24,true);
          ctx.globalAlpha=a.alpha*.9;ctx.fillStyle=rgba(colours[star.colour],1);ctx.beginPath();ctx.arc(a.x,a.y,heroRadius,0,TAU);ctx.fill();
          ctx.globalAlpha=a.alpha*.85;ctx.fillStyle='#ffffe4';ctx.beginPath();ctx.arc(a.x-heroRadius*.1,a.y-heroRadius*.1,heroRadius*.48,0,TAU);ctx.fill();
        }
        if(!near&&a.r>.7){ctx.globalAlpha=a.alpha*.65;ctx.fillStyle=rgba(colours[star.colour],1);ctx.beginPath();ctx.arc(a.x,a.y,a.r*.45,0,TAU);ctx.fill();}
        // Selected foreground lights leave short tangential trails through the volume.
        if(i%9===0&&p<.5&&a.r>1.0){
          const length=(8+a.r*4)*(1-formation),angle=star.phase+p*.96;
          ctx.globalAlpha=a.alpha*.14*(1-formation);ctx.strokeStyle=rgba(colours[star.colour],1);ctx.lineWidth=a.r*.55;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(a.x-Math.sin(angle)*length*.5,a.y+Math.cos(angle)*length*.24,a.x-Math.sin(angle)*length,a.y+Math.cos(angle)*length*.48);ctx.stroke();
        }
      }
    }
    drawCore(p,target);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';draws++;return true;
  }
  function clear(){if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(dpr,0,0,dpr,0,0);}progress=1;}
  return {init,render,clear,get state(){return {version:'yingying-constellation-v2',particleCount:stars.length,progress,anchor:{...anchor},draws,width,height,failed};}};
})();
