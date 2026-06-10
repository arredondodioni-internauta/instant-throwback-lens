import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  getAlbum,
  toggleReaction,
  addComment,
  listComments,
} from "@/lib/album.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  X,
  Download,
  Check,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

const EMOJIS = ["😂", "🥹", "🔥", "👏"] as const;
type Emoji = (typeof EMOJIS)[number];

export const Route = createFileRoute("/album/$code")({
  component: AlbumPage,
  head: ({ params }) => ({
    meta: [
      { title: `Álbum ${params.code} — mosaic` },
      { name: "description", content: "Mira las fotos del evento." },
    ],
  }),
});

function getOrCreateViewerToken(): string {
  if (typeof window === "undefined") return "";
  const key = "reel:viewer-token";
  let t = localStorage.getItem(key);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(key, t);
  }
  return t;
}

function getOrCreateNickname(prompt = false): string | null {
  if (typeof window === "undefined") return null;
  const key = "reel:nickname";
  let n = localStorage.getItem(key);
  if (!n && prompt) {
    const v = window.prompt("¿Cómo te llamas? (para tu comentario)");
    if (v && v.trim()) {
      n = v.trim().slice(0, 40);
      localStorage.setItem(key, n);
    }
  }
  return n;
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

type Photo = {
  id: string;
  takenAt: string;
  url: string;
  reactions: Record<string, number>;
  totalReactions: number;
  myReaction: string | null;
  commentCount: number;
};

function AlbumPage() {
  const { code } = Route.useParams();
  const fnAlbum = useServerFn(getAlbum);
  const fnReact = useServerFn(toggleReaction);
  const qc = useQueryClient();
  const [viewerToken] = useState(() => getOrCreateViewerToken());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["album", code, viewerToken],
    queryFn: () => fnAlbum({ data: { code, viewerToken } }),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Realtime: refetch on reaction/comment changes
  useEffect(() => {
    if (!data?.event.id) return;
    const eventId = data.event.id;
    const ch = supabase
      .channel(`album:${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reactions", filter: `event_id=eq.${eventId}` },
        () => qc.invalidateQueries({ queryKey: ["album", code] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `event_id=eq.${eventId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["album", code] });
          qc.invalidateQueries({ queryKey: ["comments"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [data?.event.id, code, qc]);

  // Refetch URLs hourly to keep signed URLs fresh
  useEffect(() => {
    const i = setInterval(() => refetch(), 50 * 60 * 1000);
    return () => clearInterval(i);
  }, [refetch]);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const photos = data?.photos ?? [];
  const featuredIds = new Set(data?.featuredIds ?? []);
  const featuredPhotos = useMemo(
    () => photos.filter((p) => featuredIds.has(p.id)),
    [photos, data?.featuredIds],
  );
  const regularPhotos = useMemo(
    () => photos.filter((p) => !featuredIds.has(p.id)),
    [photos, data?.featuredIds],
  );

  async function applyReaction(photoId: string, emoji: Emoji) {
    try {
      const res = await fnReact({ data: { code, viewerToken, photoId, emoji } });
      qc.setQueryData(["album", code, viewerToken], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          photos: old.photos.map((p: Photo) => {
            if (p.id !== photoId) return p;
            const reactions = { ...p.reactions };
            // Remove previous reaction count
            if (p.myReaction) {
              reactions[p.myReaction] = Math.max(0, (reactions[p.myReaction] ?? 1) - 1);
              if (!reactions[p.myReaction]) delete reactions[p.myReaction];
            }
            // Add new
            if (res.myReaction) {
              reactions[res.myReaction] = (reactions[res.myReaction] ?? 0) + 1;
            }
            const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
            return { ...p, reactions, totalReactions, myReaction: res.myReaction };
          }),
        };
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function enterSelectMode(id: string) {
    if (navigator.vibrate) navigator.vibrate(15);
    setSelectMode(true);
    setSelected(new Set([id]));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function downloadSelected() {
    const list = photos.filter((p) => selected.has(p.id));
    if (!list.length) return;
    const showProgress = list.length > 5;
    let done = 0;
    for (const p of list) {
      try {
        const res = await fetch(p.url);
        const blob = await res.blob();
        const file = new File([blob], `mosaic-${p.id}.jpg`, { type: blob.type || "image/jpeg" });
        if (
          typeof navigator !== "undefined" &&
          // @ts-ignore
          navigator.canShare?.({ files: [file] })
        ) {
          // @ts-ignore
          await navigator.share({ files: [file] });
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(a.href);
        }
        done++;
        if (showProgress) toast.message(`Guardando… ${done}/${list.length}`);
      } catch (e) {
        // user may cancel share — keep going
      }
    }
    toast.success(`${done} foto${done === 1 ? "" : "s"} guardada${done === 1 ? "" : "s"} ✓`);
    exitSelectMode();
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-muted-foreground">Cargando álbum…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center">
        <h1 className="font-serif text-2xl mb-2">Álbum no disponible</h1>
        <p className="text-muted-foreground">{(error as any)?.message ?? "Inténtalo de nuevo más tarde."}</p>
      </main>
    );
  }

  const expiresAt = data.event.expiresAt ? new Date(data.event.expiresAt) : null;
  const expiresIn = expiresAt ? Math.max(0, expiresAt.getTime() - Date.now()) : 0;
  const expiresDays = Math.floor(expiresIn / (24 * 60 * 60 * 1000));
  const expiresHours = Math.floor((expiresIn % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-10 backdrop-blur bg-black/70 border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-lg leading-tight">{data.event.name}</h1>
          <p className="text-xs text-white/50">
            {photos.length} fotos · expira en {expiresDays}d {expiresHours}h
          </p>
        </div>
        {selectMode ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(new Set(photos.map((p) => p.id)))}
              className="text-xs text-white/70 underline"
            >
              Seleccionar todas
            </button>
            <Button size="sm" variant="ghost" onClick={exitSelectMode} className="text-white">
              Cancelar
            </Button>
          </div>
        ) : (
          <button
            onClick={() => {
              navigator.share?.({ url: window.location.href, title: data.event.name }).catch(() => {});
            }}
            className="text-xs text-white/70"
          >
            Compartir
          </button>
        )}
      </header>

      {/* Featured */}
      {featuredPhotos.length > 0 && (
        <div className="px-2 pt-2 space-y-2">
          {featuredPhotos.map((p) => (
            <PhotoTile
              key={p.id}
              photo={p}
              featured
              selectMode={selectMode}
              selected={selected.has(p.id)}
              onTap={() => {
                if (selectMode) toggleSelect(p.id);
                else setLightboxIdx(photos.findIndex((x) => x.id === p.id));
              }}
              onLongPress={() => enterSelectMode(p.id)}
              onDoubleTap={() => applyReaction(p.id, "🔥")}
            />
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 gap-1 p-1">
        {regularPhotos.map((p) => (
          <PhotoTile
            key={p.id}
            photo={p}
            selectMode={selectMode}
            selected={selected.has(p.id)}
            onTap={() => {
              if (selectMode) toggleSelect(p.id);
              else setLightboxIdx(photos.findIndex((x) => x.id === p.id));
            }}
            onLongPress={() => enterSelectMode(p.id)}
            onDoubleTap={() => applyReaction(p.id, "🔥")}
          />
        ))}
      </div>

      {!photos.length && (
        <p className="text-center text-white/50 mt-20">Aún no hay fotos.</p>
      )}

      {/* Selection action bar */}
      {selectMode && (
        <div className="fixed bottom-0 inset-x-0 bg-black/95 border-t border-white/10 p-4 flex items-center justify-between z-20">
          <span className="text-sm">
            {selected.size} foto{selected.size === 1 ? "" : "s"} seleccionada{selected.size === 1 ? "" : "s"}
          </span>
          <Button onClick={downloadSelected} disabled={!selected.size}>
            <Download className="h-4 w-4 mr-2" />
            Guardar
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <Lightbox
          photos={photos}
          index={lightboxIdx}
          onIndex={setLightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onReact={applyReaction}
          code={code}
          viewerToken={viewerToken}
        />
      )}
    </main>
  );
}

// ---------- PhotoTile ----------

function PhotoTile({
  photo,
  featured,
  selectMode,
  selected,
  onTap,
  onLongPress,
  onDoubleTap,
}: {
  photo: Photo;
  featured?: boolean;
  selectMode: boolean;
  selected: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onDoubleTap: () => void;
}) {
  const lastTap = useRef(0);
  const longPressTimer = useRef<number | null>(null);

  function handlePointerDown() {
    longPressTimer.current = window.setTimeout(() => {
      onLongPress();
      longPressTimer.current = null;
    }, 500);
  }
  function clearLong() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleClick() {
    if (!longPressTimer.current && !lastTap.current) {
      // Long press already fired
    }
    clearLong();
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onDoubleTap();
      lastTap.current = 0;
    } else {
      lastTap.current = now;
      setTimeout(() => {
        if (Date.now() - lastTap.current >= 280) {
          onTap();
        }
      }, 280);
    }
  }

  const topEmoji = Object.entries(photo.reactions).sort((a, b) => b[1] - a[1])[0];

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={() => {}}
      onPointerCancel={clearLong}
      onPointerLeave={clearLong}
      onClick={handleClick}
      className={`relative block w-full ${featured ? "aspect-square rounded-md" : "aspect-square"} overflow-hidden bg-white/5`}
    >
      <img
        src={photo.url}
        alt=""
        loading="lazy"
        draggable={false}
        className="w-full h-full object-cover select-none"
      />
      {selectMode && (
        <span
          className={`absolute top-2 right-2 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center ${
            selected ? "bg-primary border-primary" : "bg-black/30"
          }`}
        >
          {selected && <Check className="h-4 w-4 text-white" />}
        </span>
      )}
      {!selectMode && topEmoji && (
        <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
          <span>{topEmoji[0]}</span>
          <span>{topEmoji[1]}</span>
        </span>
      )}
      {!selectMode && photo.commentCount > 0 && (
        <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs rounded-full px-2 py-0.5 flex items-center gap-1">
          <MessageCircle className="h-3 w-3" />
          {photo.commentCount}
        </span>
      )}
    </button>
  );
}

// ---------- Lightbox ----------

function Lightbox({
  photos,
  index,
  onIndex,
  onClose,
  onReact,
  code,
  viewerToken,
}: {
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onReact: (id: string, emoji: Emoji) => void;
  code: string;
  viewerToken: string;
}) {
  const photo = photos[index];
  const [showEmojiPill, setShowEmojiPill] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const lastTap = useRef(0);
  const longPressTimer = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  function next() {
    if (index < photos.length - 1) onIndex(index + 1);
  }
  function prev() {
    if (index > 0) onIndex(index - 1);
  }

  function onPointerDown(e: React.PointerEvent) {
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    longPressTimer.current = window.setTimeout(() => {
      setShowEmojiPill(true);
      longPressTimer.current = null;
    }, 500);
  }
  function clearLong() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    clearLong();
    const s = startRef.current;
    startRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const SWIPE = 50;
    if (ax > SWIPE && ax > ay) {
      if (dx < 0) next();
      else prev();
      return;
    }
    if (ay > SWIPE && ay > ax) {
      if (dy > 0) onClose();
      else setCommentsOpen(true);
      return;
    }
    // tap / double tap
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onReact(photo.id, "🔥");
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }

  // Keyboard nav on desktop
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length]);

  async function downloadOne() {
    try {
      const res = await fetch(photo.url);
      const blob = await res.blob();
      const file = new File([blob], `mosaic-${photo.id}.jpg`, { type: blob.type || "image/jpeg" });
      // @ts-ignore
      if (navigator.canShare?.({ files: [file] })) {
        // @ts-ignore
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch {
      // canceled or denied
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-none w-screen h-[100dvh] p-0 bg-black border-0 rounded-none [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Foto</DialogTitle>
        <div className="absolute top-4 left-4 z-20">
          <Button size="icon" variant="ghost" onClick={onClose} className="text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="absolute top-4 right-4 z-20">
          <Button size="icon" variant="ghost" onClick={downloadOne} className="text-white">
            <Download className="h-5 w-5" />
          </Button>
        </div>

        {/* Image area */}
        <div
          className="absolute inset-0 flex items-center justify-center touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={clearLong}
        >
          <img
            src={photo.url}
            alt=""
            draggable={false}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Side arrows for desktop */}
        {index > 0 && (
          <button
            onClick={prev}
            className="hidden md:block absolute left-4 top-1/2 -translate-y-1/2 z-20 text-white/70 hover:text-white"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            onClick={next}
            className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 z-20 text-white/70 hover:text-white"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
        )}

        {/* Emoji pill */}
        {showEmojiPill && (
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-32 z-30 bg-white/95 text-black rounded-full px-3 py-2 flex gap-2 shadow-lg"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                className={`text-2xl px-2 py-1 rounded-full ${
                  photo.myReaction === e ? "bg-primary/20" : ""
                }`}
                onClick={() => {
                  onReact(photo.id, e);
                  setShowEmojiPill(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Bottom info */}
        <div className="absolute bottom-0 inset-x-0 p-4 z-10 bg-gradient-to-t from-black/80 to-transparent text-white flex items-center justify-between">
          <div className="text-xs text-white/70">{timeAgo(photo.takenAt)}</div>
          <div className="flex items-center gap-3">
            {Object.entries(photo.reactions).map(([emoji, n]) => (
              <span key={emoji} className="text-sm">
                {emoji} {n}
              </span>
            ))}
            <button
              onClick={() => setCommentsOpen(true)}
              className="flex items-center gap-1 text-sm"
            >
              <MessageCircle className="h-4 w-4" />
              {photo.commentCount}
            </button>
          </div>
        </div>

        {/* Comments sheet */}
        <CommentsSheet
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          photoId={photo.id}
          code={code}
          viewerToken={viewerToken}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Comments ----------

function CommentsSheet({
  open,
  onOpenChange,
  photoId,
  code,
  viewerToken,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  photoId: string;
  code: string;
  viewerToken: string;
}) {
  const fnList = useServerFn(listComments);
  const fnAdd = useServerFn(addComment);
  const qc = useQueryClient();

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", code, photoId],
    queryFn: () => fnList({ data: { code, photoId } }),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, comments.length]);

  async function submit() {
    const text = body.trim();
    if (!text) return;
    let nickname = getOrCreateNickname(false);
    if (!nickname) nickname = getOrCreateNickname(true);
    if (!nickname) return;
    setBusy(true);
    try {
      await fnAdd({ data: { code, viewerToken, photoId, nickname, body: text } });
      setBody("");
      qc.invalidateQueries({ queryKey: ["comments", code, photoId] });
      qc.invalidateQueries({ queryKey: ["album", code] });
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70dvh] flex flex-col p-0 bg-background">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>Comentarios</SheetTitle>
        </SheetHeader>
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center mt-8">Sé el primero en comentar.</p>
          ) : (
            comments.map((c: any) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{c.nickname}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-foreground/90">{c.body}</p>
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="border-t p-3 flex gap-2 items-center"
        >
          <Input
            value={body}
            maxLength={140}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe un comentario…"
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !body.trim()}>
            Enviar
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}