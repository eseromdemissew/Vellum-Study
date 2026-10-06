import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { askGemini } from "@/lib/gemini.server";

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

export interface UnifiedBook {
  id: string;
  source: "vellum" | "openlibrary";
  title: string;
  author: string;
  coverUrl?: string | null;
  category?: string;
  gradeLevel?: string | null;
  subject?: string | null;
  language: string;
  description?: string;
  isNational?: boolean;
  isFeatured?: boolean;
  publishYear?: number | null;
  editionCount?: number;
  ratingsAverage?: number | null;
  ia?: string | null;
  ebookAccess?: string;
  filePath?: string | null;
  youtubeSuggestions?: Array<{ title: string; url: string; query: string }>;
  isReadable: boolean;
}

// 1-hour in-memory cache for Open Library queries
interface CacheEntry {
  timestamp: number;
  data: UnifiedBook[];
}
const openLibraryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Safe Open Library fetcher with timeout and descriptive User-Agent
async function fetchOpenLibrary(query: string, subject?: string): Promise<UnifiedBook[]> {
  const cacheKey = `${query.toLowerCase().trim()}_${subject?.toLowerCase() || ""}`;
  const cached = openLibraryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const searchParams = new URLSearchParams({
    fields: "key,title,author_name,cover_i,first_publish_year,ia,ebook_access,subject,edition_count,ratings_average,language",
    has_fulltext: "true",
    limit: "100",
  });

  if (query.trim()) {
    searchParams.set("q", query.trim());
  } else if (subject) {
    searchParams.set("subject", subject);
  } else {
    searchParams.set("q", "science OR history OR mathematics OR literature OR geography");
  }

  const url = `https://openlibrary.org/search.json?${searchParams.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "VellumEducationalLibrary/1.0 (contact: info@vellum-study.app; educational non-profit)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Open Library] API responded with status ${res.status}`);
      return [];
    }

    const json = await res.json();
    const docs = Array.isArray(json.docs) ? json.docs : [];

    const mapped: UnifiedBook[] = docs.map((doc: any) => {
      const iaId = Array.isArray(doc.ia) && doc.ia.length > 0 ? doc.ia[0] : (typeof doc.ia === "string" ? doc.ia : null);
      const isReadable = doc.ebook_access === "public" && Boolean(iaId);
      const coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null;
      const subjects = Array.isArray(doc.subject) ? doc.subject.slice(0, 3).join(", ") : undefined;
      const authors = Array.isArray(doc.author_name) ? doc.author_name.join(", ") : "Unknown Author";

      const bookId = doc.key ? doc.key.replace("/works/", "") : (iaId || Math.random().toString(36).substring(7));

      return {
        id: bookId,
        source: "openlibrary",
        title: doc.title || "Untitled",
        author: authors,
        coverUrl,
        category: subjects || "General",
        gradeLevel: null,
        subject: subjects,
        language: Array.isArray(doc.language) && doc.language.length > 0 ? doc.language[0] : "en",
        description: `Open Library edition (${doc.first_publish_year || "Unknown year"}). Available through Internet Archive digital library.`,
        isNational: false,
        isFeatured: (doc.ratings_average && doc.ratings_average >= 4.0) || (doc.edition_count && doc.edition_count > 25),
        publishYear: doc.first_publish_year || null,
        editionCount: doc.edition_count || 1,
        ratingsAverage: doc.ratings_average || null,
        ia: iaId,
        ebookAccess: doc.ebook_access || "unborrowable",
        isReadable,
      };
    });

    // Save to cache
    openLibraryCache.set(cacheKey, { timestamp: Date.now(), data: mapped });
    return mapped;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[Open Library] Request failed or timed out: ${err?.message || err}. Falling back to Vellum uploads only.`);
    return [];
  }
}

// ==========================================
// 1. GET LIBRARY CATALOG (Unified)
// ==========================================
export const getLibraryCatalog = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        search: z.string().default(""),
        source: z.enum(["all", "vellum", "openlibrary"]).default("all"),
        category: z.string().optional(),
        gradeLevel: z.string().optional(),
        subject: z.string().optional(),
        language: z.string().optional(),
        sortBy: z.enum(["recommended", "title", "newest", "popular"]).default("recommended"),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    // Fetch Vellum books from DB (publicly readable)
    let vellumBooks: UnifiedBook[] = [];
    if (data.source === "all" || data.source === "vellum") {
      let query = supabaseAdmin
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });

      if (data.gradeLevel && data.gradeLevel !== "all") {
        query = query.eq("grade_level", data.gradeLevel);
      }
      if (data.language && data.language !== "all") {
        query = query.eq("language", data.language);
      }
      if (data.category && data.category !== "all") {
        query = query.eq("category", data.category);
      }
      if (data.subject && data.subject !== "all") {
        query = query.ilike("subject", `%${data.subject}%`);
      }
      if (data.search.trim()) {
        query = query.or(`title.ilike.%${data.search.trim()}%,author.ilike.%${data.search.trim()}%`);
      }

      const { data: dbBooks, error } = await query;
      if (!error && Array.isArray(dbBooks)) {
        vellumBooks = dbBooks.map((b: any) => ({
          id: b.id,
          source: "vellum",
          title: b.title,
          author: b.author || "Curriculum Bureau",
          coverUrl: b.cover_url,
          category: b.category || "Textbook",
          gradeLevel: b.grade_level,
          subject: b.subject,
          language: b.language || "en",
          description: b.description || "",
          isNational: Boolean(b.is_national),
          isFeatured: Boolean(b.is_featured),
          filePath: b.file_path,
          youtubeSuggestions: Array.isArray(b.youtube_suggestions) ? b.youtube_suggestions : [],
          isReadable: true, // Vellum books with file_path are always readable
          editionCount: 1,
          publishYear: new Date(b.created_at).getFullYear(),
        }));
      }
    }

    // Fetch Open Library books (via server proxy)
    let olBooks: UnifiedBook[] = [];
    if (data.source === "all" || data.source === "openlibrary") {
      olBooks = await fetchOpenLibrary(data.search, data.subject && data.subject !== "all" ? data.subject : undefined);

      // Filter Open Library results locally if filters are applied
      if (data.language && data.language !== "all") {
        olBooks = olBooks.filter((b) => b.language.toLowerCase() === data.language?.toLowerCase());
      }
    }

    // Merge curated 100+ books
    let curatedMatches: UnifiedBook[] = [];
    if (data.source === "all" || data.source === "vellum") {
      try {
        const { CURATED_100_BOOKS } = await import("./books.data");
        curatedMatches = CURATED_100_BOOKS.filter((b) => {
          if (data.gradeLevel && data.gradeLevel !== "all" && b.gradeLevel !== data.gradeLevel) return false;
          if (data.language && data.language !== "all" && b.language.toLowerCase() !== data.language.toLowerCase()) return false;
          if (data.category && data.category !== "all" && b.category.toLowerCase() !== data.category.toLowerCase()) return false;
          if (data.subject && data.subject !== "all" && !b.subject.toLowerCase().includes(data.subject.toLowerCase())) return false;
          if (data.search.trim()) {
            const s = data.search.trim().toLowerCase();
            if (!b.title.toLowerCase().includes(s) && !b.author.toLowerCase().includes(s) && !b.description.toLowerCase().includes(s)) return false;
          }
          return true;
        }).map((b) => ({
          ...b,
          gradeLevel: b.gradeLevel ?? null,
          editionCount: 1,
          ratingsAverage: 4.8,
          ebookAccess: "public",
          isReadable: true,
        }));
      } catch (e) {
        console.warn("[Library] Could not load curated books:", e);
      }
    }

    // Combine sets with deduplication by title
    const seenTitles = new Set<string>();
    const combined: UnifiedBook[] = [];

    for (const b of vellumBooks) {
      const key = b.title.toLowerCase().trim();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        combined.push(b);
      }
    }

    for (const b of curatedMatches) {
      const key = b.title.toLowerCase().trim();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        combined.push(b);
      }
    }

    for (const b of olBooks) {
      const key = b.title.toLowerCase().trim();
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        combined.push(b);
      }
    }

    // Sorting
    if (data.sortBy === "title") {
      combined.sort((a, b) => a.title.localeCompare(b.title));
    } else if (data.sortBy === "newest") {
      combined.sort((a, b) => (b.publishYear || 0) - (a.publishYear || 0));
    } else if (data.sortBy === "popular") {
      combined.sort((a, b) => (b.editionCount || 0) - (a.editionCount || 0));
    } else {
      // Recommended: National curriculum first, then featured, then top rated
      combined.sort((a, b) => {
        if (a.isNational && !b.isNational) return -1;
        if (!a.isNational && b.isNational) return 1;
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return (b.ratingsAverage || 0) - (a.ratingsAverage || 0);
      });
    }

    // Fetch user's reading progress if an authenticated token is passed
    let progressRows: any[] = [];
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      const authHeader = req?.headers?.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        const { data: claimsData } = await supabaseAdmin.auth.getClaims(token);
        const uid = claimsData?.claims?.sub;
        if (uid) {
          const { data: pRows } = await supabaseAdmin
            .from("reading_progress")
            .select("book_ref, page, updated_at")
            .eq("user_id", uid)
            .order("updated_at", { ascending: false });
          if (pRows) progressRows = pRows;
        }
      }
    } catch {
      // Unauthenticated visitor: progress remains empty list
    }

    return {
      books: combined,
      progress: progressRows,
    };
  });

// ==========================================
// 2. GET SIGNED URL FOR VELLUM PDF
// ==========================================
export const getVellumSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        bookId: z.string().min(1),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.bookId);

    // 1. Try uploaded books table if it's a UUID
    if (isUuid) {
      const { data: book } = await ctx.supabase
        .from("books")
        .select("id, title, file_path")
        .eq("id", data.bookId)
        .maybeSingle();

      if (book?.file_path) {
        const { data: signedData, error: signError } = await supabaseAdmin.storage
          .from("book-files")
          .createSignedUrl(book.file_path, 3600);

        if (!signError && signedData?.signedUrl) {
          return {
            signedUrl: signedData.signedUrl,
            title: book.title,
            ia: null as string | null,
          };
        }
      }
    }

    // 2. Check CURATED_100_BOOKS (e.g. bk-001, bk-002, or matching IA identifier)
    try {
      const { CURATED_100_BOOKS } = await import("./books.data");
      const bookLower = data.bookId.toLowerCase().trim();
      const match = CURATED_100_BOOKS.find(
        (b) => b.id.toLowerCase() === bookLower || b.ia?.toLowerCase() === bookLower
      );

      if (match) {
        return {
          signedUrl: `https://archive.org/download/${encodeURIComponent(match.ia)}/${encodeURIComponent(match.ia)}.pdf`,
          title: match.title,
          ia: match.ia,
        };
      }
    } catch (e) {
      console.warn("[Library] Could not check curated books:", e);
    }

    // 3. Fallback for Open Library / Internet Archive IDs directly
    if (!isUuid && data.bookId.length > 1) {
      const cleanId = data.bookId.replace(/^ol:/i, "");
      return {
        signedUrl: `https://archive.org/download/${encodeURIComponent(cleanId)}/${encodeURIComponent(cleanId)}.pdf`,
        title: "Digital Archive Edition",
        ia: cleanId,
      };
    }

    throw new Error("Book not found in library catalog.");
  });

