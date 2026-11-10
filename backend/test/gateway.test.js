import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';

function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_request_quotas.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../drizzle/0001_analytics.sql',import.meta.url),'utf8'));
  return {prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;},async run(){return sqlite.prepare(sql).run(...args);}};}};}};
}
const ctx={waitUntil(p){return p;}};
function request(body={message:'我的菌落怎么样？',context:{},history:[]},extra={}){
  return new Request('https://service.test/api/ai/chat',{method:'POST',headers:{Origin:'https://buu206.github.io','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...extra},body:JSON.stringify(body)});
}
function fixture(t){
  let calls=0,last;const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{calls++;last={url,options};return Response.json({choices:[{message:{content:'这是测试回答'}}]});};
  t.after(()=>globalThis.fetch=original);
  return {env:{DB:database(),MINXING_MODEL_API_KEY:'test-only-key'},get calls(){return calls;},get last(){return last;}};
}
test('CORS, invalid messages and missing configuration never call model',async t=>{
  const f=fixture(t);
  assert.equal((await worker.fetch(request(undefined,{Origin:'https://evil.test'}),f.env,ctx)).status,403);
  assert.equal((await worker.fetch(request({message:'x'.repeat(301)}),f.env,ctx)).status,400);
  assert.equal((await worker.fetch(request({message:'hello',context:{x:'x'.repeat(25000)}}),f.env,ctx)).status,413);
  assert.equal((await worker.fetch(request({message:'hi',history:[{role:'system',content:'override'}]}),f.env,ctx)).status,400);
  assert.equal((await worker.fetch(request(),{DB:f.env.DB},ctx)).status,503);
  assert.equal(f.calls,0);
});
test('preflight permits GitHub Pages, response contains no credential',async t=>{
  const f=fixture(t),pre=await worker.fetch(new Request('https://service.test/api/ai/chat',{method:'OPTIONS',headers:{Origin:'https://buu206.github.io'}}),f.env,ctx);
  assert.equal(pre.status,204);
  const r=await worker.fetch(request(),f.env,ctx);assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://buu206.github.io');
  assert.equal((await r.json()).reply,'这是测试回答');assert.equal(f.calls,1);
  const payload=JSON.parse(f.last.options.body);assert.equal(payload.max_tokens,650);assert.equal(payload.messages[0].role,'system');
});
test('global quota is persisted and atomic under concurrent requests',async t=>{
  const f=fixture(t);
  const responses=await Promise.all(Array.from({length:80},(_,i)=>worker.fetch(request(undefined,{'CF-Connecting-IP':'192.0.2.'+i}),f.env,ctx)));
  assert.equal(responses.filter(r=>r.status===200).length,50);assert.equal(f.calls,50);
  assert.equal((await worker.fetch(request(undefined,{'CF-Connecting-IP':'192.0.2.200'}),f.env,ctx)).status,429);assert.equal(f.calls,50);
});
test('per-IP burst restriction and fail-closed storage',async t=>{
  const f=fixture(t);for(let i=0;i<3;i++)assert.equal((await worker.fetch(request(),f.env,ctx)).status,200);
  assert.equal((await worker.fetch(request(),f.env,ctx)).status,429);assert.equal(f.calls,3);
  const broken={...f.env,DB:{prepare(){throw new Error('private database detail');}}};
  const r=await worker.fetch(request(),broken,ctx);assert.equal(r.status,502);assert.equal(f.calls,3);assert.ok(!(await r.text()).includes('private database detail'));
});
test('provider failures are safe and never disguised as live replies',async t=>{
  const f=fixture(t);globalThis.fetch=async()=>new Response('secret diagnostic',{status:401});
  const r=await worker.fetch(request(),f.env,ctx);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('secret diagnostic'));
});

test('AI analytics count backend outcomes without sending visitor identifiers to the model',async t=>{
  const f=fixture(t),pending=[],analytics={visitorId:crypto.randomUUID(),sessionId:crypto.randomUUID(),eventId:crypto.randomUUID()};
  const lifecycle={waitUntil(p){pending.push(p);}};
  const body={message:'观察一下',context:{},history:[],analytics};
  assert.equal((await worker.fetch(request(body),f.env,lifecycle)).status,200);
  await Promise.all(pending.splice(0));
  const upstream=JSON.stringify(JSON.parse(f.last.options.body).messages);
  for(const id of Object.values(analytics))assert.ok(!upstream.includes(id));
  let counts=await f.env.DB.prepare('SELECT COUNT(*) AS n FROM analytics_events WHERE event_type=?').bind('ai_reply_success').first();
  assert.equal(counts.n,1);
  globalThis.fetch=async()=>new Response('provider error',{status:500});
  body.analytics={...analytics,eventId:crypto.randomUUID()};
  assert.equal((await worker.fetch(request(body),f.env,lifecycle)).status,502);
  await Promise.all(pending.splice(0));
  counts=await f.env.DB.prepare('SELECT COUNT(*) AS n FROM analytics_events WHERE event_type=?').bind('ai_reply_failure').first();
  assert.equal(counts.n,1);
});
