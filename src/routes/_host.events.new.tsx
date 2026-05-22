import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createEvent } from "@/lib/events.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_host/events/new")({
  component: NewEvent,
  head: () => ({ meta: [{ title: "New event — Reel" }] }),
});

function NewEvent() {
  const nav = useNavigate();
  const create = useServerFn(createEvent);
  const [name, setName] = useState("");
  const [shots, setShots] = useState(5);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ev = await create({ data: { name, shotsPerGuest: shots } });
      nav({ to: "/events/$eventId", params: { eventId: ev.id } });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
      setBusy(false);
    }
  }

  return (
    <main className="max-w-md mx-auto px-6 py-10">
      <h1 className="font-serif text-3xl mb-6">New event</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Event name</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex & Sam's wedding" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shots">Shots per guest</Label>
          <Input id="shots" type="number" min={1} max={100} required value={shots} onChange={(e) => setShots(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground">Each guest will only be able to take this many photos.</p>
        </div>
        <Button type="submit" disabled={busy} className="w-full h-11">
          {busy ? "Creating…" : "Create event"}
        </Button>
      </form>
    </main>
  );
}