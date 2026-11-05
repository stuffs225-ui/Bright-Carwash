/* Carwash service worker: cache ONLY hashed public static assets.
 * NEVER cache HTML, protected routes, private dashboards, Auth OTP, or /api/*
 * responses; customer information and financial data must stay network-only.
 */
const CACHE_NAME="carwash-static-v2";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))
  )));
  self.clients.claim();
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  const url=new URL(request.url);
  const publicHashedAsset=url.origin===self.location.origin &&
    url.pathname.startsWith("/_next/static/") &&
    ["script","style","font","image"].includes(request.destination);
  if(!publicHashedAsset || request.method!=="GET" ||
     request.headers.has("authorization") || request.headers.has("cookie")) {
    return; // Deliberately never intercept private requests.
  }
  event.respondWith(caches.open(CACHE_NAME).then(async cache=>{
    const existing=await cache.match(request);
    if(existing)return existing;
    const response=await fetch(request);
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }));
});
