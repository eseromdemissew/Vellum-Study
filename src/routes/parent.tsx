import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Clock, Link2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { getChildActivity, getMyLinks, getMyProfile, requestChildLink } from "@/lib/platform.functions";

export const Route = createFileRoute("/parent")({
  head: () => ({
    meta: [
      { title: "Parent dashboard — Vellum" },
      { name: "description", content: "Follow your child's study and reading activity on Vellum." },
      { property: "og:title", content: "Parent dashboard — Vellum" },
      { property: "og:description", content: "Follow your child's study and reading activity on Vellum." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParentPage,
});

function ParentPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchLinks = useServerFn(getMyLinks);
  const fetchActivity = useServerFn(getChildActivity);
  const requestLink = useServerFn(requestChildLink);
  const [studentIdInput, setStudentIdInput] = useState("");
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const profileQuery = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile(), enabled: !!user });
  const linksQuery = useQuery({ queryKey: ["my-links"], queryFn: () => fetchLinks(), enabled: !!user });
  const activityQuery = useQuery({
    queryKey: ["child-activity", selectedChild],
    queryFn: () => fetchActivity({ data: { studentId: selectedChild! } }),
    enabled: !!selectedChild,
  });

  if (loading || !user) return null;

  const roles = profileQuery.data?.roles ?? [];
  const accepted = (linksQuery.data ?? []).filter((l: any) => l.parent_id === user.id && l.status === "accepted");
  const pending = (linksQuery.data ?? []).filter((l: any) => l.parent_id === user.id && l.status === "pending");

  if (!profileQuery.isLoading && !roles.includes("parent")) {
    return (
      <AppShell>
        <main className="mx-auto max-w-xl px-5 py-24 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-bold">Parent dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">This area is for parent accounts. Your account is registered as {roles.join(", ") || "a student"}.</p>
        </main>
      </AppShell>
    );
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await requestLink({ data: { studentId: studentIdInput } });
      toast.success(`Link request sent to ${result.studentName}. They'll need to accept it.`);
      setStudentIdInput("");
      linksQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send link request.");
    } finally {
      setBusy(false);
    }
  }

  const activity = activityQuery.data;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-10 md:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Parent dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect to your child's account to follow their study activity.</p>

        <section className="glass mt-8 rounded-3xl p-6">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">CONNECT A CHILD</p>
          <form onSubmit={handleLink} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              placeholder="Student ID (e.g. STU-1A2B3C4D)"
              className="glass-fill flex-1 rounded-xl px-4 py-3 font-mono text-sm uppercase outline-none transition placeholder:normal-case placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/60"
            />
            <button type="submit" disabled={busy || !studentIdInput.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-60">
              <Link2 className="size-4" /> Send request
            </button>
          </form>
          {pending.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Waiting on: {pending.map((l: any) => l.student?.display_name ?? l.student?.student_id).join(", ")}
            </p>
          )}
        </section>

        {accepted.length > 0 && (
          <section className="mt-6 flex flex-wrap gap-2">
            {accepted.map((l: any) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedChild(l.student_id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${selectedChild === l.student_id ? "bg-primary text-primary-foreground" : "glass-fill hover:brightness-110"}`}
              >
                {l.student?.display_name ?? "Student"}
              </button>
            ))}
          </section>
        )}

        {selectedChild && (
          <section className="mt-6">
            {activityQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading activity…</p>
            ) : activityQuery.isError ? (
              <p className="text-sm text-destructive">Could not load this student's activity.</p>
            ) : activity ? (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: "Notebooks", value: activity.totals.notebooks },
                    { label: "Flashcards mastered", value: `${activity.totals.mastered}/${activity.totals.flashcards}` },
                    { label: "Quiz questions", value: activity.totals.quizQuestions },
                    { label: "Reading minutes", value: activity.totals.minutes },
                  ].map((s) => (
                    <div key={s.label} className="glass rounded-2xl p-4">
                      <p className="font-display text-2xl font-bold">{s.value}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="glass mt-6 rounded-3xl p-6">
                  <p className="font-mono text-[11px] tracking-wide text-muted-foreground">READING LOG</p>
                  {activity.sessions.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">No reading sessions yet.</p>
                  ) : (
                    <div className="mt-3 divide-y divide-border">
                      {activity.sessions.slice(0, 20).map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="flex items-center gap-2 truncate">
                            <BookOpen className="size-4 shrink-0 text-primary" />
                            <span className="truncate">{s.book_title}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="size-3" />{s.minutes}m</span>
                            <span>{new Date(s.started_at).toLocaleDateString()}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass mt-6 rounded-3xl p-6">
                  <p className="font-mono text-[11px] tracking-wide text-muted-foreground">NOTEBOOKS</p>
                  {activity.notebooks.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">No notebooks yet.</p>
                  ) : (
                    <div className="mt-3 divide-y divide-border">
                      {activity.notebooks.map((n: any) => (
                        <div key={n.id} className="flex items-center justify-between py-2.5 text-sm">
                          <span className="truncate">{n.title}</span>
                          <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </section>
        )}

        {accepted.length === 0 && !linksQuery.isLoading && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No connected children yet. Ask your child for their Student ID — it's on their Settings page.
          </p>
        )}
      </main>
    </AppShell>
  );
}
