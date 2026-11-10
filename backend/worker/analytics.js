const DAY_MS=86400000;
const SESSION_MS=8*3600000;
const COOKIE='__Host-minxing_admin';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_EVENTS=new Set(['page_open','home_entered','culture_started']);
const KEYS=['opens','visitors','homeVisitors','usedVisitors','aiVisitors','aiSuccesses','aiFailures','returningVisitors'];
const encoder=new TextEncoder();
const RESERVE='INSERT INTO request_quotas(bucket,used) VALUES (?,?) ON CONFLICT(bucket) DO UPDATE SET used=used+excluded.used WHERE used+excluded.used <= ? RETURNING used';

function json(data,status=200,origin=null,extra={}){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{}),...extra}});
}
function dayAt(time){return new Date(time+8*3600000).toISOString().slice(0,10);}
function base64url(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64(value){
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid token');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
}
async function signingKey(password){return crypto.subtle.importKey('raw',encoder.encode(password),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function passwordMatches(given,expected){
  const [a,b]=await Promise.all([given,expected].map(x=>crypto.subtle.digest('SHA-256',encoder.encode(x))));
  let difference=0;const left=new Uint8Array(a),right=new Uint8Array(b);
  for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
  return difference===0;
}
async function sessionCookie(password){
  const payload=base64url(encoder.encode(JSON.stringify({v:1,exp:Date.now()+SESSION_MS,nonce:crypto.randomUUID()})));
  const signature=await crypto.subtle.sign('HMAC',await signingKey(password),encoder.encode(payload));
  return COOKIE+'='+payload+'.'+base64url(signature)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+SESSION_MS/1000;
}
async function authenticated(request,password){
  if(!password)return false;
  const value=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!value||value.length>1024)return false;
  try{
    const [payload,signature,extra]=value.split('.');if(extra||!payload||!signature)return false;
    if(!await crypto.subtle.verify('HMAC',await signingKey(password),fromBase64(signature),encoder.encode(payload)))return false;
    const data=JSON.parse(new TextDecoder().decode(fromBase64(payload)));
    return data.v===1&&Number.isSafeInteger(data.exp)&&data.exp>Date.now()&&data.exp<=Date.now()+SESSION_MS&&UUID.test(data.nonce);
  }catch{return false;}
}
async function readJSON(request,limit){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new Error('TYPE');
  if(!request.body)throw new Error('INPUT');
  const reader=request.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('SIZE');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function reserve(db,bucket,limit,count=1){return !!await db.prepare(RESERVE).bind(bucket,count,limit).first();}
async function ipBucket(request,now){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(dayAt(now)+':analytics:'+(request.headers.get('CF-Connecting-IP')||'unknown')));
  return base64url(digest);
}
function validIdentity(value){return !!value&&[value.visitorId,value.sessionId,value.eventId].every(x=>typeof x==='string'&&UUID.test(x));}
function validatedEvents(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='events')||!Array.isArray(body.events)||body.events.length<1||body.events.length>5)throw new Error('INPUT');
  return body.events.map(event=>{
    if(!validIdentity(event)||Object.keys(event).some(k=>!['eventId','visitorId','sessionId','type','detail'].includes(k))||!PUBLIC_EVENTS.has(event.type))throw new Error('INPUT');
    const detail=event.detail??'';
    if(typeof detail!=='string'||(event.type==='home_entered'?!['','completed','skipped','reduced'].includes(detail):detail!==''))throw new Error('INPUT');
    return {...event,detail};
  });
}
async function insertEvent(db,event,now){
  await db.prepare('INSERT OR IGNORE INTO analytics_events(event_id,visitor_id,session_id,event_type,detail,occurred_at,day) VALUES (?,?,?,?,?,?,?)')
    .bind(event.eventId.toLowerCase(),event.visitorId.toLowerCase(),event.sessionId.toLowerCase(),event.type,event.detail||'',now,dayAt(now)).run();
  await db.prepare("INSERT OR IGNORE INTO analytics_metadata(key,value) VALUES ('collected_since',?)").bind(new Date(now).toISOString()).run();
}
async function cleanup(db,now){
  // One isolate wins this lease per Beijing day. Only it performs retention cleanup.
  if(!await reserve(db,'analytics:cleanup:'+dayAt(now),1))return;
  const cutoff=dayAt(now-29*DAY_MS);
  await db.prepare('DELETE FROM analytics_events WHERE day < ?').bind(cutoff).run();
  await db.prepare("DELETE FROM request_quotas WHERE (bucket LIKE 'analytics:minute:%' AND bucket < ?) OR (bucket LIKE 'analytics:login:%' AND bucket < ?) OR (bucket LIKE 'analytics:day:%' AND bucket < ?) OR (bucket LIKE 'analytics:ai:%' AND bucket < ?) OR (bucket LIKE 'analytics:cleanup:%' AND bucket < ?)")
    .bind('analytics:minute:'+String(Math.floor((now-DAY_MS)/60000)),'analytics:login:'+String(Math.floor((now-DAY_MS)/900000)),'analytics:day:'+dayAt(now-7*DAY_MS),'analytics:ai:'+dayAt(now-7*DAY_MS),'analytics:cleanup:'+dayAt(now-7*DAY_MS)).run();
}
function background(ctx,promise){if(ctx?.waitUntil)ctx.waitUntil(promise.catch(()=>{}));else promise.catch(()=>{});}

