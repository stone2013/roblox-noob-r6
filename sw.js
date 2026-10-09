/* Scope-limited PWA upgrade. No third-party resources or global cache deletion. */
const VERSION='4.9.2',CACHE='noob-r6-break-v'+VERSION;
const CORE=['./','./index.html','./engine.js','./game.js','./features49.js','./engine.js?v='+VERSION,'./game.js?v='+VERSION,'./features49.js?v='+VERSION,'./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(CORE);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('noob-r6-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);
  if(request.mode==='navigate'){
   try{const response=await fetch(request,{cache:'no-store'});if(response.ok){await cache.put(new URL('./index.html',scope).href,response.clone());return response}throw Error('Unavailable')}
   catch{return await cache.match('./index.html')||new Response('请先联网打开一次游戏以完成离线缓存。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})}
  }
  const saved=await cache.match(request);if(saved)return saved;
  try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response}
  catch{return new Response('',{status:503})}
 })());
});
