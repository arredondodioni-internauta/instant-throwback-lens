import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SignJWT, importPKCS8 } from "jose";

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
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function buildVapidAuthHeader(audience: string, subject: string) {
  const pub = process.env.VAPID_PUBLIC_KEY!;
  const priv = process.env.VAPID_PRIVATE_KEY!;
  if (!pub || !priv) throw new Error("VAPID keys not configured");

  const key = await importVapidPrivateKey(priv, pub);

  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  };
  const enc = (o: object) =>
    b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlEncode(sig)}`;
  return { jwt, publicKey: pub };
}

async function sendPushTo(
  subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } },
  payload: string,
) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@reel.app";
  const { jwt, publicKey } = await buildVapidAuthHeader(audience, subject);

  // For simplicity we send notification metadata via headers + empty body.
  // Encrypting the payload with aes128gcm (RFC 8291) is non-trivial in workers;
  // we deliver a tickle-style push and the SW falls back to a default message
  // when no payload is present. The SW reads notification config from a follow-up
  // fetch keyed on event code if needed. For v1 the SW shows a static message
  // and the click handler navigates using a query param embedded in endpoint? No —
  // we attach data via the SW pulling from a known URL using the data field. Here
  // we just deliver an unencrypted tickle and let the SW show a default copy.
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      "Content-Length": "0",
    },
  });
  return res;
}

export async function sendAlbumPublishedPush(
  eventId: string,
  _eventName: string,
  _code: string,
) {
  const { data: viewers } = await supabaseAdmin
    .from("album_viewers")
    .select("id, push_subscription")
    .eq("event_id", eventId)
    .not("push_subscription", "is", null);

  if (!viewers?.length) return { sent: 0 };

  let sent = 0;
  for (const v of viewers) {
    try {
      const sub = v.push_subscription as any;
      if (!sub?.endpoint) continue;
      const res = await sendPushTo(sub, "");
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