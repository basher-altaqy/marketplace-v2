const APP_SHELL_CACHE = "app-shell-v3";
const STATIC_CACHE = "app-static-v3";
const CACHE_PREFIX = "app-";
const APP_SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/js/legacy-app.js",
  "/js/router.js",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/assets/site/topbar-logo.jpg"
];

function isApiRequest(requestUrl) {
  return requestUrl.pathname.startsWith("/api/");
}

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isStaticAssetRequest(requestUrl) {
  return /\.(?:css|js|mjs|png|jpg|jpeg|webp|svg|ico|woff2?|ttf)$/i.test(requestUrl.pathname);
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => {
        if (key.startsWith(CACHE_PREFIX) && key !== APP_SHELL_CACHE && key !== STATIC_CACHE) {
          return caches.delete(key);
        }
        return Promise.resolve();
      })
    );
    await self.clients.claim();
    await notifyClients({ type: "APP_UPDATE_AVAILABLE" });
  })());
});

self.addEventListener("message", (event) => {
  const type = String(event?.data?.type || "").trim();
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (!isSameOrigin(requestUrl)) return;
  if (isApiRequest(requestUrl)) return;

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const shellCache = await caches.open(APP_SHELL_CACHE);
        shellCache.put("/index.html", networkResponse.clone());
        return networkResponse;
      } catch (_error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  if (isStaticAssetRequest(requestUrl) || requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    event.respondWith((async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          staticCache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (_error) {
        const cached = await staticCache.match(request);
        return cached || Response.error();
      }
    })());
  }
});

self.resolvePushTargetPath = function resolvePushTargetPath(data) {
  const rawLink = String(data?.linkUrl || "/").trim() || "/";
  const type = String(data?.type || "").trim().toLowerCase();
  const conversationId = Number.parseInt(String(data?.metadata?.conversationId || ""), 10);

  if ((type === "message" || rawLink === "/messages")
    && Number.isInteger(conversationId)
    && conversationId > 0) {
    return `/conversation/${conversationId}`;
  }

  return rawLink;
};

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = {};
  }

  const title = String(payload.title || "New notification");
  const body = String(payload.body || "");
  const linkUrl = String(payload.linkUrl || "/");
  const tag = payload.notificationId ? `notification-${payload.notificationId}` : undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag,
      renotify: false,
      data: {
        linkUrl,
        notificationId: payload.notificationId || null,
        type: payload.type || "general",
        metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = self.resolvePushTargetPath(event.notification?.data || {});
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      if (clientList.length && "focus" in clientList[0]) {
        clientList[0].postMessage({ type: "push:open", targetUrl });
        return clientList[0].focus();
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
