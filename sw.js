// "play/<id>/..." manzillaridagi fayllarni keshdan beradi, shunda ZIP ichidagi
// o'yinlar (index.html + rasmlar, css, js) sayt ichida to'g'ri ishlaydi.
const CACHE = "activity-hub-play";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.includes("/play/")) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const clean = url.origin + url.pathname;
      let res = await cache.match(clean);
      if (!res && url.pathname.endsWith("/")) res = await cache.match(clean + "index.html");
      return res || new Response("Fayl topilmadi: " + decodeURIComponent(url.pathname), { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    })()
  );
});
