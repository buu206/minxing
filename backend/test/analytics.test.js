import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleAnalytics,recordAIEvent} from '../worker/analytics.js';

const HOST='https://service.test';
const ORIGIN='https://buu206.github.io';
const PASSWORD='test-dashboard-password-never-a-real-credential';
const VISITOR='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
function fixture(t){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of ['0000_request_quotas.sql','0001_analytics.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  t.after(()=>sqlite.close());
  const tasks=[];
  const db={prepare(sql){
    const make=(args=[])=>({bind(...values){return make(values);},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);}});
    return make();
  }};
  return {sqlite,env:{DB:db,MINXING_ADMIN_PASSWORD:PASSWORD},ctx:{waitUntil(p){tasks.push(p);}},async settle(){while(tasks.length)await Promise.all(tasks.splice(0));}};
}
function req(path,body,headers={}){
  const method=body===undefined?'GET':'POST';
  return new Request(HOST+path,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:path.startsWith('/api/admin/')?HOST:ORIGIN}),'CF-Connecting-IP':'192.0.2.1',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function event(type='page_open',visitorId=VISITOR){return {type,visitorId,sessionId:crypto.randomUUID(),eventId:crypto.randomUUID()};}
function call(f,request){return handleAnalytics(request,f.env,f.ctx,{allowedOrigin:ORIGIN});}
async function login(f){const r=await call(f,req('/api/admin/login',{password:PASSWORD}));assert.equal(r.status,200);await f.settle();return r.headers.get('Set-Cookie').split(';')[0];}
async function report(f,cookie){const r=await call(f,req('/api/admin/analytics',undefined,{Cookie:cookie}));assert.equal(r.status,200);return r.json();}

test('admin requires signed session, rejects cross-origin and never returns passwords',async t=>{
  const f=fixture(t);
  assert.equal((await call(f,req('/api/admin/analytics'))).status,401);
  assert.equal((await call(f,req('/api/admin/login',{password:PASSWORD},{Origin:ORIGIN}))).status,403);
  const bad=await call(f,req('/api/admin/login',{password:'wrong'}));assert.equal(bad.status,401);assert.equal((await bad.text()).includes(PASSWORD),false);
  const loginResponse=await call(f,req('/api/admin/login',{password:PASSWORD}));
  const set=loginResponse.headers.get('Set-Cookie');assert.match(set,/HttpOnly/);assert.match(set,/Secure/);assert.match(set,/SameSite=Strict/);assert.match(set,/Max-Age=28800/);assert.equal(set.includes(PASSWORD),false);
  const cookie=set.split(';')[0];
  assert.equal((await call(f,req('/api/admin/analytics',undefined,{Cookie:cookie,Origin:ORIGIN}))).status,403);
  assert.equal((await call(f,req('/api/admin/analytics',undefined,{Cookie:cookie+'tampered'}))).status,401);
  const stats=await call(f,req('/api/admin/analytics',undefined,{Cookie:cookie}));assert.equal(stats.status,200);assert.equal(stats.headers.get('Access-Control-Allow-Origin'),null);assert.equal(stats.headers.get('Cache-Control'),'no-store');
  const logout=await call(f,req('/api/admin/logout',{}, {Cookie:cookie}));assert.equal(logout.status,200);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
  await f.settle();
});

test('empty dashboard returns seven zero-filled Beijing dates and expired sessions fail',async t=>{
  const f=fixture(t),original=Date.now;let now=Date.parse('2026-11-10T16:00:00Z');Date.now=()=>now;t.after(()=>Date.now=original);
  const cookie=await login(f),result=await report(f,cookie);
  assert.equal(result.start,'2026-11-05');assert.equal(result.end,'2026-11-11');assert.equal(result.timezone,'Asia/Shanghai');assert.equal(result.collectedSince,null);assert.equal(result.daily.length,7);assert.equal(result.daily[6].date,'2026-11-11');
  for(const value of Object.values(result.totals))assert.equal(value,0);
  now+=8*3600000+1;assert.equal((await call(f,req('/api/admin/analytics',undefined,{Cookie:cookie}))).status,401);
});