export function recordAIEvent(env,ctx,identity){
  if(!env.DB||!validIdentity(identity)||!['success','failure'].includes(identity.outcome))return;
  const now=Date.now();
  background(ctx,(async()=>{
    // Rejected AI requests must not become an unbounded analytics write path.
    if(!await reserve(env.DB,'analytics:ai:'+dayAt(now),1000))return;
    await insertEvent(env.DB,{...identity,type:identity.outcome==='success'?'ai_reply_success':'ai_reply_failure',detail:''},now);
    await cleanup(env.DB,now);
  })());
}

const METRICS=`COUNT(CASE WHEN event_type='page_open' THEN 1 END) AS opens,
 COUNT(DISTINCT CASE WHEN event_type='page_open' THEN visitor_id END) AS visitors,
 COUNT(DISTINCT CASE WHEN event_type='home_entered' THEN visitor_id END) AS homeVisitors,
 COUNT(DISTINCT CASE WHEN event_type IN ('culture_started','ai_reply_success') THEN visitor_id END) AS usedVisitors,
 COUNT(DISTINCT CASE WHEN event_type='ai_reply_success' THEN visitor_id END) AS aiVisitors,
 COUNT(CASE WHEN event_type='ai_reply_success' THEN 1 END) AS aiSuccesses,
 COUNT(CASE WHEN event_type='ai_reply_failure' THEN 1 END) AS aiFailures`;
function numeric(row={}){return Object.fromEntries(KEYS.map(key=>[key,Number(row[key])||0]));}
async function report(db){
  const now=Date.now(),end=dayAt(now),start=dayAt(now-6*DAY_MS);
  const totals=numeric(await db.prepare('SELECT '+METRICS+' FROM analytics_events WHERE day BETWEEN ? AND ?').bind(start,end).first());
  const aggregate=await db.prepare('SELECT day AS date,'+METRICS+' FROM analytics_events WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day').bind(start,end).all();
  const returns=await db.prepare("SELECT e.day AS date,COUNT(DISTINCT e.visitor_id) AS returningVisitors FROM analytics_events e WHERE e.day BETWEEN ? AND ? AND e.event_type='page_open' AND EXISTS (SELECT 1 FROM analytics_events p WHERE p.visitor_id=e.visitor_id AND p.event_type='page_open' AND p.day<e.day) GROUP BY e.day").bind(start,end).all();
  const totalReturns=await db.prepare("SELECT COUNT(DISTINCT e.visitor_id) AS returningVisitors FROM analytics_events e WHERE e.day BETWEEN ? AND ? AND e.event_type='page_open' AND EXISTS (SELECT 1 FROM analytics_events p WHERE p.visitor_id=e.visitor_id AND p.event_type='page_open' AND p.day<e.day)").bind(start,end).first();
  totals.returningVisitors=Number(totalReturns?.returningVisitors)||0;
  const collected=await db.prepare("SELECT value FROM analytics_metadata WHERE key='collected_since'").first();
  const byDay=new Map((aggregate.results||[]).map(row=>[row.date,numeric(row)]));
  for(const row of returns.results||[]){if(byDay.has(row.date))byDay.get(row.date).returningVisitors=Number(row.returningVisitors)||0;}
  const daily=Array.from({length:7},(_,index)=>{const date=dayAt(now-(6-index)*DAY_MS);return {date,...(byDay.get(date)||numeric())};});
  return {timezone:'Asia/Shanghai',start,end,generatedAt:new Date(now).toISOString(),collectedSince:collected?.value||null,totals,daily};
}

