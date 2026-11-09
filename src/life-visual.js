/* The approved colony surface, with a localized breeze through its soft growth edge. */
const HomeLifeVisual = (() => {
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),mix=(a,b,t)=>a+(b-a)*t;
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const rand=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  let canvas,ctx,base,baseCtx,field,fieldCtx,image,hero,aiButton,observer,resizer;
  let width=1,height=1,dpr=1,frame=0,last=0,lastPaint=0,time=0,journey=1,mood='idle',focus='explore',energy=0,scrollProgress=0;
  let breathCanvas=null,breathGL=null,breathProgram=null,breathImage=null,breathFront=null,breathUniforms={},breathFailed=false;
  let initialized=false,failed=false,loaded=false,enabled=false,inView=true,pulseAt=-100;
  let cover={x:0,y:0,w:1,h:1},edge=[],growth=[],seeds=[],pointerActive=false,touchUntil=0,lampLocked=false;
  let source={x:0,y:0},sourceGoal={x:0,y:0},lamp={x:0,y:0},lens={x:0,y:0,r:1,zoom:2.25};
  let lastButtonX=-1,lastButtonY=-1,paintCount=0,sourceVersion=0;
  const src=typeof COLONY_LANDSCAPE==='string'?COLONY_LANDSCAPE:'';
  const sourcePoint=(x,y)=>({x:cover.x+x*cover.w,y:cover.y+y*cover.h});
  const edgeY=x=>{
    if(!edge.length)return 1-.85*Math.pow(clamp(x,0,1),.58);
    const at=clamp(x,0,1)*(edge.length-1),i=Math.floor(at);
    return mix(edge[i],edge[Math.min(i+1,edge.length-1)],at-i);
  };
  function fallback(){
    failed=true;enabled=false;cancelAnimationFrame(frame);frame=0;
    if(canvas){canvas.hidden=true;canvas.dataset.ready='false';}
    return false;
  }
  function readFront(){
    const sample=document.createElement('canvas');sample.width=600;sample.height=Math.round(600*image.naturalHeight/image.naturalWidth);
    const c=sample.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0,sample.width,sample.height);
    const pixels=c.getImageData(0,0,sample.width,sample.height).data;
    const guide=[[0,.99],[.1,.84],[.2,.66],[.3,.56],[.4,.43],[.5,.35],[.6,.29],[.7,.25],[.8,.2],[.9,.19],[1,.15]];
    edge=[];
    for(let n=0;n<=200;n++){
      const u=n/200,at=u*10,k=Math.min(9,Math.floor(at)),target=mix(guide[k][1],guide[k+1][1],at-k);
      let best=target,score=0;const x=clamp(Math.round(u*(sample.width-1)),1,sample.width-2);
      for(let y=Math.max(0,Math.floor((target-.16)*sample.height));y<Math.min(sample.height,Math.ceil((target+.16)*sample.height));y++){
        let bright=0;for(let dx=-1;dx<=1;dx++){const i=(y*sample.width+x+dx)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(r>86&&g>94&&b>86&&Math.max(r,g,b)-Math.min(r,g,b)<85)bright+=Math.min(r,g,b);}
        const s=bright*(1-Math.abs(y/sample.height-target)*3);if(s>score){score=s;best=y/sample.height;}
      }
      edge.push(best);
    }
    growth=[];seeds=[];
    for(let n=0;n<68;n++){
      const u=.115+rand(n+5)*.86,y=edgeY(u),tangent=(edgeY(Math.min(1,u+.005))-edgeY(Math.max(0,u-.005)))/.01;
      const nx=clamp(tangent*.3,-.8,-.12),ny=-Math.sqrt(1-nx*nx);
      growth.push({u,y,nx,ny,length:8+rand(n+60)*19,phase:rand(n+140)*18,duration:12+rand(n+210)*9,angle:rand(n+330)*.6-.3});
    }
    for(let n=0;n<640;n++){
      const u=.1+rand(n+1250)*.9,y=edgeY(u);seeds.push({u,y,depth:rand(n+1910)*24,drift:rand(n+2341)*12,phase:rand(n+3120)*24,size:.35+rand(n+761)*.75});
    }
  }

  // A single image pass bends only the colony's soft surface, in several gently
  // offset phases. Dark negative space and the stable pigmented base stay anchored.
  function initBreathing(){
    if(breathGL||breathFailed)return;
    try{
      breathCanvas=document.createElement('canvas');
      const gl=breathCanvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
      if(!gl)throw Error('No motion context');
      const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
      const vs=compile(gl.VERTEX_SHADER,`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=vec2(a_position.x*.5+.5,.5-a_position.y*.5);gl_Position=vec4(a_position,0.,1.);}`);
      const fs=compile(gl.FRAGMENT_SHADER,`
        precision highp float;
        varying vec2 v_uv;
        uniform sampler2D u_image,u_front;
        uniform vec2 u_size;
        uniform vec4 u_cover;
        uniform float u_time,u_amplitude,u_journey;
        void main(){
          vec2 p=v_uv*u_size;
          vec2 q=(p-u_cover.xy)/u_cover.zw;
          float front=texture2D(u_front,vec2(clamp(q.x,0.,1.),.5)).r;
          float depth=q.y-front;
          vec3 original=texture2D(u_image,v_uv).rgb;
          float brightness=dot(original,vec3(.2126,.7152,.0722));
          float edgeBand=exp(-pow((depth-.037)/.105,2.));
          float bodyBand=smoothstep(-.015,.09,depth)*(1.-smoothstep(.26,.72,depth));
          float attached=smoothstep(-.055,.012,depth);
          float mask=attached*(edgeBand*.88+bodyBand*.22)*smoothstep(.085,.23,brightness);
          float phase=u_time*.72+q.x*7.3+q.y*3.7;
          float cross=u_time*.53-q.x*11.1+q.y*6.2;
          float breeze=.72+.28*sin(u_time*.24+q.x*3.2);
          vec2 drift=vec2(sin(phase)*.70+sin(cross)*.30,
                          cos(phase*.91+q.x*2.1)*.39+sin(cross*.83)*.17);
          vec2 tips=vec2(sin(u_time*.89+q.x*37.-q.y*13.),cos(u_time*.76+q.x*29.+q.y*21.))*.12;
          vec2 offset=(drift+tips*edgeBand)*u_amplitude*breeze*mask;
          vec2 uv=clamp(v_uv-offset/u_size,vec2(.0002),vec2(.9998));
          vec3 color=texture2D(u_image,uv).rgb;
          float sheen=(sin(phase+.65)*.017+sin(cross-.4)*.009)*mask;
          color*=1.+sheen*u_amplitude/5.;
          // A broad light front reveals the real texture, then disappears entirely.
          float entry=1.-smoothstep(.53,.94,u_journey);
          float wake=smoothstep(.02,.75,u_journey);
          float radius=mix(.025,1.25,wake);
          float seedX=u_size.x<700.?.53:.40;
          vec2 fromSeed=vec2((q.x-seedX)*.9,(depth-.025)*1.35);
          float opened=1.-smoothstep(radius*.4,radius,length(fromSeed));
          float rim=exp(-pow((depth-.012)/.05,2.));
          float sweep=exp(-pow((q.x-mix(seedX,.68,wake))/.13,2.))*rim;
          float lum=dot(color,vec3(.2126,.7152,.0722));
          vec3 night=vec3(lum*.30,lum*.51,lum*.51);
          color=mix(color,mix(night,color,opened*.7+.3*wake),entry);
          color*=mix(1.,.10+opened*.76,entry);
          color+=vec3(.26,.30,.13)*sweep*entry*.26;
          gl_FragColor=vec4(color,1.);
        }`);
      const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      const texture=unit=>{const tex=gl.createTexture();gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return tex;};
      breathImage=texture(gl.TEXTURE0);breathFront=texture(gl.TEXTURE1);
      const pixels=new Uint8Array(edge.length*4);edge.forEach((v,i)=>{pixels[i*4]=Math.round(clamp(v,0,1)*255);pixels[i*4+3]=255;});
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,edge.length,1,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      for(const name of ['u_image','u_front','u_size','u_cover','u_time','u_amplitude','u_journey'])breathUniforms[name]=gl.getUniformLocation(program,name);
      gl.uniform1i(breathUniforms.u_image,0);gl.uniform1i(breathUniforms.u_front,1);
      breathGL=gl;breathProgram=program;
      breathCanvas.addEventListener('webglcontextlost',event=>{event.preventDefault();breathFailed=true;breathGL=null;breathProgram=null;if(enabled)paint(performance.now(),true);});
    }catch{
      if(breathGL)breathGL.getExtension('WEBGL_lose_context')?.loseContext();
      breathFailed=true;breathGL=null;breathProgram=null;
    }
  }
  function uploadSurface(){
    if(!breathGL||!loaded)return;
    const gl=breathGL;
    breathCanvas.width=base.width;breathCanvas.height=base.height;
    gl.viewport(0,0,breathCanvas.width,breathCanvas.height);gl.useProgram(breathProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,breathImage);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,base);
    gl.uniform2f(breathUniforms.u_size,width,height);gl.uniform4f(breathUniforms.u_cover,cover.x,cover.y,cover.w,cover.h);
  }
  function drawBreathing(){
    if(!breathGL||reduce.matches||!loaded){fieldCtx.drawImage(base,0,0,width,height);return;}
    const gl=breathGL;
    if(gl.isContextLost()){breathFailed=true;breathGL=null;fieldCtx.drawImage(base,0,0,width,height);return;}
    gl.useProgram(breathProgram);gl.uniform1f(breathUniforms.u_time,time);
    gl.uniform1f(breathUniforms.u_amplitude,(width<700?3.0:5.2)*(1+.65*Math.sin(journey*Math.PI)));
    gl.uniform1f(breathUniforms.u_journey,journey);
    gl.drawArrays(gl.TRIANGLES,0,3);fieldCtx.drawImage(breathCanvas,0,0,width,height);
  }

  function idleSource(){
    if(width<700){const x=width*.61,y=clamp(sourcePoint((x-cover.x)/cover.w,edgeY((x-cover.x)/cover.w)).y+18,365,height-230);return {x,y};}
    return sourcePoint(.35,edgeY(.35)+.045);
  }
  function idleLamp(){
    if(width<700){const x=width*.73,y=clamp(sourcePoint((x-cover.x)/cover.w,edgeY((x-cover.x)/cover.w)).y-15,330,height-245);return {x,y};}
    return sourcePoint(.615,edgeY(.615)-.025);
  }
  function resize(){
    if(!initialized||failed)return;
    const parent=canvas.parentElement;if(!parent||parent.clientWidth<1||parent.clientHeight<1)return;
    width=parent.clientWidth;height=parent.clientHeight;dpr=Math.min(devicePixelRatio||1,width<700?1.3:1.5,Math.sqrt(2400000/(width*height)));
    const pw=Math.max(1,Math.round(width*dpr)),ph=Math.max(1,Math.round(height*dpr));
    for(const c of [canvas,base,field]){if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph;}}
    for(const c of [ctx,baseCtx,fieldCtx])c.setTransform(dpr,0,0,dpr,0,0);
    const iw=image?.naturalWidth||1584,ih=image?.naturalHeight||992,scale=Math.max(width/iw,height/ih);
    cover={x:(width-iw*scale)*(width<700?.5:.5),y:(height-ih*scale)*.5,w:iw*scale,h:ih*scale};
    baseCtx.fillStyle='#071a20';baseCtx.fillRect(0,0,width,height);if(loaded)baseCtx.drawImage(image,cover.x,cover.y,cover.w,cover.h);
    // Keep typography legible when portrait cropping brings the colony closer to the header.
    if(width<700){const shade=baseCtx.createLinearGradient(0,80,0,380);shade.addColorStop(0,'rgba(4,16,20,.2)');shade.addColorStop(1,'rgba(4,16,20,0)');baseCtx.fillStyle=shade;baseCtx.fillRect(0,0,width,380);}
    uploadSurface();
    sourceGoal=idleSource();source={...sourceGoal};lamp=idleLamp();lampLocked=false;lens={...lens,x:source.x,y:source.y,r:width<700?44:clamp(height*.096,65,96)};
    lastButtonX=-1;paint(performance.now(),true);kick();
  }
  function drawGrowth(){
    const c=fieldCtx,scale=cover.w/1584,cycleTime=reduce.matches?5.2:time;
    c.save();c.lineCap='round';c.lineJoin='round';
    for(const b of growth){
      const cycle=((cycleTime+b.phase)%b.duration)/b.duration;
      const grow=smooth(cycle/.64),fade=cycle>.82?1-smooth((cycle-.82)/.18):1;
      const root=sourcePoint(b.u,b.y+.002),length=b.length*scale;
      const bx=root.x+b.nx*length*grow,by=root.y+b.ny*length*grow;
      c.strokeStyle=`rgba(199,216,210,${(.22+energy*.08)*fade})`;c.lineWidth=.55;
      c.beginPath();c.moveTo(root.x,root.y);c.quadraticCurveTo(root.x+b.nx*length*.42+3*scale,root.y+b.ny*length*.5,bx,by);c.stroke();
      for(const side of [-1,1]){
        const g=smooth((grow-.42)/.58),start={x:root.x+b.nx*length*.46,y:root.y+b.ny*length*.46};
        c.beginPath();c.moveTo(start.x,start.y);c.lineTo(start.x+(b.nx*.7+side*.5)*length*.52*g,start.y+(b.ny*.67-side*.14)*length*.52*g);c.stroke();
      }
      if(grow>.05){c.fillStyle=`rgba(210,225,217,${.42*fade})`;c.beginPath();c.arc(bx,by,.5,0,Math.PI*2);c.fill();}
    }
    for(const p of seeds){
      const cycle=((cycleTime+p.phase)%15)/15,g=smooth(cycle),opacity=Math.sin(cycle*Math.PI)*.6;
      const pt=sourcePoint(p.u,p.y),x=pt.x-(p.depth*.2+p.drift*g*.18)*scale,y=pt.y-(p.depth*.16+p.drift*g)*scale;
      c.fillStyle=`rgba(194,215,208,${opacity*.55})`;c.fillRect(x,y,p.size,p.size);
    }
    // A response is a local acknowledgement near the observed edge, never a global light show.
    const age=time-pulseAt;
    if(!reduce.matches&&age>=0&&age<1.4){
      const r=8+age*26;c.strokeStyle=`rgba(221,236,179,${(1-age/1.4)*.28})`;c.lineWidth=.65;c.beginPath();c.arc(lamp.x,lamp.y,r,0,Math.PI*2);c.stroke();
    }
    c.restore();
  }
  function updateLens(dt){
    if(touchUntil&&performance.now()>touchUntil){pointerActive=false;touchUntil=0;}
    if(!pointerActive)sourceGoal=idleSource();
    const t=reduce.matches?1:Math.min(1,dt*7+.018);source.x=mix(source.x,sourceGoal.x,t);source.y=mix(source.y,sourceGoal.y,t);
    const r=lens.r,offsetX=width<700?75:118,offsetY=width<700?60:85;
    lens.x=clamp(source.x-offsetX,r+18,width-r-18);lens.y=clamp(source.y-offsetY,width<700?322:height*.31,height-(width<700?220:180)-r);
    lens.zoom=2.25+(focus==='observe'?.3:0);
    const aim=pointerActive?{x:clamp(source.x+28,24,width-(width<700?74:90)),y:clamp(source.y-24,width<700?330:130,height-(width<700?245:200))}:idleLamp();
    if(!lampLocked){lamp.x=mix(lamp.x,aim.x,t*.68);lamp.y=mix(lamp.y,aim.y,t*.68);}
  }
  function drawLens(){
    if(journey<.85||!loaded||scrollProgress>=.25)return;
    const c=ctx,r=lens.r,alpha=smooth((journey-.85)/.15)*(1-smooth(scrollProgress/.25));c.save();c.globalAlpha=alpha;
    c.beginPath();c.arc(lens.x,lens.y,r,0,Math.PI*2);c.clip();c.fillStyle='#0b2025';c.fillRect(lens.x-r,lens.y-r,r*2,r*2);
    const sample=r/lens.zoom;
    c.drawImage(field,(source.x-sample)*dpr,(source.y-sample)*dpr,sample*2*dpr,sample*2*dpr,lens.x-r,lens.y-r,r*2,r*2);
    c.restore();c.save();c.globalAlpha=alpha;
    c.strokeStyle='rgba(235,237,218,.78)';c.lineWidth=1;c.beginPath();c.arc(lens.x,lens.y,r,0,Math.PI*2);c.stroke();
    const angle=Math.atan2(source.y-lens.y,source.x-lens.x),x=lens.x+Math.cos(angle)*r,y=lens.y+Math.sin(angle)*r;
    c.strokeStyle='rgba(230,233,210,.55)';c.lineWidth=.8;c.beginPath();c.moveTo(x,y);c.lineTo(source.x,source.y);c.stroke();
    c.fillStyle='#dce4ca';c.beginPath();c.arc(source.x,source.y,2.2,0,Math.PI*2);c.fill();c.restore();
  }
  function entryCamera(){
    const p=reduce.matches?1:smooth((journey-.16)/.84),zoom=1+1.55*(1-p);
    const anchor=sourcePoint(width<700?.53:.48,edgeY(width<700?.53:.48)+.045);
    const x=clamp((width*.76-anchor.x)*(1-p)+anchor.x*(1-zoom),width*(1-zoom),0);
    const y=clamp((height*.66-anchor.y)*(1-p)+anchor.y*(1-zoom),height*(1-zoom),0);
    return {zoom,x,y};
  }
  function cameraTransform(c){const view=entryCamera();c.translate(view.x,view.y);c.scale(view.zoom,view.zoom);}
  function drawAwakening(){
    if(reduce.matches||journey>=.82)return;
    const c=fieldCtx,fade=smooth(journey/.12)*(1-smooth((journey-.42)/.4)),scale=cover.w/1584;
    c.save();c.lineCap='round';
    // Branches remain attached to the photographed growth edge, not floating decoration.
    for(let i=0;i<growth.length;i++){
      const b=growth[i],reveal=smooth((journey-Math.abs(b.u-.38)*.32-.025)/.28);
      if(!reveal)continue;
      const pt=sourcePoint(b.u,b.y+.014),length=(b.length+6)*.65*scale*reveal;
      const sway=Math.sin(time*1.1+b.phase)*2*scale;
      const tip={x:pt.x+b.nx*length+sway,y:pt.y+b.ny*length};
      c.strokeStyle=`rgba(205,228,187,${fade*.32})`;c.lineWidth=.32;
      c.beginPath();c.moveTo(pt.x,pt.y);c.quadraticCurveTo(pt.x+b.nx*length*.38,pt.y+b.ny*length*.5,tip.x,tip.y);c.stroke();
      for(const sign of [-1,1]){
        c.beginPath();c.moveTo(mix(pt.x,tip.x,.57),mix(pt.y,tip.y,.57));
        c.quadraticCurveTo(tip.x+sign*length*.12,tip.y+length*.08,tip.x+sign*length*.21,tip.y-length*.12*reveal);c.stroke();
      }
      c.fillStyle=`rgba(227,235,176,${fade*.45})`;c.beginPath();c.arc(tip.x,tip.y,.4,0,Math.PI*2);c.fill();
    }
    c.restore();
  }
  function drawLamp(){
    if(!loaded)return;
    const c=ctx,awake=reduce.matches?1:smooth(journey/.11),alpha=awake*(1-smooth(scrollProgress/.25));
    const r=(mood==='listening'?5.5:4.3)+(reduce.matches?0:Math.sin(time*1.4)*.45);
    const travel=smooth((journey-.08)/.78),u=mix(width<700?.53:.40,.615,travel),onEdge=sourcePoint(u,edgeY(u)-.025);
    const settle=smooth((journey-.76)/.24),position={x:mix(onEdge.x,lamp.x,settle),y:mix(onEdge.y,lamp.y,settle)};
    c.save();cameraTransform(c);c.globalAlpha=alpha;
    const radius=25+energy*6+(1-journey)*12,glow=c.createRadialGradient(position.x,position.y,1,position.x,position.y,radius);
    glow.addColorStop(0,'rgba(214,240,153,.45)');glow.addColorStop(.3,'rgba(183,216,127,.16)');glow.addColorStop(1,'rgba(176,211,123,0)');
    c.fillStyle=glow;c.fillRect(position.x-radius,position.y-radius,radius*2,radius*2);
    c.fillStyle='#e0efac';c.beginPath();c.arc(position.x,position.y,r,0,Math.PI*2);c.fill();c.restore();
    if(aiButton&&canvas.parentElement?.id==='homeLifeMount'){
      if(Math.abs(lastButtonX-lamp.x)>.3||Math.abs(lastButtonY-lamp.y)>.3){aiButton.style.left=lamp.x.toFixed(2)+'px';aiButton.style.top=lamp.y.toFixed(2)+'px';lastButtonX=lamp.x;lastButtonY=lamp.y;}
    }
  }
  function paint(now,once=false){
    if(!initialized||failed)return;
    if(!once&&(!enabled||!inView||document.hidden)){frame=0;last=0;return;}
    if(!once&&now-lastPaint<31){frame=requestAnimationFrame(paint);return;}
    const dt=last?Math.min((now-last)/1000,.08):.016;last=now;lastPaint=now;if(!reduce.matches)time+=dt;
    energy=mix(energy,mood==='answer'?1:mood==='listening'?.55:0,Math.min(1,dt*3));
    updateLens(dt);drawBreathing();if(loaded){drawGrowth();drawAwakening();}
    ctx.clearRect(0,0,width,height);
    ctx.save();cameraTransform(ctx);ctx.drawImage(field,0,0,width,height);ctx.restore();
    if(journey<.92){
      const fade=1-smooth((journey-.2)/.72);
      // Optical falloff keeps the first close-up intimate without a separate loading scene.
      const shade=ctx.createRadialGradient(width*.7,height*.64,width*.08,width*.6,height*.6,Math.max(width,height)*.85);
      shade.addColorStop(0,'rgba(3,14,16,0)');shade.addColorStop(1,`rgba(3,14,16,${fade*.68})`);
      ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
      if(!breathGL){ctx.fillStyle=`rgba(3,14,16,${(1-smooth(journey/.8))*.85})`;ctx.fillRect(0,0,width,height);}
    }
    drawLens();drawLamp();paintCount++;canvas.dataset.ready=String(loaded);canvas.dataset.journey=journey.toFixed(3);canvas.dataset.mood=mood;canvas.dataset.focus=focus;
    if(!once)frame=reduce.matches?0:requestAnimationFrame(paint);
  }
  function kick(){if(initialized&&!failed&&enabled&&inView&&!document.hidden&&!frame){last=0;if(reduce.matches)paint(performance.now(),true);else frame=requestAnimationFrame(paint);}}
  function point(event){
    if(!enabled||journey<.99||!loaded||scrollProgress>.05)return;
    const box=canvas.getBoundingClientRect(),x=(event.clientX-box.left)*width/box.width,y=(event.clientY-box.top)*height/box.height;
    lampLocked=Math.hypot(x-lamp.x,y-lamp.y)<95||!!event.target.closest('#homeMeetAI');
    if(event.target.closest('button,input,textarea,select,a,.home-heading,.home-main-actions,.home-hero-foot,[contenteditable]'))return;
    if(x<0||x>width||y<(width<700?285:height*.28)||y>height-(width<700?195:150))return;
    sourceGoal={x:clamp(x,28,width-28),y};pointerActive=true;sourceVersion++;
    if(event.pointerType==='touch')touchUntil=performance.now()+1800;
    if(reduce.matches)paint(performance.now(),true);
  }
  function init(){
    if(failed)return false;if(initialized)return true;
    hero=document.getElementById('homeUniverse');const host=document.getElementById('homeLifeMount');if(!host)return false;
    canvas=document.getElementById('homeLifeCanvas')||document.createElement('canvas');canvas.id='homeLifeCanvas';canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';canvas.setAttribute('aria-hidden','true');host.append(canvas);aiButton=document.getElementById('homeMeetAI');
    document.querySelectorAll('.home-life-fallback').forEach(el=>{if(src){el.style.backgroundImage=`url("${src}")`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';}});
    try{ctx=canvas.getContext('2d',{alpha:false});base=document.createElement('canvas');field=document.createElement('canvas');baseCtx=base.getContext('2d',{alpha:false});fieldCtx=field.getContext('2d',{alpha:false});if(!ctx||!baseCtx||!fieldCtx)return fallback();initialized=true;}catch{return fallback();}
    image=new Image();image.onload=()=>{try{loaded=true;readFront();initBreathing();resize();kick();}catch{return fallback();}};image.onerror=fallback;image.src=src;
    resize();
    resizer=new ResizeObserver(resize);resizer.observe(canvas);
    observer=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??true;if(!inView){cancelAnimationFrame(frame);frame=0;last=0;}else kick();},{threshold:0});observer.observe(canvas);
    hero?.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')point(event);},{passive:true});
    hero?.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')point(event);},{passive:true});
    hero?.addEventListener('pointerleave',event=>{if(event.pointerType==='touch'&&touchUntil>performance.now())return;pointerActive=false;lampLocked=false;if(reduce.matches)paint(performance.now(),true);},{passive:true});
    aiButton?.addEventListener('pointerenter',()=>{lampLocked=true;},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else kick();});
    reduce.addEventListener?.('change',()=>{cancelAnimationFrame(frame);frame=0;last=0;pointerActive=false;kick();});
    window.addEventListener('resize',resize,{passive:true});return true;
  }
  function setActive(value){if(!initialized&&!init())return;const next=!!value;if(enabled===next){if(next)kick();return;}enabled=next;if(enabled){resize();kick();}else{cancelAnimationFrame(frame);frame=0;last=0;pointerActive=false;}}
  function setScrollProgress(value){scrollProgress=clamp(Number.isFinite(value)?value:0,0,1);if(scrollProgress>.05){pointerActive=false;lampLocked=false;}if(enabled&&reduce.matches)paint(performance.now(),true);}
  function setJourney(value){journey=clamp(Number.isFinite(value)?value:1,0,1);if(enabled&&reduce.matches)paint(performance.now(),true);}
  function setMood(value){mood=['idle','listening','answer'].includes(value)?value:'idle';if(enabled&&reduce.matches)paint(performance.now(),true);}
  function setFocus(value){focus=['explore','observe','create','ask'].includes(value)?value:'explore';if(enabled&&reduce.matches)paint(performance.now(),true);}
  function pulse(){if(!reduce.matches){pulseAt=time;kick();}}
  const api={init,resize,setActive,setJourney,setScrollProgress,setMood,setFocus,pulse,get canvas(){return canvas;},get motionCanvas(){return breathCanvas;},get active(){return enabled&&!failed;},get state(){return {version:'colony-awakening-v1',initialized,failed,loaded,enabled,active:enabled&&!failed,inView,reduced:reduce.matches,journey,entryZoom:entryCamera().zoom,scrollProgress,mood,focus,width,height,motionTime:time,breathing:{backend:breathGL?'webgl':'static',failed:breathFailed,amplitude:!breathGL||reduce.matches?0:width<700?3.0:5.2},paintCount,sourceVersion,lens:{...lens,sourceX:source.x,sourceY:source.y},lamp:{...lamp,locked:lampLocked},growthSites:growth.length,postprocessing:false};}};
  window.__homeLifeVisual=api;return api;
})();
