import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ChatChannel {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  target_audience: "both" | "student" | "parent" | "all";
  is_default: boolean;
  created_by?: string | null;
  created_at: string;
  unread_count?: number;
}

export interface ChatAttachment {
  type: "file" | "image" | "notebook";
  name: string;
  url?: string;
  size?: number;
  mime?: string;
  notebook_id?: string;
  notebook_title?: string;
  subject_code?: string;
  summary?: string;
  flashcards_count?: number;
  quiz_count?: number;
  notes_count?: number;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  attachments: ChatAttachment[];
  created_at: string;
  author: {
    id: string;
    display_name: string;
    avatar_url?: string | null;
    role: "student" | "parent" | "admin";
    student_id?: string | null;
  };
}

const DEFAULT_CHANNELS: ChatChannel[] = [
  {
    id: "def-general",
    name: "General Lounge",
    slug: "general-lounge",
    description: "Open community lounge for students & parents to connect, discuss topics, and share study kits.",
    icon: "message-square",
    target_audience: "both",
    is_default: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "def-students",
    name: "Student Hub",
    slug: "student-hub",
    description: "Exclusive student space to collaborate on homework, exchange revision tips, and study together.",
    icon: "graduation-cap",
    target_audience: "student",
    is_default: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "def-parents",
    name: "Parent Circle",
    slug: "parent-circle",
    description: "Private circle for parents to discuss study guidance, motivation, and learning tools.",
    icon: "users",
    target_audience: "parent",
    is_default: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "def-resources",
    name: "Resource Exchange",
    slug: "resource-exchange",
    description: "Share and discover peer study kits, textbooks, revision guides, and past exam tips.",
    icon: "book-open",
    target_audience: "both",
    is_default: false,
    created_at: new Date().toISOString(),
  },
];

async function getUserRole(supabase: any, userId: string): Promise<"admin" | "parent" | "student"> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const roleList = (roles ?? []).map((r: any) => r.role);
  if (roleList.includes("admin")) return "admin";
  if (roleList.includes("parent")) return "parent";
  return "student";
}

/**
 * List channels accessible to the current user based on their role
 */
export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const role = await getUserRole(supabase, userId);

    try {
      let query = supabase
        .from("chat_channels")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (role !== "admin") {
        if (role === "student") {
          query = query.in("target_audience", ["both", "all", "student"]);
        } else if (role === "parent") {
          query = query.in("target_audience", ["both", "all", "parent"]);
        }
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        // Fallback to default channels filtered by role
        return {
          channels: DEFAULT_CHANNELS.filter((c) => {
            if (role === "admin") return true;
            if (role === "student") return c.target_audience === "both" || c.target_audience === "student" || c.target_audience === "all";
            if (role === "parent") return c.target_audience === "both" || c.target_audience === "parent" || c.target_audience === "all";
            return false;
          }),
          role,
        };
      }

      return { channels: data as ChatChannel[], role };
    } catch {
      return {
        channels: DEFAULT_CHANNELS.filter((c) => {
          if (role === "admin") return true;
          if (role === "student") return c.target_audience === "both" || c.target_audience === "student" || c.target_audience === "all";
          if (role === "parent") return c.target_audience === "both" || c.target_audience === "parent" || c.target_audience === "all";
          return false;
        }),
        role,
      };
    }
  });

/**
 * List messages in a channel with author profiles and roles
 */
export const listChannelMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        channelId: z.string(),
        limit: z.number().min(1).max(100).default(60),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getUserRole(supabase, userId);

    try {
      const { data: messages, error } = await supabase
        .from("chat_channel_messages")
        .select("id, channel_id, user_id, content, attachments, created_at")
        .eq("channel_id", data.channelId)
        .order("created_at", { ascending: true })
        .limit(data.limit);

      if (error || !messages) return { messages: [] as ChatMessage[] };

      // Collect author profiles
      const userIds = Array.from(new Set(messages.map((m: any) => m.user_id)));
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url, student_id").in("id", userIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
      ]);

      const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
      const roleMap = new Map<string, "admin" | "parent" | "student">();
      for (const r of rolesRes.data ?? []) {
        if (r.role === "admin") roleMap.set(r.user_id, "admin");
        else if (r.role === "parent" && roleMap.get(r.user_id) !== "admin") roleMap.set(r.user_id, "parent");
        else if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, "student");
      }

      const formatted: ChatMessage[] = messages.map((m: any) => {
        const prof = (profileMap.get(m.user_id) as any) || {};
        const authorRole = roleMap.get(m.user_id) || "student";
        return {
          id: m.id,
          channel_id: m.channel_id,
          user_id: m.user_id,
          content: m.content || "",
          attachments: (m.attachments as ChatAttachment[]) || [],
          created_at: m.created_at,
          author: {
            id: m.user_id,
            display_name: prof.display_name || "Community Member",
            avatar_url: prof.avatar_url || null,
            role: authorRole,
            student_id: prof.student_id || null,
          },
        };
      });

      return { messages: formatted };
    } catch {
      return { messages: [] as ChatMessage[] };
    }
  });

