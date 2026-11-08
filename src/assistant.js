// B / session-only, explicitly unconnected assistant workspace.
const HomeAssistant = (() => {
  let initialized = false;
  let opened = false, nextTurn = 1, workspace = null;
  const conversation = [];
  const MAX_TURNS = 10;
  const prompts = {
    inspect: '解读我的培养皿',
    start: '帮我开始第一皿',
    compare: '设计一次对照'
  };
  const get = id => document.getElementById(id);
  const copy = value => value ? JSON.parse(JSON.stringify(value)) : null;
  const percent = value => Math.round(value * 100) + '%';
  const shortHour = value => Number(value.toFixed(1)).toString() + ' 小时';
  const identity = record => record ? [record.id || 'first', record.hours, record.temperature, record.light, record.life?.nutrient, record.colonies.length].join('|') : '';
  const name = id => SP[IDX[id]]?.name || id;
  function detect(text) {
    if (Object.hasOwn(prompts, text)) return text;
    if (/对照|假如|如果|会怎样|会怎么样|试算|比较.*温|换.*温|设计.*(?:实验|条件)|调到|升到|降到/.test(text)) return 'compare';
    if (/第一皿|开始.*(?:养|培养|一皿)|新建|推荐|选.*(?:菌|培养基)|养什么|种什么|想养|想种|彩色|颜色丰富/.test(text)) return 'start';
    if (/解读|分析|我的|看看|看一下|看一看|生长|长得|状态|营养|死亡|死了|停止|慢|活性|温度|光照/.test(text)) return 'inspect';
    return 'unknown';
  }
  function recommendation(text) {
    // These are existing unlocked prototype specimens and model parameters, not lab advice.
    if (/红|黄|彩色|颜色丰富/.test(text)) return {
      ids: ['serr', 'micro'], medium: 'lb', temperature: 30,
      title: '从红与黄的对比开始',
      observation: '在虚拟培养皿里，对比两种菌落的颜色、大小和边缘。'
    };
    if (/藻|绿|光照/.test(text)) return {
      ids: ['chlor'], medium: 'algae', temperature: 25,
      title: '从一皿绿色开始',
      observation: '先观察小球藻，再在培养室调整培养光，记录前后的模拟变化。'
    };
    return {
      ids: ['pen', 'asp'], medium: 'pda', temperature: 27,
      title: '先养一皿有细节的风景',
      observation: '青霉与黑曲霉：从中心颜色和白色边缘开始观察。'
    };
  }
  function emptyReply(intent, record) {
    if (record) return {
      title: '培养基已经准备好，接种后就能解读',
      lines: ['这只培养皿里还没有菌落，暂时没有生长变化可分析。', '先放下一个接种点，再回来看看它怎样变化。'],
      source: '依据当前培养记录 · 尚未接种',
      action: { label: '去放下第一个接种点', type: 'plant' }
    };
    return {
      title: intent === 'compare' ? '先有一皿，才能做有依据的对照' : '还没有自己的培养皿',
      lines: ['下方“今日观察”的培养皿是展示示例，还不是你的培养记录。', '可以先选一组菌种，接种后萤萤会读取这只皿的数据。'],
      source: '本地功能演示 · 不生成不存在的培养数据',
      action: { label: '帮我选第一皿', type: 'ask', value: 'start' }
    };
  }
  function inspect(record) {
    if (!record?.colonies?.length) return emptyReply('inspect', record);
    const summary = Life.summary(record);
    const source = '依据当前培养记录 · ' + shortHour(record.hours) + '时点';
    const readings = '营养 ' + percent(summary.nutrient) + ' · 活性 ' + percent(summary.vitality) + ' · 存活 ' + summary.alive + '/' + summary.total + ' 个菌落。';
    if (summary.dead) return {
      title: '这一皿已失去活性，记录还在',
      lines: [readings, '记录中的损伤：' + (summary.causes.join('、') || '活性持续下降') + '。', '补充营养或恢复温度不会让已死亡的菌落复活，可以从预警前的时点做复盘。'],
      source, action: {label:'看看转折发生在哪里',type:'route',value:'review'}
    };
    const latest = record.life.events.filter(event => event.type !== 'migration').at(-1);
    let next = summary.nutrient < .15 ? '营养偏低。可以在监控里补充营养，再比较后续活性。' :
      summary.vitality < .8 ? '活性正在偏低区间，先查看温度与损伤记录。' :
      summary.phase === '低温停滞' ? '模型显示低温停滞，可以先试算不同温度，不必直接改动培养皿。' :
      summary.phase === '迟滞期' ? '目前还在适应阶段。先记住接种点，稍后回来比较大小和边缘。' :
      '可以记录一次中心颜色与边缘的变化，再和下一次观察比较。';
    const lines = [record.temperature + ' °C · ' + summary.phase + '。' + readings, next];
    if (latest) lines.push('最近记录：' + latest.text + '（培养 ' + shortHour(latest.hours) + '）。');
    return {
      title: (record.name || '你的培养皿') + '，现在是' + summary.phase,
      lines, source, action:{label:'展开数据监控',type:'route',value:'monitor'}
    };
  }
  function starter(text) {
    const setup = recommendation(text);
    const medium = appMedia[setup.medium].name;
    return {
      title: setup.title,
      lines: [setup.ids.map(name).join(' + ') + ' · ' + medium + ' 培养基 · ' + setup.temperature + ' °C。', setup.observation,
        '先打开配置，确认后才会新建一皿。'],
      species: setup.ids,
      source:'本地功能演示 · 根据现有菌种与培养模型推荐',
      action:{label:'用这组配置开始',type:'setup',value:setup}
    };
  }
  function requestedTemperature(text) {
    const match = text.match(/(?:温度(?:调到|改到|设为|改为|是)?|调到|升到|降到|改成|改为)\s*(-?\d+(?:\.\d+)?)/) || text.match(/(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃|度)/i);
    return match ? Number(match[1]) : null;
  }
  function compare(record, text) {
    if (!record?.colonies?.length) return emptyReply('compare', record);
    const current = Life.summary(record);
    if (current.dead) return {
      title:'已死亡的状态无法靠改变条件逆转',
      lines:['从现在开始试算，已死亡菌落仍会保持死亡。', '可以打开复盘，从最近一次预警前的记录出发，比较其他条件可能带来的变化。'],
      source:'依据当前培养记录 · 不改写死亡状态',
      action:{label:'从转折前重新比较',type:'route',value:'review'}
    };
    if (/光|灯/.test(text) && requestedTemperature(text) === null && !/营养|补充|喂养/.test(text)) return {
      title:'先把观察光和培养光分开看',
      lines:['展陈、灯箱和暗场只改变观察画面；培养光才会进入生长模型。', '这版首页的对照演示先支持温度与营养，你可以先选一个条件来比较。'],
      source:'演示模式 · 未连接 AI 模型',
      action:{label:'试一次温度对照',type:'ask',value:'compare'}
    };
    const requested = requestedTemperature(text);
    if (requested !== null && (!Number.isFinite(requested) || requested < 15 || requested > 42)) return {
      title:'先选一个模型支持的温度',
      lines:['这版原型的温度范围是 15–42 °C。', '例如输入“调到 25 度会怎样”，我会对照同一只皿未来 24 小时的模拟变化。'],
      source:'本地功能演示 · 不推算范围外的数值',
      action:{label:'使用推荐条件对照',type:'ask',value:'compare'}
    };
    const nutrient = /营养|补充|喂养/.test(text) && requested === null;
    const average = Math.round(record.species.reduce((sum,id)=>sum+SP[IDX[id]].Topt,0)/record.species.length);
    let temperature = requested ?? average;
    if (requested === null && Math.abs(temperature-record.temperature)<1) temperature = Math.max(15,temperature-5);
    const changes = nutrient ? {feed:.35} : {temperature};
    const baseline = Life.summary(Life.forecast(record,24));
    const alternate = Life.summary(Life.forecast(record,24,changes));
    const condition = nutrient ? '补充营养' : temperature + ' °C';
    return {
      title:'把“' + condition + '”作为一个对照',
      lines:[
        '同一只皿，从当前时点向前模拟 24 小时，仅改变' + (nutrient?'营养':'温度') + '。',
        '保持原条件：存活 ' + baseline.alive + '/' + baseline.total + '，活性 ' + percent(baseline.vitality) + '，覆盖率 ' + baseline.coverage.toFixed(1) + '%。',
        '采用对照条件：存活 ' + alternate.alive + '/' + alternate.total + '，活性 ' + percent(alternate.vitality) + '，覆盖率 ' + alternate.coverage.toFixed(1) + '%。'
      ],
      source:'本地培养模型试算 · 非真实实验结论，未改动你的培养皿',
      action:{label:'打开复盘继续比较',type:'forecast',value:{temperature:nutrient?record.temperature:temperature,feed:nutrient}}
    };
  }
  function describe(intent, original, text = '') {
    // Life.summary may initialize legacy fields, so every answer works on its own copy.
    const record = copy(original);
    if (intent === 'start') return starter(text);
    if (intent === 'inspect') return inspect(record);
    if (intent === 'compare') return compare(record,text);
    return {
      title:'这版萤萤先陪你做好三件事',
      lines:['解读当前培养皿、推荐第一皿、试算一次条件对照。', '当前是功能演示，还不能像已连接模型的 AI 一样回答任意问题。'],
      source:'演示模式 · 未连接 AI 模型',
      action:{label:'先看看我的培养皿',type:'ask',value:'inspect'}
    };
  }
  function element(tag,text,className) {
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    if(className)node.className=className;
    return node;
  }
  function metadata(record) {
    if(!record)return null;
    return {
      id:record.id||'first',hours:record.hours,temperature:record.temperature,light:record.light,
      nutrient:record.life?.nutrient,
      colonies:record.colonies.map(c=>[c.species,c.life?.alive,c.life?.viability])
    };
  }
  function isStale(turn) {
    const now=metadata(firstRecord),then=turn.record;
    if(!now||!then)return Boolean(now)!==Boolean(then);
    return now.id!==then.id || Math.abs(now.hours-then.hours)>=1 || now.temperature!==then.temperature || now.light!==then.light ||
      Math.abs((now.nutrient??1)-(then.nutrient??1))>=.01 ||
      now.colonies.length!==then.colonies.length || now.colonies.some((c,i)=>
        c[0]!==then.colonies[i]?.[0] || c[1]!==then.colonies[i]?.[1] || Math.abs((c[2]??1)-(then.colonies[i]?.[2]??1))>=.01);
  }
  function turnTime(turn) {
    return turn.record ? '培养 '+shortHour(turn.record.hours)+'时的记录' : '提问时尚无个人培养记录';
  }
  function setOpen(value) {
    const changed=opened!==value;
    opened=value;
    document.body.classList.toggle('home-ai-open',value);
    const panel=get('homeAssistantReply');if(panel)panel.hidden=!value;
    document.querySelectorAll('[data-home-ask],[data-home-ai-open]').forEach(button=>button.setAttribute('aria-expanded',String(value)));
    if(changed)document.dispatchEvent(new CustomEvent('home-assistant-state',{detail:{open:value}}));
  }
  function ensureWorkspace() {
    if(workspace)return workspace;
    const panel=get('homeAssistantReply');if(!panel)return null;
    // Fixed outside the hero avoids transformed / clipped containing blocks.
    document.body.append(panel);
    panel.replaceChildren();panel.hidden=true;
    panel.setAttribute('role','complementary');panel.setAttribute('aria-labelledby','homeAssistantWorkspaceTitle');
    panel.removeAttribute('aria-live');panel.removeAttribute('aria-label');
    const header=element('header',undefined,'home-ai-header');
    const identityBlock=element('div',undefined,'home-ai-identity');
    const mark=element('span','✦','home-ai-identity-mark');mark.setAttribute('aria-hidden','true');
    const naming=element('div');
    const title=element('h2','萤萤 AI');title.id='homeAssistantWorkspaceTitle';
    const mode=element('p','功能演示 · 未连接模型','home-ai-connection');
    naming.append(title,mode);identityBlock.append(mark,naming);
    const dismiss=element('button','×','home-ai-close');dismiss.type='button';dismiss.setAttribute('aria-label','关闭萤萤对话');dismiss.title='关闭 · Esc';dismiss.onclick=()=>close({focus:true});
    header.append(identityBlock,dismiss);
    const update=element('div',undefined,'home-ai-update');update.hidden=true;
    update.append(element('p','培养记录已更新。下方保留的是提问时的快照。'));
    const refresh=element('button','重新解读');refresh.type='button';refresh.onclick=()=>ask('inspect');update.append(refresh);
    const messages=element('div',undefined,'home-ai-messages');messages.id='homeAssistantMessages';
    messages.setAttribute('role','log');messages.setAttribute('aria-live','off');messages.setAttribute('aria-label','本次对话');
    const composer=element('div',undefined,'home-ai-composer');
    const form=element('form');form.id='homeAssistantFollowupForm';
    const label=element('label','继续向萤萤提问','home-ai-sr');label.htmlFor='homeAssistantFollowupInput';
    const input=element('input');input.id='homeAssistantFollowupInput';input.type='text';input.maxLength=280;input.autocomplete='off';input.placeholder='继续问，或换个条件试试…';
    const send=element('button','↑');send.type='submit';send.setAttribute('aria-label','发送给萤萤');
    form.append(label,input,send);
    form.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim();if(value){ask(value);input.value='';}});
    composer.append(form,element('p','解读来自培养记录，对照采用本地教学模型。','home-ai-composer-note'));
    const announce=element('p',undefined,'home-ai-sr');announce.id='homeAssistantAnnouncement';announce.setAttribute('role','status');announce.setAttribute('aria-live','polite');
    panel.append(header,update,messages,composer,announce);
    workspace={panel,header,update,messages,composer,input,announce};
    return workspace;
  }
  function welcome() {
    const block=element('div',undefined,'home-ai-welcome');
    block.append(element('span','从好奇心开始','home-ai-small-label'),element('h3','想一起看看什么？'),element('p','从一只培养皿出发，读懂变化，再试一个新想法。'));
    const choices=element('div',undefined,'home-ai-welcome-choices');
    for(const [key,label]of Object.entries(prompts)){
      const button=element('button');button.type='button';button.dataset.workspacePrompt=key;
      button.append(element('span',label),element('span','↗'));button.onclick=()=>ask(key);choices.append(button);
    }
    block.append(choices,element('p','现在可体验这三类任务。未连接模型，暂不提供开放式问答。','home-ai-welcome-note'));
    return block;
  }
  function renderMessages() {
    const view=ensureWorkspace();if(!view)return;
    const nodes=[];
    if(!conversation.length)nodes.push(welcome());
    for(const turn of conversation){
      const group=element('section',undefined,'home-ai-turn');group.dataset.turn=turn.id;group.setAttribute('aria-label','问题：'+turn.question);
      const user=element('div',undefined,'home-ai-user');user.append(element('span','你','home-ai-speaker'),element('p',turn.question));
      const response=element('div',undefined,'home-ai-response');
      const heading=element('h3',turn.answer.title);heading.id='homeAssistantAnswerTitle-'+turn.id;
      response.append(element('span','萤萤','home-ai-speaker'),heading);
      if(turn.answer.species){
        const specimens=element('div',undefined,'home-ai-specimens');
        for(const id of turn.answer.species){const chip=element('span');const image=document.createElement('img');image.src=appAsset(id);image.alt='';image.width=image.height=28;chip.append(image,document.createTextNode(name(id)));specimens.append(chip);}
        response.append(specimens);
      }
      const body=element('div',undefined,'home-ai-prose');
      for(const line of turn.answer.lines)body.append(element('p',line));
      const provenance=element('div',undefined,'home-ai-provenance');
      const timestamp=element('p',turnTime(turn),'home-ai-snapshot');
      const source=element('p',turn.answer.source,'home-ai-source');
      const stale=element('span','历史快照','home-ai-stale');stale.hidden=!isStale(turn);
      provenance.append(timestamp,source,stale);
      const action=element('button',turn.answer.action.label,'home-ai-action');action.type='button';action.dataset.turnAction=turn.id;action.onclick=()=>perform(turn.answer.action,turn);
      response.append(body,provenance,action);group.append(user,response);nodes.push(group);
    }
    view.messages.replaceChildren(...nodes);
    updateStale();
  }
  function updateStale() {
    if(!workspace)return;
    const latest=conversation.at(-1);
    workspace.update.hidden=!latest||!isStale(latest);
    for(const turn of conversation){
      const marker=workspace.messages.querySelector('[data-turn="'+turn.id+'"] .home-ai-stale');if(marker)marker.hidden=!isStale(turn);
    }
  }
  function open({focus=true}={}) {
    const view=ensureWorkspace();if(!view)return;
    if(!view.messages.children.length)renderMessages();
    updateStale();setOpen(true);
    if(focus)view.input.focus({preventScroll:true});
  }
  function close({focus=false}={}) {
    setOpen(false);
    if(focus)get('homeAssistantInput')?.focus({preventScroll:true});
  }
  function perform(action,turn) {
    if(action.type==='ask')return ask(action.value);
    const dependent=['plant','forecast'].includes(action.type)||(action.type==='route'&&['monitor','review','discover'].includes(action.value));
    if(dependent&&turn&&isStale(turn)){
      const refreshed=ask(turn.query);
      if(workspace)workspace.announce.textContent='培养记录已有变化，已按当前记录重新解读。请查看最新回答后继续。';
      return refreshed;
    }
    close();
    if(action.type==='setup'){
      const setup=action.value;
      chosenMedium=setup.medium;chosenSpecies=setup.ids.slice();chosenMethod='point';
      appNavigate('new');get('newTemperature').value=setup.temperature;renderNewPage();return;
    }
    if(action.type==='plant')return appNavigate('stage',{startInoculation:true});
    if(action.type==='forecast'){
      appNavigate('review');get('reviewFromTurning').checked=false;get('reviewTemperature').value=action.value.temperature;get('reviewAddNutrients').checked=action.value.feed;appReviewRenderForecast();return;
    }
    if(action.type==='route')appNavigate(action.value);
  }
  function ask(query) {
    const text=String(query||'').trim().slice(0,280);if(!text)return;
    const intent=detect(text),answer=describe(intent,firstRecord,text);
    conversation.push({id:nextTurn++,query:text,question:prompts[text]||text,intent,answer,record:metadata(firstRecord)});
    while(conversation.length>MAX_TURNS)conversation.shift();
    renderMessages();open({focus:false});
    if(workspace){workspace.messages.scrollTop=workspace.messages.scrollHeight;workspace.input.focus({preventScroll:true});workspace.announce.textContent=answer.title;}
    if(typeof HomeLanding!=='undefined'&&typeof HomeLanding.answer==='function')HomeLanding.answer();
    return answer;
  }
  function render() {
    const status=get('homeAIStatus');if(status){status.textContent='AI 功能演示 · 未连接模型';status.title='功能演示，未连接 AI 模型。解读来自当前培养记录，对照使用本地培养模型。';status.setAttribute('aria-label',status.title);}
    const input=get('homeAssistantInput');if(input){input.placeholder=firstRecord?.colonies?.length?'问萤萤：我的菌落现在怎么样？':'问萤萤：帮我开始第一皿';input.maxLength=280;}
    updateStale();
  }
  function init() {
    if(initialized)return;initialized=true;
    const form=get('homeAssistantForm');
    if(form)form.addEventListener('submit',event=>{event.preventDefault();const input=get('homeAssistantInput');const value=input?.value.trim();if(value){ask(value);input.value='';}});
    document.querySelectorAll('[data-home-ask]').forEach(button=>{
      button.type='button';button.setAttribute('aria-controls','homeAssistantReply');button.setAttribute('aria-expanded','false');button.addEventListener('click',()=>ask(button.dataset.homeAsk));
    });
    document.querySelectorAll('[data-home-ai-open]').forEach(button=>{button.setAttribute('aria-controls','homeAssistantReply');button.setAttribute('aria-expanded','false');button.addEventListener('click',()=>open());});
    document.addEventListener('keydown',event=>{if(opened&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close({focus:true});}});
    ensureWorkspace();render();
  }
  return {init,render,open,ask,close,describe,get isOpen(){return opened;}};
})();
