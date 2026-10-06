import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AmbientField } from "@/components/AmbientField";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme";
import { LanguageSwitcher, useLanguage } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Vellum" },
      { name: "description", content: "Reset your password for your Vellum study account." },
    ],
  }),
  component: ResetPasswordPage,
});

function calculatePasswordStrength(pass: string): { score: number; labelKey: string; color: string } {
  if (!pass) return { score: 0, labelKey: "password.weak", color: "bg-border" };
  let score = 0;
  if (pass.length >= 8) score += 1;
  if (/[A-Z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  if (score <= 1) return { score: 1, labelKey: "password.weak", color: "bg-destructive" };
  if (score === 2 || score === 3) return { score: 2, labelKey: "password.medium", color: "bg-amber-500" };
  return { score: 3, labelKey: "password.strong", color: "bg-success" };
}

interface ResetPasswordErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [errors, setErrors] = useState<ResetPasswordErrors>({});

  // Detect recovery mode from hash or URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash.includes("type=recovery") || hash.includes("access_token=")) {
        setMode("update");
      }
    }
  }, []);

  const strength = calculatePasswordStrength(password);

  async function handleSendReset(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const emailSchema = z.string().trim().email(t("val.email_invalid", "Please enter a valid email address."));
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setErrors({ email: result.error.errors[0]?.message || t("val.email_invalid") });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSentSuccess(true);
      toast.success(t("auth.reset_sent_title", "Password reset link sent."));
    } catch (err: any) {
      toast.error(err.message || t("val.network_error", "Failed to send reset link."));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const newErrors: ResetPasswordErrors = {};
    if (password.length < 8) {
      newErrors.password = t("val.password_min", "Password must be at least 8 characters long.");
    }
    if (password !== confirmPassword) {
      newErrors.confirmPassword = t("val.passwords_dont_match", "Passwords do not match.");
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("auth.password_updated_success", "Password updated successfully. You can now sign in."));
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || t("val.network_error", "Failed to update password."));
    } finally {
      setBusy(false);
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
          <div className="mb-5">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft className="size-4" />
              {t("auth.back_to_login", "Back to login")}
            </Link>
          </div>

          {mode === "request" ? (
            sentSuccess ? (
              <div className="text-center py-6">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success">
                  <CheckCircle2 className="size-7" />
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {t("auth.reset_sent_title", "Password reset link sent")}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {t(
                    "auth.reset_sent_desc",
                    "If an account exists for that email, we've sent password reset instructions."
                  )}
                </p>
                <div className="mt-6">
                  <Link
                    to="/login"
                    className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
                  >
                    {t("auth.signin_button", "Return to login")}
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2.5 text-primary mb-2">
                  <KeyRound className="size-5" />
                  <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                    SECURITY
                  </span>
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                  {t("auth.reset_title", "Reset your password")}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {t(
                    "auth.reset_desc",
                    "Enter your email address and we'll send you a link to reset your password."
                  )}
                </p>

                <form onSubmit={handleSendReset} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="block text-xs font-semibold text-foreground mb-1.5">
                      {t("auth.email", "Email address")}
                    </label>
                    <input
                      id="reset-email"
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

                  <button
                    type="submit"
                    disabled={busy}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60 cursor-pointer"
                  >
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    {t("auth.send_reset_button", "Send reset link")}
                  </button>
                </form>
              </div>
            )
          ) : (
            <div>
              <div className="flex items-center gap-2.5 text-primary mb-2">
                <KeyRound className="size-5" />
                <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                  NEW CREDENTIALS
                </span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {t("auth.new_password_title", "Set new password")}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {t("auth.new_password_desc", "Enter your new password below.")}
              </p>

              <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-xs font-semibold text-foreground mb-1.5">
                    {t("auth.password", "New Password")}
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("auth.password_placeholder", "At least 8 characters")}
                      autoComplete="new-password"
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

                  {/* Password Strength Meter */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1 h-1.5 w-full">
                        <div className={`h-full flex-1 rounded-full ${strength.score >= 1 ? strength.color : "bg-border"}`} />
                        <div className={`h-full flex-1 rounded-full ${strength.score >= 2 ? strength.color : "bg-border"}`} />
                        <div className={`h-full flex-1 rounded-full ${strength.score >= 3 ? strength.color : "bg-border"}`} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{t(strength.labelKey)}</span>
                        <span>{t("password.hint", "Min 8 chars, mix letters & numbers")}</span>
                      </div>
                    </div>
                  )}
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-destructive font-medium">{errors.password}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirm-new-password" className="block text-xs font-semibold text-foreground mb-1.5">
                    {t("auth.confirm_password", "Confirm password")}
                  </label>
                  <div className="relative">
                    <input
                      id="confirm-new-password"
                      type={showConfirm ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t("auth.confirm_password_placeholder", "Re-enter your password")}
                      autoComplete="new-password"
                      className={`glass-fill w-full min-h-[44px] rounded-xl px-4 py-2.5 pr-11 text-sm outline-none transition placeholder:text-muted-foreground border ${
                        errors.confirmPassword ? "border-destructive focus:ring-2 focus:ring-destructive/40" : "border-border/40 focus:ring-2 focus:ring-primary/50"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      aria-label="Toggle password visibility"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 flex min-h-[36px] min-w-[36px] items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-destructive font-medium">{errors.confirmPassword}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60 cursor-pointer"
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {t("auth.update_password_button", "Update password")}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
