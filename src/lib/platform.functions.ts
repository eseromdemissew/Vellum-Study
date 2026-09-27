import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function myRoles(ctx: Ctx): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return (data ?? []).map((r: any) => r.role as string);
}

async function requireRole(ctx: Ctx, role: string) {
  const roles = await myRoles(ctx);
  if (!roles.includes(role)) throw new Error(`Forbidden: requires ${role} role`);
}

// ---------- Roles & profile ----------

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const [{ data: profile }, roles] = await Promise.all([
      ctx.supabase.from("profiles").select("*").eq("id", ctx.userId).single(),
      myRoles(ctx),
    ]);
    return { profile, roles };
  });

export const completeRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        firstName: z.string().trim().min(1).max(60),
        fatherName: z.string().trim().max(60).optional(),
        role: z.enum(["admin", "parent", "student"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const update: Record<string, unknown> = {
      first_name: data.firstName,
      father_name: data.fatherName ?? null,
      display_name: data.firstName,
    };
    if (data.role === "student") {
      const { data: sid } = await ctx.supabase.rpc("generate_student_id");
      update.student_id = sid;
    }
    const { error } = await ctx.supabase.from("profiles").update(update).eq("id", ctx.userId);
    if (error) throw new Error(error.message);
    const { error: roleError } = await ctx.supabase
      .from("user_roles")
      .upsert({ user_id: ctx.userId, role: data.role }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);
    return { ok: true };
  });

// ---------- Notifications ----------

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await ctx.supabase.from("notifications").update({ read: true }).eq("id", data.id).eq("user_id", ctx.userId);
    return { ok: true };
  });

async function notify(ctx: Ctx, userId: string, kind: string, title: string, body: string, extra: Record<string, unknown> = {}) {
  await ctx.supabase.from("notifications").insert({ user_id: userId, kind, title, body, data: extra });
}

// ---------- Parent–child linking ----------

export const requestChildLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ studentId: z.string().trim().min(4).max(20) }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "parent");
    const { data: student } = await ctx.supabase
      .from("profiles")
      .select("id, display_name, student_id")
      .eq("student_id", data.studentId.toUpperCase())
      .maybeSingle();
    if (!student) throw new Error("No student found with that ID.");
    if (student.id === ctx.userId) throw new Error("You cannot link to yourself.");
    const { data: existing } = await ctx.supabase
      .from("parent_child_links")
      .select("id, status")
      .eq("parent_id", ctx.userId)
      .eq("student_id", student.id)
      .maybeSingle();
    if (existing && (existing.status === "pending" || existing.status === "accepted"))
      throw new Error("A link with this student already exists.");
    if (existing) {
      await ctx.supabase.from("parent_child_links").update({ status: "pending" }).eq("id", existing.id);
    } else {
      const { error } = await ctx.supabase
        .from("parent_child_links")
        .insert({ parent_id: ctx.userId, student_id: student.id });
      if (error) throw new Error(error.message);
    }
    const { data: me } = await ctx.supabase.from("profiles").select("display_name").eq("id", ctx.userId).single();
    await notify(
      ctx,
      student.id,
      "link_request",
      "Parent link request",
      `${me?.display_name ?? "A parent"} wants to connect to your account. Accept or decline in Settings.`,
      { parent_id: ctx.userId },
    );
    return { ok: true, studentName: student.display_name };
  });

export const respondToLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ linkId: z.string().uuid(), accept: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: link } = await ctx.supabase
      .from("parent_child_links")
      .select("*")
      .eq("id", data.linkId)
      .eq("student_id", ctx.userId)
      .single();
    if (!link) throw new Error("Link request not found.");
    const status = data.accept ? "accepted" : "declined";
    const { error } = await ctx.supabase.from("parent_child_links").update({ status }).eq("id", link.id);
    if (error) throw new Error(error.message);
    const { data: me } = await ctx.supabase.from("profiles").select("display_name").eq("id", ctx.userId).single();
    await notify(
      ctx,
      link.parent_id,
      "link_response",
      data.accept ? "Link accepted" : "Link declined",
      `${me?.display_name ?? "The student"} ${data.accept ? "accepted" : "declined"} your link request.`,
    );
    return { ok: true };
  });

