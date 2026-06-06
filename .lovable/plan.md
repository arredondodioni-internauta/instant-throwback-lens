## Guest Join Page Refresh

Goal: Improve the guest join experience when they arrive from a QR code scan.

### Changes

1. **Add a public lookup server function** in `src/lib/events.functions.ts`
   - `getEventByCode(code)` — returns `{ id, name, status }` without auth, so the join page can show the event name.

2. **Update `src/routes/join.tsx`**
   - On mount (when `code` is present in URL), fetch the event via the new lookup fn to display `Welcome to [event name]`.
   - Subtitle becomes: `Enter your name to start capturing moments`
   - Remove the event code `<Input>` and its `<Label>` entirely. Keep the code value internally for the `joinEvent` call.
   - Remove the `placeholder="Alex"` from the name field so it is blank.
   - Make the name field visually larger (e.g., `text-lg h-14`).
   - Keep the `joinEvent` submit logic unchanged — it still uses the code from the URL.

### Technical notes
- No auth required for the lookup; it only exposes public event info (name + status).
- The page still works when no code is in the URL: falls back to a generic title and shows the code input. (If the user wants to drop manual code entry entirely, let me know — I can redirect or show a "no code" state instead.)
