import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { joinEvent, getEventByCode } from "@/lib/events.functions";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const searchSchema = z.object({ code: z.string().optional() });

export const Route = createFileRoute("/join")({
  component: JoinPage,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Únete al evento — mosaic" }] }),
});

const STEPS = [
  {
    n: "01",
    t: "Tienes 5 fotos. Que valgan la pena.",
    d: "Nada de repetir, nada de borrar. Como la cámara analógica de tus padres.",
  },
  {
    n: "02",
    t: "Para un momento antes de disparar.",
    d: "Las mejores fotos no se hacen con prisa. Respira, encuadra, dispara.",
  },
  {
    n: "03",
    t: "No verás nada hasta el final.",
    d: "Tus fotos van directo al anfitrión. Cuando acabe el evento, se revelan todas de golpe.",
  },
];

function JoinPage() {
  const nav = useNavigate();
  const { code: codeFromUrl } = useSearch({ from: "/join" });
  const [code, setCode] = useState(codeFromUrl ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const join = useServerFn(joinEvent);
  const lookup = useServerFn(getEventByCode);

  const trimmedCode = code.trim().toUpperCase();
  const { data: eventInfo } = useQuery({
    queryKey: ["event-by-code", trimmedCode],
    queryFn: () => lookup({ data: { code: trimmedCode } }),
    enabled: trimmedCode.length >= 4,
    retry: false,
    staleTime: 60_000,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await join({ data: { code: code.trim().toUpperCase(), displayName: name.trim() } });
      localStorage.setItem(`reel:event:${res.eventId}`, res.deviceToken);
      nav({ to: "/guest/$eventId", params: { eventId: res.eventId } });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo unir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="font-serif text-4xl leading-tight text-primary">
            {eventInfo?.name ?? "el evento"}
          </h1>
        </div>
        <ol className="mb-8 space-y-6">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium text-sm">
                  {i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mt-2 w-px flex-1 bg-border" />
                )}
              </div>
              <div className="pb-2 pt-1">
                <div className="font-serif text-lg leading-snug font-medium text-foreground mb-1.5">
                  {s.t}
                </div>
                <div className="text-base text-muted-foreground leading-relaxed">
                  {s.d}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {!codeFromUrl && (
          <div className="space-y-2">
            <Label htmlFor="code">Código del evento</Label>
            <Input
              id="code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="text-center font-mono tracking-[0.4em] text-lg uppercase"
              maxLength={8}
            />
          </div>
        )}
        <div>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="¿Cómo te llamas?"
            className="h-14 text-lg placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full h-12 text-base">
          {busy ? "Abriendo..." : "Abrir mi cámara"}
        </Button>
      </form>
    </main>
  );
}