test('event allowlist rejects fake AI success, extra data, oversized bodies and wrong origins',async t=>{
  const f=fixture(t);
  for(const candidate of [{...event(),type:'ai_reply_success'},{...event(),visitorId:'someone'},{...event(),message:'must not store'},{...event(),detail:'secret'}]){
    assert.equal((await call(f,req('/api/analytics/events',{events:[candidate]}))).status,400);
  }
  assert.equal((await call(f,req('/api/analytics/events',{events:Array.from({length:6},()=>event())}))).status,400);
  assert.equal((await call(f,req('/api/analytics/events',{events:[event()],extra:'x'.repeat(5000)}))).status,413);
  assert.equal((await call(f,req('/api/analytics/events',{events:[event()]},{Origin:'https://evil.test'}))).status,403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM analytics_events').get().count,0);
});

test('idempotent events, successful AI use and cross-day returns aggregate without summing daily users',async t=>{
  const f=fixture(t),original=Date.now;let now=Date.parse('2026-11-09T15:59:59Z');Date.now=()=>now;t.after(()=>Date.now=original);
  const first=event(),home={...event('home_entered'),detail:'completed'};
  assert.equal((await call(f,req('/api/analytics/events',{events:[first,home]}))).status,202);
  assert.equal((await call(f,req('/api/analytics/events',{events:[first]}))).status,202);
  await f.settle();
  now=Date.parse('2026-11-09T16:00:01Z');
  await call(f,req('/api/analytics/events',{events:[event(),event('page_open',OTHER),event('culture_started')]}));await f.settle();
  const ai={...event('ignored',OTHER),outcome:'success'};recordAIEvent(f.env,f.ctx,ai);recordAIEvent(f.env,f.ctx,ai);
  recordAIEvent(f.env,f.ctx,{...event('ignored'),outcome:'failure'});await f.settle();
  const cookie=await login(f),result=await report(f,cookie);
  assert.deepEqual(result.totals,{opens:3,visitors:2,homeVisitors:1,usedVisitors:2,aiVisitors:1,aiSuccesses:1,aiFailures:1,returningVisitors:1});
  assert.equal(result.daily.at(-2).date,'2026-11-09');assert.equal(result.daily.at(-2).opens,1);assert.equal(result.daily.at(-1).opens,2);assert.equal(result.daily.at(-1).returningVisitors,1);
  assert.equal(result.collectedSince,'2026-11-09T15:59:59.000Z');
  assert.deepEqual(f.sqlite.prepare("SELECT bucket FROM request_quotas WHERE bucket LIKE 'analytics:cleanup:%' ORDER BY bucket").all().map(row=>row.bucket),['analytics:cleanup:2026-11-09','analytics:cleanup:2026-11-10']);
});

test('event and login rate limits do not spend model quota',async t=>{
  const f=fixture(t);
  for(let i=0;i<12;i++){const r=await call(f,req('/api/analytics/events',{events:Array.from({length:5},()=>event())}));assert.equal(r.status,202);await f.settle();}
  assert.equal((await call(f,req('/api/analytics/events',{events:[event()]}))).status,429);
  for(let i=0;i<5;i++)assert.equal((await call(f,req('/api/admin/login',{password:'wrong'}))).status,401);
  assert.equal((await call(f,req('/api/admin/login',{password:PASSWORD}))).status,429);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM request_quotas WHERE bucket LIKE 'day:%' OR bucket LIKE 'minute:%'").get().count,0);
});

test('retention removes events older than thirty Beijing days and keeps collection start',async t=>{
  const f=fixture(t),original=Date.now;let now=Date.parse('2026-10-01T04:00:00Z');Date.now=()=>now;t.after(()=>Date.now=original);
  await call(f,req('/api/analytics/events',{events:[event()]}));await f.settle();
  now=Date.parse('2026-11-10T04:00:00Z');await call(f,req('/api/analytics/events',{events:[event()]}));await f.settle();
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM analytics_events').get().count,1);
  const result=await report(f,await login(f));assert.equal(result.collectedSince,'2026-10-01T04:00:00.000Z');assert.equal(result.totals.returningVisitors,0);
});

test('analytics storage failures are isolated from model responses',async()=>{
  const env={DB:{prepare(){throw new Error('private storage details');}},MINXING_ADMIN_PASSWORD:PASSWORD};
  const jobs=[],ctx={waitUntil(p){jobs.push(p);}};
  assert.doesNotThrow(()=>recordAIEvent(env,ctx,{...event(),outcome:'success'}));await Promise.all(jobs);
  const r=await handleAnalytics(req('/api/analytics/events',{events:[event()]}),env,ctx,{allowedOrigin:ORIGIN});assert.equal(r.status,503);assert.equal((await r.text()).includes('private storage details'),false);
});