/**
 * Send a message into a channel with optional attachments
 */
export const sendChannelMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        channelId: z.string(),
        content: z.string().max(4000).default(""),
        attachments: z
          .array(
            z.object({
              type: z.enum(["file", "image", "notebook"]),
              name: z.string(),
              url: z.string().optional(),
              size: z.number().optional(),
              mime: z.string().optional(),
              notebook_id: z.string().optional(),
              notebook_title: z.string().optional(),
              subject_code: z.string().optional(),
              summary: z.string().optional(),
              flashcards_count: z.number().optional(),
              quiz_count: z.number().optional(),
              notes_count: z.number().optional(),
            })
          )
          .default([]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.content.trim() && data.attachments.length === 0) {
      throw new Error("Message cannot be completely empty.");
    }

    const { data: inserted, error } = await supabase
      .from("chat_channel_messages")
      .insert({
        channel_id: data.channelId,
        user_id: userId,
        content: data.content.trim(),
        attachments: data.attachments,
      })
      .select("id, channel_id, user_id, content, attachments, created_at")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message || "Failed to post message to channel.");
    }

    // Automatically enable link sharing on any notebook explicitly shared into chat
    const notebookAttachments = data.attachments.filter((a) => a.type === "notebook" && a.notebook_id);
    if (notebookAttachments.length > 0) {
      const nbIds = notebookAttachments.map((a) => a.notebook_id as string);
      await supabase
        .from("notebooks")
        .update({ is_shared: true })
        .in("id", nbIds)
        .eq("user_id", userId);
    }

    const [profRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url, student_id").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const roleList = (roleRes.data ?? []).map((r: any) => r.role);
    const role: "admin" | "parent" | "student" = roleList.includes("admin")
      ? "admin"
      : roleList.includes("parent")
      ? "parent"
      : "student";

    const msg: ChatMessage = {
      id: inserted.id,
      channel_id: inserted.channel_id,
      user_id: inserted.user_id,
      content: inserted.content,
      attachments: (inserted.attachments as ChatAttachment[]) || [],
      created_at: inserted.created_at,
      author: {
        id: userId,
        display_name: profRes.data?.display_name || "Community Member",
        avatar_url: profRes.data?.avatar_url || null,
        role,
        student_id: profRes.data?.student_id || null,
      },
    };

    return { message: msg };
  });

/**
 * Delete a message (author or admin only)
 */
export const deleteChannelMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ messageId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getUserRole(supabase, userId);

    if (role === "admin") {
      await supabase.from("chat_channel_messages").delete().eq("id", data.messageId);
    } else {
      await supabase
        .from("chat_channel_messages")
        .delete()
        .eq("id", data.messageId)
        .eq("user_id", userId);
    }

    return { ok: true };
  });

/**
 * Admin: Create a new channel with specific audience target
 */
export const adminCreateChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().min(2).max(40),
        description: z.string().max(250).default(""),
        target_audience: z.enum(["both", "student", "parent"]),
        icon: z.string().default("hash"),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getUserRole(supabase, userId);
    if (role !== "admin") {
      throw new Error("Only administrators can create channels.");
    }

    const slug = data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const { data: channel, error } = await supabase
      .from("chat_channels")
      .insert({
        name: data.name.trim(),
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
        description: data.description.trim(),
        target_audience: data.target_audience,
        icon: data.icon,
        is_default: false,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !channel) {
      throw new Error(error?.message || "Could not create channel.");
    }

    return { channel: channel as ChatChannel };
  });

