import { registerPushSubscription } from "@/lib/album.functions";

const VAPID_PUBLIC_KEY =
  "BE6B7CoRO4rIAMV45Xv3eIhaahNSSd6EzB6vYJWUHKVmC2Tq9T8Li9AQKKkU947-JG-Ny0f1WURHvQiaQs67m_o";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function getOrCreateViewerToken(): string {
  const key = "reel:viewer-token";
  let t = localStorage.getItem(key);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(key, t);
  }
  return t;
}

/**
 * Request notification permission and subscribe this device to push for the given event.
 * Safe to call multiple times; no-ops if unsupported or already denied.
 */
export async function subscribeToAlbumPush(eventId: string, nickname?: string) {
  try {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }

    const reg = await navigator.serviceWorker.register("/push-sw.js");
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const viewerToken = getOrCreateViewerToken();
    await registerPushSubscription({
      data: {
        eventId,
        viewerToken,
        nickname,
        subscription: sub.toJSON(),
      },
    });
  } catch (e) {
    console.warn("Push subscription failed:", e);
  }
}