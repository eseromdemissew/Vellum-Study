import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createNotebook, generateStudyKit } from "@/lib/study.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your notebooks — Vellum" },
      {
        name: "description",
        content:
          "Every study notebook you have built with Vellum, with flashcards, quizzes and notes ready to revise.",
      },
      { property: "og:title", content: "Your notebooks — Vellum" },
      {
        property: "og:description",
        content: "Every study notebook you have built with Vellum, ready to revise.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Notebook = {
  id: string;
  title: string;
  description: string;
  subject_code: string;
  status: string;
  error_message: string | null;
  updated_at: string;
};

const statusStyles: Record<string, string> = {
  ready: "text-success",
  failed: "text-destructive",
  pending: "text-muted-foreground",
  generating: "text-cool",
};

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const queryClient = useQueryClient();
  const notebooksQuery = useQuery({
    queryKey: ["notebooks", user?.id],
    enabled: Boolean(user),
    refetchInterval: (query) =>
      (query.state.data as Notebook[] | undefined)?.some(
        (n) => n.status === "generating" || n.status === "pending",
      )
        ? 4000
        : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notebooks")
        .select("id, title, description, subject_code, status, error_message, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Notebook[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notebooks").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Notebook deleted");
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const notebooks = notebooksQuery.data ?? [];

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-5 pt-10 pb-24 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
              YOUR LIBRARY
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">
              Study notebooks
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            {composerOpen ? <X className="size-4" /> : <Plus className="size-4" />}
            {composerOpen ? "Close" : "New notebook"}
          </button>
        </div>

        {(composerOpen || (!notebooksQuery.isLoading && notebooks.length === 0)) && (
          <Composer
            onCreated={() => {
              setComposerOpen(false);
              queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            }}
          />
        )}

        {notebooksQuery.isLoading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="glass-soft h-44 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notebooks.map((notebook, index) => (
              <div
                key={notebook.id}
                className="glass rise group relative rounded-2xl p-5 transition-transform duration-500 hover:-translate-y-1"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Link
                  to="/notebook/$notebookId"
                  params={{ notebookId: notebook.id }}
                  className="block"
                >
                  <div className="flex items-center justify-between font-mono text-[10px] tracking-wide">
                    <span className="glass-fill rounded-md px-2 py-1 text-muted-foreground">
                      {notebook.subject_code || "STUDY"}
                    </span>
                    <span
                      className={`flex items-center gap-1.5 ${statusStyles[notebook.status] ?? ""}`}
                    >
                      {notebook.status === "generating" || notebook.status === "pending" ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : notebook.status === "failed" ? (
                        <AlertTriangle className="size-3" />
                      ) : (
                        <CheckCircle2 className="size-3" />
                      )}
                      {notebook.status.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="mt-4 line-clamp-2 font-display text-lg leading-snug font-semibold">
                    {notebook.title}
                  </h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {notebook.status === "failed"
                      ? notebook.error_message
                      : notebook.description || "Studying material…"}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => remove.mutate(notebook.id)}
                  aria-label="Delete notebook"
                  className="absolute right-3 bottom-3 rounded-lg p-2 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Composer({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const create = useServerFn(createNotebook);
  const generate = useServerFn(generateStudyKit);
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "creating" | "generating">("idle");

  const busy = stage !== "idle";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!title.trim()) {
      toast.error("Give your notebook a title first.");
      return;
    }

    try {
      let uploaded: { path: string; name: string; mimeType: string } | null = null;

      if (file) {
        setStage("uploading");
        const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error } = await supabase.storage.from("sources").upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (error) throw new Error(error.message);
        uploaded = {
          path,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
        };
      }

      setStage("creating");
      const { notebookId } = await create({
        data: {
          title: title.trim(),
          description: description.trim(),
          pastedText,
          file: uploaded,
        },
      });

      onCreated();
      setStage("generating");
      toast.info("Vellum is reading your material…");

      generate({ data: { notebookId } })
        .then(() => toast.success("Your study kit is ready"))
        .catch((error: Error) => toast.error(error.message));

      navigate({ to: "/notebook/$notebookId", params: { notebookId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the notebook.");
      setStage("idle");
    }
  }

  return (
    <form onSubmit={submit} className="glass rise mt-8 rounded-3xl p-6">
      <div className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground">
        <Sparkles className="size-3.5 text-primary" />
        NEW STUDY NOTEBOOK
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title — e.g. Cell respiration, week 4"
            className="glass-fill w-full rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the topic, or what you want to focus on. Enough on its own if you have no file."
            className="glass-fill w-full resize-none rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
          />
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={4}
            placeholder="Optional: paste notes, a transcript or an article here."
            className="glass-fill w-full resize-none rounded-xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
          />
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="glass-fill flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-dashed px-6 py-10 text-center transition hover:brightness-110"
          >
            <FileUp className="size-5 text-primary" />
            <span className="text-sm font-medium">
              {file ? file.name : "Upload a file"}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              PDF · DOCX · TXT · MD · IMAGES · MAX 25MB
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.csv,.json,.docx,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <button
              type="button"
              onClick={() => setFile(null)}
              className="self-start rounded-lg px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-destructive"
            >
              REMOVE FILE
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {stage === "uploading"
              ? "Uploading…"
              : stage === "creating"
                ? "Creating…"
                : stage === "generating"
                  ? "Analysing…"
                  : "Build my study kit"}
          </button>
        </div>
      </div>
    </form>
  );
}
