import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AmbientField } from "@/components/AmbientField";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Vellum" },
      {
        name: "description",
        content: "Sign in to Vellum to build AI study notebooks from your own material.",
      },
      { property: "og:title", content: "Sign in — Vellum" },
      {
        property: "og:description",
        content: "Sign in to Vellum to build AI study notebooks from your own material.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setIsSignUp(mode === "signup"), [mode]);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created — check your inbox to confirm your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col font-body text-foreground">
      <AmbientField />
      <div className="flex items-center justify-between px-5 pt-5 md:px-8">
        <BrandMark />
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="glass rise w-full max-w-md rounded-3xl p-7">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
            {isSignUp ? "CREATE ACCOUNT" : "WELCOME BACK"}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">
            {isSignUp ? "Start your first notebook" : "Sign in to Vellum"}
          </h1>

          <button
            type="button"
            onClick={google}
            className="glass-fill-strong mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition hover:brightness-110"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1A6.2 6.2 0 1 1 16 7.6l2.7-2.6A10 10 0 1 0 12 22c5.8 0 9.6-4.1 9.6-9.8 0-.7-.07-1.2-.17-2z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            OR EMAIL
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {isSignUp && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className="glass-fill w-full rounded-xl px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
              />
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@university.edu"
              autoComplete="email"
              className="glass-fill w-full rounded-xl px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={6}
              placeholder="Password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              className="glass-fill w-full rounded-xl px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {isSignUp ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "New to Vellum?"}{" "}
            <Link
              to="/auth"
              search={{ mode: isSignUp ? "signin" : "signup" }}
              className="text-primary hover:underline"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
