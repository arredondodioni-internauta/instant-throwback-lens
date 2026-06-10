// Messaging-only service worker for Web Push.
// Does NOT cache app shell. Safe to register on any browser that supports push.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // Tickle-style push (no encrypted payload in v1). Show a generic notification.
  const title = "🎞️ Tu álbum está listo";
  const body = "El álbum del evento ya está disponible. Ábrelo para verlo.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "album-published",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Try to focus an existing tab on /album/* or /guest/*
      for (const client of allClients) {
        if (client.url.includes("/album/") || client.url.includes("/guest/")) {
          await client.focus();
          return;
        }
      }
      // Fallback: open the site root; the in-app banner will surface the album link
      await self.clients.openWindow("/");
    })()
  );
});