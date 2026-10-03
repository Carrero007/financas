const V = "cifra-v20",
  A = [
    "./",
    "index.html",
    "manifest.json",
    "icons/icon-192x192.png",
    "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  ];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(V)
      .then((c) => Promise.all(A.map((u) => c.add(u).catch(() => {})))),
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
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || !r.url.startsWith("http")) return;
  e.respondWith(
    fetch(r)
      .then((res) => {
        if (res.ok && (res.type === "basic" || res.type === "cors")) {
          const k = res.clone();
          caches
            .open(V)
            .then((c) => c.put(r, k))
            .catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches
          .match(r)
          .then(
            (m) =>
              m || (r.mode === "navigate" ? caches.match("./") : undefined),
          ),
      ),
  );
});
