import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Camera, Film, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-2 font-serif text-xl tracking-tight">
          <Film className="h-5 w-5 text-primary" />
          <span>mosaic</span>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 px-4">
          <Link to="/login">Host sign in</Link>
        </Button>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <p className="uppercase text-xs tracking-[0.3em] text-primary mb-4">
          Disposable camera, for events
        </p>
        <h1 className="font-serif text-5xl sm:text-6xl leading-[1.05] tracking-tight">
          Hand every guest a roll of film.
          <br />
          <span className="text-primary italic">No previews.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          Set a shot limit per guest. They can't see what they took. You collect every photo
          when the night ends, every angle of your event, unfiltered.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg" className="h-12 px-6 text-base">
            <Link to="/signup">
              <Camera className="mr-2 h-4 w-4" /> Host an event
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-6 text-base">
            <Link to="/join">
              <Users className="mr-2 h-4 w-4" /> Join with a code
            </Link>
          </Button>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-24 grid sm:grid-cols-3 gap-6">
        {[
          { n: "01", t: "Create the event", d: "Set how many shots each guest gets." },
          { n: "02", t: "Share the code", d: "Guests join with a code and their name." },
          { n: "03", t: "Develop the roll", d: "End the event, download every photo." },
        ].map((s) => (
          <div key={s.n} className="border border-border bg-card p-5 rounded-md">
            <div className="font-mono text-xs text-primary mb-2">{s.n}</div>
            <div className="font-serif text-lg mb-1">{s.t}</div>
            <div className="text-sm text-muted-foreground">{s.d}</div>
          </div>
        ))}
      </section>
      <footer className="text-center text-xs text-muted-foreground pb-6">
        v1.0.1
      </footer>
    </main>
  );
}
