const V = "cifra-v30",
  A = [
    "./",
    "index.html",
    "style.css",
    "app.js",
    "manifest.json",
    "icons/icon-192x192.png",
    "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  ];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(V)
      .then((c) =>
        Promise.all(
          A.map((u) =>
            c.add(new Request(u, { cache: "reload" })).catch(() => {}),
          ),
        ),
      ),
  );
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  ),
);
// Cache primeiro (abre na hora) e atualiza em segundo plano para a próxima abertura.
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || !r.url.startsWith("http")) return;
  e.respondWith(
    caches.match(r, { ignoreSearch: r.mode === "navigate" }).then((m) => {
      const net = fetch(r)
        .then((res) => {
          const okT = res.ok && (res.type === "basic" || res.type === "cors"),
            font =
              res.type === "opaque" && /fonts\.googleapis\.com/.test(r.url);
          if (okT || font) {
            const k = res.clone();
            caches
              .open(V)
              .then((c) => c.put(r, k))
              .catch(() => {});
          }
          return res;
        })
        .catch(
          () => m || (r.mode === "navigate" ? caches.match("./") : undefined),
        );
      if (m) {
        e.waitUntil(net.catch(() => {}));
        return m;
      }
      return net;
    }),
  );
});
