import { supabaseAdmin } from "@/integrations/supabase/client.server";

// VAPID keys are base64url-encoded EC P-256 keys.
// Public key: raw uncompressed point (65 bytes) base64url-encoded -> goes to clients.
// Private key: 32-byte d value base64url-encoded -> used to sign VAPID JWT.
// For Web Push we send JWT signed with ES256 and include public key in Crypto-Key header.

function b64urlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Build a JWK from raw private key d (32 bytes) and public key (65 bytes uncompressed).
async function importVapidPrivateKey(privateKeyB64Url: string, publicKeyB64Url: string) {
  const d = privateKeyB64Url;
  const pub = b64urlDecode(publicKeyB64Url);
  // pub[0] === 0x04 (uncompressed); x = bytes 1..33, y = bytes 33..65
  const x = b64urlEncode(pub.slice(1, 33));
  const y = b64urlEncode(pub.slice(33, 65));
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d,
    x,
    y,
    ext: true,
  } as JsonWebKey;
  return await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

async function buildVapidAuthHeader(audience: string, subject: string) {
  const pub =
    process.env.VAPID_PUBLIC_KEY ??
    "BE6B7CoRO4rIAMV45Xv3eIhaahNSSd6EzB6vYJWUHKVmC2Tq9T8Li9AQKKkU947-JG-Ny0f1WURHvQiaQs67m_o";
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys not configured");

  const key = await importVapidPrivateKey(priv, pub);

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const enc = (o: object) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlEncode(sig)}`;
  return { jwt, publicKey: pub };
}

type PushSubscriptionLike = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

// RFC 8291 Web Push payload encryption (aes128gcm), using the subscription's
// ECDH public key (p256dh) and auth secret. Lets a push carry its own
// {title, body, tag, url} instead of an empty "tickle" body.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm.buffer as ArrayBuffer, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt.buffer as ArrayBuffer,
      info: info.buffer as ArrayBuffer,
    },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function encryptWebPushPayload(
  subscription: PushSubscriptionLike,
  payload: object,
): Promise<Uint8Array | null> {
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!p256dh || !auth) return null;

  const uaPublicRaw = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublicKey },
      asKeyPair.privateKey,
      256,
    ),
  );

  const enc = new TextEncoder();
  const keyInfo = new Uint8Array([
    ...enc.encode("WebPush: info\0"),
    ...uaPublicRaw,
    ...asPublicRaw,
  ]);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const cekKey = await crypto.subtle.importKey("raw", cek.buffer as ArrayBuffer, "AES-GCM", false, [
    "encrypt",
  ]);

  const plaintext = enc.encode(JSON.stringify(payload));
  // Single-record message: append the 0x02 "last record" delimiter, no further padding.
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext, 0);
  padded[plaintext.length] = 0x02;

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, tagLength: 128 },
      cekKey,
      padded.buffer as ArrayBuffer,
    ),
  );

  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);
  return body;
}

async function sendPushTo(subscription: PushSubscriptionLike, payload?: object) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@reel.app";
  const { jwt, publicKey } = await buildVapidAuthHeader(audience, subject);

  const encryptedBody = payload ? await encryptWebPushPayload(subscription, payload) : null;

  const headers: Record<string, string> = {
    TTL: "86400",
    Authorization: `vapid t=${jwt}, k=${publicKey}`,
  };
  if (encryptedBody) {
    headers["Content-Encoding"] = "aes128gcm";
    headers["Content-Type"] = "application/octet-stream";
  } else {
    headers["Content-Length"] = "0";
  }

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body: encryptedBody ? (encryptedBody.buffer as ArrayBuffer) : undefined,
  });
  return res;
}

export async function sendAlbumPublishedPush(eventId: string, eventName: string, code: string) {
  const { data: viewers } = await supabaseAdmin
    .from("album_viewers")
    .select("id, push_subscription")
    .eq("event_id", eventId)
    .not("push_subscription", "is", null);

  if (!viewers?.length) return { sent: 0 };

  const payload = {
    title: "🎞️ Tu álbum está listo",
    body: `El álbum de "${eventName}" ya está disponible. Ábrelo para verlo.`,
    tag: "album-published",
    url: `/album/${code}`,
  };

  let sent = 0;
  for (const v of viewers) {
    try {
      const sub = v.push_subscription as unknown as PushSubscriptionLike;
      if (!sub?.endpoint) continue;
      const res = await sendPushTo(sub, payload);
      if (res.status === 410 || res.status === 404) {
        // Subscription gone, clean up
        await supabaseAdmin
          .from("album_viewers")
          .update({ push_subscription: null })
          .eq("id", v.id);
      } else if (res.ok || res.status === 201 || res.status === 202) {
        sent++;
      }
    } catch (e) {
      console.error("push send error", e);
    }
  }
  return { sent };
}

type ReminderTier = {
  delayMs: number;
  sentColumn: "camera_reminder_sent_at" | "camera_reminder_test_sent_at";
};

// Guests where `tier.sentColumn` is still null, whose event is still active,
// and who have a linked push subscription (via album_viewers.guest_id).
async function sendCameraReminderTier(tier: ReminderTier) {
  const { data: candidates, error } = await supabaseAdmin
    .from("guests")
    .select("id, event_id, events!inner(status)")
    .is(tier.sentColumn, null)
    .lte("created_at", new Date(Date.now() - tier.delayMs).toISOString())
    .eq("events.status", "active");

  if (error) throw new Error(error.message);
  if (!candidates?.length) return { sent: 0, skipped: 0 };

  const guestIds = candidates.map((g) => g.id);
  const { data: subscriptions, error: subsError } = await supabaseAdmin
    .from("album_viewers")
    .select("id, guest_id, push_subscription")
    .in("guest_id", guestIds)
    .not("push_subscription", "is", null);
  if (subsError) throw new Error(subsError.message);

  const subByGuestId = new Map((subscriptions ?? []).map((s) => [s.guest_id as string, s]));

  const payload = {
    title: "📸 ¡No olvides tomar fotos!",
    body: "Toca para abrir la cámara y seguir capturando el momento.",
    tag: "camera-reminder",
  };

  let sent = 0;
  let skipped = 0;
  for (const guest of candidates) {
    const viewer = subByGuestId.get(guest.id);
    const sub = viewer?.push_subscription as unknown as PushSubscriptionLike | undefined;
    if (!sub?.endpoint) {
      // No subscription yet — leave unmarked so a later tick can still catch them.
      skipped++;
      continue;
    }
    try {
      const res = await sendPushTo(sub, { ...payload, url: `/guest/${guest.event_id}` });
      if (res.status === 410 || res.status === 404) {
        await supabaseAdmin
          .from("album_viewers")
          .update({ push_subscription: null })
          .eq("id", viewer!.id);
        skipped++;
        continue;
      }
      if (res.ok || res.status === 201 || res.status === 202) sent++;
      // Mark as sent regardless of a transient non-2xx: this is a best-effort
      // fire-and-forget push, same tolerance as sendAlbumPublishedPush. Avoids
      // retry storms against a push endpoint that's failing for another reason.
      const now = new Date().toISOString();
      const update =
        tier.sentColumn === "camera_reminder_sent_at"
          ? { camera_reminder_sent_at: now }
          : { camera_reminder_test_sent_at: now };
      await supabaseAdmin.from("guests").update(update).eq("id", guest.id);
    } catch (e) {
      console.error("camera reminder push send error", e);
    }
  }
  return { sent, skipped };
}

export async function sendCameraReminderPushes() {
  // TODO(testing): remove the 30s tier once the 1h reminder is confirmed working
  // end-to-end — it exists purely so this can be tested without a real hour-long wait.
  const test30s = await sendCameraReminderTier({
    delayMs: 30 * 1000,
    sentColumn: "camera_reminder_test_sent_at",
  });
  const oneHour = await sendCameraReminderTier({
    delayMs: 60 * 60 * 1000,
    sentColumn: "camera_reminder_sent_at",
  });
  return {
    sent: test30s.sent + oneHour.sent,
    skipped: test30s.skipped + oneHour.skipped,
    test30s,
    oneHour,
  };
}
