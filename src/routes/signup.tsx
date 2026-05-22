import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Host sign up — Reel" }] }),
});

function SignupPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + "/events" },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if ((await supabase.auth.getSession()).data.session) {
      nav({ to: "/events" });
    } else {
      toast.success("Check your email to confirm your account.");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <h1 className="font-serif text-3xl">Create host account</h1>
          <p className="text-sm text-muted-foreground mt-1">Start hosting your first event.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} className="w-full h-11">{busy ? "Creating..." : "Create account"}</Button>
        <p className="text-sm text-center text-muted-foreground">
          Already a host? <Link to="/login" className="text-primary underline">Sign in</Link>
        </p>
      </form>
    </main>
  );
}