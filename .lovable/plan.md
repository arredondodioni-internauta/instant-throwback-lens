# Reel — Post-Event Album

Builds the full album experience from "Publicar álbum" → guests view, react, comment, and save photos. Anonymous photo authorship throughout. 3-day expiry. Realtime sync.

---

## 1. Database (one migration)

New columns on `events`:
- `album_published_at timestamptz null`
- `album_expires_at timestamptz null` (set to `published_at + 3 days`)

New tables (all in `public`, with GRANTs):

**`reactions`** — one row per (photo, anon viewer, emoji)
- `id uuid pk`, `photo_id uuid fk photos`, `event_id uuid fk events`
- `viewer_token uuid not null` (random token stored in guest's localStorage; allows "one reaction per user per photo")
- `emoji text check in ('😂','🥹','🔥','👏')`
- `created_at timestamptz`
- unique(photo_id, viewer_token) → enforces "one active reaction per user per photo"

**`comments`** — flat list, max 140 chars
- `id uuid pk`, `photo_id uuid fk photos`, `event_id uuid fk events`
- `viewer_token uuid not null`, `nickname text not null` (≤ 40 chars, captured on first comment if not already a guest)
- `body text check (length(body) between 1 and 140)`
- `created_at timestamptz`

**`album_viewers`** (lightweight) — for push subscription mapping
- `id uuid pk`, `event_id uuid fk events`, `viewer_token uuid`
- `nickname text null`, `push_subscription jsonb null`, `created_at timestamptz`
- unique(event_id, viewer_token)

RLS: enable on all three; deny direct client access. All reads/writes go through server functions using `supabaseAdmin` (album is public-by-code, so server functions gate on `album_published_at is not null and album_expires_at > now()`).

Realtime publication: add `reactions` and `comments` to `supabase_realtime` so the album page can subscribe.

---

## 2. Server functions (`src/lib/album.functions.ts`)

All take `{ code }` (event code) + `viewerToken` and verify the album is published and not expired.

- `publishAlbum({ eventId })` — host-only (uses `requireSupabaseAuth`). Sets `album_published_at = now()`, `album_expires_at = now() + 3 days`, status `ended`. Then triggers push to all `album_viewers` with a subscription for this event.
- `getAlbum({ code, viewerToken })` — returns `{ event: {name, expiresAt}, photos: [{id, takenAt, url, reactions: {emoji: count}, myReaction, commentCount}] }`. Signs storage URLs (1h TTL). Ordered chronologically. Computes "featured" = top 3 photos by total reactions (only if any exist).
- `toggleReaction({ code, viewerToken, photoId, emoji })` — upsert with unique constraint; if same emoji exists, delete; if different, update; if none, insert. Returns new counts for that photo.
- `addComment({ code, viewerToken, nickname, photoId, body })` — validates length, inserts.
- `listComments({ code, photoId })` — returns last 50 ordered desc, client paginates.
- `registerPushSubscription({ code, viewerToken, nickname, subscription })` — upsert into `album_viewers`. Called on guest join + when permission granted.

---

## 3. Host publish flow

Edit `src/routes/_host.events.$eventId.tsx`:
- Replace standalone "End event" with a single CTA **"Publicar álbum"** (red→primary). Confirmation dialog explains: ends the event, notifies all guests, album available for 3 days.
- After publish: show album link + QR + "Copiar enlace al álbum" + countdown "Expira en 2d 23h".
- Existing ZIP download stays for host.

---

## 4. Album route (`src/routes/album.$code.tsx`) — public

Layout: mobile-first, full-bleed black background, no nav chrome.

**Header**: event name + small "expira en Xd Xh" + share button.

**Grid**:
- If 1+ photos have reactions: top 3 reacted photos render full-width stacked as hero cards (square, full grid width).
- Below: 2-column square grid, chronological (oldest first), `aspect-square object-cover`.
- Reaction badge overlay on bottom-right of each tile: `😂 3` (top emoji + count). Double-tap fires 🔥 reaction with quick scale animation.
- Long-press (500ms) → enters selection mode (haptic via `navigator.vibrate(15)`).

**Selection mode**:
- Top bar: "Seleccionar todas" + "Cancelar". Each tile shows a circle top-right (empty/filled-check).
- Drag-to-select: pointer events on the grid container track which tile the pointer is over and toggle on first entry (iOS Photos style).
- Bottom action bar (fixed, above safe area): "N fotos seleccionadas" + filled "↓ Guardar".
- Save: iterates selected photos, calls `navigator.share({ files: [File] })` per photo (user picks "Save Image" → camera roll). If `navigator.canShare` unsupported, falls back to triggering `<a download>` per photo. Progress toast for >5. Final toast "X fotos guardadas ✓".

**Lightbox** (`<Dialog>` full-screen, photo at native aspect):
- Swipe gestures via pointer events:
  - left/right → prev/next (preload neighbors)
  - down → close
  - up → opens comments bottom sheet
- Long-press → emoji pill (😂 🥹 🔥 👏) floats above photo; tap picks reaction.
- Double-tap → quick 🔥.
- Top-right: download (single-photo share-sheet save).
- Bottom: relative timestamp ("hace 2h"), no author.

**Comments sheet** (`<Sheet side="bottom">`):
- Header "Comentarios". List shows nickname + body + relative time, newest at bottom.
- Sticky input + send button. Max 140 chars with counter. If `viewerToken` has no nickname yet → first send prompts for nickname (small inline dialog) then submits.

**Realtime**: subscribe to `postgres_changes` on `reactions` and `comments` filtered by `event_id`; merge updates into local state.

**Viewer token**: on first load, read/write `reel:viewer-token` in localStorage. Anonymous, stable per device.

**Expiry**: if `album_expires_at < now()`, render "Este álbum ya no está disponible" instead of grid.

---

## 5. Web Push (PWA)

Per the PWA skill, ship the messaging-style worker — not an app-shell cache:

- Generate VAPID keypair once; store private key as secret `VAPID_PRIVATE_KEY`, expose public as `VITE_VAPID_PUBLIC_KEY`.
- New `public/push-sw.js` (messaging worker only, no app-shell caching, no Lovable-preview guards needed since it's not a Workbox SW). Handles `push` → `showNotification` and `notificationclick` → open `/album/{code}`.
- Register from album-related screens only (`/join`, `/guest/:eventId`): after user joins, ask notification permission (one-time, deferrable). On grant, subscribe with VAPID public key, POST to `registerPushSubscription`.
- New manifest at `public/manifest.webmanifest` so iOS users can "Add to Home Screen" (required for iOS web push). Add link tags in `__root.tsx` head.
- New server route `src/routes/api/public/push/send.ts` is internal-only (called from `publishAlbum` server fn, not externally). Uses `web-push` npm package with VAPID keys to fan out to all `album_viewers.push_subscription` for the event. **Note**: `web-push` is Node-only; will need to send pushes from a server route using fetch directly to the push endpoints with VAPID JWT signed via Web Crypto (worker-compatible). Implementation uses `jose` for JWT signing — Worker-safe.

Graceful fallback: if user denied notifications, they'll just see the album when they next open the camera screen (we'll show an in-app banner "📷 El álbum de [evento] ya está disponible" linking to `/album/{code}` once `album_published_at` is set).

---

## 6. Expiry job

`pg_cron` daily job: `DELETE FROM photos / reactions / comments WHERE event_id IN (SELECT id FROM events WHERE album_expires_at < now())` + storage cleanup via server route called by cron with anon-key apikey header.

---

## Technical notes

- `web-push` library is Node-only and won't run in Cloudflare Workers. We'll implement VAPID JWT + raw `fetch` to the subscription endpoint using `jose` (Worker-safe).
- Drag-to-select uses `pointermove` + `elementFromPoint` to identify the tile under finger.
- Storage URLs are signed for 1h; album page re-fetches on focus if a URL is older than 50min.
- Reactions/comments are anonymous via `viewer_token`; nicknames apply only to comments.
- No author on photos anywhere — even host download ZIP filenames will change to `photo_001.jpg` (currently uses guest name; flag this for confirmation if the host still wants the per-guest folders).

## Out of scope (call out for follow-up)

- iOS native push (requires native app; only PWA + Add to Home Screen works on iOS web).
- Album sharing to non-guests via deep link preview / OG image generation.
- Removing per-guest folder structure in host ZIP download — currently uses `guests.display_name`. Plan keeps host ZIP as-is; confirm if you want it anonymized too.