// ==========================================
// 3. READING PROGRESS (Save & Get)
// ==========================================
export const saveReadingProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        bookRef: z.string().min(1),
        page: z.number().int().min(1),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase
      .from("reading_progress")
      .upsert(
        {
          user_id: ctx.userId,
          book_ref: data.bookRef,
          page: data.page,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,book_ref" }
      );

    if (error) {
      console.error("[Reading Progress] Save failed:", error);
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const getReadingProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        bookRef: z.string().min(1),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: row } = await ctx.supabase
      .from("reading_progress")
      .select("page, updated_at")
      .eq("user_id", ctx.userId)
      .eq("book_ref", data.bookRef)
      .maybeSingle();

    return { page: row?.page || 1 };
  });

// ==========================================
// 4. ADMIN BOOK MANAGEMENT
// ==========================================
export const adminListBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);

    const { data: books, error } = await supabaseAdmin
      .from("books")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { books: books || [] };
  });

export const adminSaveBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(1).max(200),
        author: z.string().trim().min(1).max(150),
        category: z.string().default("Textbook"),
        gradeLevel: z.string().nullable().optional(),
        subject: z.string().nullable().optional(),
        language: z.string().default("en"),
        description: z.string().default(""),
        isNational: z.boolean().default(false),
        isFeatured: z.boolean().default(false),
        filePath: z.string().nullable().optional(),
        coverUrl: z.string().nullable().optional(),
        youtubeSuggestions: z
          .array(
            z.object({
              title: z.string(),
              url: z.string(),
              query: z.string(),
            })
          )
          .optional(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);

    const row = {
      title: data.title,
      author: data.author,
      category: data.category,
      grade_level: data.gradeLevel ? (isNaN(parseInt(data.gradeLevel, 10)) ? null : parseInt(data.gradeLevel, 10)) : null,
      subject: data.subject || null,
      language: data.language,
      description: data.description,
      is_national: data.isNational,
      is_featured: data.isFeatured,
      file_path: data.filePath || null,
      cover_url: data.coverUrl || null,
      youtube_suggestions: data.youtubeSuggestions || [],
    };

    if (data.id) {
      let res = await ctx.supabase.from("books").update(row).eq("id", data.id);
      if (res.error) {
        res = await supabaseAdmin.from("books").update(row).eq("id", data.id);
      }
      if (res.error) throw new Error(res.error.message);
      return { ok: true, id: data.id };
    } else {
      let res = await ctx.supabase.from("books").insert(row).select("id").single();
      if (res.error) {
        res = await supabaseAdmin.from("books").insert(row).select("id").single();
      }
      if (res.error) throw new Error(res.error.message);
      return { ok: true, id: res.data?.id };
    }
  });

