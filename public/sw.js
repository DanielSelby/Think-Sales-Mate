const CACHE_NAME = "thinksales-shell-v1";
const APP_SHELL = ["/dashboard", "/thinksales-logo.jpeg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  const request = new URL(event.request.url);
  if (request.pathname.startsWith("/api/") || request.pathname.includes("_next/data")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (request.pathname.startsWith("/_next/static/") || request.pathname === "/dashboard")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/dashboard")))
  );
});
