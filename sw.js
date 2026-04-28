const CACHE_NAME = "alm-x21-v1";

self.addEventListener("install", e=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache=>{
      return cache.addAll([
        "./",
        "./index.html",
        "./alm_core.js",
        "./alm_bootstrap.js"
      ]);
    })
  );
});

self.addEventListener("fetch", e=>{
  e.respondWith(
    caches.match(e.request).then(res=>{
      return res || fetch(e.request);
    })
  );
});
