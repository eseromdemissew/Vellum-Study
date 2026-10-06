import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldAlert, ExternalLink } from "lucide-react";
import { AmbientField } from "@/components/AmbientField";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme";
import { LanguageSwitcher, useLanguage } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Verifying Authentication — Vellum" },
      { name: "description", content: "Completing sign-in and setting up your Vellum workspace." },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isProviderDisabled, setIsProviderDisabled] = useState(false);
  const handledRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let authSub: { unsubscribe: () => void } | null = null;

    async function processUser(user: any) {
      if (handledRef.current) return;
      handledRef.current = true;

      // 1. Process signup intent if stored in sessionStorage (e.g. user selected Parent role or Grade Level)
      try {
        const intentRaw = sessionStorage.getItem("vellum_oauth_signup_intent");
        if (intentRaw) {
          sessionStorage.removeItem("vellum_oauth_signup_intent");
          const intent = JSON.parse(intentRaw);
          if (intent && Date.now() - (intent.timestamp || 0) < 30 * 60 * 1000) {
            const updates: Record<string, any> = {};
            if (intent.gradeLevel) updates.grade_level = intent.gradeLevel;
            if (intent.language) updates.language = intent.language;

            if (Object.keys(updates).length > 0) {
              await supabase.from("profiles").update(updates).eq("id", user.id);
            }

            if (intent.role === "parent") {
              await supabase.from("user_roles").upsert(
                { user_id: user.id, role: "parent" },
                { onConflict: "user_id,role" }
              );
            }
          }
        }
      } catch (intentErr) {
        console.warn("Could not apply OAuth signup intent:", intentErr);
      }

      // 2. Determine target route based on user roles
      let target = "/dashboard";
      try {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const roles = (roleData || []).map((r: any) => r.role);
        if (roles.includes("admin")) {
          target = "/admin";
        } else if (roles.includes("parent")) {
          target = "/parent";
        } else {
          target = "/dashboard";
        }
      } catch {
        target = "/dashboard";
      }

      if (mounted) {
        setStatus("success");
        setTimeout(() => {
          navigate({ to: target as any });
        }, 1200);
      }
    }

    async function handleAuthCallback() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(
          window.location.hash.startsWith("#") ? window.location.hash.substring(1) : window.location.hash
        );

        // 1. Check for error in query or hash
        const error =
          urlParams.get("error_description") ||
          urlParams.get("error") ||
          hashParams.get("error_description") ||
          hashParams.get("error");

        if (error) {
          const errLower = error.toLowerCase();
          const disabled =
            errLower.includes("provider is not enabled") ||
            errLower.includes("unsupported provider") ||
            errLower.includes("validation_failed");

          if (mounted) {
            setIsProviderDisabled(disabled);
            setStatus("error");
            setErrorMessage(error);
          }
          return;
        }

        // 2. Check for PKCE exchange code in query params
        const code = urlParams.get("code");
        if (code) {
          const { data: codeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("Code exchange failed:", exchangeError);
            if (mounted) {
              const errLower = exchangeError.message.toLowerCase();
              setIsProviderDisabled(errLower.includes("provider is not enabled") || errLower.includes("unsupported provider"));
              setStatus("error");
              setErrorMessage(exchangeError.message);
            }
            return;
          }
          if (codeData?.session?.user) {
            await processUser(codeData.session.user);
            return;
          }
        }

        // 3. Check for implicit hash tokens (access_token & refresh_token)
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data: tokenData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            console.error("Set session from hash tokens failed:", setSessionError);
          } else if (tokenData?.session?.user) {
            await processUser(tokenData.session.user);
            return;
          }
        }

        // 4. Check existing session
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          await processUser(session.user);
          return;
        }

        // 5. Subscribe to onAuthStateChange in case session is being restored
        const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (newSession?.user && mounted) {
            await processUser(newSession.user);
          }
        });
        authSub = authListener.subscription;

        // 6. Timeout fallback after 6 seconds
        setTimeout(async () => {
          if (mounted && status === "loading" && !handledRef.current) {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.user) {
              await processUser(data.session.user);
            } else {
              setStatus("error");
              setErrorMessage(
                t("auth.confirm_failed_desc", "Authentication took longer than expected or the session could not be established.")
              );
            }
          }
        }, 6000);
      } catch (err) {
        if (mounted) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Authentication verification failed.");
        }
      }
    }

    handleAuthCallback();

    return () => {
      mounted = false;
      if (authSub) {
        authSub.unsubscribe();
      }
    };
  }, [navigate, status, t]);

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

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 md:px-8">
        <div className="glass rise w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-border/40 text-center">
          {status === "loading" && (
            <div className="flex flex-col items-center py-6">
              <div className="relative mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Loader2 className="size-8 animate-spin" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {t("auth.confirming_title", "Verifying your sign-in...")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {t("auth.confirming_desc", "Please wait while we establish your secure session and prepare your study workspace.")}
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center py-6">
              <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success">
                <CheckCircle2 className="size-8" />
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {t("auth.confirmed_title", "Authentication successful!")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {t("auth.confirmed_desc", "Your account is verified. Redirecting to your workspace…")}
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-medium text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                <span>{t("auth.confirmed_redirect", "Redirecting to your dashboard...")}</span>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center py-4 text-left">
              {isProviderDisabled ? (
                <div className="w-full space-y-4">
                  <div className="flex items-center gap-3 text-amber-500">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15">
                      <ShieldAlert className="size-6" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold text-foreground">
                        Google Sign-In Needs To Be Enabled
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Configuration required in your Supabase project
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-relaxed text-foreground space-y-2">
                    <p className="font-semibold text-amber-400">
                      Step-by-step to activate Google Sign-In:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                      <li>
                        Go to{" "}
                        <a
                          href="https://supabase.com/dashboard/project/eqlbxdlgtsihcginzkav/auth/providers"
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline inline-flex items-center gap-1"
                        >
                          Supabase Providers Dashboard <ExternalLink className="size-3 inline" />
                        </a>
                      </li>
                      <li>Find <strong>Google</strong> and toggle <strong>Enable Google</strong> to ON.</li>
                      <li>Paste your Google Cloud <strong>Client ID</strong> and <strong>Client Secret</strong>.</li>
                      <li>
                        In Google Cloud Console, ensure Authorized Redirect URI is:
                        <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground select-all">
                          https://eqlbxdlgtsihcginzkav.supabase.co/auth/v1/callback
                        </code>
                      </li>
                      <li>Click <strong>Save</strong> in Supabase.</li>
                    </ol>
                  </div>

                  <div className="pt-2 flex flex-col gap-2.5">
                    <Link
                      to="/login"
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                    >
                      <span>Return to Sign In</span>
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link
                      to="/signup"
                      className="glass-fill flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
                    >
                      Sign up with Email & Password
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="w-full text-center">
                  <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
                    <AlertCircle className="size-8" />
                  </div>
                  <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                    {t("auth.confirm_failed_title", "Verification error")}
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {errorMessage || t("auth.confirm_failed_desc", "This sign-in attempt could not be completed.")}
                  </p>
                  <div className="mt-7 flex w-full flex-col gap-3">
                    <Link
                      to="/login"
                      className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                    >
                      {t("auth.signin_link", "Sign in")}
                    </Link>
                    <Link
                      to="/signup"
                      className="glass-fill flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/70"
                    >
                      {t("auth.signup_link", "Create an account")}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