/**
 * Admin: Delete a channel
 */
export const adminDeleteChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ channelId: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getUserRole(supabase, userId);
    if (role !== "admin") throw new Error("Only administrators can delete channels.");

    await supabase.from("chat_channels").delete().eq("id", data.channelId);
    return { ok: true };
  });

/**
 * Get current user's notebooks with stats to attach/share in chat
 */
export const listMyNotebooksForShare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: notebooks, error } = await supabase
      .from("notebooks")
      .select("id, title, description, subject_code, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !notebooks) return { notebooks: [] };

    // Fetch counts for cards and quizzes
    const nbIds = notebooks.map((n: any) => n.id);
    const [fcRes, qzRes, ntRes] = await Promise.all([
      supabase.from("flashcards").select("notebook_id").in("notebook_id", nbIds),
      supabase.from("quiz_questions").select("notebook_id").in("notebook_id", nbIds),
      supabase.from("notes").select("notebook_id").in("notebook_id", nbIds),
    ]);

    const fcCount: Record<string, number> = {};
    for (const row of fcRes.data ?? []) fcCount[row.notebook_id] = (fcCount[row.notebook_id] || 0) + 1;

    const qzCount: Record<string, number> = {};
    for (const row of qzRes.data ?? []) qzCount[row.notebook_id] = (qzCount[row.notebook_id] || 0) + 1;

    const ntCount: Record<string, number> = {};
    for (const row of ntRes.data ?? []) ntCount[row.notebook_id] = (ntCount[row.notebook_id] || 0) + 1;

    return {
      notebooks: notebooks.map((n: any) => ({
        ...n,
        flashcards_count: fcCount[n.id] || 0,
        quiz_count: qzCount[n.id] || 0,
        notes_count: ntCount[n.id] || 0,
      })),
    };
  });

/**
 * Fetch a shared notebook preview (flashcards & quiz questions) for the chat study preview modal
 */
export const getSharedStudyPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ notebookId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch notebook title & subject
    const { data: nb } = await supabase
      .from("notebooks")
      .select("id, user_id, title, description, subject_code, is_shared")
      .eq("id", data.notebookId)
      .maybeSingle();

    if (!nb) throw new Error("Notebook not found.");
    if (nb.user_id !== userId && !nb.is_shared) {
      throw new Error("This notebook is private and can only be accessed by the user who created it.");
    }

    const [fcRes, qzRes, ntRes] = await Promise.all([
      supabase.from("flashcards").select("id, question, answer, position").eq("notebook_id", data.notebookId).order("position", { ascending: true }).limit(20),
      supabase.from("quiz_questions").select("id, question, options, correct_index, explanation, position").eq("notebook_id", data.notebookId).order("position", { ascending: true }).limit(10),
      supabase.from("notes").select("id, heading, body, position").eq("notebook_id", data.notebookId).order("position", { ascending: true }).limit(10),
    ]);

    return {
      notebook: nb,
      flashcards: fcRes.data ?? [],
      quiz: qzRes.data ?? [],
      notes: ntRes.data ?? [],
    };
  });

/**
 * List all DM conversations for the current user
 */
