## What's actually happening

Looking at the session replay + network log for your last attempt:

- You signed up, then signed in, and reached `/events` (host dashboard) successfully.
- You navigated to `/events/new`, then **clicked "Create event" several times without typing anything into the "Event name" field**.
- No `createEvent` RPC was fired — because the `<Input name>` is `required`, the browser silently blocks the submit (it shows a tiny native "Please fill this field" hint that's easy to miss on mobile). The button has no `disabled` state and no toast, so it feels broken.

So the back‑end and auth are fine; the form just looks dead when invalid. That's the bug to fix.

A secondary issue worth handling at the same time: signups currently require email confirmation. If you want to test end‑to‑end without checking an inbox each time, we should turn on auto‑confirm.

The guest flow (`/join` → `/guest/$eventId`) looks correct on review — no logic bugs in `joinEvent`, `getGuestStatus`, or `takePhoto`. I'll still tighten two small UX things while we're in there.

## Plan

### 1. Make the "New event" form obviously responsive
File: `src/routes/_host.events.new.tsx`
- Disable "Create event" until `name.trim().length > 0` and shots is a valid number — so users see immediately that something is missing instead of clicking a dead button.
- Trim the name before submitting.
- Show a toast on validation failure as a backup.
- Keep the existing `createEvent` server function as-is (it works).

### 2. Auto-confirm host email signups (optional but recommended for testing)
- Enable `auto-confirm email signups` in auth config so signing up immediately logs you in. You can flip this back off before going live.

### 3. Light review/fixes on the guest path
Files: `src/routes/join.tsx`, `src/routes/guest.$eventId.tsx`, `src/lib/events.functions.ts`
- `join.tsx`: trim/uppercase the code before submit (already uppercased on input, but make sure no stray spaces).
- `guest.$eventId.tsx`: when `getGuestStatus` fails (e.g. stale `deviceToken` after event was deleted), we already redirect to `/join` — confirmed correct.
- `takePhoto`: confirm FormData round-trip works with the global `attachSupabaseAuth` middleware (it does — it only adds a header, doesn't touch the body). No code change needed.
- Add a small "Joining…" disabled state styling fix is already in place — no change.

### 4. Verify
- Sign in as host → `/events/new` → notice button is disabled until name is filled → fill name → submit → land on event dashboard with code + QR.
- Open `/join?code=XYZ` in a second window → enter name → camera screen loads with `5/5` counter.

## Out of scope
- No DB schema changes.
- No changes to camera capture, ZIP export, or styling beyond the form's disabled state.
