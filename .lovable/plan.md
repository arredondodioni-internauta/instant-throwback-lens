## Guest Join Page — Spanish + Onboarding Steps

Edit only `src/routes/join.tsx`. No backend or other route changes.

### Changes

1. **Header**: Replace the two-line "Welcome to / [event name]" with just the event name (`eventInfo?.name ?? "el evento"`) in the same `font-serif` primary-colored style. Drop the "Welcome to" line entirely.

2. **3-step onboarding block** (new): Between the header and the name input, add a vertical list of 3 steps. Each step shows a number badge (01 / 02 / 03) in mono/primary, a bold title, and a muted subtitle. Styled to match the landing page step cards (border, rounded, subtle).
   - 01 — "Tienes 5 fotos. Que valgan la pena." / "Nada de repetir, nada de borrar. Como la cámara analógica de tus padres."
   - 02 — "Para un momento antes de disparar." / "Las mejores fotos no se hacen con prisa. Respira, encuadra, dispara."
   - 03 — "No verás nada hasta el final." / "Tus fotos van directo al anfitrión. Cuando acabe el evento, se revelan todas de golpe."

3. **Name field placeholder**: `"¿Cómo te llamas?"` (replaces `"Your name"`).

4. **Submit button label**: `"Abrir mi cámara"` (busy state: `"Abriendo..."`).

5. **Other Spanish strings on this screen**:
   - Fallback event name: `"el evento"`
   - Manual code entry label (only shown when no `?code=` in URL): `"Código del evento"`
   - Toast error fallback: `"No se pudo unir"`
   - Route `head` title: `"Únete al evento — mosaic"`

### Notes
- "5 fotos" in step 01 is hardcoded as written by the user, even though the real shot limit comes from event settings. If you'd rather make it dynamic (`Tienes {shotsPerGuest} fotos…`), say so and I'll wire it through `getEventByCode` (currently it only returns id/name/status).
- No language toggle on this screen — fully Spanish, since QR-scan guests are the target audience.