export const listDMConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    
    // 1. Try dm_conversations table
    try {
      const { data, error } = await supabase
        .from("dm_conversations")
        .select("id, participant_1, participant_2, last_message, last_message_at, created_at")
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order("last_message_at", { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        // Collect all peer user IDs
        const peerIds = data.map((c: any) => c.participant_1 === userId ? c.participant_2 : c.participant_1);
        const uniquePeerIds = [...new Set(peerIds)];
        
        let profiles: any[] = [];
        if (uniquePeerIds.length > 0) {
          const { data: profData } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, student_id")
            .in("id", uniquePeerIds);
          profiles = profData ?? [];
        }

        const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

        const conversations = data.map((c: any) => {
          const peerId = c.participant_1 === userId ? c.participant_2 : c.participant_1;
          const peer = profileMap.get(peerId);
          return {
            id: c.id,
            peerId,
            peerName: peer?.display_name || "Community Member",
            peerAvatar: peer?.avatar_url || null,
            peerStudentId: peer?.student_id || null,
            lastMessage: c.last_message || "",
            lastMessageAt: c.last_message_at || c.created_at,
          };
        });

        return { conversations };
      }
    } catch {
      // Continue to fallback
    }

    // 2. Fallback: check chat_channels with dm- prefix
    try {
      const { data: dmChannels } = await supabase
        .from("chat_channels")
        .select("id, name, slug, description, created_at")
        .ilike("slug", `%dm-%${userId}%`)
        .order("created_at", { ascending: false });

      if (dmChannels && dmChannels.length > 0) {
        const peerIds: string[] = [];
        for (const ch of dmChannels) {
          const parts = ch.slug.replace(/^dm-/, "").split("-");
          const peerId = parts[0] === userId ? parts[1] : parts[0];
          if (peerId) peerIds.push(peerId);
        }

        const uniquePeerIds = [...new Set(peerIds)];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, student_id")
          .in("id", uniquePeerIds);
        const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

        const conversations = dmChannels.map((ch: any) => {
          const parts = ch.slug.replace(/^dm-/, "").split("-");
          const peerId = parts[0] === userId ? parts[1] : parts[0];
          const peer = profileMap.get(peerId);
          return {
            id: ch.id,
            peerId: peerId || ch.id,
            peerName: peer?.display_name || ch.name || "Private Chat",
            peerAvatar: peer?.avatar_url || null,
            peerStudentId: peer?.student_id || null,
            lastMessage: ch.description || "",
            lastMessageAt: ch.created_at,
          };
        });

        return { conversations };
      }
    } catch {
      // Return empty
    }

    return { conversations: [] };
  });

/**
 * Start or find existing DM conversation with another user
 */
export const startDMConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ peerId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.peerId === userId) throw new Error("Cannot start a DM with yourself.");

    // 1. Try dm_conversations table
    try {
      const { data: existing, error: findErr } = await supabase
        .from("dm_conversations")
        .select("id")
        .or(`and(participant_1.eq.${userId},participant_2.eq.${data.peerId}),and(participant_1.eq.${data.peerId},participant_2.eq.${userId})`)
        .maybeSingle();

      if (!findErr && existing) return { conversationId: existing.id };

      if (!findErr) {
        const { data: conv, error: insErr } = await supabase
          .from("dm_conversations")
          .insert({
            participant_1: userId,
            participant_2: data.peerId,
          })
          .select("id")
          .single();

        if (!insErr && conv) return { conversationId: conv.id };
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback to private chat_channels
    try {
      const sorted = [userId, data.peerId].sort();
      const dmSlug = `dm-${sorted[0]}-${sorted[1]}`.toLowerCase();

      const { data: existingChannel } = await supabase
        .from("chat_channels")
        .select("id")
        .eq("slug", dmSlug)
        .maybeSingle();

      if (existingChannel) return { conversationId: existingChannel.id };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: newChan, error: chanErr } = await supabaseAdmin
        .from("chat_channels")
        .insert({
          name: "Direct Message",
          slug: dmSlug,
          description: "Private conversation",
          icon: "mail",
          target_audience: "both",
          is_default: false,
          created_by: userId,
        })
        .select("id")
        .single();

      if (!chanErr && newChan) return { conversationId: newChan.id };
    } catch (e: any) {
      console.error("[startDMConversation error]", e);
    }

    throw new Error("Could not start conversation. Please try again.");
  });

/**
 * List messages in a DM conversation
 */
