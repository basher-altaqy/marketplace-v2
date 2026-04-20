self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = {};
  }

  const title = String(payload.title || 'New notification');
  const body = String(payload.body || '');
  const linkUrl = String(payload.linkUrl || '/');
  const tag = payload.notificationId ? `notification-${payload.notificationId}` : undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag,
      renotify: false,
      data: {
        linkUrl,
        notificationId: payload.notificationId || null,
        type: payload.type || 'general'
      }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = String(event.notification?.data?.linkUrl || '/');
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      if (clientList.length && 'focus' in clientList[0]) {
        clientList[0].postMessage({ type: 'push:open', targetUrl });
        return clientList[0].focus();
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
