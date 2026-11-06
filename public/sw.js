/* Bright-Carwash installable PWA.
 * Only a PUBLIC offline worker-entry shell and hashed JS/CSS assets are cached.
 * The authenticated app HTML, API responses, financial rows and OTP traffic
 * are NEVER cached. Main / navigation is network-first, offline fallback ONLY.
 */
const ASSETS_CACHE="carwash-static-v4";
const OFFLINE_CACHE="carwash-offline-shell-v4";
const FALLBACK="/offline.html";

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(OFFLINE_CACHE)
    .then(cache=>cache.addAll([FALLBACK,"/offline-worker.html","/worker-offline.js"]))
    .then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key!==ASSETS_CACHE&&key!==OFFLINE_CACHE)
      .map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || request.method!=="GET")return;

  // Shared worker capability URL is NEVER written to a Cache. On an offline
  // cold launch only a generic public worker form is served at the original URL.
  if(request.mode==="navigate" && /^\/w\/[a-f0-9]{64}$/.test(url.pathname)){
    event.respondWith(fetch(request).catch(async()=>{
      const cache=await caches.open(OFFLINE_CACHE);
      return (await cache.match("/offline-worker.html"))||Response.error();
    }));
    return;
  }
  // The public fallback's JavaScript is cached separately; never cache a
  // bearer-specific route or any request carrying credentials.
  if(url.pathname==="/worker-offline.js" && request.destination==="script" &&
     !request.headers.has("authorization") && !request.headers.has("cookie")){
    event.respondWith(caches.open(OFFLINE_CACHE).then(async cache=>
      (await cache.match("/worker-offline.js"))||fetch(request)));
    return;
  }
  // Important: NEVER persist the server's home-page response. We only serve
  // a separately reviewed static offline form when the network truly fails.
  if(request.mode==="navigate" && url.pathname==="/"){
    event.respondWith(fetch(request).catch(async()=>{
      const cache=await caches.open(OFFLINE_CACHE);
      return (await cache.match(FALLBACK))||Response.error();
    }));
    return;
  }
  const publicHashedAsset=url.pathname.startsWith("/_next/static/") &&
    ["script","style","font","image"].includes(request.destination);
  if(!publicHashedAsset || request.headers.has("authorization") ||
      request.headers.has("cookie"))return;
  event.respondWith(caches.open(ASSETS_CACHE).then(async cache=>{
    const existing=await cache.match(request);
    if(existing)return existing;
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }));
});
