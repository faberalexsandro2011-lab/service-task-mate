const CACHE_NAME = "central-os-offline-v3";
const APP_SHELL = ["/", "/manifest.webmanifest"];

async function precacheBuildAssets(cache) {
  try {
    const manifestResponse = await fetch("/asset-manifest.json", { cache: "no-store" });
    if (!manifestResponse.ok) return;
    const manifest = await manifestResponse.json();
    const assets = new Set(["/asset-manifest.json"]);

    for (const entry of Object.values(manifest)) {
      if (!entry || typeof entry !== "object") continue;
      if (typeof entry.file === "string") assets.add("/" + entry.file.replace(/^\//, ""));
      for (const file of [...(entry.css ?? []), ...(entry.assets ?? [])]) {
        if (typeof file === "string") assets.add("/" + file.replace(/^\//, ""));
      }
    }

    await Promise.allSettled([...assets].map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (response.ok) await cache.put(path, response);
    }));
  } catch (error) {
    console.warn("[PWA] Não foi possível pré-carregar todos os módulos:", error);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (response.ok) await cache.put(path, response);
    }));
    await precacheBuildAssets(cache);
    await self.skipWaiting();
  })());
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
      Promise.allSettled(event.data.urls
        .filter((url) => typeof url === "string" && url.startsWith(self.location.origin))
        .map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok) await cache.put(url, response);
        })
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Arquivos versionados do Vite são imutáveis: priorize o cache offline.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

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
          (cached) => cached || (request.mode === "navigate" ? caches.match("/") : Response.error())
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
