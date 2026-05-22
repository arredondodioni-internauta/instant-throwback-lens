import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyEvents } from "@/lib/events.functions";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_host/events/")({
  component: EventsList,
  head: () => ({ meta: [{ title: "My events — Reel" }] }),
});

function EventsList() {
  const fn = useServerFn(listMyEvents);
  const { data, isLoading } = useQuery({ queryKey: ["my-events"], queryFn: () => fn() });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-3xl">Your events</h1>
        <Button asChild>
          <Link to="/events/new"><Plus className="h-4 w-4 mr-1" /> New event</Link>
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center">
          <p className="text-muted-foreground">No events yet.</p>
          <Button asChild className="mt-4">
            <Link to="/events/new">Create your first event</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((ev) => (
            <li key={ev.id}>
              <Link
                to="/events/$eventId"
                params={{ eventId: ev.id }}
                className="flex items-center justify-between border border-border rounded-md p-4 hover:bg-card transition"
              >
                <div>
                  <div className="font-serif text-lg">{ev.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Code <span className="font-mono">{ev.code}</span> · {ev.shots_per_guest} shots/guest
                  </div>
                </div>
                <span
                  className={`text-xs uppercase tracking-wider px-2 py-1 rounded ${
                    ev.status === "active"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {ev.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}