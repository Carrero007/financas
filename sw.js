const V = "cifra-v15",
  A = [
    "./",
    "index.html",
    "manifest.json",
    "icons/icon-192x192.png",
    "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  ];
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(V).then((c) => c.addAll(A))),
);
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const k = r.clone();
        caches.open(V).then((c) => c.put(e.request, k));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
