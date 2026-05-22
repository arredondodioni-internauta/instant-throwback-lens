import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Film, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_host")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: HostLayout,
});

function HostLayout() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link to="/events" className="flex items-center gap-2 font-serif text-xl">
          <Film className="h-5 w-5 text-primary" /> Reel
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await supabase.auth.signOut();
            nav({ to: "/" });
          }}
        >
          <LogOut className="h-4 w-4 mr-1" /> Sign out
        </Button>
      </header>
      <Outlet />
    </div>
  );
}