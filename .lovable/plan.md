## Concept

A web app that mimics an analog disposable camera for events. The host creates an event, sets a per-guest shot limit, and shares a join code. Guests join with just a name, take a fixed number of photos they cannot review, and the host downloads every photo as a ZIP when the event ends.

## User flows

**Host**
1. Sign up / log in (email + password).
2. Create event: name, date, shots-per-guest (e.g. 5), optional max guests.
3. Get a 6-character join code + QR code to share.
4. Live dashboard: guest count, total photos taken, "End event" button.
5. After ending: download ZIP of all originals, organized by guest name.

**Guest**
1. Open join link or enter code + display name. No account needed; identity is stored in `localStorage` so they can close/reopen the tab during the event.
2. Camera screen: live viewfinder, big shutter button, "3 / 5 left" counter.
3. Tap shutter → shutter sound + white flash overlay → photo uploads in background → counter decrements. Photo is never shown back.
4. When shots = 0, see a "Roll finished — photos will be revealed by your host" screen.

## Tech & architecture

- **Stack**: TanStack Start (already scaffolded) + Lovable Cloud (Supabase) for auth, Postgres, and Storage.
- **Code portability**: standard React/TS project. Connect GitHub via the Plus menu → two-way sync. You can clone and iterate in Claude Code; pushes flow back into Lovable.
- **Camera**: browser `getUserMedia` + `<canvas>` capture → JPEG blob → upload to Supabase Storage. Falls back to a file `<input capture="environment">` if camera API fails.
- **ZIP export**: client-side `jszip` — host's browser fetches signed URLs for all event photos and zips them. Avoids server memory limits.

### Routes

```text
src/routes/
  index.tsx                    -> Landing: "Host an event" / "Join with code"
  login.tsx                    -> Host auth
  signup.tsx
  join.tsx                     -> Code entry + name
  _host/                       -> Layout guarding host auth
    events.tsx                 -> Host's event list
    events.new.tsx             -> Create event
    events.$eventId.tsx        -> Live dashboard + end + download
  guest.$eventId.tsx           -> Guest camera screen (no auth)
```

### Database

- `events` — id, host_id (auth.users), name, code (unique 6-char), shots_per_guest, status ('active'|'ended'), created_at, ended_at
- `guests` — id, event_id, display_name, device_token (uuid stored in guest's localStorage), created_at
- `photos` — id, event_id, guest_id, storage_path, taken_at

RLS:
- Hosts: full access to their own events, guests, and photos.
- Guests (anon): can insert into `guests` with a valid event code; can insert into `photos` only if their guest row's remaining shot count > 0 (enforced by a server function, not a raw insert).
- Guests cannot select photos. Ever.

Storage bucket: `event-photos`, private. Host fetches signed URLs server-side for the ZIP.

### Server functions (`createServerFn`)

- `joinEvent({ code, displayName })` → creates guest row, returns device_token + event metadata.
- `recordPhoto({ deviceToken, eventId, storagePath })` → atomic check of remaining shots, insert photo or reject.
- `endEvent({ eventId })` → host-only, flips status to ended.
- `getEventPhotosForDownload({ eventId })` → host-only, returns signed URLs grouped by guest.

## Out of scope (v1)

- Vintage/film-grain filter (we can add later as a toggle).
- Public guest gallery / per-guest reveal.
- Email magic links for guests.
- Native mobile app — runs as a PWA-friendly web app.

## Build order

1. Enable Lovable Cloud + host email/password auth.
2. DB schema + RLS + storage bucket.
3. Landing, host auth, event create + dashboard.
4. Guest join flow + camera capture + upload.
5. End-event + ZIP download.
6. Polish: shutter sound, flash animation, counter, "roll finished" screen.

Ready to switch to build mode whenever you approve.
