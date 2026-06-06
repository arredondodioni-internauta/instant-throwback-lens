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
  head: () => ({ meta: [{ title: "Join an event — Reel" }] }),
});

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
      toast.error(err?.message ?? "Could not join");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="font-serif text-3xl leading-tight">
            <span className="block">Welcome to</span>
            <span className="block text-primary">
              {eventInfo?.name ?? "the event"}
            </span>
          </h1>
          <p className="text-base text-muted-foreground mt-3">
            Enter your name to start capturing moments
          </p>
        </div>
        {!codeFromUrl && (
          <div className="space-y-2">
            <Label htmlFor="code">Event code</Label>
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
            placeholder="Your name"
            className="h-14 text-lg placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full h-12 text-base">
          {busy ? "Joining..." : "Pick up the camera"}
        </Button>
      </form>
    </main>
  );
}