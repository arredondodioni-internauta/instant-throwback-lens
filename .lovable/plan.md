## What the data actually shows

I checked the DB for event `ML32AE` (BBQ, still `active`):

- **10 guests joined successfully** between Jun 3 16:49 and Jun 4 07:18.
- **0 photos** were ever taken by any of them.
- **Duplicate names**: Joan×2, Josn×2, Alex×2 — strong signal that those users hit an error and retried `/join` with the same name.

Conclusion: the failure was **not** at the `/join` step. The `joinEvent` server fn worked — rows exist. The error users saw appeared **after** join, on the `/guest/$eventId` camera screen, and they bounced back to `/join` thinking the join itself had failed.

## Most likely causes (ranked)

### 1. Camera permission denied / unavailable → silent bounce to /join
On `/guest/$eventId`, the page calls `getGuestStatus`. If that throws for **any** reason, the code does:

```ts
localStorage.removeItem(`reel:event:${eventId}`);
nav({ to: "/join", search: { code: undefined } });
```

No toast, no explanation. The user lands back on `/join` and assumes "I'm not in the group". This matches the duplicate-name pattern perfectly.

Triggers for `getGuestStatus` to throw:
- WhatsApp / Instagram / TikTok in-app browsers strip or wall off `localStorage` and camera APIs — the device token write succeeds on `/join`, but reading it on the next route can fail, or the serverFn call fails because the in-app browser blocks the auth/cookie surface.
- iOS Safari Private Mode: `localStorage.setItem` silently fails in some versions.
- Token race: the user opens the camera route in a different tab/browser than `/join`, so the token isn't there.

### 2. Camera permission flow itself
Even if `getGuestStatus` succeeds, the camera `getUserMedia` call can fail on:
- Non-HTTPS context (shouldn't happen on `*.lovable.app`, but worth ruling out for any custom QR URL).
- In-app browsers that don't expose `mediaDevices`.
- iOS where the user denied the permission prompt once — subsequent visits silently fail.

The camera error is shown inline (`cameraError` state), not as the bouncing-back-to-/join behavior, so this is a secondary hypothesis.

### 3. The "not part of a group" wording
That exact phrase isn't in our codebase. It's most likely the user paraphrasing one of:
- The default `/join` page reappearing ("Enter the host's code") → they read it as "you're not in".
- A toast from `joinEvent`: `"Event not found. Check the code."` if they retried with a typo (we see `Josn` vs `Joan`, `Alez` vs `Alex`).

## How to confirm

Three quick checks, no code changes:

1. **Pull serverFn logs** for `getGuestStatus` and `takePhoto` around Jun 3 17:00–20:30 and Jun 4 07:15 to see whether `getGuestStatus` was failing or whether users never reached `takePhoto`.
2. **Test on a real in-app browser**: open the QR via WhatsApp on iOS and Android, complete the join, see if `/guest/$eventId` survives.
3. **Add a one-line diagnostic toast** before the silent bounce so future failures are visible.

## Recommended fix (small, surgical — only after you approve)

In `src/routes/guest.$eventId.tsx`, change the silent catch into a visible one:

- Show a `toast.error("Couldn't restore your session, please rejoin.")` before navigating back to `/join`.
- Distinguish "no token in localStorage" (likely in-app browser) from "serverFn failed" (likely network or event ended) with different messages.
- Optionally: if the in-app browser is detected (`navigator.userAgent` contains `FBAN`, `Instagram`, `Line`, etc.), show a "Open in Safari/Chrome" hint before they even hit the camera step.

This is diagnosis-only for now — say the word and I'll implement the toast + in-app-browser hint.