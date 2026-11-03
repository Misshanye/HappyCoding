/* Persistent local learning archive + ZIP download. No remote requests here. */
window.ClassroomLocalLog=(()=>{
 'use strict';
 const DB='classroom_local_learning_v1',STAGE='classroom_local_stage_v1_',FORM='https://v.wjx.cn/vm/wayfzFB.aspx#';
 const fields=['event_id','visitor','visit','session_start','event_time','event','schema','site_version','module','level','task','case','language','mode','task_version','action','execution','run_id','run_no','status','error_kind','error_message','error_line','truncated','task_result','reason','elapsed_ms','visible_ms','active_ms','idle_ms','from_module','from_level','from_task'];
 let database=null,pending=new Map(),saving=null,error='',stageError='',count=0,working=false;
 const listeners=new Set();
 function notify(){for(const fn of listeners)fn();}
 function readStage(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch(e){stageError='浏览器暂存读取失败';return [];}}
 function keys(){const out=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(STAGE))out.push(k);}}catch(e){stageError='浏览器本地存储不可用';}return out;}
 for(const key of keys())for(const row of readStage(key))if(row?.event_id)pending.set(row.event_id,row);
 function open(){
  if(!database)database=new Promise((resolve,reject)=>{
   if(!window.indexedDB){reject(Error('浏览器不支持本地日志数据库'));return;}
   const request=indexedDB.open(DB,1);
   request.onupgradeneeded=()=>{const store=request.result.createObjectStore('events',{keyPath:'event_id'});store.createIndex('visit','visit');};
   request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};
   request.onerror=()=>reject(request.error||Error('本地日志数据库打开失败'));
   request.onblocked=()=>reject(Error('本地日志数据库被其他页面占用，请关闭旧页面后重试'));
  }).catch(e=>{database=null;throw e;});
  return database;
 }
 function stage(row){
  const key=STAGE+row.visit,rows=readStage(key);if(!rows.some(r=>r.event_id===row.event_id))rows.push(row);
  try{localStorage.setItem(key,JSON.stringify(rows));stageError='';}catch(e){stageError='浏览器暂存失败，请尽快下载日志';}
 }
 function capture(item){
  if(window.CLASSROOM_LEARNING_LOG_CONFIG?.localArchive===false)return;
  if(!item.payload?.name)return;
  const id='online_'+item.visitKey.replaceAll('-',''),row={};
  for(const key of fields){const value=item.payload.data?.[key];if(typeof value==='string')row[key]=value.slice(0,450);else if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean')row[key]=value;}
  Object.assign(row,{event_id:item.id,visitor:id,visit:id,session_start:new Date(item.visitAt||item.at).toISOString(),event_time:new Date(item.at).toISOString(),event:item.payload.name});
  pending.set(row.event_id,row);stage(row);notify();void flush();
 }
 function flush(){
  if(saving)return saving;
  saving=(async()=>{
   const db=await open();
   do{
    const rows=[...pending.values()].slice(0,200);if(!rows.length)break;
    await new Promise((resolve,reject)=>{const tx=db.transaction('events','readwrite'),store=tx.objectStore('events');for(const row of rows)store.put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('日志写入失败'));tx.onabort=()=>reject(tx.error||Error('日志写入被中止'));});
    const ids=new Set(rows.map(r=>r.event_id));for(const id of ids)pending.delete(id);
    for(const key of new Set(rows.map(r=>STAGE+r.visit))){try{const left=readStage(key).filter(r=>!ids.has(r.event_id));if(left.length)localStorage.setItem(key,JSON.stringify(left));else localStorage.removeItem(key);}catch(e){stageError='部分暂存清理失败，导出会按事件编号去重';}}
    count+=rows.length;error='';notify();
   }while(pending.size);
   return true;
  })().catch(e=>{error=e.message||'日志保存失败';notify();return false;}).finally(()=>{saving=null;});
  return saving;
 }
 async function rows(){
  await flush();
  const db=await open();
  const saved=await new Promise((resolve,reject)=>{const tx=db.transaction('events','readonly'),r=tx.objectStore('events').getAll();let values=[];r.onsuccess=()=>{values=r.result;};tx.oncomplete=()=>resolve(values);tx.onerror=()=>reject(tx.error||Error('读取本地日志失败'));});
  const all=new Map(saved.map(r=>[r.event_id,r]));for(const key of keys())for(const row of readStage(key))if(row?.event_id)all.set(row.event_id,row);for(const row of pending.values())all.set(row.event_id,row);
  return [...all.values()].sort((a,b)=>a.event_time.localeCompare(b.event_time)||a.event_id.localeCompare(b.event_id));
 }
 function cell(value){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
 function csv(values){return '\ufeff'+fields.map(cell).join(',')+'\r\n'+values.map(row=>fields.map(key=>cell(row[key])).join(',')).join('\r\n')+'\r\n';}
 const encoder=new TextEncoder(),crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function crc(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
 function zip(files){
  if(files.length>65535)throw Error('日志文件过多，请联系教师分批导出');
  const chunks=[],central=[];let offset=0,centralSize=0;
  const date=new Date(),year=Math.max(1980,Math.min(2107,date.getFullYear())),dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),dosDate=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  for(const file of files){
   const name=encoder.encode(file.name),content=encoder.encode(file.content),sum=crc(content),local=new Uint8Array(30),v=new DataView(local.buffer);
   v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(10,dosTime,true);v.setUint16(12,dosDate,true);v.setUint32(14,sum,true);v.setUint32(18,content.length,true);v.setUint32(22,content.length,true);v.setUint16(26,name.length,true);
   const entry=new Uint8Array(46),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(12,dosTime,true);e.setUint16(14,dosDate,true);e.setUint32(16,sum,true);e.setUint32(20,content.length,true);e.setUint32(24,content.length,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);
   chunks.push(local,name,content);central.push(entry,name);offset+=local.length+name.length+content.length;centralSize+=entry.length+name.length;
   if(offset+centralSize>0xffffffff)throw Error('日志超过单次打包大小限制');
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
 }
 async function archive(){
  window.ClassroomLearningLog?.checkpoint('local_export');
  const data=await rows(),groups=new Map();for(const row of data){if(!groups.has(row.visit))groups.set(row.visit,[]);groups.get(row.visit).push(row);}
  if(!groups.size)throw Error('没有可导出的学习记录，请先运行一次代码');
  const files=[];
  for(const [visit,values] of groups){const start=new Date(values[0].session_start),pad=n=>String(n).padStart(2,'0'),stamp=pad(start.getMonth()+1)+pad(start.getDate())+'_'+pad(start.getHours())+pad(start.getMinutes())+pad(start.getSeconds());files.push({name:'学习日志/'+visit+'_'+stamp+'.csv',content:csv(values)});}
  files.push({name:'日志说明.txt',content:'本包包含当前浏览器在本网站保存的各次访问记录；每份CSV对应一次访问，刷新沿用编号，新开页面使用新编号。\r\n无完整代码、键盘内容、输入输出全文或MAC/IP地址。event_id用于去重。\r\nlearning_result记录运行是否报错，learning_assessment记录案例是否通过，两者含义不同。\r\nlearning_time各行是时间片毫秒值，按此事件求和统计，不要叠加其他事件中的运行耗时。时间仅为活动估计。\r\n记录时间为UTC ISO格式；文件名日期使用当前电脑本地时区。\r\n本包生成不代表已经在问卷提交成功。\r\n'});
  return {blob:zip(files),visits:groups.size,events:data.length};
 }
 function download(blob){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='学习日志.zip';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function submit(){
  if(working)return;working=true;
  const button=document.getElementById('submitLearningLog'),message=document.getElementById('localLearningMessage'),form=document.getElementById('localLearningForm');
  button.disabled=true;form.hidden=true;message.textContent='正在整理本机学习日志…';
  // Reserve a tab during the user click, then navigate only after ZIP generation succeeds.
  let tab=null;try{tab=window.open('about:blank','_blank');if(tab){tab.opener=null;tab.document.title='正在生成学习日志';tab.document.body.textContent='正在准备学习日志，完成后将打开提交问卷。';}}catch(e){}
  try{
   window.ClassroomLearningLog?.recordLocal('learning_action',{action:'submit_learning_log'});
   const result=await archive();download(result.blob);
   message.textContent='已发起下载“学习日志.zip”（'+result.visits+'次访问，'+result.events+'条记录）。请在问卷中选择本次下载的压缩包上传。';
   form.hidden=false;
   try{if(tab&&!tab.closed)tab.location.replace(FORM);else message.textContent+=' 若问卷未打开，请点击旁边链接。';}catch(e){message.textContent+=' 请点击旁边链接打开问卷。';}
  }catch(e){if(tab&&!tab.closed)try{tab.close();}catch(_){}message.textContent='日志准备失败：'+e.message+'。请保留当前页面后重试。';}
  finally{working=false;button.disabled=false;}
 }
 function mount(){
  const bar=document.createElement('div');bar.style.cssText='margin:8px auto;padding:9px 14px;max-width:1460px;background:#f2f7eb;border-radius:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px';
  bar.innerHTML='<span id="localLearningStatus" role="status"></span><button type="button" id="submitLearningLog" style="padding:10px 18px;border:0;border-radius:9px;background:#397924;color:white;font-size:15px;font-weight:800;cursor:pointer">提交本节课学习日志</button><span id="localLearningMessage" role="status" aria-live="polite"></span><a id="localLearningForm" href="'+FORM+'" target="_blank" rel="noopener noreferrer" hidden>打开学习日志提交问卷</a>';
  const header=document.querySelector('header');if(header)header.after(bar);else document.body.prepend(bar);
  function paint(){const node=document.getElementById('localLearningStatus');node.textContent=error||stageError?'本地日志保存提示：'+(error||stageError):pending.size?'学习日志正在本机暂存…':'学习日志保存在本机浏览器';node.style.color=error||stageError?'#a82323':'';}
  listeners.add(paint);paint();document.getElementById('submitLearningLog').onclick=submit;
  let editTimer;document.getElementById('editor')?.addEventListener('input',()=>{clearTimeout(editTimer);editTimer=setTimeout(()=>window.ClassroomLearningLog?.recordLocal('learning_action',{action:'code_edit'}),1500);});
  window.ClassroomLearningLog?.recordLocal('learning_page',{action:'page_open'});void flush();
 }
 setInterval(()=>{if(pending.size)void flush();},10000);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 return Object.freeze({capture,flush,archive,submit,status:()=>({pending:pending.size,error,stageError,savedThisPage:count})});
})();
