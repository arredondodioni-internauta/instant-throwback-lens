import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getGuestStatus, takePhoto } from "@/lib/events.functions";
import { getEventAlbumStatus } from "@/lib/album.functions";
import { subscribeToAlbumPush } from "@/lib/push-client";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/guest/$eventId")({
  component: GuestCamera,
  head: () => ({ meta: [{ title: "Camera — Reel" }] }),
});

// Vercel rejects any single function payload over 4.5MB, and native camera
// resolution routinely exceeds that. Cap the longest edge and re-encode so
// uploads stay well under the limit even on a slow connection.
const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_QUALITY = 0.8;

// Downscale + re-encode a captured photo blob (e.g. from ImageCapture, which
// returns the native, uncapped sensor resolution).
async function resizePhotoBlob(blob: Blob, maxDim: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", quality),
  );
}

function GuestCamera() {
  const { eventId } = Route.useParams();
  const nav = useNavigate();
  const fnStatus = useServerFn(getGuestStatus);
  const fnTake = useServerFn(takePhoto);
  const fnAlbumStatus = useServerFn(getEventAlbumStatus);
  const [albumInfo, setAlbumInfo] = useState<{
    published: boolean;
    code: string | null;
    name?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [status, setStatus] = useState<{
    displayName: string;
    eventName: string;
    eventStatus: "active" | "ended";
    shotsPerGuest: number;
    shotsTaken: number;
  } | null>(null);
  // Lets the camera-start effect check the latest status without depending
  // on it, so starting the camera doesn't wait on the status round trip.
  const statusRef = useRef<typeof status>(null);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const [flashing, setFlashing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  // Live refs so the touch handlers always read the current zoom/caps without
  // re-binding listeners (which was causing stale-closure jumps mid-pinch).
  const zoomRef = useRef(1);
  const zoomCapsRef = useRef<{ min: number; max: number; step: number } | null>(null);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    zoomCapsRef.current = zoomCaps;
  }, [zoomCaps]);

  // Lock the page into a true full-screen, no-scroll, no-pinch-zoom camera shell.
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyBg = document.body.style.backgroundColor;
    const prevTouchAction = document.documentElement.style.touchAction;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.backgroundColor = "#000";
    document.documentElement.style.touchAction = "none";

    // Tighten the viewport meta so iOS doesn't double-tap / pinch-zoom the page.
    const existing = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    const prevViewport = existing?.getAttribute("content") ?? null;
    const meta = existing ?? document.createElement("meta");
    meta.setAttribute("name", "viewport");
    meta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );
    if (!existing) document.head.appendChild(meta);

    // Block iOS Safari's proprietary pinch/double-tap page zoom gestures and
    // any default multi-touch behavior that would scale the webpage.
    const blockGesture = (e: Event) => e.preventDefault();
    const blockMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    let lastTouchEnd = 0;
    const blockDoubleTap = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 350) e.preventDefault();
      lastTouchEnd = now;
    };
    document.addEventListener("gesturestart", blockGesture as EventListener);
    document.addEventListener("gesturechange", blockGesture as EventListener);
    document.addEventListener("gestureend", blockGesture as EventListener);
    document.addEventListener("touchmove", blockMultiTouch, { passive: false });
    document.addEventListener("touchend", blockDoubleTap, { passive: false });

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.backgroundColor = prevBodyBg;
      document.documentElement.style.touchAction = prevTouchAction;
      if (prevViewport !== null) meta.setAttribute("content", prevViewport);
      document.removeEventListener("gesturestart", blockGesture as EventListener);
      document.removeEventListener("gesturechange", blockGesture as EventListener);
      document.removeEventListener("gestureend", blockGesture as EventListener);
      document.removeEventListener("touchmove", blockMultiTouch);
      document.removeEventListener("touchend", blockDoubleTap);
    };
  }, []);

  // Load guest status from device token
  useEffect(() => {
    // Detect in-app browsers (WhatsApp, Instagram, Facebook, TikTok, Line, etc.)
    // which often block camera access and/or localStorage.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const inApp = /FBAN|FBAV|Instagram|Line|TikTok|MicroMessenger|WhatsApp/i.test(ua);
    if (inApp) {
      toast.error(
        "Open this link in Safari or Chrome — in-app browsers block the camera.",
        { duration: 8000 },
      );
    }

    let token: string | null = null;
    try {
      token = localStorage.getItem(`reel:event:${eventId}`);
    } catch {
      toast.error("Your browser is blocking storage. Open the link in Safari or Chrome.");
      nav({ to: "/join", search: { code: undefined } });
      return;
    }
    if (!token) {
      toast.error("We couldn't find your session on this device. Please join again.");
      nav({ to: "/join", search: { code: undefined } });
      return;
    }
    fnStatus({ data: { deviceToken: token } })
      .then((s) => {
        setStatus(s);
        // Fire-and-forget: subscribe this device to push so we can notify when album publishes
        subscribeToAlbumPush(eventId, s.displayName);
      })
      .catch((err: any) => {
        const msg = err?.message ?? "";
        if (/Guest not found/i.test(msg)) {
          toast.error("Your session expired. Please join the event again.");
          try { localStorage.removeItem(`reel:event:${eventId}`); } catch {}
        } else {
          toast.error(`Couldn't restore your session: ${msg || "network error"}`);
        }
        nav({ to: "/join", search: { code: undefined } });
      });
  }, [eventId, fnStatus, nav]);

  // Poll album publish status while the event is ended so we can show a CTA
  useEffect(() => {
    if (status?.eventStatus !== "ended") return;
    let cancelled = false;
    async function check() {
      try {
        const info = await fnAlbumStatus({ data: { eventId } });
        if (!cancelled) setAlbumInfo(info as any);
      } catch {}
    }
    check();
    const i = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [status?.eventStatus, eventId, fnAlbumStatus]);

  // Start camera immediately, in parallel with the guest-status network call,
  // so a slow connection doesn't delay the viewfinder appearing. Bail out if
  // we've since learned (via statusRef) that the event already ended.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        // Request the highest resolution the device can offer (no square cap).
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 4096 },
              height: { ideal: 2160 },
              aspectRatio: { ideal: 16 / 9 },
            },
            audio: false,
          });
        } catch {
          // Fallback if the device rejects the ideal constraints.
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing } },
            audio: false,
          });
        }
        if (cancelled || statusRef.current?.eventStatus === "ended") {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        // Detect optical/digital zoom capability and reset to 1x on (re)start.
        const caps: any = track?.getCapabilities?.() ?? {};
        if (caps.zoom && typeof caps.zoom.min === "number" && typeof caps.zoom.max === "number") {
          setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step ?? 0.1 });
          setZoom(caps.zoom.min);
        } else {
          setZoomCaps(null);
          setZoom(1);
        }
        setCameraError(null);
      } catch (err: any) {
        setCameraError(err?.message ?? "Camera unavailable");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
    };
  }, [facing]);

  // Stop the camera if the event ends while the stream is already running
  // (e.g. the host ends it mid-session).
  useEffect(() => {
    if (status?.eventStatus === "ended") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    }
  }, [status?.eventStatus]);

  // Apply zoom to the active track whenever it changes.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !zoomCaps) return;
    const clamped = Math.min(zoomCaps.max, Math.max(zoomCaps.min, zoom));
    try {
      // advanced constraints are required on some browsers for `zoom`
      (track.applyConstraints as any)({ advanced: [{ zoom: clamped }] }).catch(() => {});
    } catch {
      // ignore
    }
  }, [zoom, zoomCaps]);

  // Pinch-to-zoom inside the viewfinder. Listeners are bound once and read
  // the current zoom/caps from refs so updates during the gesture don't
  // re-bind the handlers or reset the starting point.
  useEffect(() => {
    const el = viewfinderRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 1;

    const dist = (touches: TouchList) => {
      const a = touches[0];
      const b = touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        startDist = dist(e.touches);
        startZoom = zoomRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const caps = zoomCapsRef.current;
        if (!caps || startDist <= 0) return;
        const ratio = dist(e.touches) / startDist;
        const next = Math.min(caps.max, Math.max(caps.min, startZoom * ratio));
        // Apply directly to the track for smooth, continuous zoom — bypass
        // React render latency during the gesture.
        const track = trackRef.current;
        if (track) {
          try {
            (track.applyConstraints as any)({ advanced: [{ zoom: next }] }).catch(() => {});
          } catch {
            // ignore
          }
        }
        zoomRef.current = next;
        setZoom(next);
      }
    };
    const onEnd = () => {
      startDist = 0;
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  async function shoot() {
    if (busy || !status || !videoRef.current) return;
    const remaining = status.shotsPerGuest - status.shotsTaken;
    if (remaining <= 0) return;

    setBusy(true);
    // flash + shutter sound
    setFlashing(true);
    playShutter();
    setTimeout(() => setFlashing(false), 120);

    let blob: Blob | null = null;
    // Prefer ImageCapture for full-sensor resolution when available, then
    // downscale — the native resolution it returns routinely exceeds
    // Vercel's upload limit.
    const track = trackRef.current;
    const ImageCaptureCtor = (window as any).ImageCapture;
    if (track && ImageCaptureCtor) {
      try {
        const ic = new ImageCaptureCtor(track);
        const native = await ic.takePhoto();
        blob = await resizePhotoBlob(native, MAX_PHOTO_DIMENSION, PHOTO_QUALITY);
      } catch {
        blob = null;
      }
    }
    if (!blob) {
      const video = videoRef.current;
      const settings = track?.getSettings?.();
      const rawW = settings?.width ?? video.videoWidth;
      const rawH = settings?.height ?? video.videoHeight;
      const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(rawW, rawH));
      const w = Math.round(rawW * scale);
      const h = Math.round(rawH * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, w, h);
      blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", PHOTO_QUALITY),
      );
    }

    // Local capture is done — hand control back to the guest immediately.
    // The upload continues in the background so a slow connection no longer
    // makes the shutter feel stuck.
    setBusy(false);

    if (!blob) {
      toast.error("Could not capture photo");
      return;
    }

    // Optimistically count this shot right away so the counter and shot
    // limit feel instant, regardless of how long the upload takes.
    setStatus((s) => (s ? { ...s, shotsTaken: s.shotsTaken + 1 } : s));

    const token = localStorage.getItem(`reel:event:${eventId}`)!;
    const fd = new FormData();
    fd.append("deviceToken", token);
    fd.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
    fnTake({ data: fd })
      .then((res) => {
        // Reconcile with the authoritative count from the server.
        setStatus((s) => (s ? { ...s, shotsTaken: res.shotsTaken } : s));
      })
      .catch((err: any) => {
        // Upload failed — give the shot back so they can retake it.
        setStatus((s) => (s ? { ...s, shotsTaken: Math.max(0, s.shotsTaken - 1) } : s));
        toast.error(err?.message ?? "Could not save photo — try again");
      });
  }

  if (!status) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-black text-white">
        Loading…
      </main>
    );
  }

  if (status.eventStatus === "ended") {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white px-6 text-center">
        <h1 className="font-serif text-3xl mb-2">El carrete está listo.</h1>
        {albumInfo?.published && albumInfo.code ? (
          <>
            <p className="text-white/70 max-w-sm mb-6">
              El álbum de {status.eventName} ya está disponible.
            </p>
            <a
              href={`/album/${albumInfo.code}`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
            >
              🎞️ Ver el álbum
            </a>
          </>
        ) : (
          <p className="text-white/70 max-w-sm">
            {status.eventName} ha terminado. El anfitrión publicará el álbum pronto.
          </p>
        )}
      </main>
    );
  }

  const remaining = status.shotsPerGuest - status.shotsTaken;

  if (remaining <= 0) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white px-6 text-center">
        <h1 className="font-serif text-3xl mb-2">Roll finished.</h1>
        <p className="text-white/70 max-w-sm">
          You used all {status.shotsPerGuest} shots. Your host will share the photos when the
          event ends.
        </p>
      </main>
    );
  }

  return (
    <main
      className="fixed inset-0 h-dvh bg-black text-white overflow-hidden select-none"
      style={{ touchAction: "none" }}
    >
      {/* Viewfinder — fills the whole screen */}
      <div
        ref={viewfinderRef}
        className="absolute inset-0 overflow-hidden bg-black"
        style={{ touchAction: "none" }}
      >
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white/70">
            {cameraError}. Please allow camera access.
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Flash overlay */}
        <div
          className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-100 ${
            flashing ? "opacity-90" : "opacity-0"
          }`}
        />

        {/* Corner brackets */}
        <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-white/50 pointer-events-none" />
        <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-white/50 pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-white/50 pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-white/50 pointer-events-none" />

        {/* Vertical zoom slider */}
        {zoomCaps && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 pointer-events-auto z-30 py-2 px-1">
            <span className="text-xs font-mono text-white/60 bg-black/50 px-1.5 py-0.5 rounded-full">
              {zoom.toFixed(1)}x
            </span>
            <div className="relative" style={{ height: 260, width: 20 }}>
              <input
                type="range"
                min={zoomCaps.min}
                max={zoomCaps.max}
                step={zoomCaps.step}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="accent-primary absolute"
                style={{
                  width: 260,
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%) rotate(-90deg)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Top bar overlay */}
      <div
        className="absolute top-0 inset-x-0 z-20 px-5 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)", paddingBottom: 24 }}
      >
        <div>
          <div className="font-serif text-base leading-tight">{status.eventName}</div>
          <div className="text-xs text-primary uppercase tracking-wider">{status.displayName}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="text-xs font-mono bg-primary/20 text-primary px-2 py-0.5 rounded">ISO 400</div>
          <div className="text-xs text-white/40 font-mono">f/2.8 · 1/60</div>
        </div>
      </div>

      {/* Shot counter overlay (sits above the shutter) */}
      <div
        className="absolute inset-x-0 z-20 flex flex-col items-center gap-2 pointer-events-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 130px)" }}
      >
        <FilmDots taken={status.shotsTaken} total={status.shotsPerGuest} />
        <div className="text-center leading-none">
          <span className="font-mono text-3xl font-bold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {String(remaining).padStart(2, "0")}
          </span>
          <span className="font-mono text-sm text-white/60">
            {" "}/ {String(status.shotsPerGuest).padStart(2, "0")}
          </span>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 mt-1">shots left</div>
        </div>
      </div>

      {/* Bottom controls overlay — superpuesto a la imagen */}
      <div
        className="absolute bottom-0 inset-x-0 z-20 px-8 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent"
        style={{ paddingTop: 24, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="w-12" />
        <button
          onClick={shoot}
          disabled={busy}
          aria-label="Take photo"
          className="h-20 w-20 rounded-full border-4 border-white bg-white/10 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center"
        >
          <div className="h-14 w-14 rounded-full bg-white" />
        </button>
        <button
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Flip camera"
          className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center"
        >
          <RotateCw className="h-5 w-5" />
        </button>
      </div>
    </main>
  );
}

function FilmDots({ taken, total }: { taken: number; total: number }) {
  const maxDots = Math.min(total, 20);
  const remaining = total - taken;
  const remainingDots = total > 0 ? Math.round((remaining / total) * maxDots) : 0;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {Array.from({ length: maxDots }).map((_, i) => (
        <div
          key={i}
          className={`h-3 w-4 rounded-sm ${i < remainingDots ? "bg-primary/80" : "bg-white/15"}`}
        />
      ))}
    </div>
  );
}

// Quick synthesized shutter click using WebAudio — no asset needed
function playShutter() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(2200, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.1);
    setTimeout(() => ctx.close(), 200);
  } catch {
    // ignore
  }
}

// ===== Image adjustment helpers =====
// (Image adjustment helpers preserved in src/lib/camera-filters.unused.tsx)