export const revokeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ linkId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase
      .from("parent_child_links")
      .update({ status: "revoked" })
      .eq("id", data.linkId)
      .or(`parent_id.eq.${ctx.userId},student_id.eq.${ctx.userId}`);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("parent_child_links")
      .select("*")
      .or(`parent_id.eq.${ctx.userId},student_id.eq.${ctx.userId}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const links = data ?? [];
    const ids = [...new Set(links.flatMap((l: any) => [l.parent_id, l.student_id]))];
    const { data: profiles } = ids.length
      ? await ctx.supabase.from("profiles").select("id, display_name, email, student_id").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return links.map((l: any) => ({ ...l, parent: byId.get(l.parent_id), student: byId.get(l.student_id) }));
  });

// ---------- Parent dashboard ----------

export const getChildActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ studentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "parent");
    const { data: link } = await ctx.supabase
      .from("parent_child_links")
      .select("id")
      .eq("parent_id", ctx.userId)
      .eq("student_id", data.studentId)
      .eq("status", "accepted")
      .maybeSingle();
    if (!link) throw new Error("You are not linked to this student.");

    const [notebooks, sessions, flashcards, quizzes, profile] = await Promise.all([
      ctx.supabase.from("notebooks").select("id, title, status, created_at").eq("user_id", data.studentId).order("created_at", { ascending: false }),
      ctx.supabase.from("reading_sessions").select("*").eq("user_id", data.studentId).order("started_at", { ascending: false }).limit(100),
      ctx.supabase.from("flashcards").select("id, mastered").eq("user_id", data.studentId),
      ctx.supabase.from("quiz_questions").select("id").eq("user_id", data.studentId),
      ctx.supabase.from("profiles").select("display_name, email, student_id").eq("id", data.studentId).single(),
    ]);

    // 48h inactivity alert — real check, notified once per day
    const latest = (sessions.data ?? [])[0];
    const lastActivity = latest ? new Date(latest.started_at).getTime() : 0;
    const inactiveMs = Date.now() - lastActivity;
    if (inactiveMs > 48 * 3600 * 1000) {
      const { data: recent } = await ctx.supabase
        .from("notifications")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("kind", "inactivity")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(1);
      if (!recent?.length) {
        await notify(
          ctx,
          ctx.userId,
          "inactivity",
          "Student inactive for 48h",
          `${profile.data?.display_name ?? "Your child"} has had no reading activity in the last 48 hours.`,
          { student_id: data.studentId },
        );
      }
    }

    return {
      profile: profile.data,
      notebooks: notebooks.data ?? [],
      sessions: sessions.data ?? [],
      totals: {
        minutes: (sessions.data ?? []).reduce((s: number, r: any) => s + (r.minutes ?? 0), 0),
        flashcards: (flashcards.data ?? []).length,
        mastered: (flashcards.data ?? []).filter((f: any) => f.mastered).length,
        quizQuestions: (quizzes.data ?? []).length,
        notebooks: (notebooks.data ?? []).length,
      },
    };
  });

// ---------- Admin ----------

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ search: z.string().trim().max(100).optional(), role: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    let query = ctx.supabase.from("profiles").select("id, email, display_name, first_name, father_name, student_id, suspended, created_at");
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "");
      query = query.or(`display_name.ilike.%${s}%,email.ilike.%${s}%,student_id.ilike.%${s}%`);
    }
    const { data: profiles, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const { data: roles } = await ctx.supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    let users = (profiles ?? []).map((p: any) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
    if (data.role) users = users.filter((u: any) => u.roles.includes(data.role));
    return users;
  });

export const adminSetSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid(), suspended: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    const { error } = await ctx.supabase.from("profiles").update({ suspended: data.suspended }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    await ctx.supabase.from("moderation_actions").insert({
      admin_id: ctx.userId,
      action: data.suspended ? "suspend_user" : "unsuspend_user",
      target_user_id: data.userId,
    });
    return { ok: true };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    const [profiles, notebooks, sessions, posts] = await Promise.all([
      ctx.supabase.from("profiles").select("id", { count: "exact", head: true }),
      ctx.supabase.from("notebooks").select("id", { count: "exact", head: true }),
      ctx.supabase.from("reading_sessions").select("minutes"),
      ctx.supabase.from("community_posts").select("id", { count: "exact", head: true }),
    ]);
    return {
      users: profiles.count ?? 0,
      notebooks: notebooks.count ?? 0,
      posts: posts.count ?? 0,
      readingMinutes: (sessions.data ?? []).reduce((s: number, r: any) => s + (r.minutes ?? 0), 0),
    };
  });

// ---------- AI key management ----------

export const adminListApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    const { data, error } = await ctx.supabase
      .from("ai_api_keys")
      .select("id, label, provider, last4, status, priority, usage_count, last_used_at, created_at")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminAddApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ label: z.string().trim().min(1).max(60), key: z.string().trim().min(8).max(200), priority: z.number().int().min(0).max(99).default(0) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    // Encrypted at rest via pgcrypto-backed vault-less approach: store using
    // Supabase's built-in encryption is unavailable here, so we hash-obfuscate
    // with the service role key as pepper and keep only last4 for display.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pepper = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
    const encoder = new TextEncoder();
    const keyData = encoder.encode(data.key);
    const pepperData = encoder.encode(pepper);
    const obfuscated = Buffer.from(keyData.map((b, i) => b ^ pepperData[i % pepperData.length])).toString("base64");
    const { error } = await supabaseAdmin.from("ai_api_keys").insert({
      label: data.label,
      key_encrypted: obfuscated,
      last4: data.key.slice(-4),
      priority: data.priority,
      created_by: ctx.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetApiKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    const { error } = await ctx.supabase.from("ai_api_keys").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Community ----------

const PROFANITY = ["fuck", "shit", "bitch", "asshole", "cunt", "dick", "porn", "nude", "sex"];
function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return PROFANITY.some((w) => new RegExp(`\\b${w}`, "i").test(lower));
}

export const listPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ feed: z.enum(["student", "parent"]), category: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    let query = ctx.supabase
      .from("community_posts")
      .select("*, profiles!community_posts_user_id_fkey(display_name)")
      .eq("feed", data.feed)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.category && data.category !== "all") query = query.eq("category", data.category);
    const { data: posts, error } = await query;
    if (error) throw new Error(error.message);
    const ids = (posts ?? []).map((p: any) => p.id);
    const [likes, comments, myLikes] = ids.length
      ? await Promise.all([
          ctx.supabase.from("post_likes").select("post_id").in("post_id", ids),
          ctx.supabase.from("post_comments").select("*, profiles!post_comments_user_id_fkey(display_name)").in("post_id", ids).eq("hidden", false).order("created_at"),
          ctx.supabase.from("post_likes").select("post_id").in("post_id", ids).eq("user_id", ctx.userId),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
    const likeCount = new Map<string, number>();
    for (const l of likes.data ?? []) likeCount.set(l.post_id, (likeCount.get(l.post_id) ?? 0) + 1);
    const myLikeSet = new Set((myLikes.data ?? []).map((l: any) => l.post_id));
    const commentMap = new Map<string, any[]>();
    for (const c of comments.data ?? []) commentMap.set(c.post_id, [...(commentMap.get(c.post_id) ?? []), c]);
    return (posts ?? []).map((p: any) => ({
      ...p,
      author: p.profiles?.display_name ?? "Member",
      likeCount: likeCount.get(p.id) ?? 0,
      likedByMe: myLikeSet.has(p.id),
      comments: (commentMap.get(p.id) ?? []).map((c: any) => ({ ...c, author: c.profiles?.display_name ?? "Member" })),
    }));
  });

export const createPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ feed: z.enum(["student", "parent"]), body: z.string().trim().min(1).max(2000), category: z.string().trim().max(40).default("general") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (containsProfanity(data.body)) throw new Error("Your post contains language that isn't allowed here.");
    const { error } = await ctx.supabase.from("community_posts").insert({
      user_id: ctx.userId,
      feed: data.feed,
      body: data.body,
      category: data.category,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: existing } = await ctx.supabase
      .from("post_likes")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (existing) {
      await ctx.supabase.from("post_likes").delete().eq("id", existing.id);
    } else {
      await ctx.supabase.from("post_likes").insert({ post_id: data.postId, user_id: ctx.userId });
    }
    return { ok: true };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ postId: z.string().uuid(), body: z.string().trim().min(1).max(1000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (containsProfanity(data.body)) throw new Error("Your comment contains language that isn't allowed here.");
    const { error } = await ctx.supabase.from("post_comments").insert({ post_id: data.postId, user_id: ctx.userId, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reportContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ postId: z.string().uuid().optional(), commentId: z.string().uuid().optional(), reason: z.string().trim().max(300).default("") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!data.postId && !data.commentId) throw new Error("Nothing to report.");
    const { error } = await ctx.supabase.from("reports").insert({
      reporter_id: ctx.userId,
      post_id: data.postId ?? null,
      comment_id: data.commentId ?? null,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Moderation (admin) ----------

export const adminListReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    const { data, error } = await ctx.supabase
      .from("reports")
      .select("*, community_posts(body, user_id), post_comments(body, user_id)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminModerate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      action: z.enum(["hide_post", "unhide_post", "delete_post", "hide_comment", "resolve_report"]),
      postId: z.string().uuid().optional(),
      commentId: z.string().uuid().optional(),
      reportId: z.string().uuid().optional(),
      targetUserId: z.string().uuid().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    if (data.action === "hide_post" && data.postId)
      await ctx.supabase.from("community_posts").update({ hidden: true }).eq("id", data.postId);
    if (data.action === "unhide_post" && data.postId)
      await ctx.supabase.from("community_posts").update({ hidden: false }).eq("id", data.postId);
    if (data.action === "delete_post" && data.postId)
      await ctx.supabase.from("community_posts").delete().eq("id", data.postId);
    if (data.action === "hide_comment" && data.commentId)
      await ctx.supabase.from("post_comments").update({ hidden: true }).eq("id", data.commentId);
    if (data.action === "resolve_report" && data.reportId)
      await ctx.supabase.from("reports").update({ status: "resolved" }).eq("id", data.reportId);
    await ctx.supabase.from("moderation_actions").insert({
      admin_id: ctx.userId,
      action: data.action,
      target_post_id: data.postId ?? null,
      target_user_id: data.targetUserId ?? null,
    });
    return { ok: true };
  });

export const adminModerationLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireRole(ctx, "admin");
    const { data, error } = await ctx.supabase
      .from("moderation_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Library (Open Library proxy) ----------

export const searchBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ q: z.string().trim().min(1).max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: me } = await ctx.supabase.from("profiles").select("suspended").eq("id", ctx.userId).single();
    if (me?.suspended) throw new Error("Your account is suspended.");
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(data.q)}&has_fulltext=true&limit=24`,
      { headers: { "User-Agent": "VellumStudy/1.0" } },
    );
    if (!res.ok) throw new Error("The book library is unavailable right now. Try again in a moment.");
    const json = await res.json();
    const books = (json.docs ?? [])
      .filter((doc: any) => Array.isArray(doc.ia) && doc.ia.length > 0)
      .slice(0, 18)
      .map((doc: any) => ({
        iaId: doc.ia[0] as string,
        title: (doc.title as string) ?? "Untitled",
        author: doc.author_name?.[0] ?? "Unknown",
        cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
        year: doc.first_publish_year ?? null,
      }));
    return books;
  });

