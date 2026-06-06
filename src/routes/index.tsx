import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Camera, Film, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/")({
  component: Landing,
});

type Lang = "en" | "es";

const translations = {
  en: {
    hostSignIn: "Host sign in",
    eyebrow: "Disposable camera, for events",
    h1a: "Hand every guest a roll of film.",
    h1b: "No previews.",
    sub: "Set a shot limit per guest. They can't see what they took. You collect every photo when the night ends, every angle of your event, unfiltered.",
    host: "Host an event",
    join: "Join with a code",
    steps: [
      { n: "01", t: "Create the event", d: "Set how many shots each guest gets." },
      { n: "02", t: "Share the code", d: "Guests join with a code and their name." },
      { n: "03", t: "Develop the roll", d: "End the event, download every photo." },
    ],
  },
  es: {
    hostSignIn: "Iniciar sesión",
    eyebrow: "Cámara desechable, para eventos",
    h1a: "Dale a cada invitado un rollo de película.",
    h1b: "Sin vista previa.",
    sub: "Define un límite de fotos por invitado. No pueden ver lo que tomaron. Al final de la noche recoges cada foto, cada ángulo de tu evento, sin filtros.",
    host: "Organizar un evento",
    join: "Unirse con un código",
    steps: [
      { n: "01", t: "Crea el evento", d: "Define cuántas fotos tiene cada invitado." },
      { n: "02", t: "Comparte el código", d: "Los invitados entran con un código y su nombre." },
      { n: "03", t: "Revela el rollo", d: "Finaliza el evento y descarga todas las fotos." },
    ],
  },
} as const;

function LanguageSelector({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-lg">
          {lang === "en" ? "🇬🇧" : "🇪🇸"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setLang("en")}>🇬🇧 English</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLang("es")}>🇪🇸 Español</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Landing() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem("mosaic.lang") as Lang | null;
    if (stored === "en" || stored === "es") {
      setLang(stored);
    } else if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es")) {
      setLang("es");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mosaic.lang", lang);
  }, [lang]);

  const t = translations[lang];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-2 font-serif text-xl tracking-tight">
          <Film className="h-5 w-5 text-primary" />
          <span>mosaic</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector lang={lang} setLang={setLang} />
          <Button asChild variant="outline" size="sm" className="h-8 px-4">
            <Link to="/login">{t.hostSignIn}</Link>
          </Button>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <p className="uppercase text-xs tracking-[0.3em] text-primary mb-4">
          {t.eyebrow}
        </p>
        <h1 className="font-serif text-5xl sm:text-6xl leading-[1.05] tracking-tight">
          {t.h1a}
          <br />
          <span className="text-primary italic">{t.h1b}</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          {t.sub}
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg" className="h-12 px-6 text-base">
            <Link to="/signup">
              <Camera className="mr-2 h-4 w-4" /> {t.host}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-6 text-base">
            <Link to="/join">
              <Users className="mr-2 h-4 w-4" /> {t.join}
            </Link>
          </Button>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-24 grid sm:grid-cols-3 gap-6">
        {t.steps.map((s) => (
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
