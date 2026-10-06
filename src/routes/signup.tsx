import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  GraduationCap,
  Users,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AmbientField } from "@/components/AmbientField";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme";
import { LanguageSwitcher, useLanguage, type LanguageCode } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Free Student Account — Vellum" },
      {
        name: "description",
        content: "Sign up for Vellum to build AI study kits, access curriculum textbooks and study games.",
      },
      { property: "og:title", content: "Create Free Student Account — Vellum" },
      { property: "og:url", content: "https://vellumstudy.vercel.app/signup" },
    ],
    links: [{ rel: "canonical", href: "https://vellumstudy.vercel.app/signup" }],
  }),
  component: SignupPage,
});

const GRADE_LEVELS = [
  { code: "1", labelKey: "grade.1" },
  { code: "2", labelKey: "grade.2" },
  { code: "3", labelKey: "grade.3" },
  { code: "4", labelKey: "grade.4" },
  { code: "5", labelKey: "grade.5" },
  { code: "6", labelKey: "grade.6" },
  { code: "7", labelKey: "grade.7" },
  { code: "8", labelKey: "grade.8" },
  { code: "9", labelKey: "grade.9" },
  { code: "10", labelKey: "grade.10" },
  { code: "11", labelKey: "grade.11" },
  { code: "12", labelKey: "grade.12" },
  { code: "college", labelKey: "grade.college" },
  { code: "lifelong", labelKey: "grade.lifelong" },
] as const;

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

interface SignupErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  gradeLevel?: string;
  agreeTerms?: string;
  general?: string;
}

