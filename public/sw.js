// Service worker: la app abre rápido y la última lista que viste se ve aunque no haya señal en el súper.
const CACHE = "compras-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Archivos estáticos: primero el caché
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
        return res;
      })),
    );
    return;
  }

  // Páginas: primero la red; sin señal, la última versión guardada
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("/")).then((r) => r || new Response(
        "<meta name=viewport content='width=device-width'><p style='font-family:sans-serif;padding:2rem'>Sin conexión. Abrí la lista una vez con señal y después vas a poder verla offline.</p>",
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      ))),
    );
  }
});
