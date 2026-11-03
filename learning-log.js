/* Learning telemetry v1. No complete code, stdin, stdout, variable snapshots or keystrokes. */
window.ClassroomLearningLog = (() => {
  'use strict';
  const cfg=window.CLASSROOM_LEARNING_LOG_CONFIG||{}, analytics=window.CLASSROOM_ANALYTICS_CONFIG||{};
  const enabled=cfg.enabled===true&&analytics.enabled===true&&location.protocol!=='file:'&&
    navigator.doNotTrack!=='1'&&navigator.globalPrivacyControl!==true;
  const key='classroom_learning_v1', uuid=()=>crypto.randomUUID();
  const read=(store,k,otherwise)=>{try{return JSON.parse(store.getItem(k))??otherwise;}catch{return otherwise;}};
  const write=(store,k,v)=>{try{store.setItem(k,JSON.stringify(v));return true;}catch{return false;}};
  const previous=read(sessionStorage,key+'_visit',null);
  const nav=performance.getEntriesByType('navigation')[0]?.type;
  // Only reloads keep the ID. A newly opened page/navigation gets a full UUID.
  const reused=nav==='reload'&&previous?.key;
  const visit=reused?previous:{key:uuid(),at:Date.now()};
  write(sessionStorage,key+'_visit',visit);
  const queueKey=key+'_queue_'+visit.key;
  let queue=read(localStorage,queueKey,[]), lost=0, storageFailed=false, inflight=false, lastSuccess=null,lastError='';
  let provider=()=>({}), ctx={}, runCount=reused?read(sessionStorage,key+'_runs',0):0;
  write(sessionStorage,key+'_runs',runCount);
  const admitted=new Set(['module','level','task','case','language','mode','task_version','action','execution','run_id','run_no','status','error_kind','error_message','error_line','truncated','task_result','reason','elapsed_ms','visible_ms','active_ms','idle_ms','event_time','schema','site_version','visitor','visit','event_id','identity_status','from_module','from_level','from_task']);
  function clean(data){const out={};for(const [k,v] of Object.entries(data||{})){if(!admitted.has(k)||v==null)continue;if(typeof v==='string')out[k]=v.slice(0,450);else if(typeof v==='number'&&Number.isFinite(v))out[k]=Math.round(v);else if(typeof v==='boolean')out[k]=v;}return out;}
  const idFor=k=>'online_'+k.replaceAll('-','');
  const fullVisit=()=>idFor(visit.key);
  function context(){try{return clean(provider());}catch{return {};}}
  function persist(){storageFailed=!write(localStorage,queueKey,queue);}
  function base(){return {website:analytics.websiteId,hostname:location.hostname,url:location.pathname,language:navigator.language||'',screen:`${screen.width}x${screen.height}`,title:'编程互动课堂',referrer:''};}
  function enqueuePayload(payload){
    if(!enabled)return;
    // Remove arbitrary fields before adding the stable identity during delivery.
    const data=clean(payload.data||{}), named=Boolean(payload.name);
    const item={payload:{...base(),...(named?{name:payload.name.slice(0,50),data}: {})},
      at:Date.now(),id:uuid(),visitKey:visit.key};
    queue.push(item);
    const limit=Math.max(50,Number(cfg.queueLimit)||1000);
    if(queue.length>limit){const excess=queue.length-limit;queue.splice(0,excess);lost+=excess;}
    persist();void flush();
  }
  function record(name,data={}){enqueuePayload({...base(),name,data:{...context(),...clean(data),event_time:new Date().toISOString(),schema:'learning-v1',site_version:cfg.siteVersion||'V1.3'}});}
  function wire(item){const id=idFor(item.visitKey);
    return {type:'event',payload:{...item.payload,id,...(item.payload.name?{data:{...item.payload.data,
      event_id:item.id,visitor:id,visit:id,identity_status:'per_visit_uuid',event_time:new Date(item.at).toISOString()}}:{})}};}
  async function post(url,body){const controller=new AbortController(),t=setTimeout(()=>controller.abort(),8000);try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',referrerPolicy:'no-referrer',mode:'cors',signal:controller.signal,keepalive:true});
    if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();
  }finally{clearTimeout(t);}}
  function allQueues(){const list=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(key+'_queue_'))list.push(k);}}catch{}if(!list.includes(queueKey))list.push(queueKey);return list;}
  async function drain(){
    if(!enabled||inflight||navigator.onLine===false)return;
    inflight=true;
    try{
      // Per-origin Web Lock prevents two tabs from sending the same durable queue concurrently.
      for(const k of allQueues()){
        let items=k===queueKey?queue:read(localStorage,k,[]);
        const cutoff=Date.now()-(Number(cfg.retentionDays)||7)*86400000;
        const fresh=items.filter(i=>i.at>=cutoff);lost+=items.length-fresh.length;items=fresh;
        if(k===queueKey){queue=items;persist();}else write(localStorage,k,items);
        for(const item of [...items].slice(0,20)){
          const ack=await post(analytics.endpoint,wire(item));
          if(!ack.sessionId&&!ack.cache)throw new Error('未收到Umami有效确认');
          lastSuccess=new Date().toISOString();lastError='';
          if(k===queueKey){queue=queue.filter(i=>i.id!==item.id);persist();}
          else {items=read(localStorage,k,[]).filter(i=>i.id!==item.id);write(localStorage,k,items);}
        }
      }
    }catch(e){lastError=String(e.message||e).slice(0,200);}
    finally{inflight=false;}
  }
  let delivery=null;
  function flush(){if(delivery)return delivery;delivery=(navigator.locks?.request?navigator.locks.request(key+'_send',{ifAvailable:true},lock=>lock?drain():undefined):drain()).finally(()=>{delivery=null;});return delivery;}
  let tickAt=performance.now(),lastAction=Date.now(),slice={elapsed_ms:0,visible_ms:0,active_ms:0,idle_ms:0};
  function tick(){const now=performance.now(),delta=Math.min(5000,Math.max(0,now-tickAt));tickAt=now;slice.elapsed_ms+=delta;if(!document.hidden){slice.visible_ms+=delta;if(Date.now()-lastAction<60000)slice.active_ms+=delta;else slice.idle_ms+=delta;}}
  function checkpoint(reason){tick();if(slice.elapsed_ms<500)return;record('learning_time',{...ctx,...slice,reason});slice={elapsed_ms:0,visible_ms:0,active_ms:0,idle_ms:0};}
  function syncContext(){const next=context();if(JSON.stringify(next)===JSON.stringify(ctx))return;checkpoint('context_change');const from=ctx;ctx=next;record('learning_context',{from_module:from.module,from_level:from.level,from_task:from.task});}
  function beginRun(execution){syncContext();const run={id:uuid(),number:++runCount,at:performance.now(),ctx:{...ctx},ended:false};write(sessionStorage,key+'_runs',runCount);return {...run,execution};}
  function endRun(run,result){if(!run||run.ended)return;run.ended=true;const error=result.error;
    const raw=String(error?.message||error?.traceback||'');
    // Core message only; omit traceback source lines and code. No stdout/stdin.
    const lines=raw.split('\n').filter(x=>x.trim());const message=lines.find(x=>/\b(?:fatal error|error):/i.test(x))||lines.findLast(x=>/^[A-Za-z_][\w.]*(?:Error|Exception):/.test(x.trim()))||lines.at(-1)||String(error?.kind||'');
    record('learning_result',{...run.ctx,run_id:run.id,run_no:run.number,execution:run.execution,
      elapsed_ms:performance.now()-run.at,status:error&&error.kind!=='InterruptedError'?'error':result.type==='aborted'?'stopped':'success',
      error_kind:error?.kind,error_message:message,error_line:error?.line,truncated:message.length>450});}
  function assessment(run,a){if(run&&a)record('learning_assessment',{...run.ctx,run_id:run.id,run_no:run.number,task_result:a.ok?'passed':'not_passed'});}
  function runtimeFailure(run,error){endRun(run,{error:{kind:'platform_error',message:String(error.message||error)}});}
  if(enabled){
    for(const type of ['pointerdown','keydown','input','touchstart'])document.addEventListener(type,()=>{lastAction=Date.now();},{passive:true});
    setInterval(tick,1000);
    setInterval(()=>{checkpoint('interval');void flush();},Math.max(30,Number(cfg.heartbeatSeconds)||60)*1000);
    setInterval(()=>void flush(),15000);
    document.addEventListener('visibilitychange',()=>{checkpoint(document.hidden?'hidden':'visible');void flush();});
    // keepalive sends are best-effort. Durable items remain until an actual HTTP acknowledgement.
    window.addEventListener('pagehide',()=>{checkpoint('pagehide');void flush();});
    window.addEventListener('online',()=>void flush());
  }
  function status(){return {enabled,visit:fullVisit(),identityMode:'per_visit_uuid',pending:allQueues().reduce((n,k)=>n+(k===queueKey?queue:read(localStorage,k,[])).length,0),lastSuccess,lastError,storageFailed,droppedThisPage:lost};}
  function exportPending(){const items=allQueues().flatMap(k=>k===queueKey?queue:read(localStorage,k,[]));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}));a.download='learning-pending.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  return Object.freeze({context,enqueuePayload,record,setContextProvider(fn){provider=fn;},syncContext,beginRun,endRun,assessment,runtimeFailure,flush,status,exportPending});
})();
