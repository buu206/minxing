const LiveAI=(()=>{
  const API_BASE=location.hostname==='buu206.github.io'?'https://minxing-ai.190782129-44b.workers.dev':'';
  let busy=false,dish=null,history=[],statusText='AI · 正在检查模型配置';
  function context(facts){
    const r=firstRecord?JSON.parse(JSON.stringify(firstRecord)):null;
    return {hasPersonalRecord:!!r,summary:r?Life.summary(r):null,temperature:r?.temperature,light:r?.light,medium:r?.medium,
      species:r?.species?.map(id=>({id,name:SP[IDX[id]]?.name})),events:r?.life?.events?.slice(-6).map(x=>({hours:x.hours,type:x.type,text:x.text})),
      facts: facts?{title:facts.title,lines:facts.lines,source:facts.source,simulation:facts.simulation}:null,tone:chatTone,help:chatHelp};
  }
  function requestBody(message,facts){
    const payload={message,context:context(facts),history:history.slice(-12)};
    const analytics=window.HomeAnalytics?.context();if(analytics)payload.analytics=analytics;
    while(payload.history.length&&new TextEncoder().encode(JSON.stringify(payload)).length>19000)payload.history.splice(0,2);
    return JSON.stringify(payload);
  }
  async function ask(message,facts){
    if(busy)throw new Error('萤萤正在回答，请稍等。');
    const id=firstRecord?.id||null;if(id!==dish){history=[];dish=id;}
    busy=true;
    try{
      const response=await fetch(API_BASE+'/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:requestBody(message,facts),signal:AbortSignal.timeout(50000)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'模型连接失败');
      history.push({role:'user',content:message},{role:'assistant',content:data.reply.slice(0,2000)});history=history.slice(-12);
      return data;
    }catch(error){throw new Error(error.name==='TimeoutError'?'模型请求超时，请重试。':error instanceof SyntaxError?'请通过模型服务链接打开页面。':error instanceof TypeError?'无法连接模型服务，请检查网络后重试。':error.message||'模型连接失败，请检查服务。');}
    finally{busy=false;}
  }
  async function init(){
    fetch(API_BASE+'/api/ai/status').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>{
      statusText=data.configured?'AI 已配置 · '+data.model:'AI · 尚未配置模型';HomeAssistant.render();
    }).catch(()=>{statusText='AI · 模型服务未连接';HomeAssistant.render();});
    document.getElementById('chatForm').onsubmit=async event=>{
      event.preventDefault();const input=document.getElementById('chatInput'),text=input.value.trim();if(!text||busy)return;
      const id=firstRecord?.id||null, pending={role:'assistant',text:'萤萤正在读取培养状态…'};
      appMeta.chats.push({role:'user',text},pending);input.value='';appChatRender();
      try{const facts=HomeAssistant.prepare(text),result=await ask(text,facts);pending.text=result.reply+'\n（真实模型 · '+result.model+'；依据提问时的培养快照）'+(facts.simulation?'\n程序试算依据：\n'+facts.lines.join('\n'):'');}
      catch(error){pending.text='未获得模型回答：'+error.message;}
      if((firstRecord?.id||null)!==id)pending.text+='\n这是切换培养皿之前的问题。';
      appMeta.chats=appMeta.chats.slice(-50);saveAppMeta();appChatRender();
    };
    const caption=document.querySelector('#chatPanel .chat-caption');if(caption)caption.textContent='真实模型 · 本皿观察';
  }
  return {ask,init,get busy(){return busy;},get statusText(){return statusText;}};
})();