export const adminDeleteBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);

    // Retrieve file_path and cover_url to clean up storage
    const { data: book } = await supabaseAdmin
      .from("books")
      .select("file_path, cover_url")
      .eq("id", data.id)
      .single();

    if (book) {
      if (book.file_path) {
        await supabaseAdmin.storage.from("book-files").remove([book.file_path]);
      }
      if (book.cover_url && book.cover_url.includes("book-covers/")) {
        const coverFileName = book.cover_url.split("/").pop();
        if (coverFileName) {
          await supabaseAdmin.storage.from("book-covers").remove([coverFileName]);
        }
      }
    }

    let delRes = await ctx.supabase.from("books").delete().eq("id", data.id);
    if (delRes.error) {
      delRes = await supabaseAdmin.from("books").delete().eq("id", data.id);
    }
    if (delRes.error) throw new Error(delRes.error.message);
    return { ok: true };
  });

// ==========================================
// 5. GEMINI YOUTUBE RECOMMENDATIONS GENERATOR
// ==========================================
export const adminGenerateYoutubeSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        title: z.string().min(1),
        gradeLevel: z.string().nullable().optional(),
        subject: z.string().nullable().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireAdmin(ctx);

    const prompt = `You are an educational video curator for Ethiopian students.
For the textbook / book titled: "${data.title}"
Grade level: ${data.gradeLevel || "General"}
Subject: ${data.subject || "General Science & Education"}

Provide 3 high-quality educational video topics or playlist search recommendations on YouTube that help students understand this subject.
Return ONLY valid JSON matching this schema:
[
  {
    "title": "Clear descriptive video or lesson title",
    "query": "Exact YouTube search query for students to find this lesson",
    "url": "https://www.youtube.com/results?search_query=..."
  }
]
No extra markdown or commentary outside the JSON array.`;

    try {
      const responseText = await askGemini(prompt, { temperature: 0.2 });
      const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
      const suggestions = JSON.parse(cleanJson);
      return { suggestions: Array.isArray(suggestions) ? suggestions : [] };
    } catch (err: any) {
      console.error("[Gemini YouTube Suggestions] Error:", err);
      // Fallback safe queries
      const safeQuery = encodeURIComponent(`${data.title} Grade ${data.gradeLevel || ""} education lesson`);
      return {
        suggestions: [
          {
            title: `${data.title} — Video Lessons & Tutorials`,
            query: `${data.title} curriculum tutorial`,
            url: `https://www.youtube.com/results?search_query=${safeQuery}`,
          },
        ],
      };
    }
  });
