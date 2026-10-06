import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Check,
  Copy,
  Link2,
  ShieldOff,
  X,
  Globe,
  GraduationCap,
  SunMoon,
  Camera,
  User,
  Upload,
  Edit2,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyLinks,
  getMyProfile,
  getNotifications,
  markNotificationRead,
  respondToLink,
  revokeLink,
  updateMySettings,
} from "@/lib/platform.functions";
import { useLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n";
import { ThemeToggle } from "@/components/theme";

// Self-contained SVG avatar data URIs — no external API calls needed
function makeAvatarSvg(bg1: string, bg2: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs><rect width="80" height="80" rx="16" fill="url(#g)"/><text x="40" y="50" font-size="38" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const PRESET_AVATARS = [
  makeAvatarSvg("#6366f1", "#a78bfa", "🤖"),
  makeAvatarSvg("#f97316", "#fbbf24", "🦁"),
  makeAvatarSvg("#ec4899", "#f472b6", "🌸"),
  makeAvatarSvg("#10b981", "#34d399", "🐸"),
  makeAvatarSvg("#3b82f6", "#60a5fa", "🐬"),
  makeAvatarSvg("#8b5cf6", "#c084fc", "🦄"),
  makeAvatarSvg("#ef4444", "#f87171", "🔥"),
  makeAvatarSvg("#14b8a6", "#5eead4", "🌿"),
];

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Vellum" },
      { name: "description", content: "Manage your Vellum profile, grade level, language, and parent connections." },
      { property: "og:title", content: "Settings — Vellum" },
      { property: "og:description", content: "Manage your Vellum profile, grade level, language, and parent connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
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

function SettingsPage() {
  const { user, loading } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchLinks = useServerFn(getMyLinks);
  const fetchNotifications = useServerFn(getNotifications);
  const respond = useServerFn(respondToLink);
  const revoke = useServerFn(revokeLink);
  const markRead = useServerFn(markNotificationRead);
  const saveSettings = useServerFn(updateMySettings);

  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const profileQuery = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile(), enabled: !!user });
  const linksQuery = useQuery({ queryKey: ["my-links"], queryFn: () => fetchLinks(), enabled: !!user });
  const notificationsQuery = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications(), enabled: !!user });

  const profile = profileQuery.data?.profile;
  const roles = profileQuery.data?.roles ?? [];
  const isStudent = roles.includes("student");
  const links = linksQuery.data ?? [];
  const notifications = notificationsQuery.data ?? [];
  const incoming = links.filter((l: any) => l.student_id === user?.id && l.status === "pending");
  const active = links.filter((l: any) => l.status === "accepted");

  useEffect(() => {
    if (profile?.display_name) {
      setNameValue(profile.display_name);
    }
  }, [profile?.display_name]);

  if (loading || !user) return null;

  async function handleLanguageChange(newLang: LanguageCode) {
    setLanguage(newLang, true);
    try {
      await saveSettings({ data: { language: newLang } });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Language preference updated.");
    } catch {
      // Local state is already updated
    }
  }

  async function handleGradeChange(newGrade: any) {
    setSavingSettings(true);
    try {
      await saveSettings({ data: { gradeLevel: newGrade } });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Grade level updated.");
    } catch (e: any) {
      toast.error(e.message || "Failed to update grade level.");
    } finally {
      setSavingSettings(false);
    }
  }

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

  async function handleAvatarUpload(file: File) {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `user-${user.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: pubData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      if (!pubData?.publicUrl) {
        throw new Error("Failed to get public URL for avatar.");
      }

      await saveSettings({ data: { avatarUrl: pubData.publicUrl } });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Profile photo updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handlePresetAvatar(url: string) {
    setUploadingAvatar(true);
    try {
      await saveSettings({ data: { avatarUrl: url } });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Avatar updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to set avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveName() {
    if (!nameValue.trim()) return;
    setSavingSettings(true);
    try {
      await saveSettings({ data: { displayName: nameValue.trim() } });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setEditingName(false);
      toast.success("Display name updated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update name.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 md:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          {t("nav.settings", "Settings")}
        </h1>

        {/* PROFILE SECTION */}
        <section className="glass mt-6 rounded-3xl p-6 border border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="relative group">
                <div className="size-20 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-md bg-muted flex items-center justify-center">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || "Profile"}
                      className="size-full object-cover"
                    />
                  ) : (
                    <User className="size-10 text-muted-foreground" />
                  )}
                </div>
                <label className="absolute -bottom-2 -right-2 rounded-xl bg-primary p-2 text-primary-foreground shadow-lg hover:brightness-110 cursor-pointer transition">
                  <Camera className="size-4" />
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingAvatar}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                    }}
                  />
                </label>
              </div>

              <div className="space-y-1">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm font-semibold text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveName}
                      disabled={savingSettings}
                      className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold font-display text-foreground">
                      {profile?.display_name || user.email?.split("@")[0] || "Student"}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      title="Edit Name"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{profile?.email ?? user.email}</p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-primary capitalize">
                    {roles.length ? roles.join(", ") : "Student"}
                  </span>
                  {uploadingAvatar && (
                    <span className="text-[11px] text-muted-foreground animate-pulse">
                      Updating avatar...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick preset avatar chooser */}
            <div className="glass-soft p-3 rounded-2xl border border-border/40">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                Choose an Avatar
              </span>
              <div className="flex items-center gap-2">
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handlePresetAvatar(url)}
                    className="size-8 rounded-lg overflow-hidden border border-border/60 hover:scale-110 hover:border-primary transition"
                  >
                    <img src={url} alt={`Avatar ${idx + 1}`} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Student ID Card */}
          {profile?.student_id && (
            <div className="glass-fill mt-6 flex items-center justify-between rounded-2xl p-4 border border-border/40">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-mono font-bold text-xs">
                  ID
                </div>
                <div>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                    Official Student Identifier
                  </p>
                  <p className="font-mono text-base font-bold tracking-widest text-primary">
                    {profile.student_id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(profile.student_id);
                  toast.success("Student ID copied to clipboard!");
                }}
                className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-3.5 py-2 text-xs font-semibold text-foreground transition hover:border-primary cursor-pointer shadow-sm"
              >
                <Copy className="size-3.5 text-primary" /> Copy ID
              </button>
            </div>
          )}
        </section>

        {/* PREFERENCES: LANGUAGE, GRADE LEVEL, THEME */}
        <section className="glass mt-6 rounded-3xl p-6 border border-border/40">
          <p className="font-mono text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-4">
            PREFERENCES & CURRICULUM
          </p>

          <div className="space-y-4">
            {/* Preferred Language */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl glass-fill p-4 border border-border/30">
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Preferred Language</p>
                  <p className="text-xs text-muted-foreground">
                    Interface language for dictionary and study materials
                  </p>
                </div>
              </div>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as LanguageCode)}
                className="glass-soft rounded-xl px-3 py-2 text-xs font-semibold text-foreground outline-none border border-border/40 cursor-pointer min-h-[44px]"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-background text-foreground">
                    {l.flag} {l.nativeLabel} ({l.code.toUpperCase()}) — {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Grade Level (for student) */}
            {isStudent && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl glass-fill p-4 border border-border/30">
                <div className="flex items-center gap-3">
                  <GraduationCap className="size-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t("grade.label", "Grade Level")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Used for tailored textbook suggestions and difficulty
                    </p>
                  </div>
                </div>
                <select
                  value={profile?.grade_level || "9"}
                  disabled={savingSettings}
                  onChange={(e) => handleGradeChange(e.target.value)}
                  className="glass-soft rounded-xl px-3 py-2 text-xs font-semibold text-foreground outline-none border border-border/40 cursor-pointer min-h-[44px]"
                >
                  {GRADE_LEVELS.map((g) => (
                    <option key={g.code} value={g.code} className="bg-background text-foreground">
                      {t(g.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Theme Toggle */}
            <div className="flex items-center justify-between gap-3 rounded-2xl glass-fill p-4 border border-border/30">
              <div className="flex items-center gap-3">
                <SunMoon className="size-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Appearance</p>
                  <p className="text-xs text-muted-foreground">Switch between dark and light themes</p>
                </div>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </section>

        {/* PARENT CONNECTIONS */}
        <section className="glass mt-6 rounded-3xl p-6 border border-border/40">
          <p className="font-mono text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            PARENT CONNECTIONS
          </p>
          {incoming.length > 0 && (
            <div className="mt-4 space-y-3">
              {incoming.map((l: any) => (
                <div
                  key={l.id}
                  className="glass-fill flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-2.5 text-sm">
                    <Link2 className="size-4 text-primary" />
                    <span>
                      <strong>{l.parent?.display_name ?? "A parent"}</strong> wants to connect
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRespond(l.id, true)}
                      className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:brightness-110 cursor-pointer min-h-[36px]"
                    >
                      <Check className="size-3.5" /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespond(l.id, false)}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground cursor-pointer min-h-[36px]"
                    >
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
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-xl px-2 py-2.5 text-sm glass-fill"
                  >
                    <span>
                      {other?.display_name ?? "Connected account"}{" "}
                      <span className="text-muted-foreground">
                        ({l.parent_id === user.id ? "student" : "parent"})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRevoke(l.id)}
                      className="flex items-center gap-1 text-xs text-destructive hover:underline cursor-pointer"
                    >
                      <ShieldOff className="size-3.5" /> Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            incoming.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">No parent connections yet.</p>
            )
          )}
        </section>

        {/* NOTIFICATIONS */}
        <section className="glass mt-6 rounded-3xl p-6 border border-border/40">
          <p className="font-mono text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            NOTIFICATIONS
          </p>
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
                  onClick={() =>
                    !n.read &&
                    markRead({ data: { id: n.id } }).then(() =>
                      queryClient.invalidateQueries({ queryKey: ["notifications"] })
                    )
                  }
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer ${
                    n.read ? "opacity-60" : "glass-fill"
                  }`}
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