// ---------- Reading sessions ----------

export const startReading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ iaId: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(300), author: z.string().trim().max(120).default("Unknown"), cover: z.string().url().max(500).nullable().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: row, error } = await ctx.supabase
      .from("reading_sessions")
      .insert({ user_id: ctx.userId, book_ia_id: data.iaId, book_title: data.title, book_author: data.author, book_cover: data.cover ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { sessionId: row.id as string };
  });

export const stopReading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ sessionId: z.string().uuid(), minutes: z.number().int().min(0).max(24 * 60) }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase
      .from("reading_sessions")
      .update({ ended_at: new Date().toISOString(), minutes: data.minutes })
      .eq("id", data.sessionId)
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getContinueReading = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("reading_sessions")
      .select("*")
      .eq("user_id", ctx.userId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const byBook = new Map<string, any>();
    for (const s of data ?? []) {
      const existing = byBook.get(s.book_ia_id);
      if (!existing) {
        byBook.set(s.book_ia_id, { ...s, totalMinutes: s.minutes ?? 0, sessions: 1 });
      } else {
        existing.totalMinutes += s.minutes ?? 0;
        existing.sessions += 1;
      }
    }
    return [...byBook.values()].slice(0, 6);
  });

export const getMyReadingHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("reading_sessions")
      .select("*")
      .eq("user_id", ctx.userId)
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
