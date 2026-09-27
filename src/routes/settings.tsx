import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, Copy, Link2, ShieldOff, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { getMyLinks, getMyProfile, getNotifications, markNotificationRead, respondToLink, revokeLink } from "@/lib/platform.functions";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Vellum" },
      { name: "description", content: "Manage your Vellum profile, student ID, and parent connections." },
      { property: "og:title", content: "Settings — Vellum" },
      { property: "og:description", content: "Manage your Vellum profile, student ID, and parent connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchLinks = useServerFn(getMyLinks);
  const fetchNotifications = useServerFn(getNotifications);
  const respond = useServerFn(respondToLink);
  const revoke = useServerFn(revokeLink);
  const markRead = useServerFn(markNotificationRead);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const profileQuery = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile(), enabled: !!user });
  const linksQuery = useQuery({ queryKey: ["my-links"], queryFn: () => fetchLinks(), enabled: !!user });
  const notificationsQuery = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications(), enabled: !!user });

  if (loading || !user) return null;

  const profile = profileQuery.data?.profile;
  const roles = profileQuery.data?.roles ?? [];
  const links = linksQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const incoming = links.filter((l: any) => l.student_id === user.id && l.status === "pending");
  const active = links.filter((l: any) => l.status === "accepted");

  async function handleRespond(linkId: string, accept: boolean) {
    try {
      await respond({ data: { linkId, accept } });
      toast.success(accept ? "Parent connected." : "Request declined.");
      queryClient.invalidateQueries({ queryKey: ["my-links"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  async function handleRevoke(linkId: string) {
    try {
      await revoke({ data: { linkId } });
      toast.success("Connection removed.");
      queryClient.invalidateQueries({ queryKey: ["my-links"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-10 md:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>

        <section className="glass mt-8 rounded-3xl p-6">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">PROFILE</p>
          <div className="mt-3 space-y-1.5 text-sm">
            <p><span className="text-muted-foreground">Name:</span> {profile?.display_name ?? "—"}</p>
            <p><span className="text-muted-foreground">Email:</span> {profile?.email ?? user.email}</p>
            <p><span className="text-muted-foreground">Role:</span> {roles.length ? roles.join(", ") : "not set"}</p>
          </div>
          {profile?.student_id && (
            <div className="glass-fill mt-4 flex items-center justify-between rounded-xl px-4 py-3">
              <div>
                <p className="font-mono text-[10px] text-muted-foreground">YOUR STUDENT ID</p>
                <p className="font-mono text-sm font-semibold tracking-wider">{profile.student_id}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(profile.student_id);
                  toast.success("Student ID copied.");
                }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <Copy className="size-3.5" /> Copy
              </button>
            </div>
          )}
        </section>

        <section className="glass mt-6 rounded-3xl p-6">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">PARENT CONNECTIONS</p>
          {incoming.length > 0 && (
            <div className="mt-4 space-y-3">
              {incoming.map((l: any) => (
                <div key={l.id} className="glass-fill flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2.5 text-sm">
                    <Link2 className="size-4 text-primary" />
                    <span><strong>{l.parent?.display_name ?? "A parent"}</strong> wants to connect</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleRespond(l.id, true)} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:brightness-110">
                      <Check className="size-3.5" /> Accept
                    </button>
                    <button type="button" onClick={() => handleRespond(l.id, false)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground">
                      <X className="size-3.5" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {active.length > 0 ? (
            <div className="mt-4 space-y-2">
              {active.map((l: any) => {
                const other = l.parent_id === user.id ? l.student : l.parent;
                return (
                  <div key={l.id} className="flex items-center justify-between rounded-xl px-1 py-2 text-sm">
                    <span>{other?.display_name ?? "Connected account"} <span className="text-muted-foreground">({l.parent_id === user.id ? "student" : "parent"})</span></span>
                    <button type="button" onClick={() => handleRevoke(l.id)} className="flex items-center gap-1 text-xs text-destructive hover:underline">
                      <ShieldOff className="size-3.5" /> Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            incoming.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No parent connections yet.</p>
          )}
        </section>

        <section className="glass mt-6 rounded-3xl p-6">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">NOTIFICATIONS</p>
          {notificationsQuery.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {notifications.map((n: any) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.read && markRead({ data: { id: n.id } }).then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${n.read ? "opacity-60" : "glass-fill"}`}
                >
                  <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-medium">{n.title}</span>
                    <span className="block text-xs text-muted-foreground">{n.body}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
