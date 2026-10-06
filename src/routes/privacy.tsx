import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck, Lock } from "lucide-react";
import { AmbientField } from "@/components/AmbientField";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme";
import { LanguageSwitcher, useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Vellum" },
      { name: "description", content: "Privacy Policy for the Vellum educational platform." },
      { property: "og:title", content: "Privacy Policy — Vellum" },
      { property: "og:url", content: "https://vellumstudy.vercel.app/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://vellumstudy.vercel.app/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <div className="relative min-h-screen bg-background font-body text-foreground">
      <AmbientField />
      
      {/* Pre-login Header with Language Switcher */}
      <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6 md:px-8">
        <div className="glass-soft flex items-center justify-between rounded-2xl px-4 py-2.5 backdrop-blur-xl border border-border/40">
          <div className="flex items-center gap-3">
            <BrandMark to="/" />
          </div>
          <div className="flex items-center gap-2.5">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <div className="mb-6">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px]"
          >
            <ArrowLeft className="size-4" />
            {t("auth.back_to_login", "Back to Sign up")}
          </Link>
        </div>

        <div className="glass rise rounded-3xl p-6 md:p-10 border border-border/40">
          <div className="flex items-center gap-3 text-primary mb-4">
            <ShieldCheck className="size-7" />
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {t("auth.privacy_link", "Privacy Policy")}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-mono mb-8">
            LAST UPDATED: SEPTEMBER 2026 • VELLUM LEARNING PLATFORM
          </p>

          <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                1. Information We Collect
              </h2>
              <p>
                When creating an account, we collect your name, email address, selected role (Student or Parent), grade level (for students), and preferred language. We store study notes, uploaded study documents, flashcards, quiz scores, and reading bookmarks created during your learning sessions.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                2. How We Protect Student Data
              </h2>
              <p>
                Student data is protected with database Row-Level Security (RLS) and strict cryptographic isolation. User data is strictly private and only accessible by the account owner and approved linked parents or guardians.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                3. AI Processing & Privacy
              </h2>
              <p>
                AI requests (flashcard creation, study questions, book explanations) are processed through private server-side APIs. Your personal details, contact information, and study history are never shared with AI model providers for training or advertising.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                4. Cookies & Local Preferences
              </h2>
              <p>
                We use secure local cookies (<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">vellum_lang</code>) and localStorage to remember your chosen language, theme preference, and game session timer across devices and sessions.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                5. Contact & Data Rights
              </h2>
              <p>
                You may request export or deletion of your account and learning materials at any time by contacting our education support team.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
