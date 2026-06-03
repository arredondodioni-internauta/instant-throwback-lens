## Goal

Maximize photo resolution on iPhone (Safari) in `src/routes/guest.$eventId.tsx`. Most of the requested fixes are already partly in place — this plan closes the remaining gaps without changing capture/upload behavior elsewhere.

## Current state

- `getUserMedia` requests `width/height ideal 4096x2160` but no `aspectRatio` and no fallback if constraints are rejected.
- `<video>` already has `autoPlay playsInline muted`.
- Capture path: tries `ImageCapture.takePhoto()` first (good), then falls back to drawing from `video.videoWidth/videoHeight` — which on iOS Safari often reflects the downscaled preview size, not the track's true resolution.
- Upload sends the blob as-is (no resizing/recompression). Good.

## Changes (single file: `src/routes/guest.$eventId.tsx`)

1. **getUserMedia constraints + fallback**
   - Add `aspectRatio: { ideal: 16/9 }` to the ideal request.
   - Wrap the call in try/catch: on failure, retry with a minimal constraint set (`{ video: { facingMode: { ideal: facing } }, audio: false }`) so the camera still starts on devices that reject the high-res ideals.

2. **Full-resolution canvas capture**
   - In the non-ImageCapture branch of `shoot()`, read `track.getSettings()` and use its `width`/`height` as the canvas size when available, falling back to `video.videoWidth/videoHeight` only if settings are missing.
   - Keep `canvas.toBlob(..., "image/jpeg", 0.95)` and the existing upload path unchanged.

3. **No other changes** — video element attributes, ImageCapture preference, zoom logic, and the upload flow remain as-is.

## Technical notes

- `track.getSettings()` reflects the negotiated track resolution; on iOS this is typically higher than the rendered `<video>` element's `videoWidth` when the element is sized by CSS.
- The fallback `getUserMedia` call only fires if the first one throws (`OverconstrainedError` etc.), preserving the high-res path on capable devices.
- No backend, storage, or schema changes.
