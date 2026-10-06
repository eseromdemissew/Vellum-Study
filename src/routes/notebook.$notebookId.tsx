import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  NotebookPen,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  Trophy,
  Video,
  X,
  XCircle,
  Youtube,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { RichText } from "@/lib/rich-text";
import {
  askSources,
  generateMoreFlashcards,
  generateMoreQuestions,
  generateStudyKit,
  toggleNotebookShare,
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

type Tab = "quiz" | "cards" | "notes" | "ask" | "videos";
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
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`vellum-yt-${notebookId}`);
      if (stored === "1") return "videos";
    }
    return "quiz";
  });
  const regenerate = useServerFn(generateStudyKit);
  const toggleShareFn = useServerFn(toggleNotebookShare);
  const qc = useQueryClient();
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareToggling, setShareToggling] = useState(false);

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
      let data: any = null;
      // Try to select including is_shared; if column does not exist on live Supabase yet, fallback gracefully
      const resWithShared = await supabase
        .from("notebooks")
        .select("id, user_id, title, description, subject_code, status, error_message, is_shared")
        .eq("id", notebookId)
        .maybeSingle();

      if (!resWithShared.error && resWithShared.data) {
        data = resWithShared.data;
      } else {
        const fallbackRes = await supabase
          .from("notebooks")
          .select("id, user_id, title, description, subject_code, status, error_message")
          .eq("id", notebookId)
          .maybeSingle();

        if (fallbackRes.error) throw new Error(fallbackRes.error.message);
        if (!fallbackRes.data) throw new Error("Notebook not found.");
        data = { ...fallbackRes.data, is_shared: false };
      }

      // Check access permission:
      // If user is owner: ALWAYS allow!
      if (user && data.user_id === user.id) {
        return data;
      }

      // If user is not owner and notebook is not shared:
      if (!data.is_shared) {
        throw new Error("PRIVATE_NOTEBOOK");
      }

      return data;
    },
  });

  const isOwner = Boolean(user && nb.data?.user_id === user.id);
  const isShared = Boolean(nb.data?.is_shared);

  const onCopyLink = async () => {
    try {
      if (typeof window !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
        toast.success("Share link copied to clipboard!", {
          description: isShared
            ? "Anyone with this link can now view this notebook's cards, quizzes, notes, and sources."
            : "Notice: This notebook is currently set to Private. Enable link sharing for others to open it.",
        });
      }
    } catch {
      toast.error("Could not copy link to clipboard.");
    }
  };

  const onToggleShare = async () => {
    if (!isOwner || shareToggling) return;
    setShareToggling(true);
    const targetState = !isShared;
    try {
      await toggleShareFn({ data: { notebookId, isShared: targetState } });
      qc.setQueryData(["notebook", notebookId], (old: any) =>
        old ? { ...old, is_shared: targetState } : old
      );
      if (targetState) {
        if (typeof window !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(window.location.href);
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2500);
        }
        toast.success("Notebook is now Shared!", {
          description: "Share link copied! Anyone with the link or in the community chat can now access all cards, quizzes, notes, and sources.",
        });
      } else {
        toast.info("Notebook is now Private.", {
          description: "Access has been restricted. Only you can access or view this study kit.",
        });
      }
    } catch (e) {
      toast.error((e as Error).message || "Failed to update sharing settings.");
    } finally {
      setShareToggling(false);
    }
  };

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
    if (!isOwner) return;
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
    { id: "videos", label: "Videos", icon: Video },
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
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] tracking-wide text-primary">
                {nb.data?.subject_code || "STUDY"}
              </span>
              {isOwner ? (
                isShared ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-blue-500">
                    <Globe className="h-3 w-3" /> SHARED (PUBLIC LINK)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                    <Lock className="h-3 w-3" /> PRIVATE (ONLY YOU)
                  </span>
                )
              ) : isShared ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-blue-500">
                  <Globe className="h-3 w-3" /> SHARED STUDY KIT
                </span>
              ) : null}
            </div>

            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">
              {nb.data?.title ?? "Loading…"}
            </h1>
            {nb.data?.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{nb.data.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Share / Link Controls (Owner only) */}
            {isOwner && (
              <button
                type="button"
                onClick={onToggleShare}
                disabled={shareToggling}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition cursor-pointer ${
                  isShared
                    ? "bg-blue-500/15 border border-blue-500/30 text-blue-500 hover:bg-blue-500/25"
                    : "glass-soft text-foreground hover:text-primary"
                }`}
                title={isShared ? "Click to revoke sharing and make private" : "Click to share notebook with others"}
              >
                {shareToggling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isShared ? (
                  <Globe className="h-4 w-4 text-blue-500" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                {isShared ? "Shared (Click to revoke)" : "Share Notebook"}
              </button>
            )}

            {/* Quick Copy Link Button */}
            {(isShared || isOwner) && (
              <button
                type="button"
                onClick={onCopyLink}
                className="glass-soft inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm hover:text-primary transition cursor-pointer"
                title="Copy share link to clipboard"
              >
                {copiedLink ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copiedLink ? "Copied!" : "Copy Link"}
              </button>
            )}

            {/* Regenerate Kit (Owner only) */}
            {isOwner && (
              <button
                onClick={onRegenerate}
                disabled={busy}
                className="glass-soft inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm hover:text-primary disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                {busy ? "Generating…" : "Regenerate kit"}
              </button>
            )}
          </div>
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
          <div className="glass mt-8 flex flex-col items-center rounded-3xl p-10 md:p-14 text-center border border-primary/20 bg-primary/[0.03]">
            <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-8 animate-pulse text-primary" />
              <div className="absolute inset-0 rounded-2xl border-2 border-primary/40 animate-ping opacity-25" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-bold">AI is crafting your study kit…</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              Extracting key concepts, writing exam flashcards, synthesizing notes, and preparing practice quizzes.
            </p>
            <div className="mt-6 w-full max-w-sm rounded-full bg-muted/60 p-1 overflow-hidden">
              <div className="h-2 w-full rounded-full bg-gradient-to-r from-primary via-cool to-primary animate-pulse" />
            </div>
            <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>Building study kit • Auto-refreshing…</span>
            </div>
          </div>
        )}

        {nb.data?.status === "failed" && (
          <div className="glass mt-8 rounded-3xl p-8 text-center">
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-3 font-display text-lg">Generation failed</p>
            <p className="mt-1 text-sm text-muted-foreground">{nb.data.error_message}</p>
            <button
              onClick={onRegenerate}
              className="mt-5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground cursor-pointer hover:brightness-110"
            >
              Try again
            </button>
          </div>
        )}

        {nb.isError && nb.error?.message === "PRIVATE_NOTEBOOK" && (
          <div className="glass mt-8 rounded-3xl p-10 text-center border border-border/40">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
              <Lock className="size-7" />
            </div>
            <p className="font-display text-2xl font-bold">Private Notebook</p>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              This notebook is strictly private and can only be accessed by the user who generated it.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110"
              >
                Back to My Notebooks
              </Link>
            </div>
          </div>
        )}

        {nb.isError && nb.error?.message !== "PRIVATE_NOTEBOOK" && (
          <div className="glass mt-8 rounded-3xl p-8 text-center border border-destructive/30">
            <XCircle className="mx-auto h-8 w-8 text-destructive" />
            <p className="mt-3 font-display text-lg">Unable to load notebook</p>
            <p className="mt-1 text-sm text-muted-foreground">{nb.error?.message}</p>
            <button
              onClick={() => nb.refetch()}
              className="mt-4 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground cursor-pointer hover:brightness-110"
            >
              Retry
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
              {tab === "cards" && <CardsPanel notebookId={notebookId} isOwner={isOwner} />}
              {tab === "notes" && <NotesPanel notebookId={notebookId} />}
              {tab === "ask" && <AskPanel notebookId={notebookId} />}
              {tab === "videos" && <VideosPanel notebookId={notebookId} notebookTitle={nb.data?.title || ""} notebookDescription={nb.data?.description || ""} />}
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
            <h2 className="mt-6 font-display text-xl leading-snug md:text-2xl">
              <RichText text={current.question} />
            </h2>

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
                    <span className="flex-1"><RichText text={opt} /></span>
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
                    <RichText text={current.explanation} />
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

function CardsPanel({ notebookId, isOwner }: { notebookId: string; isOwner: boolean }) {
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
    if (isOwner) {
      await supabase.from("flashcards").update({ mastered: !card.mastered }).eq("id", card.id);
    }
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
              <p className="m-auto text-center font-display text-2xl leading-snug">
                <RichText text={card.question} />
              </p>
              <span className="text-center text-xs text-muted-foreground">Tap to reveal</span>
            </div>
            <div className="glass backface-hidden rotate-y-180 absolute inset-0 flex flex-col rounded-3xl p-8">
              <span className="font-mono text-[11px] text-cool">ANSWER</span>
              <p className="m-auto overflow-auto text-center text-lg leading-relaxed">
                <RichText text={card.answer} />
              </p>
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
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <RichText text={n.body} />
          </p>
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
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

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
        {mine ? content : <RichText text={content} />}
      </div>
    </div>
  );
}

/* ------------------------------ VIDEOS ------------------------------ */

function VideosPanel({ notebookId, notebookTitle, notebookDescription }: { notebookId: string; notebookTitle: string; notebookDescription: string }) {
  const [videos, setVideos] = useState<Array<{
    id: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
    duration?: string;
    badge?: string;
    directId?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [theaterVideo, setTheaterVideo] = useState<{ id: string; title: string; isRealId: boolean } | null>(null);

  // Generate search query from notebook title and description
  const defaultQuery = useMemo(() => {
    const parts: string[] = [];
    if (notebookTitle) parts.push(notebookTitle);
    if (notebookDescription) {
      const firstSentence = notebookDescription.split(/[.!?]/)[0]?.trim();
      if (firstSentence && firstSentence.length < 80) parts.push(firstSentence);
    }
    return parts.join(" ").slice(0, 100) || "study tutorial";
  }, [notebookTitle, notebookDescription]);

  // Fetch notes for tailored topic lessons
  const notesQ = useQuery({
    queryKey: ["notes-for-video", notebookId],
    queryFn: async () => {
      const { data } = await supabase
        .from("notes")
        .select("heading")
        .eq("notebook_id", notebookId)
        .order("position")
        .limit(6);
      return (data ?? []).map((n: any) => n.heading);
    },
  });

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      const query = searchQuery || defaultQuery;

      try {
        // Attempt Invidious proxy
        const encodedQuery = encodeURIComponent(query + " lesson tutorial");
        const res = await fetch(`https://vid.puffyan.us/api/v1/search?q=${encodedQuery}&type=video&sort_by=relevance&page=1`, {
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const results = data.slice(0, 8).map((v: any) => ({
              id: v.videoId,
              directId: v.videoId,
              title: v.title,
              thumbnail: v.videoThumbnails?.find((t: any) => t.quality === "medium")?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
              channelTitle: v.author || "YouTube",
              duration: v.lengthSeconds ? `${Math.floor(v.lengthSeconds / 60)}:${String(v.lengthSeconds % 60).padStart(2, "0")}` : "Lesson",
              badge: "Video Lesson",
            }));
            setVideos(results);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Continue to curated educational cards
      }

      // Curated topic lessons extracted from notebook notes & title
      const channels = ["Khan Academy", "CrashCourse", "3Blue1Brown", "MIT OpenCourseWare", "freeCodeCamp", "TED-Ed"];
      const durations = ["14:20", "18:45", "11:15", "22:05", "09:30", "16:40"];
      const badges = ["Full Lesson", "Core Concept", "Worked Examples", "Visual Summary", "Deep Dive", "Exam Prep"];
      const covers = [
        "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=700&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=700&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=700&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=700&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=700&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=700&auto=format&fit=crop&q=80",
      ];

      const topics = (notesQ.data && notesQ.data.length > 0)
        ? notesQ.data
        : [notebookTitle, "Key Definitions & Terminology", "Step-by-Step Problem Solving", "Visual Overview & Concepts"];

      const generated = topics.slice(0, 6).map((topic, i) => ({
        id: `search-${i}`,
        title: `${topic} — Video Lesson & Explanation`,
        thumbnail: covers[i % covers.length] || "",
        channelTitle: channels[i % channels.length] || "Educational Lesson",
        duration: durations[i % durations.length] || "15:00",
        badge: badges[i % badges.length] || "Video Guide",
      }));

      setVideos(generated);
      setLoading(false);
    };

    fetchVideos();
  }, [searchQuery, defaultQuery, notesQ.data, notebookTitle]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="glass rounded-3xl p-5 border border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-red-500/15 shadow-xs">
              <Youtube className="size-6 text-red-500" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">Suggested Video Lessons</h3>
              <p className="text-xs text-muted-foreground">
                High-yield video tutorials and visual explanations related to your study kit
              </p>
            </div>
          </div>

          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent((searchQuery || defaultQuery) + " lesson")}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 border border-red-500/25 px-3.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/20 transition cursor-pointer"
          >
            <Youtube className="size-3.5" /> Open in YouTube <ExternalLink className="size-3" />
          </a>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search video lessons… (default: ${defaultQuery.slice(0, 50)})`}
            className="glass-fill flex-1 rounded-xl px-4 py-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-red-500/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            className="rounded-xl bg-red-500 px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110 transition cursor-pointer shadow-xs"
          >
            Search
          </button>
        </form>
      </div>

      {/* Video Cards Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-soft h-60 animate-pulse rounded-3xl" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center">
          <Video className="mx-auto size-12 text-muted-foreground/40" />
          <h4 className="mt-3 font-display text-base font-bold">No videos found</h4>
          <p className="mt-1 text-xs text-muted-foreground">Try a different search query or explore YouTube directly.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => {
            const isSearch = video.id.startsWith("search-");
            const ytUrl = isSearch
              ? `https://www.youtube.com/results?search_query=${encodeURIComponent(video.title)}`
              : `https://www.youtube.com/watch?v=${video.id}`;

            return (
              <div
                key={video.id}
                className="glass rise group flex flex-col rounded-3xl overflow-hidden border border-border/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-red-500/30"
              >
                {/* Thumbnail Header */}
                <div className="relative aspect-video bg-black/40 overflow-hidden">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/20 to-red-900/30">
                      <Youtube className="size-12 text-red-500/60" />
                    </div>
                  )}

                  {/* Dark gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Play overlay button */}
                  <div
                    onClick={() => {
                      if (!isSearch && video.id) {
                        setTheaterVideo({ id: video.id, title: video.title, isRealId: true });
                      } else {
                        window.open(ytUrl, "_blank");
                      }
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                  >
                    <div className="flex size-12 items-center justify-center rounded-full bg-red-500 shadow-xl shadow-red-500/40 transform group-hover:scale-110 transition-transform">
                      <Play className="size-5 text-white ml-0.5" />
                    </div>
                  </div>

                  {/* Top Badge */}
                  {video.badge && (
                    <div className="absolute top-2.5 left-2.5">
                      <span className="rounded-lg bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-semibold text-white border border-white/10">
                        {video.badge}
                      </span>
                    </div>
                  )}

                  {/* Duration Chip */}
                  {video.duration && (
                    <div className="absolute bottom-2.5 right-2.5">
                      <span className="rounded-md bg-black/80 backdrop-blur-sm px-1.5 py-0.5 font-mono text-[10px] text-white">
                        {video.duration}
                      </span>
                    </div>
                  )}
                </div>

                {/* Video Info & Action */}
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-snug">
                      {video.title}
                    </h4>
                    <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Youtube className="size-3 text-red-500 shrink-0" />
                      <span className="truncate">{video.channelTitle}</span>
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                    {!isSearch && video.id ? (
                      <button
                        onClick={() => setTheaterVideo({ id: video.id, title: video.title, isRealId: true })}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
                      >
                        <Play className="size-3" /> Watch in Vellum
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Curated Topic Lesson</span>
                    )}

                    <a
                      href={ytUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-500/20 transition cursor-pointer"
                    >
                      <span>Watch</span>
                      <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Theater Video Modal */}
      {theaterVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass w-full max-w-3xl rounded-3xl overflow-hidden border border-border/60 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b border-border/40">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <Youtube className="size-5 text-red-500 shrink-0" />
                <h3 className="font-display text-sm font-bold truncate text-foreground">
                  {theaterVideo.title}
                </h3>
              </div>
              <button
                onClick={() => setTheaterVideo(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="relative aspect-video bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${theaterVideo.id}?autoplay=1`}
                title={theaterVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>

            <div className="p-4 flex items-center justify-between bg-background/60">
              <span className="text-xs text-muted-foreground">Playing via YouTube player</span>
              <a
                href={`https://www.youtube.com/watch?v=${theaterVideo.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white hover:brightness-110 transition"
              >
                Open in YouTube <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </div>
      )}
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
