import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BrainCircuit,
  FileUp,
  Layers,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  Sparkle,
  Wand2,
} from "lucide-react";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vellum — turn anything into a study kit" },
      {
        name: "description",
        content:
          "Upload a document or describe a topic. Vellum writes flashcards, unlimited quiz questions, short notes and answers questions from your own sources.",
      },
      { property: "og:title", content: "Vellum — turn anything into a study kit" },
      {
        property: "og:description",
        content:
          "Upload a document or describe a topic. Vellum writes flashcards, unlimited quiz questions, short notes and answers questions from your own sources.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    icon: FileUp,
    title: "Drop in your material",
    body: "A PDF, notes, a transcript — or just describe the topic in a sentence and let Vellum do the reading.",
  },
  {
    icon: BrainCircuit,
    title: "Vellum reads it properly",
    body: "The whole document is analysed end to end, then rebuilt into the shapes you actually revise from.",
  },
  {
    icon: Sparkle,
    title: "Study, endlessly",
    body: "Flip cards, take quizzes that never run out, skim the notes, and ask your sources anything.",
  },
];

const outputs = [
  {
    icon: Layers,
    label: "FLASHCARDS",
    title: "Cards that flip",
    body: "Self-contained question and answer pairs with a mastered pile you can grow every session.",
  },
  {
    icon: ListChecks,
    label: "QUIZ",
    title: "Unlimited questions",
    body: "Four options, instant right/wrong feedback and the reasoning underneath. Ask for more and more arrive.",
  },
  {
    icon: NotebookPen,
    label: "NOTES",
    title: "Crisp revision notes",
    body: "The material distilled into headed sections you can read the night before.",
  },
  {
    icon: MessagesSquare,
    label: "ASK",
    title: "Talk to your sources",
    body: "Ask anything and get an answer grounded in your own material, with the source named.",
  },
];

function Landing() {
  const { user } = useAuth();

  return (
    <AppShell>
      <main>
        {/* hero */}
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-24 md:px-8 md:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rise">
              <span className="glass-soft inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground">
                <span className="pulse-soft size-1.5 rounded-full bg-primary" />
                AI STUDY NOTEBOOKS
              </span>
              <h1 className="mt-6 font-display text-[2.7rem] leading-[1.03] font-bold tracking-tight md:text-6xl">
                Anything you need to learn,
                <span className="block text-primary">rebuilt into a study kit.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
                Upload a file or describe a topic. Vellum analyses it and writes flashcards,
                endless quiz questions with explanations, short notes — and answers your
                questions straight from the material.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to={user ? "/dashboard" : "/auth"}
                  search={(user ? {} : { mode: "signup" }) as any}
                  className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lg transition hover:brightness-110"
                >
                  {user ? "Go to your notebooks" : "Start studying free"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#how"
                  className="glass-soft inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm text-foreground transition hover:brightness-110"
                >
                  See how it works
                </a>
              </div>
              <p className="mt-4 font-mono text-[11px] text-muted-foreground">
                PDF · DOCX · TXT · MD · IMAGES · OR JUST A TOPIC
              </p>
            </div>

            {/* floating preview */}
            <div className="perspective rise" style={{ animationDelay: "120ms" }}>
              <div className="diag">
                <div className="glass diag-inner rounded-3xl p-5">
                  <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>BIO-204 / PHOTOSYNTHESIS</span>
                    <span className="text-success">READY</span>
                  </div>
                  <div className="glass-fill mt-4 rounded-2xl p-4">
                    <p className="font-display text-sm font-semibold">
                      Which pigment absorbs light most strongly in the blue-violet range?
                    </p>
                    <div className="mt-3 space-y-2 text-[13px]">
                      <div className="glass-fill rounded-xl px-3 py-2 text-muted-foreground">
                        Carotene
                      </div>
                      <div className="rounded-xl border border-success/60 bg-success/15 px-3 py-2 text-foreground">
                        Chlorophyll a
                      </div>
                      <div className="glass-fill rounded-xl px-3 py-2 text-muted-foreground">
                        Xanthophyll
                      </div>
                    </div>
                    <p className="mt-3 border-l-2 border-success/60 pl-3 text-[12px] leading-relaxed text-muted-foreground">
                      Chlorophyll a peaks around 430 nm, which sits in the blue-violet band.
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px]">
                    <div className="glass-fill rounded-xl px-3 py-2.5">
                      <div className="text-base font-semibold text-foreground">18</div>
                      CARDS
                    </div>
                    <div className="glass-fill rounded-xl px-3 py-2.5">
                      <div className="text-base font-semibold text-foreground">∞</div>
                      QUESTIONS
                    </div>
                    <div className="glass-fill rounded-xl px-3 py-2.5">
                      <div className="text-base font-semibold text-foreground">7</div>
                      NOTES
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* how */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-24 md:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Three steps, no setup
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <span className="glass-fill flex size-10 items-center justify-center rounded-xl">
                    <step.icon className="size-4.5 text-primary" />
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* outputs */}
        <section id="outputs" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-24 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Everything one notebook gives you
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              One upload becomes four study surfaces, all kept in sync in a single workspace.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {outputs.map((item) => (
              <div
                key={item.label}
                className="glass group rounded-2xl p-6 transition-transform duration-500 hover:-translate-y-1"
              >
                <div className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground">
                  <item.icon className="size-3.5 text-cool" />
                  {item.label}
                </div>
                <h3 className="mt-3 font-display text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* cta */}
        <section className="mx-auto max-w-6xl px-5 pb-24 md:px-8">
          <div className="glass relative overflow-hidden rounded-3xl px-8 py-14 text-center">
            <Wand2 className="mx-auto size-6 text-primary" />
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Your next exam starts with one upload
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
              Free to start. Your material stays private to your account.
            </p>
            <Link
              to={user ? "/dashboard" : "/auth"}
              search={(user ? {} : { mode: "signup" }) as any}
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:brightness-110"
            >
              {user ? "Open your notebooks" : "Create your first notebook"}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <footer className="mx-auto max-w-6xl px-5 pb-10 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 font-mono text-[11px] text-muted-foreground">
            <span>VELLUM / AI STUDY NOTEBOOKS</span>
            <span>BUILT FOR PEOPLE WITH AN EXAM ON MONDAY</span>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}
