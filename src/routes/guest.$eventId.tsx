import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getGuestStatus, takePhoto } from "@/lib/events.functions";
import { Camera, RotateCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/guest/$eventId")({
  component: GuestCamera,
  head: () => ({ meta: [{ title: "Camera — Reel" }] }),
});

function GuestCamera() {
  const { eventId } = Route.useParams();
  const nav = useNavigate();
  const fnStatus = useServerFn(getGuestStatus);
  const fnTake = useServerFn(takePhoto);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [status, setStatus] = useState<{
    displayName: string;
    eventName: string;
    eventStatus: "active" | "ended";
    shotsPerGuest: number;
    shotsTaken: number;
  } | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Load guest status from device token
  useEffect(() => {
    const token = localStorage.getItem(`reel:event:${eventId}`);
    if (!token) {
      nav({ to: "/join", search: { code: undefined } });
      return;
    }
    fnStatus({ data: { deviceToken: token } })
      .then(setStatus)
      .catch(() => {
        localStorage.removeItem(`reel:event:${eventId}`);
        nav({ to: "/join", search: { code: undefined } });
      });
  }, [eventId, fnStatus, nav]);

  // Start camera
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraError(null);
      } catch (err: any) {
        setCameraError(err?.message ?? "Camera unavailable");
      }
    }
    if (status?.eventStatus === "active") start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, status?.eventStatus]);

  async function shoot() {
    if (busy || !status || !videoRef.current) return;
    const remaining = status.shotsPerGuest - status.shotsTaken;
    if (remaining <= 0) return;

    setBusy(true);
    // flash + shutter sound
    setFlashing(true);
    playShutter();
    setTimeout(() => setFlashing(false), 120);

    const video = videoRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.88),
    );

    const token = localStorage.getItem(`reel:event:${eventId}`)!;
    const fd = new FormData();
    fd.append("deviceToken", token);
    fd.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
    try {
      const res = await fnTake({ data: fd });
      setStatus((s) => (s ? { ...s, shotsTaken: res.shotsTaken } : s));
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save photo");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <main className="min-h-screen flex items-center justify-center bg-black text-white">Loading…</main>;
  }

  if (status.eventStatus === "ended") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 text-center">
        <h1 className="font-serif text-3xl mb-2">The roll is in.</h1>
        <p className="text-white/70 max-w-sm">
          {status.eventName} has ended. Your host will share the photos soon.
        </p>
      </main>
    );
  }

  const remaining = status.shotsPerGuest - status.shotsTaken;

  if (remaining <= 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 text-center">
        <h1 className="font-serif text-3xl mb-2">Roll finished.</h1>
        <p className="text-white/70 max-w-sm">
          You used all {status.shotsPerGuest} shots. Your host will share the photos when the
          event ends.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Top bar */}
      <div className="px-5 py-4 flex items-center justify-between text-sm">
        <div>
          <div className="text-white/60 text-xs uppercase tracking-wider">{status.eventName}</div>
          <div className="font-serif">{status.displayName}</div>
        </div>
        <div className="font-mono text-2xl tabular-nums">
          <span className="text-primary">{remaining}</span>
          <span className="text-white/40">/{status.shotsPerGuest}</span>
        </div>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden bg-black">
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
        {/* Viewfinder frame */}
        <div className="absolute inset-4 border border-white/20 rounded-sm pointer-events-none" />
      </div>

      {/* Bottom controls */}
      <div className="px-5 py-6 flex items-center justify-between">
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
      <p className="text-center text-white/40 text-xs pb-4 px-6">
        <Camera className="inline h-3 w-3 mr-1" /> You can't preview your shots. Make it count.
      </p>
    </main>
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