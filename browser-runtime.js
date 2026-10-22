/* No execution server: the worker owns CPython, Clang and the program's WASI instance. */
window.BrowserClassroom=(()=>{
 let worker=null,current=null;
 const encoder=new TextEncoder();
 async function ready(){
  if(location.protocol==='file:')throw new Error('请通过 GitHub Pages 的 HTTPS 地址打开在线版。');
  if(!('serviceWorker' in navigator))throw new Error('此浏览器不支持所需的 Service Worker，请使用新版 Chrome / Edge。');
  await navigator.serviceWorker.register('./coi-serviceworker.js',{scope:'./'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  if(!crossOriginIsolated){
   const last=Number(sessionStorage.getItem('classroom_isolation_reload')||0);
   if(Date.now()-last>15000){sessionStorage.setItem('classroom_isolation_reload',Date.now().toString());location.reload();await new Promise(()=>{});}
   throw new Error('浏览器尚未完成运行环境初始化，请刷新网页，或使用新版 Chrome / Edge。');
  }
  if(typeof SharedArrayBuffer==='undefined')throw new Error('浏览器未提供交互输入所需的共享内存。');
 }
 const readiness=ready();readiness.catch(()=>{});
 function settle(result){if(!current)return;const c=current;current=null;clearTimeout(c.timer);c.resolve(result);}
 function reset(){worker?.terminate();worker=null;}
 function watchdog(ms){if(!current)return;clearTimeout(current.timer);current.timer=setTimeout(()=>{const c=current;reset();settle({type:'aborted',env:c.env,steps:[],stdout:c.stdout,error:{kind:'TimeoutError',line:1,traceback:'程序超过课堂运行时限，已停止。'}});},ms);}
 function getWorker(){
  if(!worker){worker=new Worker(new URL('./engine-worker.js',location.href),{type:'module'});
   worker.onmessage=({data:e})=>{
    if(!current)return;
    if(e.type==='result'){settle(e);return;}
    if(e.type==='input')watchdog(600000);
    else if(e.type==='run-start'||e.type==='input_done')watchdog(8000);
    if(e.type==='step')current.env=e.step.vars;
    if(e.type==='output'){current.env=e.env;current.stdout+=e.text;}
    current.onEvent(e);
   };
   worker.onerror=e=>{const msg=e.message||'浏览器运行线程异常';reset();settle({type:'aborted',error:{kind:'BrowserRuntimeError',line:1,traceback:msg}});};
  }return worker;
 }
 async function run(req,onEvent){
  await readiness;if(current)throw new Error('已有程序正在运行');
  return await new Promise(resolve=>{
   const shared=new SharedArrayBuffer(65552),control=new Int32Array(shared,0,4);
   current={resolve,onEvent,shared,control,env:{},stdout:'',timer:null};watchdog(180000);
   getWorker().postMessage({type:'run',request:{...req,stream:true},shared});
  });
 }
 function input(text){
  if(!current)throw new Error('程序已经结束');
  const data=encoder.encode(text+'\n');if(data.length>65536)throw new Error('单次输入过长');
  if(Atomics.load(current.control,0)!==0)throw new Error('上一条输入正在接收，请稍后再提交');
  new Uint8Array(current.shared,16,data.length).set(data);Atomics.store(current.control,1,data.length);Atomics.store(current.control,0,1);Atomics.notify(current.control,0);
 }
 function stop(){if(!current)return;const c=current;reset();settle({type:'aborted',env:c.env,steps:[],stdout:c.stdout,error:{kind:'InterruptedError',line:1,traceback:'已停止本次程序。'}});}
 return {ready:()=>readiness,run,input,stop};
})();
