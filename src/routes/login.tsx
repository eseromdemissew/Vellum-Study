import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AmbientField } from "@/components/AmbientField";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme";
import { LanguageSwitcher, useLanguage, type LanguageCode } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Vellum" },
      { name: "description", content: "Sign in to access your AI study kits, national textbooks, and game break zone." },
      { property: "og:title", content: "Sign In — Vellum" },
      { property: "og:url", content: "https://vellumstudy.vercel.app/login" },
    ],
    links: [{ rel: "canonical", href: "https://vellumstudy.vercel.app/login" }],
  }),
  component: LoginPage,
});

interface LoginErrors {
  email?: string;
  password?: string;
  general?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t, setLanguage } = useLanguage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, user, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const schema = z.object({
      email: z.string().trim().email(t("val.email_invalid", "Please enter a valid email address.")),
      password: z.string().min(1, t("val.password_min", "Password is required.")),
    });

    const result = schema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: LoginErrors = {};
      for (const err of result.error.errors) {
        const key = err.path[0];
        if (key === "email") fieldErrors.email = err.message;
        if (key === "password") fieldErrors.password = err.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("invalid login credentials")) {
          throw new Error(t("val.network_error", "Invalid email or password. Please verify your details."));
        }
        if (error.message.toLowerCase().includes("email not confirmed")) {
          throw new Error(t("auth.check_email_instruction", "Please confirm your email address before signing in."));
        }
        throw error;
      }

      // Sync language preference from user's profile (profile wins over cookie)
      if (data?.user) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("language")
            .eq("id", data.user.id)
            .single();

          if (profile?.language && ["en", "am", "om", "ti"].includes(profile.language)) {
            setLanguage(profile.language as LanguageCode);
          }
        } catch {}
      }

      toast.success(t("auth.signin_badge", "Welcome back!"));
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || t("val.network_error", "Sign in failed."));
    } finally {
      setBusy(false);
    }
  }

  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    try {
      try {
        sessionStorage.removeItem("vellum_oauth_signup_intent");
      } catch {}

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error("[GoogleSignIn]", err);
      const msg = err.message || "";
      if (msg.includes("provider is not enabled") || msg.includes("Unsupported provider")) {
        toast.error("Google sign-in is not enabled yet in your Supabase project. Please enable Google Provider in the Supabase Dashboard.", {
          duration: 6000,
        });
      } else {
        toast.error(msg || "Google sign-in failed. Please try again.");
      }
      setGoogleBusy(false);
    }
  }

  return (
    <div translate="no" className="relative flex min-h-screen flex-col bg-background font-body text-foreground">
      <AmbientField />

      {/* Pre-login Header with Language Switcher */}
      <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 md:px-8">
        <div className="glass-soft flex items-center justify-between rounded-2xl px-4 py-2.5 backdrop-blur-xl border border-border/40">
          <BrandMark to="/" />
          <div className="flex items-center gap-2.5">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 md:px-8">
        <div className="glass rise w-full max-w-md rounded-3xl p-6 sm:p-8 border border-border/40">
          <p className="font-mono text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            {t("auth.signin_badge", "WELCOME BACK")}
          </p>
          <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {t("auth.signin_title", "Sign in to Vellum")}
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {t("auth.signin_subtitle", "Access your study notebooks, flashcards and national curriculum library.")}
          </p>

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy || googleBusy}
            className="glass-fill-strong mt-6 flex min-h-[46px] w-full items-center justify-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground transition hover:brightness-110 disabled:opacity-60 cursor-pointer border border-border/40 shadow-xs"
          >
            {googleBusy ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <svg viewBox="0 0 24 24" className="size-4.5 shrink-0" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 10.03 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
            )}
            <span>{googleBusy ? "Connecting to Google…" : t("auth.continue_google", "Continue with Google")}</span>
          </button>

          <div className="my-5 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
            <span className="h-px flex-1 bg-border/60" />
            <span>{t("auth.or_email", "OR WITH EMAIL")}</span>
            <span className="h-px flex-1 bg-border/60" />
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-foreground mb-1.5">
                {t("auth.email", "Email address")}
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.email_placeholder", "you@example.com")}
                autoComplete="email"
                className={`glass-fill w-full min-h-[44px] rounded-xl px-4 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground border ${
                  errors.email ? "border-destructive focus:ring-2 focus:ring-destructive/40" : "border-border/40 focus:ring-2 focus:ring-primary/50"
                }`}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-destructive font-medium">{errors.email}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-semibold text-foreground">
                  {t("auth.password", "Password")}
                </label>
                <Link
                  to="/reset-password"
                  className="text-xs text-primary hover:underline font-medium min-h-[30px] flex items-center"
                >
                  {t("auth.forgot_password", "Forgot password?")}
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.password_placeholder", "Your password")}
                  autoComplete="current-password"
                  className={`glass-fill w-full min-h-[44px] rounded-xl px-4 py-2.5 pr-11 text-sm outline-none transition placeholder:text-muted-foreground border ${
                    errors.password ? "border-destructive focus:ring-2 focus:ring-destructive/40" : "border-border/40 focus:ring-2 focus:ring-primary/50"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex min-h-[36px] min-w-[36px] items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-destructive font-medium">{errors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60 cursor-pointer mt-2"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("auth.signin_button", "Sign in")}
            </button>
          </form>

          <p className="mt-6 text-center text-xs sm:text-sm text-muted-foreground">
            {t("auth.new_to_vellum", "New to Vellum?")}{" "}
            <Link to="/signup" className="text-primary hover:underline font-semibold">
              {t("auth.signup_link", "Create an account")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
