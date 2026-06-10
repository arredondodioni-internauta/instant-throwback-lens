import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getEventDashboard,
  getEventPhotosForDownload,
} from "@/lib/events.functions";
import { publishAlbum } from "@/lib/album.functions";
import { Button } from "@/components/ui/button";
import { Download, Copy, Users, Camera, Sparkles, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_host/events/$eventId")({
  component: EventDashboard,
  head: () => ({ meta: [{ title: "Event dashboard — Reel" }] }),
});

function EventDashboard() {
  const { eventId } = Route.useParams();
  const fnDash = useServerFn(getEventDashboard);
  const fnDownload = useServerFn(getEventPhotosForDownload);
  const fnPublish = useServerFn(publishAlbum);

  const { data, refetch } = useQuery({
    queryKey: ["dashboard", eventId],
    queryFn: () => fnDash({ data: { eventId } }),
    refetchInterval: 5000,
  });

  const [qr, setQr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [albumQr, setAlbumQr] = useState<string | null>(null);

  const joinUrl =
    typeof window !== "undefined" && data
      ? `${window.location.origin}/join?code=${data.event.code}`
      : "";

  const albumUrl =
    typeof window !== "undefined" && data?.event.code
      ? `${window.location.origin}/album/${data.event.code}`
      : "";

  useEffect(() => {
    let cancelled = false;
    if (!joinUrl) {
      setQr(null);
      return;
    }
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(joinUrl, { width: 220, margin: 1 }))
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!albumUrl || !data?.event.album_published_at) {
      setAlbumQr(null);
      return;
    }
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(albumUrl, { width: 220, margin: 1 }))
      .then((url) => {
        if (!cancelled) setAlbumQr(url);
      })
      .catch(() => {
        if (!cancelled) setAlbumQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [albumUrl, data?.event.album_published_at]);

  async function onPublish() {
    if (
      !confirm(
        "¿Publicar el álbum?\n\nEsto finaliza el evento, notifica a todos los invitados y el álbum estará disponible durante 3 días.",
      )
    )
      return;
    setPublishing(true);
    try {
      await fnPublish({ data: { eventId } });
      await refetch();
      toast.success("Álbum publicado.");
    } catch (err: any) {
      toast.error(err?.message ?? "Error");
    } finally {
      setPublishing(false);
    }
  }

  async function onDownload() {
    setDownloading(true);
    try {
      const res = await fnDownload({ data: { eventId } });
      if (res.photos.length === 0) {
        toast.info("No photos to download yet.");
        return;
      }
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      // group counts per guest
      const counters: Record<string, number> = {};
      await Promise.all(
        res.photos.map(async (p) => {
          const safe = p.guestName.replace(/[^\w\-]+/g, "_");
          counters[safe] = (counters[safe] ?? 0) + 1;
          const n = String(counters[safe]).padStart(3, "0");
          const blob = await fetch(p.url!).then((r) => r.blob());
          zip.file(`${safe}/${safe}_${n}.jpg`, blob);
        }),
      );
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `${res.eventName.replace(/[^\w\-]+/g, "_")}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      toast.error(err?.message ?? "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  if (!data) return <main className="p-10 text-muted-foreground">Loading…</main>;
  const { event, guestCount, photoCount } = data;
  const isPublished = !!event.album_published_at;
  const expiresAt = event.album_expires_at ? new Date(event.album_expires_at) : null;
  const expiresIn = expiresAt
    ? Math.max(0, expiresAt.getTime() - Date.now())
    : 0;
  const expiresDays = Math.floor(expiresIn / (24 * 60 * 60 * 1000));
  const expiresHours = Math.floor((expiresIn % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-serif text-3xl">{event.name}</h1>
        <span
          className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${
            event.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {event.status}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        {event.shots_per_guest} shots per guest
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-border rounded-md p-5 flex items-center gap-4">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <div className="font-serif text-3xl">{guestCount}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">guests joined</div>
          </div>
        </div>
        <div className="border border-border rounded-md p-5 flex items-center gap-4">
          <Camera className="h-6 w-6 text-primary" />
          <div>
            <div className="font-serif text-3xl">{photoCount}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">photos taken</div>
          </div>
        </div>
      </div>

      {event.status === "active" && (
        <div className="border border-border rounded-md p-6 mb-8 bg-card">
          <h2 className="font-serif text-xl mb-4">Invite guests</h2>
          <div className="flex flex-col sm:flex-row gap-6 items-center">
            {qr && <img src={qr} alt="Join QR" className="rounded border border-border" />}
            <div className="flex-1 w-full">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Code</div>
              <div className="font-mono text-3xl tracking-[0.3em] mb-3">{event.code}</div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Link</div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={joinUrl}
                  className="flex-1 text-xs font-mono border border-border rounded px-2 py-1.5 bg-background"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(joinUrl);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPublished && (
        <div className="border border-primary/30 rounded-md p-6 mb-8 bg-primary/5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-xl">Álbum publicado</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Expira en {expiresDays}d {expiresHours}h
          </p>
          <div className="flex flex-col sm:flex-row gap-6 items-center">
            {albumQr && (
              <img src={albumQr} alt="Álbum QR" className="rounded border border-border" />
            )}
            <div className="flex-1 w-full">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Enlace del álbum
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={albumUrl}
                  className="flex-1 text-xs font-mono border border-border rounded px-2 py-1.5 bg-background"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(albumUrl);
                    toast.success("Copiado");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <Button asChild variant="link" className="px-0 mt-2">
                <a href={albumUrl} target="_blank" rel="noreferrer">
                  <LinkIcon className="h-3 w-3 mr-1" /> Abrir álbum
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {!isPublished ? (
          <Button onClick={onPublish} disabled={publishing || photoCount === 0}>
            <Sparkles className="h-4 w-4 mr-2" />
            {publishing ? "Publicando…" : "Publicar álbum"}
          </Button>
        ) : null}
        <Button onClick={onDownload} disabled={downloading || photoCount === 0}>
          <Download className="h-4 w-4 mr-2" />
          {downloading ? "Preparing ZIP…" : `Download all (${photoCount})`}
        </Button>
      </div>
    </main>
  );
}