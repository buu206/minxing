const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {readFileSync}=require('node:fs');
const source=readFileSync(new URL('../analytics.js','file://'+__filename),'utf8');
function browser({url='https://buu206.github.io/minxing/colony.html#home',store=new Map(),storageFailure=false,gpc=false,status=202}={}){
  const requests=[],timers=new Map(),handlers=new Map(),elements=new Map();let nextTimer=0;
  elements.set('homePage',{hidden:false,inert:false});
  for(const id of ['homeAnalyticsToggle','homeAnalyticsStatus'])elements.set(id,{textContent:'',disabled:false,setAttribute(){},addEventListener(type,fn){handlers.set(id+':'+type,fn);}});
  const document={hidden:false,getElementById:id=>elements.get(id),addEventListener:(type,fn)=>handlers.set('document:'+type,fn)};
  const location=new URL(url);
  const env={URL,Uint8Array,Promise,Set,crypto:webcrypto,AbortController,location,document,navigator:{globalPrivacyControl:gpc},
    localStorage:{getItem(key){if(storageFailure)throw Error('denied');return store.get(key)||null;},setItem(key,value){if(storageFailure)throw Error('denied');store.set(key,value);}},
    history:{state:null,replaceState(state,title,next){const u=new URL(next,location);location.href=u.href;}},
    addEventListener:(type,fn)=>handlers.set('window:'+type,fn),
    setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    fetch(target,options){requests.push({target,options,body:JSON.parse(options.body)});return Promise.resolve({status});}};
  env.window=env;vm.runInNewContext(source,env);
  return {api:env.HomeAnalytics,requests,store,timers,document,elements,location,
    finish(reason){handlers.get('document:home-intro-finished')({detail:{reason}});},
    visible(){document.hidden=false;handlers.get('document:visibilitychange')();},
    storage(value){handlers.get('window:storage')({key:'minxing.analytics.preference.v1',newValue:value});}};
}
const events=app=>app.requests.map(request=>request.body.events[0]);
test('production opens before app boot, with browser deduplication and fresh sessions',()=>{
  const store=new Map(),first=browser({store}),second=browser({store});
  assert.equal(events(first)[0].type,'page_open');
  assert.equal(events(first)[0].visitorId,events(second)[0].visitorId);
  assert.notEqual(events(first)[0].sessionId,events(second)[0].sessionId);
  const a=first.api.context(),b=first.api.context();
  assert.equal(a.visitorId,b.visitorId);assert.notEqual(a.eventId,b.eventId);
  assert.equal(first.requests[0].options.credentials,'omit');
});
test('local preview, explicit exclusion and browser privacy signals never collect',()=>{
  for(const app of [browser({url:'http://127.0.0.1:18777/colony.html'}),browser({url:'https://buu206.github.io/other/'}),browser({url:'https://buu206.github.io/minxing/colony.html?analytics=off#home'}),browser({gpc:true})]){
    app.finish('complete');app.api.track('culture_started');assert.equal(app.requests.length,0);assert.equal(app.api.context(),null);
  }
  const store=new Map(),excluded=browser({url:'https://buu206.github.io/minxing/colony.html?analytics=off#home',store});
  assert.equal(excluded.location.search,'');assert.equal(browser({store}).requests.length,0);
  const restored=browser({url:'https://buu206.github.io/minxing/colony.html?analytics=on#home',store});
  assert.equal(restored.requests.length,1);
});
test('home arrival counts once across intro replay and route changes',()=>{
  const app=browser();app.finish('route');app.finish('restart');assert.equal(app.requests.length,1);
  app.finish('complete');app.finish('complete');app.finish('route');
  assert.deepEqual(events(app).map(e=>e.type),['page_open','home_entered']);
  assert.equal(events(app)[1].detail,'completed');
  for(const [reason,detail]of [['skip','skipped'],['escape','skipped'],['reduced-motion','reduced'],['visual-unavailable','completed']]){
    const variant=browser();variant.finish(reason);assert.equal(events(variant)[1].detail,detail);
  }
});
test('background completion counts an arrival only after visible return',()=>{
  const app=browser();app.document.hidden=true;app.finish('hidden');assert.equal(app.requests.length,1);
  app.visible();assert.equal(events(app)[1].type,'home_entered');assert.equal(events(app)[1].detail,'skipped');
});
test('storage failure leaves product usable with temporary identifiers',()=>{
  const app=browser({storageFailure:true});app.finish('complete');
  assert.equal(app.requests.length,2);assert.ok(app.api.context().visitorId);
  app.api.setEnabled(false);assert.equal(app.api.context(),null);
  assert.match(app.elements.get('homeAnalyticsStatus').textContent,/本页已关闭/);
});
test('frontend whitelist cannot report AI success or leak extra detail',()=>{
  const app=browser();assert.equal(app.api.track('ai_reply_success'),false);
  app.api.track('culture_started','private content');
  const event=events(app)[1];assert.equal(event.type,'culture_started');assert.equal('detail' in event,false);
  assert.deepEqual(Object.keys(event).sort(),['eventId','sessionId','type','visitorId']);
});
test('a failed send has a bounded retry with the same event ID and opt-out cancels it',async()=>{
  const app=browser({status:503});await new Promise(resolve=>setImmediate(resolve));
  const retry=[...app.timers.values()].find(t=>t.ms===1500);assert.ok(retry);retry.fn();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(app.requests.length,2);
  assert.equal(events(app)[0].eventId,events(app)[1].eventId);
  const another=browser({status:503});await new Promise(resolve=>setImmediate(resolve));another.api.setEnabled(false);
  assert.equal(another.timers.size,0);assert.equal(another.api.context(),null);
});
test('opt-out in another tab stops subsequent event and AI context collection',()=>{
  const app=browser();app.storage('off');app.finish('complete');app.api.track('culture_started');
  assert.equal(app.requests.length,1);assert.equal(app.api.context(),null);
});
