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

  async function submit() {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter an event name.");
      return;
    }
    const shotsNum = Number(shots);
    if (!Number.isFinite(shotsNum) || shotsNum < 1 || shotsNum > 100) {
      toast.error("Shots per guest must be between 1 and 100.");
      return;
    }
    setBusy(true);
    try {
      const ev = await create({ data: { name: trimmed, shotsPerGuest: shotsNum } });
      nav({ to: "/events/$eventId", params: { eventId: ev.id } });
    } catch (err: any) {
      console.error("createEvent failed", err);
      toast.error(err?.message ?? "Failed to create event");
      setBusy(false);
    }
  }

  return (
    <main className="max-w-md mx-auto px-6 py-10">
      <h1 className="font-serif text-3xl mb-6">New event</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Event name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex & Sam's wedding"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shots">Shots per guest</Label>
          <Input
            id="shots"
            type="number"
            min={1}
            max={100}
            value={shots}
            onChange={(e) => setShots(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">Each guest will only be able to take this many photos.</p>
        </div>
        <Button type="submit" disabled={busy} className="w-full h-11">
          {busy ? "Creating…" : "Create event"}
        </Button>
      </form>
    </main>
  );
}