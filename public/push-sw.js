// Messaging-only service worker for Web Push.
// Does NOT cache app shell. Safe to register on any browser that supports push.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // Pushes carry an encrypted {title, body, tag, url} payload (RFC 8291).
  // Fall back to the original album-published copy if parsing fails, so an
  // in-flight tickle push from before this deploy still shows something.
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }

  const title = data?.title ?? "🎞️ Tu álbum está listo";
  const body = data?.body ?? "El álbum del evento ya está disponible. Ábrelo para verlo.";
  const tag = data?.tag ?? "album-published";
  const url = data?.url ?? null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? null;
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (targetUrl) {
        for (const client of allClients) {
          if (client.url.includes(targetUrl)) {
            await client.focus();
            return;
          }
        }
        await self.clients.openWindow(targetUrl);
        return;
      }
      // No target url (fallback copy) — try an existing /album/* or /guest/* tab.
      for (const client of allClients) {
        if (client.url.includes("/album/") || client.url.includes("/guest/")) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow("/");
    })(),
  );
});
