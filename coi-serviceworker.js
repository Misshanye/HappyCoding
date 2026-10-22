/* Supply isolation headers on static hosts (including GitHub Pages). All assets stay same-origin. */
const CACHE='programming-classroom-v20261022-web1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('programming-classroom-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(new URL(req.url).origin!==self.location.origin||req.method!=='GET')return;
 if(req.cache==='only-if-cached'&&req.mode!=='same-origin')return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),isAsset=new URL(req.url).pathname.includes('/vendor/');
  let response=isAsset?await cache.match(req):null;
  if(!response){try{response=await fetch(req);if(response.ok&&isAsset)await cache.put(req,response.clone());}catch(e){response=await cache.match(req);if(!response)throw e;}}
  if(response.status===0)return response;
  const h=new Headers(response.headers);h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Resource-Policy','same-origin');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
 })());
});
