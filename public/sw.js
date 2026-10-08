const CACHE_NAME = "thinksales-shell-v3";
const APP_SHELL = [
  "/",
  "/dashboard",
  "/offline",
  "/offline-portal.html",
  "/pos",
  "/sales",
  "/sales/new",
  "/inventory",
  "/inventory/new",
  "/settings/general",
  "/thinksales-logo.jpeg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  const request = new URL(event.request.url);

  if (request.pathname.startsWith("/api/") || request.pathname.includes("_next/data")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (
          request.pathname.startsWith("/_next/static/") ||
          request.pathname === "/dashboard" ||
          request.pathname === "/offline" ||
          request.pathname === "/pos" ||
          request.pathname === "/sales" ||
          request.pathname === "/sales/new" ||
          request.pathname === "/inventory" ||
          request.pathname === "/inventory/new" ||
          request.pathname === "/settings/general"
        )) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        const isPlatformAdminOrPortal =
          request.pathname.startsWith("/platform-admin")
          || request.pathname === "/order"
          || request.pathname.startsWith("/order/");
        if (isPlatformAdminOrPortal) {
          if (event.request.mode === "navigate") {
            return caches.match("/offline-portal.html").then((cached) => cached ?? new Response(
              "<!doctype html><title>You are offline</title><h1>You are offline</h1><p>Reconnect to continue.</p>",
              { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
            ));
          }
          return new Response("This page is unavailable offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        const fallback = caches.match(event.request);
        return fallback.then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match("/offline-portal.html").then((offlinePage) => offlinePage ?? new Response(
              "<!doctype html><title>ThinkSales is offline</title><h1>You’re offline</h1><p>Reconnect to load this page.</p>",
              { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
            ));
          }
          return new Response("This resource is unavailable offline.", { status: 503 });
        });
      })
  );
});