export default function SignupPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { language, t } = useLanguage();

  // Form states
  const [role, setRole] = useState<"student" | "parent">("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gradeLevel, setGradeLevel] = useState<string>("9");
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});

  // Post-signup Check Email screen state
  const [emailCheckPending, setEmailCheckPending] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  // Field element refs for focus-on-error
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const gradeRef = useRef<HTMLSelectElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, user, navigate]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const passwordStrength = calculatePasswordStrength(password);
  const isYoungerStudent = role === "student" && ["1", "2", "3", "4", "5", "6"].includes(gradeLevel);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // Zod validation
    const schema = z
      .object({
        fullName: z.string().trim().min(2, t("val.name_required", "Please enter your full name.")),
        email: z.string().trim().email(t("val.email_invalid", "Please enter a valid email address.")),
        password: z.string().min(8, t("val.password_min", "Password must be at least 8 characters long.")),
        confirmPassword: z.string(),
        role: z.enum(["student", "parent"]),
        gradeLevel: z.string().optional(),
        language: z.enum(["en", "am", "om", "ti"]),
        agreeTerms: z.boolean().refine((val) => val === true, {
          message: t("val.terms_required", "You must agree to the Terms and Privacy Policy to create an account."),
        }),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: t("val.passwords_dont_match", "Passwords do not match."),
        path: ["confirmPassword"],
      })
      .refine((data) => (data.role === "student" ? !!data.gradeLevel : true), {
        message: t("val.grade_required", "Please select your grade level."),
        path: ["gradeLevel"],
      });

    const parsed = schema.safeParse({
      fullName,
      email,
      password,
      confirmPassword,
      role,
      gradeLevel: role === "student" ? gradeLevel : undefined,
      language,
      agreeTerms,
    });

    if (!parsed.success) {
      const fieldErrors: SignupErrors = {};
      let firstErrorKey: keyof SignupErrors | null = null;
      for (const err of parsed.error.errors) {
        const fieldName = (err.path[0] as keyof SignupErrors) || "general";
        if (!fieldErrors[fieldName]) {
          fieldErrors[fieldName] = err.message;
          if (!firstErrorKey) firstErrorKey = fieldName;
        }
      }
      setErrors(fieldErrors);

      // Focus first error field
      if (firstErrorKey === "fullName") nameRef.current?.focus();
      else if (firstErrorKey === "email") emailRef.current?.focus();
      else if (firstErrorKey === "password") passwordRef.current?.focus();
      else if (firstErrorKey === "confirmPassword") confirmRef.current?.focus();
      else if (firstErrorKey === "gradeLevel") gradeRef.current?.focus();
      else if (firstErrorKey === "agreeTerms") termsRef.current?.focus();

      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: fullName.trim(),
            full_name: fullName.trim(),
            role,
            grade_level: role === "student" ? gradeLevel : null,
            language,
          },
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("user already exists")) {
          throw new Error(t("val.email_registered", "This email is already registered. Please sign in instead."));
        }
        if (msg.includes("rate limit") || msg.includes("too many requests")) {
          throw new Error(t("val.rate_limited", "Too many attempts. Please wait a minute and try again."));
        }
        throw error;
      }

      // Check if session was returned immediately (email confirmation turned off)
      if (data?.session) {
        toast.success(t("auth.confirmed_title", "Account created successfully!"));
        if (role === "parent") {
          navigate({ to: "/parent" });
        } else {
          navigate({ to: "/dashboard" });
        }
      } else {
        // Email confirmation is on: show Check your email screen
        setRegisteredEmail(email.trim());
        setEmailCheckPending(true);
        setResendCooldown(60);
      }
    } catch (err: any) {
      toast.error(err.message || t("val.network_error", "Account creation failed. Please check your connection."));
    } finally {
      setBusy(false);
    }
  }

  async function handleResendEmail() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: registeredEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      toast.success(t("auth.resend_success", "Confirmation email resent successfully."));
      setResendCooldown(60);
    } catch (err: any) {
      toast.error(err.message || t("val.network_error", "Failed to resend confirmation email."));
    } finally {
      setResending(false);
    }
  }

  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleGoogleSignUp() {
    setGoogleBusy(true);
    try {
      // Store intent so callback sets role, grade_level and language correctly
      const signupIntent = {
        role,
        gradeLevel: role === "student" ? gradeLevel : null,
        language,
        timestamp: Date.now(),
      };
      try {
        sessionStorage.setItem("vellum_oauth_signup_intent", JSON.stringify(signupIntent));
      } catch (storageErr) {
        console.warn("Could not save signup intent to sessionStorage", storageErr);
      }

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
      console.error("[GoogleSignUp]", err);
      const msg = err.message || "";
      if (msg.includes("provider is not enabled") || msg.includes("Unsupported provider")) {
        toast.error("Google sign-up is not enabled yet in your Supabase project. Please enable Google Provider in the Supabase Dashboard.", {
          duration: 6000,
        });
      } else {
        toast.error(msg || "Google sign-up failed. Please try again.");
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

      <main className="flex flex-1 items-center justify-center px-4 py-8 md:px-8">
        <div className="glass rise w-full max-w-lg rounded-3xl p-6 sm:p-8 border border-border/40">
          {emailCheckPending ? (
            /* ==============================================
             * CHECK YOUR EMAIL SCREEN (Part B requirement)
             * ============================================== */
            <div className="text-center py-4">
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mail className="size-7" />
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {t("auth.check_email_title", "Check your email")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {t("auth.check_email_desc", "We have sent a secure confirmation link to")}{" "}
                <span className="font-semibold text-foreground underline">{registeredEmail}</span>.
              </p>
              <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t(
                  "auth.check_email_instruction",
                  "Please click the link in your email to activate your account and access your study notebooks."
                )}
              </p>

              <div className="mt-8 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={resendCooldown > 0 || resending}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60 cursor-pointer"
                >
                  {resending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {resendCooldown > 0
                    ? `${t("auth.resend_cooldown", "Resend available in")} ${resendCooldown}s`
                    : t("auth.resend_email", "Resend confirmation email")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEmailCheckPending(false);
                    setTimeout(() => emailRef.current?.focus(), 100);
                  }}
                  className="glass-fill flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {t("auth.change_email", "Change email address")}
                </button>

                <Link
                  to="/login"
                  className="mt-2 text-xs font-medium text-primary hover:underline"
                >
                  {t("auth.already_have_account", "Already have an account? Sign in")}
                </Link>
              </div>
            </div>
          ) : (
            /* ==============================================
             * SIGNUP FORM (Part B requirement)
             * ============================================== */
            <div>
              <p className="font-mono text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
                {t("auth.signup_badge", "CREATE ACCOUNT")}
              </p>
              <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {t("auth.signup_title", "Start your study journey")}
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t(
                  "auth.signup_subtitle",
                  "Transform textbooks into revision notes, interactive quizzes and flashcards."
                )}
              </p>

              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleSignUp}
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

              <form onSubmit={handleSignUp} className="space-y-4">
                {/* ROLE SELECTOR: Only Student and Parent cards */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-2">
                    {t("role.select_label", "Select your account type")}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("student")}
                      className={`flex min-h-[44px] flex-col p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        role === "student"
                          ? "bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40"
                          : "glass-fill border-border/40 hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                        <GraduationCap className={`size-4 ${role === "student" ? "text-primary" : "text-muted-foreground"}`} />
                        <span>{t("role.student_title", "Student")}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                        {t("role.student_desc", "Study with interactive notebooks, textbooks and revision games.")}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole("parent")}
                      className={`flex min-h-[44px] flex-col p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        role === "parent"
                          ? "bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40"
                          : "glass-fill border-border/40 hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
                        <Users className={`size-4 ${role === "parent" ? "text-primary" : "text-muted-foreground"}`} />
                        <span>{t("role.parent_title", "Parent")}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                        {t("role.parent_desc", "Monitor your child's study progress, quiz scores and learning time.")}
                      </p>
                    </button>
                  </div>
                </div>

                {/* FULL NAME */}
                <div>
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-foreground mb-1.5">
                    {t("auth.fullname", "Full name")}
                  </label>
                  <input
                    ref={nameRef}
                    id="signup-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("auth.fullname_placeholder", "Abebe Bikila")}
                    autoComplete="name"
                    className={`glass-fill w-full min-h-[44px] rounded-xl px-4 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground border ${
                      errors.fullName ? "border-destructive focus:ring-2 focus:ring-destructive/40" : "border-border/40 focus:ring-2 focus:ring-primary/50"
                    }`}
                  />
                  {errors.fullName && (
                    <p className="mt-1.5 text-xs text-destructive font-medium">{errors.fullName}</p>
                  )}
                </div>

                {/* EMAIL */}
                <div>
                  <label htmlFor="signup-email" className="block text-xs font-semibold text-foreground mb-1.5">
                    {t("auth.email", "Email address")}
                  </label>
                  <input
                    ref={emailRef}
                    id="signup-email"
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

                {/* GRADE LEVEL: Only for Student */}
                {role === "student" && (
                  <div>
                    <label htmlFor="signup-grade" className="block text-xs font-semibold text-foreground mb-1.5">
                      {t("grade.label", "Grade Level")}
                    </label>
                    <select
                      ref={gradeRef}
                      id="signup-grade"
                      value={gradeLevel}
                      onChange={(e) => setGradeLevel(e.target.value)}
                      className={`glass-fill w-full min-h-[44px] rounded-xl px-4 py-2.5 text-sm outline-none transition text-foreground border cursor-pointer ${
                        errors.gradeLevel ? "border-destructive focus:ring-2 focus:ring-destructive/40" : "border-border/40 focus:ring-2 focus:ring-primary/50"
                      }`}
                    >
                      {GRADE_LEVELS.map((g) => (
                        <option key={g.code} value={g.code} className="bg-background text-foreground py-1">
                          {t(g.labelKey)}
                        </option>
                      ))}
                    </select>
                    {errors.gradeLevel && (
                      <p className="mt-1.5 text-xs text-destructive font-medium">{errors.gradeLevel}</p>
                    )}

                    {/* YOUNGER STUDENTS NOTICE (Grades 1 to 6) */}
                    {isYoungerStudent && (
                      <div className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                        <AlertTriangle className="size-4 shrink-0 text-amber-400 mt-0.5" />
                        <span className="leading-relaxed">
                          {t(
                            "grade.parent_notice",
                            "Notice: Students in Grades 1 to 6 should have parental or guardian supervision when creating an account."
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* PASSWORD */}
                <div>
                  <label htmlFor="signup-password" className="block text-xs font-semibold text-foreground mb-1.5">
                    {t("auth.password", "Password")}
                  </label>
                  <div className="relative">
                    <input
                      ref={passwordRef}
                      id="signup-password"
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
                        <div className={`h-full flex-1 rounded-full ${passwordStrength.score >= 1 ? passwordStrength.color : "bg-border"}`} />
                        <div className={`h-full flex-1 rounded-full ${passwordStrength.score >= 2 ? passwordStrength.color : "bg-border"}`} />
                        <div className={`h-full flex-1 rounded-full ${passwordStrength.score >= 3 ? passwordStrength.color : "bg-border"}`} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{t(passwordStrength.labelKey)}</span>
                        <span>{t("password.hint", "Min 8 chars, mix letters & numbers")}</span>
                      </div>
                    </div>
                  )}
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-destructive font-medium">{errors.password}</p>
                  )}
                </div>

                {/* CONFIRM PASSWORD */}
                <div>
                  <label htmlFor="signup-confirm-password" className="block text-xs font-semibold text-foreground mb-1.5">
                    {t("auth.confirm_password", "Confirm password")}
                  </label>
                  <div className="relative">
                    <input
                      ref={confirmRef}
                      id="signup-confirm-password"
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

                {/* TERMS & PRIVACY CHECKBOX */}
                <div className="pt-1">
                  <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1">
                    <input
                      ref={termsRef}
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-1 size-4 rounded border-border accent-primary cursor-pointer shrink-0"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      {t("auth.terms_agree", "I agree to the")}{" "}
                      <Link to="/terms" target="_blank" className="text-primary hover:underline font-medium">
                        {t("auth.terms_link", "Terms of Service")}
                      </Link>{" "}
                      {t("auth.and", "and")}{" "}
                      <Link to="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                        {t("auth.privacy_link", "Privacy Policy")}
                      </Link>
                      .
                    </span>
                  </label>
                  {errors.agreeTerms && (
                    <p className="text-xs text-destructive font-medium">{errors.agreeTerms}</p>
                  )}
                </div>

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  disabled={busy}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60 cursor-pointer mt-2"
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {t("auth.create_account", "Create account")}
                </button>
              </form>

              <p className="mt-6 text-center text-xs sm:text-sm text-muted-foreground">
                {t("auth.already_have_account", "Already have an account?")}{" "}
                <Link to="/login" className="text-primary hover:underline font-semibold">
                  {t("auth.signin_link", "Sign in")}
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
