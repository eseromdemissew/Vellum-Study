import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  NotebookPen,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  askSources,
  generateMoreFlashcards,
  generateMoreQuestions,
  generateStudyKit,
} from "@/lib/study.functions";

export const Route = createFileRoute("/notebook/$notebookId")({
  head: () => ({
    meta: [
      { title: "Study workspace — Vellum" },
      {
        name: "description",
        content: "Flashcards, unlimited quizzes, revision notes and answers from your own material.",
      },
      { property: "og:title", content: "Study workspace — Vellum" },
      {
        property: "og:description",
        content: "Revise with flashcards, unlimited quizzes and notes generated from your material.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotebookPage,
});

type Tab = "quiz" | "cards" | "notes" | "ask";
type Card = { id: string; question: string; answer: string; mastered: boolean; position: number };
type Question = {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  position: number;
};

function NotebookPage() {
  const { notebookId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("quiz");
  const regenerate = useServerFn(generateStudyKit);
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const nb = useQuery({
    queryKey: ["notebook", notebookId],
    enabled: Boolean(user),
    refetchInterval: (q) => {
      const s = (q.state.data as { status: string } | undefined)?.status;
      return s === "generating" || s === "pending" ? 3000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notebooks")
        .select("id, title, description, subject_code, status, error_message")
        .eq("id", notebookId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const sources = useQuery({
    queryKey: ["sources", notebookId],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("sources")
        .select("id, kind, name")
        .eq("notebook_id", notebookId);
      return data ?? [];
    },
  });

  const ready = nb.data?.status === "ready";
  const busy = nb.data?.status === "generating" || nb.data?.status === "pending";

  const onRegenerate = async () => {
    qc.setQueryData(["notebook", notebookId], (d: any) => (d ? { ...d, status: "generating" } : d));
    try {
      await regenerate({ data: { notebookId } });
      toast.success("Study kit refreshed");
    } catch (e) {
      toast.error((e as Error).message);
    }
    qc.invalidateQueries();
  };

  const tabs: { id: Tab; label: string; icon: typeof Layers }[] = [
    { id: "quiz", label: "Quiz", icon: Trophy },
    { id: "cards", label: "Flashcards", icon: Layers },
    { id: "notes", label: "Notes", icon: NotebookPen },
    { id: "ask", label: "Ask sources", icon: MessageSquare },
  ];

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-5 pt-8 pb-24 md:px-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> ALL NOTEBOOKS
        </Link>

        <div className="rise mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-wide text-primary">
              {nb.data?.subject_code || "STUDY"}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              {nb.data?.title ?? "Loading…"}
            </h1>
            {nb.data?.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{nb.data.description}</p>
            )}
          </div>
          <button
            onClick={onRegenerate}
            disabled={busy}
            className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Generating…" : "Regenerate kit"}
          </button>
        </div>

        {(sources.data?.length ?? 0) > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {sources.data!.map((s) => (
              <span
                key={s.id}
                className="glass-fill inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="font-mono text-[10px] text-primary">{s.kind}</span>
                <span className="max-w-[220px] truncate">{s.name}</span>
              </span>
            ))}
          </div>
        )}

        {busy && (
          <div className="glass mt-8 flex flex-col items-center rounded-3xl p-12 text-center">
            <Sparkles className="pulse-soft h-8 w-8 text-primary" />
            <p className="mt-4 font-display text-xl">Reading your material…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Building flashcards, quiz questions and notes. This usually takes under a minute.
            </p>
          </div>
        )}

        {nb.data?.status === "failed" && (
          <div className="glass mt-8 rounded-3xl p-8 text-center">
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-3 font-display text-lg">Generation failed</p>
            <p className="mt-1 text-sm text-muted-foreground">{nb.data.error_message}</p>
            <button
              onClick={onRegenerate}
              className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
          </div>
        )}

        {ready && (
          <>
            <div className="glass-soft mt-8 inline-flex flex-wrap gap-1 rounded-full p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>
            <div key={tab} className="rise mt-6">
              {tab === "quiz" && <QuizPanel notebookId={notebookId} />}
              {tab === "cards" && <CardsPanel notebookId={notebookId} />}
              {tab === "notes" && <NotesPanel notebookId={notebookId} />}
              {tab === "ask" && <AskPanel notebookId={notebookId} />}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}

/* ------------------------------ QUIZ ------------------------------ */

function QuizPanel({ notebookId }: { notebookId: string }) {
  const qc = useQueryClient();
  const more = useServerFn(generateMoreQuestions);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [loadingMore, setLoadingMore] = useState(false);

  const q = useQuery({
    queryKey: ["quiz", notebookId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quiz_questions")
        .select("id, question, options, correct_index, explanation, position")
        .eq("notebook_id", notebookId)
        .order("position");
      return (data ?? []) as unknown as Question[];
    },
  });
  const list = q.data ?? [];
  const current = list[index];
  const answered = picked !== null;
  const correct = answered && picked === current?.correct_index;

  const generate = async () => {
    setLoadingMore(true);
    try {
      const r = await more({ data: { notebookId, count: 8, difficulty } });
      await qc.invalidateQueries({ queryKey: ["quiz", notebookId] });
      toast.success(`${r.added} new questions added`);
      setIndex(list.length);
      setPicked(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const choose = (i: number) => {
    if (answered || !current) return;
    setPicked(i);
    setScore((s) =>
      i === current.correct_index ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 },
    );
  };

  const next = () => {
    setPicked(null);
    setIndex((i) => i + 1);
  };

  if (q.isLoading) return <Spinner />;

  const total = score.right + score.wrong;
  const pct = total ? Math.round((score.right / total) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        {current ? (
          <div key={current.id} className="glass rise rounded-3xl p-6 md:p-8">
            <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
              <span>
                QUESTION {index + 1} / {list.length}
              </span>
              <span className="text-primary">∞ UNLIMITED</span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${((index + (answered ? 1 : 0)) / list.length) * 100}%` }}
              />
            </div>
            <h2 className="mt-6 font-display text-xl leading-snug md:text-2xl">{current.question}</h2>

            <div className="mt-6 grid gap-3">
              {current.options.map((opt, i) => {
                const isRight = i === current.correct_index;
                const isPicked = i === picked;
                let cls = "glass-fill hover:border-primary/60 hover:translate-x-1";
                if (answered && isRight) cls = "border-success bg-success/15 anim-pop";
                else if (answered && isPicked) cls = "border-destructive bg-destructive/15 anim-shake";
                else if (answered) cls = "glass-fill opacity-50";
                return (
                  <button
                    key={i}
                    onClick={() => choose(i)}
                    disabled={answered}
                    className={`flex items-center gap-4 rounded-2xl border px-4 py-3.5 text-left text-sm transition-all duration-300 ${cls}`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs ${
                        answered && isRight
                          ? "bg-success text-background"
                          : answered && isPicked
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {answered && isRight ? (
                        <Check className="h-4 w-4" />
                      ) : answered && isPicked ? (
                        <X className="h-4 w-4" />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span className="flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>

            {answered && (
              <div
                className={`anim-unfold mt-6 rounded-2xl border p-5 ${
                  correct ? "border-success/50 bg-success/10" : "border-destructive/50 bg-destructive/10"
                }`}
              >
                <div className="flex items-center gap-2 font-display text-lg">
                  {correct ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                  {correct ? "Correct!" : "Not quite"}
                </div>
                {!correct && (
                  <p className="mt-2 text-sm">
                    Correct answer:{" "}
                    <strong>
                      {String.fromCharCode(65 + current.correct_index)}.{" "}
                      {current.options[current.correct_index]}
                    </strong>
                  </p>
                )}
                {current.explanation && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-mono text-[10px] tracking-wide text-foreground">
                      EXPLANATION ·{" "}
                    </span>
                    {current.explanation}
                  </p>
                )}
                <button
                  onClick={next}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
                >
                  {index + 1 < list.length ? "Next question" : "Finish set"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="glass rise rounded-3xl p-8 text-center md:p-12">
            <Trophy className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-4 font-display text-2xl">
              {list.length ? "Set complete" : "No questions yet"}
            </p>
            {total > 0 && (
              <p className="mt-1 text-muted-foreground">
                You scored {score.right}/{total} ({pct}%)
              </p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              Generate a fresh batch — new questions never repeat old ones.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={generate}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate 8 new questions
              </button>
              {list.length > 0 && (
                <button
                  onClick={() => {
                    setIndex(0);
                    setPicked(null);
                    setScore({ right: 0, wrong: 0 });
                  }}
                  className="glass-soft inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm"
                >
                  <RotateCcw className="h-4 w-4" /> Restart
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="glass rounded-3xl p-5">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">SESSION SCORE</p>
          <p className="mt-2 font-display text-4xl">{pct}%</p>
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-success">✓ {score.right}</span>
            <span className="text-destructive">✗ {score.wrong}</span>
          </div>
        </div>
        <div className="glass rounded-3xl p-5">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">MORE QUESTIONS</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["easy", "medium", "hard", "mixed"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`rounded-xl px-3 py-2 text-xs capitalize transition ${
                  difficulty === d ? "bg-primary text-primary-foreground" : "glass-fill text-muted-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={generate}
            disabled={loadingMore}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cool px-4 py-2.5 text-sm font-medium text-cool-foreground disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loadingMore ? "Writing…" : "Generate more"}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">{list.length} questions in this notebook</p>
        </div>
      </aside>
    </div>
  );
}

/* ---------------------------- FLASHCARDS ---------------------------- */

function CardsPanel({ notebookId }: { notebookId: string }) {
  const qc = useQueryClient();
  const more = useServerFn(generateMoreFlashcards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const q = useQuery({
    queryKey: ["cards", notebookId],
    queryFn: async () => {
      const { data } = await supabase
        .from("flashcards")
        .select("id, question, answer, mastered, position")
        .eq("notebook_id", notebookId)
        .order("position");
      return (data ?? []) as Card[];
    },
  });
  const cards = q.data ?? [];
  const card = cards[Math.min(index, cards.length - 1)];
  const mastered = cards.filter((c) => c.mastered).length;

  const go = (d: number) => {
    setFlipped(false);
    setIndex((i) => (i + d + cards.length) % cards.length);
  };

  const toggleMastered = async () => {
    if (!card) return;
    await supabase.from("flashcards").update({ mastered: !card.mastered }).eq("id", card.id);
    qc.setQueryData(["cards", notebookId], (d: Card[] | undefined) =>
      d?.map((c) => (c.id === card.id ? { ...c, mastered: !c.mastered } : c)),
    );
  };

  const generate = async () => {
    setLoadingMore(true);
    try {
      const r = await more({ data: { notebookId, count: 10 } });
      await qc.invalidateQueries({ queryKey: ["cards", notebookId] });
      toast.success(`${r.added} new flashcards added`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (q.isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span>
          CARD {cards.length ? index + 1 : 0} / {cards.length}
        </span>
        <span className="text-success">
          {mastered} MASTERED
        </span>
      </div>

      {card && (
        <div className="perspective mt-4 h-80 cursor-pointer" onClick={() => setFlipped((f) => !f)}>
          <div
            className="preserve-3d relative h-full w-full transition-transform duration-700"
            style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
          >
            <div className="glass backface-hidden absolute inset-0 flex flex-col rounded-3xl p-8">
              <span className="font-mono text-[11px] text-primary">QUESTION</span>
              <p className="m-auto text-center font-display text-2xl leading-snug">{card.question}</p>
              <span className="text-center text-xs text-muted-foreground">Tap to reveal</span>
            </div>
            <div className="glass backface-hidden rotate-y-180 absolute inset-0 flex flex-col rounded-3xl p-8">
              <span className="font-mono text-[11px] text-cool">ANSWER</span>
              <p className="m-auto overflow-auto text-center text-lg leading-relaxed">{card.answer}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button onClick={() => go(-1)} className="glass-soft rounded-full p-3" aria-label="Previous">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={toggleMastered}
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm transition ${
            card?.mastered ? "bg-success text-background" : "glass-soft"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {card?.mastered ? "Mastered" : "Mark mastered"}
        </button>
        <button onClick={() => go(1)} className="glass-soft rounded-full p-3" aria-label="Next">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={generate}
          disabled={loadingMore}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate 10 more flashcards
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ NOTES ------------------------------ */

function NotesPanel({ notebookId }: { notebookId: string }) {
  const q = useQuery({
    queryKey: ["notes", notebookId],
    queryFn: async () => {
      const { data } = await supabase
        .from("notes")
        .select("id, heading, body")
        .eq("notebook_id", notebookId)
        .order("position");
      return data ?? [];
    },
  });
  if (q.isLoading) return <Spinner />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(q.data ?? []).map((n, i) => (
        <article
          key={n.id}
          className="glass rise rounded-3xl p-6"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span className="font-mono text-[11px] text-primary">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="mt-1 font-display text-lg">{n.heading}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{n.body}</p>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------- ASK ------------------------------- */

function AskPanel({ notebookId }: { notebookId: string }) {
  const qc = useQueryClient();
  const ask = useServerFn(askSources);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["chat", notebookId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("notebook_id", notebookId)
        .order("created_at");
      return data ?? [];
    },
  });

  const messages = useMemo(() => q.data ?? [], [q.data]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, pending]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = text.trim();
    if (!question || pending) return;
    setText("");
    setPending(question);
    try {
      await ask({ data: { notebookId, question } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      await qc.invalidateQueries({ queryKey: ["chat", notebookId] });
      setPending(null);
    }
  };

  return (
    <div className="glass mx-auto flex h-[560px] max-w-3xl flex-col rounded-3xl">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && !pending && (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 text-primary" />
            <p className="mt-3 text-sm">Ask anything about your material.</p>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}
        {pending && (
          <>
            <Bubble role="user" content={pending} />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          </>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask your sources…"
          className="glass-fill flex-1 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          disabled={!text.trim() || Boolean(pending)}
          className="rounded-full bg-primary p-3 text-primary-foreground disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function Bubble({ role, content }: { role: string; content: string }) {
  const mine = role === "user";
  return (
    <div className={`rise flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          mine ? "bg-primary text-primary-foreground" : "glass-fill"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
