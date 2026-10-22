/* Browser-only CPython + real Clang/LLVM; no requests to a code execution API. */
let py=null,pyLoading=null,toolchain=null,tcLoading=null,instrumentC=null,runnerSource='',bridgeSource='';
let request=null,control=null,shared=null,env={},steps=[],stdout='',diagnostics='',cLine=1,inputEvent=null;
const decoder=new TextDecoder(),encoder=new TextEncoder();
function emit(event){postMessage(event);}
function status(text){emit({type:'status',text});}
function readInput(){
 if(!request.interactive){if(request._usedInput)return null;request._usedInput=true;return request.stdin||null;}
 emit({type:'input',line:inputEvent?.line||cLine,env:inputEvent?.env||{...env}});inputEvent=null;
 while(Atomics.load(control,0)===0){const outcome=Atomics.wait(control,0,0,600000);if(outcome==='timed-out')throw new Error('等待输入超过 10 分钟。');}
 const length=Atomics.load(control,1),bytes=new Uint8Array(shared,16,length).slice();Atomics.store(control,0,0);
 return decoder.decode(bytes);
}
function handlePythonLine(line){
 if(!line.trim())return;let event;try{event=JSON.parse(line);}catch(e){return;}
 if(event.type==='input'){inputEvent=event;return;}
 if(event.type==='step')env=event.step.vars;
 if(event.type==='output')env=event.env;
 emit(event);
}
async function ensurePython(){
 if(py)return py;
 if(!pyLoading)pyLoading=(async()=>{
  status('首次加载 Python 运行环境…');const {loadPyodide}=await import('./vendor/pyodide/pyodide.mjs');
  py=await loadPyodide({indexURL:new URL('./vendor/pyodide/',self.location.href).href});
  const [runner,instrument,bridge]=await Promise.all(['python_runner.py','c_instrument.py','c_bridge.h'].map(async p=>{const r=await fetch(new URL(p,self.location.href));if(!r.ok)throw new Error('资源加载失败：'+p);return r.text();}));
  runnerSource=runner;bridgeSource=bridge;
  py.globals.set('_instrument_source',instrument);instrumentC=py.runPython('_instrument_ns = {}\nexec(_instrument_source, _instrument_ns)\n_instrument_ns["instrument"]');
  return py;
 })().catch(e=>{pyLoading=null;py=null;throw e;});
 return pyLoading;
}
async function ensureClang(){
 if(toolchain)return toolchain;
 if(!tcLoading)tcLoading=(async()=>{
  status('首次加载 C 编译器（约 29 MB），请稍候…');await import('./vendor/clang-toolchain.js');
  toolchain=await clangWasmToolchain.createToolchain({baseUrl:new URL('./vendor/clang/',self.location.href).href,onProgress:value=>status('加载 C 编译器：'+Math.round(value*100)+'%')});
  return toolchain;
 })().catch(e=>{tcLoading=null;throw e;});
 return tcLoading;
}
async function runPython(){
 const python=await ensurePython();let buffer='';const utf8=new TextDecoder();
 python.setStdout({write(bytes){buffer+=utf8.decode(bytes,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){handlePythonLine(buffer.slice(0,i));buffer=buffer.slice(i+1);}return bytes.length;}});
 python.setStderr({batched:text=>status(text)});
 python.setStdin({stdin:readInput});
 const ns=python.runPython("{'__name__':'__main__'}");ns.set('_browser_req_json',JSON.stringify(request));
 emit({type:'run-start'});
 try{python.runPython(runnerSource,{globals:ns});}finally{ns.destroy();}
}
function handleCLine(line){
 let event;try{event=JSON.parse(line);}catch(e){if(line.trim())status(line);return;}
 const kind=event.type;
 if(kind==='var'){
  env[event.name]=event.value;cLine=event.line;
  const step={line:event.line,vars:{...env},desc:'变量赋值后',output_len:stdout.length};
  if(steps.length<1500)steps.push(step);emit({type:'step',step});
 }else if(kind==='output'){
  stdout+=event.text;cLine=event.line||cLine;
  emit({type:'output',text:event.text,line:cLine,env:{...env}});
  if(steps.length<1500)steps.push({line:cLine,vars:{...env},desc:'printf 输出后',output_len:stdout.length});
 }else if(kind==='input'){cLine=event.line||cLine;}
 else if(kind==='input_done')emit({type:'input_done'});
 else if(kind==='limit')throw new Error('程序超过课堂输出或执行步数限制');
}
function result(error=null){emit({type:'result',env,steps,stdout,error,diagnostics,trace_truncated:steps.length>=1500});}
function compileError(compiled,kind){
 const lines=clangWasmToolchain.compilerDiagnostics(compiled.raw),message=lines.join('\n')||String(compiled.error?.message||compiled.error);
 const line=Number(message.match(/classroom\.c:(\d+)/)?.[1]||1);diagnostics=message;
 result({kind,line,traceback:message});
}
async function runC(){
 await ensurePython();const tc=await ensureClang();status('正在编译 C 程序…');
 const compileArgs=['-std=gnu17','-O0','-fgnuc-version=4.2.1','-Werror=implicit-function-declaration','-Werror=implicit-int'];
 const original=await tc.captureCompilerOutput(()=>tc.runtime.compileArtifact(request.code,{language:'C',fileName:'classroom.c',compileArgs}));
 if(original.error){compileError(original,'CompileError');return;}
 const traced=instrumentC(request.code);
 const compiled=await tc.captureCompilerOutput(()=>tc.runtime.compileArtifact(bridgeSource+'\n#line 1 "classroom.c"\n'+traced,{language:'C',fileName:'observed.c',compileArgs}));
 if(compiled.error){compileError(compiled,'BindingError');return;}
 let buffer='';const utf8=new TextDecoder();emit({type:'run-start'});
 let rc;
 try{
  rc=await tc.execute(compiled.result,{stdin:()=>{const value=readInput();return value===null?null:encoder.encode(value);},stdout:chunk=>{
   const text=typeof chunk==='string'?chunk:utf8.decode(chunk,{stream:true});buffer+=text;let i;
   while((i=buffer.indexOf('\n'))>=0){handleCLine(buffer.slice(0,i));buffer=buffer.slice(i+1);}
  },stderr:chunk=>{diagnostics+=chunk;}});
  if(buffer.trim())handleCLine(buffer);
 }catch(e){result({kind:'RuntimeError',line:cLine,traceback:String(e.message||e)});return;}
 result(rc.exitCode?{kind:'RuntimeError',line:cLine,traceback:'C 程序退出码：'+rc.exitCode}:null);
}
self.onmessage=async({data})=>{
 if(data.type!=='run')return;
 request=data.request;shared=data.shared;control=new Int32Array(shared,0,4);env={};steps=[];stdout='';diagnostics='';cLine=1;inputEvent=null;
 try{if(request.language==='c')await runC();else await runPython();}
 catch(e){result({kind:'BrowserRuntimeError',line:cLine,traceback:String(e.stack||e)});}
};