export async function handleAnalytics(request,env,ctx,{allowedOrigin='https://buu206.github.io'}={}){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(url.pathname==='/api/analytics/events'){
    if(origin!==allowedOrigin)return json({error:'请求来源不允许'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store','Vary':'Origin'}});
    if(request.method!=='POST')return json({error:'请使用 POST 请求'},405,origin);
    if(!env.DB)return json({error:'统计服务尚未就绪'},503,origin);
    let events;try{events=validatedEvents(await readJSON(request,4096));}catch(e){return json({error:'统计事件格式不正确'},e.message==='SIZE'?413:e.message==='TYPE'?415:400,origin);}
    try{
      const now=Date.now(),ip=await ipBucket(request,now);
      if(!await reserve(env.DB,'analytics:minute:'+Math.floor(now/60000)+':'+ip,60,events.length)||!await reserve(env.DB,'analytics:day:'+dayAt(now),10000,events.length))return json({error:'统计请求过于频繁'},429,origin);
      for(const event of events)await insertEvent(env.DB,event,now);
      background(ctx,cleanup(env.DB,now));
      return json({accepted:events.length},202,origin);
    }catch{return json({error:'统计服务暂时不可用'},503,origin);}
  }
  if(!url.pathname.startsWith('/api/admin/'))return null;
  // Admin routes never emit CORS headers. Only the same-origin dashboard can make mutations.
  if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.method!=='GET'&&origin!==url.origin))return json({error:'请求来源不允许'},403);
  if(!env.DB||!env.MINXING_ADMIN_PASSWORD||env.MINXING_ADMIN_PASSWORD.length<24)return json({error:'管理入口尚未配置'},503);
  try{
    if(url.pathname==='/api/admin/login'){
      if(request.method!=='POST')return json({error:'请使用 POST 请求'},405);
      let body;try{body=await readJSON(request,1024);}catch{return json({error:'登录格式不正确'},400);}
      if(!body||typeof body.password!=='string'||body.password.length>512)return json({error:'登录格式不正确'},400);
      const now=Date.now(),ip=await ipBucket(request,now);
      if(!await reserve(env.DB,'analytics:login:'+Math.floor(now/900000)+':'+ip,5))return json({error:'尝试次数过多，请 15 分钟后再试'},429);
      if(!await passwordMatches(body.password,env.MINXING_ADMIN_PASSWORD))return json({error:'密码不正确'},401);
      background(ctx,cleanup(env.DB,now));
      return json({authenticated:true},200,null,{'Set-Cookie':await sessionCookie(env.MINXING_ADMIN_PASSWORD)});
    }
    if(!await authenticated(request,env.MINXING_ADMIN_PASSWORD))return json({error:'请先登录'},401);
    if(url.pathname==='/api/admin/logout'&&request.method==='POST')return json({authenticated:false},200,null,{'Set-Cookie':COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    if(url.pathname==='/api/admin/analytics'&&request.method==='GET')return json(await report(env.DB));
    return json({error:'接口不存在'},404);
  }catch{return json({error:'统计服务暂时不可用'},503);}
}
