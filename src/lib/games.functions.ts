import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Ctx = { supabase: any; userId: string };

async function requireAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin")) {
    throw new Error("Forbidden: Admin access required");
  }
}

// Get current date string (YYYY-MM-DD) in Africa/Addis_Ababa timezone
export function getAddisAbabaDateString(): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Addis_Ababa",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date()); // Formats as YYYY-MM-DD
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

// Calculate milliseconds until next midnight in Africa/Addis_Ababa
export function getMsUntilNextAddisMidnight(): number {
  const now = new Date();
  const dateStr = getAddisAbabaDateString();
  // Construct tomorrow midnight in UTC or local
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  tomorrow.setHours(0, 0, 0, 0);
  return Math.max(0, tomorrow.getTime() - now.getTime());
}

async function getGameSettingsFromDb(): Promise<{ dailyLimitSeconds: number; gamesEnabled: boolean }> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "game_settings")
      .maybeSingle();

    const val = data?.value as any;
    const minutes = typeof val?.daily_limit_minutes === "number" ? val.daily_limit_minutes : 30;
    const enabled = typeof val?.games_enabled === "boolean" ? val.games_enabled : true;

    return {
      dailyLimitSeconds: minutes * 60,
      gamesEnabled: enabled,
    };
  } catch (e) {
    return {
      dailyLimitSeconds: 30 * 60,
      gamesEnabled: true,
    };
  }
}

// ==========================================
// 1. GET GAME REMAINING TIME
// ==========================================
export const getGameRemainingTime = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const today = getAddisAbabaDateString();
    const settings = await getGameSettingsFromDb();

    const { data: usageRow } = await ctx.supabase
      .from("game_usage")
      .select("seconds")
      .eq("user_id", ctx.userId)
      .eq("day", today)
      .maybeSingle();

    const usedSeconds = usageRow?.seconds || 0;
    const remainingSeconds = Math.max(0, settings.dailyLimitSeconds - usedSeconds);

    return {
      today,
      usedSeconds,
      remainingSeconds,
      limitSeconds: settings.dailyLimitSeconds,
      isLocked: remainingSeconds <= 0,
      gamesEnabled: settings.gamesEnabled,
    };
  });

// ==========================================
// 2. RECORD GAME HEARTBEAT (15s interval)
// ==========================================
export const recordGameHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        deltaSeconds: z.number().int().min(1).max(20), // Max 20s per heartbeat to prevent spoofing
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const today = getAddisAbabaDateString();
    const settings = await getGameSettingsFromDb();

    if (!settings.gamesEnabled) {
      return {
        remainingSeconds: 0,
        isLocked: true,
        gamesEnabled: false,
        message: "Games are currently disabled by administrator",
      };
    }

    // Fetch existing usage
    const { data: usageRow } = await ctx.supabase
      .from("game_usage")
      .select("seconds")
      .eq("user_id", ctx.userId)
      .eq("day", today)
      .maybeSingle();

    const currentSeconds = usageRow?.seconds || 0;
    const newSeconds = currentSeconds + data.deltaSeconds;

    // Upsert new usage
    const { error } = await ctx.supabase.from("game_usage").upsert(
      {
        user_id: ctx.userId,
        day: today,
        seconds: newSeconds,
      },
      { onConflict: "user_id,day" }
    );

    if (error) {
      console.error("[Game Heartbeat] Failed to save usage:", error);
    }

    const remainingSeconds = Math.max(0, settings.dailyLimitSeconds - newSeconds);

    return {
      today,
      usedSeconds: newSeconds,
      remainingSeconds,
      limitSeconds: settings.dailyLimitSeconds,
      isLocked: remainingSeconds <= 0,
      gamesEnabled: settings.gamesEnabled,
    };
  });

// ==========================================
// 3. ADMIN GAME SETTINGS (Get & Update)
// ==========================================
export const adminGetGameSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);
    return await getGameSettingsFromDb();
  });

export const adminUpdateGameSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        dailyLimitMinutes: z.number().int().min(5).max(180),
        gamesEnabled: z.boolean(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);

    const val = {
      daily_limit_minutes: data.dailyLimitMinutes,
      games_enabled: data.gamesEnabled,
    };

    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key: "game_settings",
        value: val,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) throw new Error(error.message);
    return { ok: true, settings: val };
  });

// ==========================================
// 4. LIST & MANAGE GAMES (Addicting Games + Custom DB)
// ==========================================
export const listAllGames = createServerFn({ method: "GET" })
  .handler(async () => {
    const { ADDICTING_GAMES_CATALOG } = await import("./games.data");
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dbGames, error } = await supabaseAdmin
        .from("games")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(dbGames) && dbGames.length > 0) {
        const customMapped = dbGames.map((g: any) => ({
          id: g.id,
          title: g.title,
          subtitle: g.subtitle || "",
          embedUrl: g.embed_url,
          thumbnailUrl: g.thumbnail_url || "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80",
          genre: g.genre || "Casual",
          tags: Array.isArray(g.tags) ? g.tags : [g.genre || "Casual"],
        }));
        // Custom admin games first, then default Addicting Games catalog
        return [...customMapped, ...ADDICTING_GAMES_CATALOG];
      }
    } catch (e) {
      console.warn("[Games] DB games fetch failed, using default catalog:", e);
    }

    return ADDICTING_GAMES_CATALOG;
  });

export const adminSaveGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(1).max(100),
        subtitle: z.string().trim().max(300).default(""),
        embedUrl: z.string().trim().url(),
        thumbnailUrl: z.string().trim().default(""),
        genre: z.string().trim().default("Casual"),
        tags: z.array(z.string()).default([]),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);

    const payload = {
      title: data.title,
      subtitle: data.subtitle,
      embed_url: data.embedUrl,
      thumbnail_url: data.thumbnailUrl,
      genre: data.genre,
      tags: data.tags.length ? data.tags : [data.genre],
      created_by: ctx.userId,
    };

    let result;
    if (data.id) {
      result = await ctx.supabase.from("games").update(payload).eq("id", data.id);
      if (result.error) {
        result = await supabaseAdmin.from("games").update(payload).eq("id", data.id);
      }
    } else {
      result = await ctx.supabase.from("games").insert(payload);
      if (result.error) {
        result = await supabaseAdmin.from("games").insert(payload);
      }
    }

    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

export const adminDeleteGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);

    let result = await ctx.supabase.from("games").delete().eq("id", data.id);
    if (result.error) {
      result = await supabaseAdmin.from("games").delete().eq("id", data.id);
    }
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });
