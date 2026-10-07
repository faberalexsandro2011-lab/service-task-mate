const CACHE_NAME = "central-os-offline-v2";
const APP_SHELL = ["/tecnico", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(
        event.data.urls.filter(
          (url) => typeof url === "string" && url.startsWith(self.location.origin)
        )
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached || (request.mode === "navigate" ? caches.match("/tecnico") : Response.error())
        )
      )
  );
});


self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ("focus" in client) return client.focus();
    }
    const url = event.notification.data?.url || "/tecnico";
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});

self.addEventListener("push", (event) => {
  let data = { title: "Central OS", body: "Você recebeu uma atualização.", url: "/tecnico" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      if (event.data) data.body = event.data.text();
    } catch {}
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/agri-icon.svg",
      badge: "/agri-icon.svg",
      data: { url: data.url || "/tecnico" },
      tag: data.osId ? "central-os-" + data.osId : "central-os",
    })
  );
});
