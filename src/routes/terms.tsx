import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Shield, FileText } from "lucide-react";
import { AmbientField } from "@/components/AmbientField";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/theme";
import { LanguageSwitcher, useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Vellum" },
      { name: "description", content: "Terms of Service for the Vellum educational platform." },
      { property: "og:title", content: "Terms of Service — Vellum" },
      { property: "og:url", content: "https://vellumstudy.vercel.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://vellumstudy.vercel.app/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
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
            <FileText className="size-7" />
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {t("auth.terms_link", "Terms of Service")}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground font-mono mb-8">
            LAST UPDATED: SEPTEMBER 2026 • VELLUM LEARNING PLATFORM
          </p>

          <div className="space-y-6 text-sm text-foreground/90 leading-relaxed">
            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                1. Educational Purpose & Use
              </h2>
              <p>
                Vellum is an AI-assisted learning platform designed to help students, educators, and lifelong learners study textbooks, create revision flashcards, test comprehension with interactive quizzes, and explore curriculum-aligned learning materials.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                2. Student Accounts & Parental Supervision
              </h2>
              <p>
                Students under 13 years of age (Grades 1 through 6) must create their accounts with parental or guardian consent and supervision. Parents and legal guardians may link their accounts with student profiles to monitor learning progress and study time.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                3. User Content & Source Materials
              </h2>
              <p>
                You retain ownership of study notes and materials you upload to Vellum. You agree not to upload harmful, offensive, or copyrighted materials that you do not have permission to use for personal educational study.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                4. Fair AI Usage & Game Breaks
              </h2>
              <p>
                AI generation features (flashcard creation, quiz synthesis, question answering) are provided for genuine academic study. The Game Break Zone is subject to a daily limit of 30 minutes to encourage healthy study-rest balance.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-2">
                5. Privacy & Data Integrity
              </h2>
              <p>
                Your study data and account credentials are secure and never sold to third parties. For full details on data collection and storage, please review our{" "}
                <Link to="/privacy" className="text-primary hover:underline font-medium">
                  {t("auth.privacy_link", "Privacy Policy")}
                </Link>.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