export const listDMMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string(),
      limit: z.number().min(1).max(100).default(50),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Try dm_messages table
    try {
      const { data: messages, error } = await supabase
        .from("dm_messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .eq("conversation_id", data.conversationId)
        .order("created_at", { ascending: true })
        .limit(data.limit);

      if (!error && messages) {
        const senderIds = [...new Set(messages.map((m: any) => m.sender_id))];
        let profileMap = new Map();
        if (senderIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", senderIds);
          profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
        }

        const formatted = messages.map((m: any) => {
          const prof = profileMap.get(m.sender_id);
          return {
            id: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            content: m.content,
            createdAt: m.created_at,
            senderName: prof?.display_name || (m.sender_id === userId ? "You" : "User"),
            senderAvatar: prof?.avatar_url || null,
            isMine: m.sender_id === userId,
          };
        });

        return { messages: formatted };
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback to chat_channel_messages
    try {
      const { data: chanMsgs, error: cErr } = await supabase
        .from("chat_channel_messages")
        .select("id, channel_id, user_id, content, created_at")
        .eq("channel_id", data.conversationId)
        .order("created_at", { ascending: true })
        .limit(data.limit);

      if (!cErr && chanMsgs) {
        const senderIds = [...new Set(chanMsgs.map((m: any) => m.user_id))];
        let profileMap = new Map();
        if (senderIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", senderIds);
          profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
        }

        const formatted = chanMsgs.map((m: any) => {
          const prof = profileMap.get(m.user_id);
          return {
            id: m.id,
            conversationId: m.channel_id,
            senderId: m.user_id,
            content: m.content,
            createdAt: m.created_at,
            senderName: prof?.display_name || (m.user_id === userId ? "You" : "User"),
            senderAvatar: prof?.avatar_url || null,
            isMine: m.user_id === userId,
          };
        });

        return { messages: formatted };
      }
    } catch {
      // Return empty
    }

    return { messages: [] };
  });

/**
 * Send a DM message
 */
export const sendDMMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string(),
      content: z.string().min(1).max(4000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Try dm_messages table
    try {
      const { data: msg, error } = await supabase
        .from("dm_messages")
        .insert({
          conversation_id: data.conversationId,
          sender_id: userId,
          content: data.content.trim(),
        })
        .select("id, conversation_id, sender_id, content, created_at")
        .single();

      if (!error && msg) {
        await supabase
          .from("dm_conversations")
          .update({
            last_message: data.content.trim().slice(0, 100),
            last_message_at: msg.created_at,
          })
          .eq("id", data.conversationId);

        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", userId)
          .single();

        return {
          message: {
            id: msg.id,
            conversationId: msg.conversation_id,
            senderId: msg.sender_id,
            content: msg.content,
            createdAt: msg.created_at,
            senderName: prof?.display_name || "You",
            senderAvatar: prof?.avatar_url || null,
            isMine: true,
          },
        };
      }
    } catch {
      // Fallback below
    }

    // 2. Fallback to chat_channel_messages
    try {
      const { data: chanMsg, error: cErr } = await supabase
        .from("chat_channel_messages")
        .insert({
          channel_id: data.conversationId,
          user_id: userId,
          content: data.content.trim(),
        })
        .select("id, channel_id, user_id, content, created_at")
        .single();

      if (!cErr && chanMsg) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", userId)
          .single();

        return {
          message: {
            id: chanMsg.id,
            conversationId: chanMsg.channel_id,
            senderId: chanMsg.user_id,
            content: chanMsg.content,
            createdAt: chanMsg.created_at,
            senderName: prof?.display_name || "You",
            senderAvatar: prof?.avatar_url || null,
            isMine: true,
          },
        };
      }
    } catch (e: any) {
      console.error("[sendDMMessage fallback error]", e);
    }

    throw new Error("Failed to send message. Please try again.");
  });

/**
 * Search and list eligible registered community users to start private DMs with
 */
export const listEligibleUsersForDM = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ search: z.string().optional() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      let query = supabase
        .from("profiles")
        .select("id, display_name, avatar_url, student_id")
        .neq("id", userId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (data.search && data.search.trim()) {
        const s = data.search.trim().replace(/[%_]/g, "");
        query = query.or(`display_name.ilike.%${s}%,student_id.ilike.%${s}%`);
      }

      const { data: users, error } = await query;
      if (error || !users) return { users: [] };

      const uids = users.map((u: any) => u.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", uids);

      const roleMap = new Map<string, string>();
      for (const r of roles ?? []) {
        if (r.role === "admin") roleMap.set(r.user_id, "admin");
        else if (r.role === "parent" && roleMap.get(r.user_id) !== "admin") roleMap.set(r.user_id, "parent");
        else if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, "student");
      }

      return {
        users: users.map((u: any) => ({
          id: u.id,
          display_name: u.display_name || "Community Member",
          avatar_url: u.avatar_url || null,
          student_id: u.student_id || null,
          role: roleMap.get(u.id) || "student",
        })),
      };
    } catch {
      return { users: [] };
    }
  });
