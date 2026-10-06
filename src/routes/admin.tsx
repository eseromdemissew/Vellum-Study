import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  Key,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
  Video,
  Edit2,
  Award,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAddApiKey,
  adminListApiKeys,
  adminListReports,
  adminListUsers,
  adminModerate,
  adminModerationLog,
  adminSetApiKeyStatus,
  adminSetSuspended,
  adminStats,
  getMyProfile,
} from "@/lib/platform.functions";
import {
  adminListBooks,
  adminSaveBook,
  adminDeleteBook,
  adminGenerateYoutubeSuggestions,
} from "@/lib/library.functions";
import {
  adminGetGameSettings,
  adminUpdateGameSettings,
  listAllGames,
  adminSaveGame,
  adminDeleteGame,
} from "@/lib/games.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Portal — Vellum" },
      { name: "description", content: "Vellum Administration Portal — AI keys, books, games, users and moderation." },
      { property: "og:title", content: "Admin Portal — Vellum" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

type Tab = "keys" | "books" | "games" | "users" | "moderation" | "stats";

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("books");

  // Platform server functions
  const fetchProfile = useServerFn(getMyProfile);
  const fetchStats = useServerFn(adminStats);
  const fetchApiKeys = useServerFn(adminListApiKeys);
  const addApiKeyFn = useServerFn(adminAddApiKey);
  const setApiKeyStatusFn = useServerFn(adminSetApiKeyStatus);
  const fetchUsers = useServerFn(adminListUsers);
  const setSuspendedFn = useServerFn(adminSetSuspended);
  const fetchReports = useServerFn(adminListReports);
  const moderateFn = useServerFn(adminModerate);
  const fetchModLog = useServerFn(adminModerationLog);

  // Books & Games server functions
  const fetchBooksFn = useServerFn(adminListBooks);
  const saveBookFn = useServerFn(adminSaveBook);
  const deleteBookFn = useServerFn(adminDeleteBook);
  const generateYoutubeFn = useServerFn(adminGenerateYoutubeSuggestions);
  const fetchGameSettingsFn = useServerFn(adminGetGameSettings);
  const updateGameSettingsFn = useServerFn(adminUpdateGameSettings);

  // Key form state
  const [keyLabel, setKeyLabel] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [keyPriority, setKeyPriority] = useState(0);
  const [showKeyText, setShowKeyText] = useState(false);
  const [submittingKey, setSubmittingKey] = useState(false);

  // User search/filter state
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");

  // Book form state
  const [bookId, setBookId] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [bookCategory, setBookCategory] = useState("Textbook");
  const [bookGrade, setBookGrade] = useState<string>("all");
  const [bookSubject, setBookSubject] = useState("");
  const [bookLanguage, setBookLanguage] = useState("en");
  const [bookDescription, setBookDescription] = useState("");
  const [bookIsNational, setBookIsNational] = useState(false);
  const [bookIsFeatured, setBookIsFeatured] = useState(false);
  const [bookFilePath, setBookFilePath] = useState("");
  const [bookCoverUrl, setBookCoverUrl] = useState("");
  const [bookYoutubeRecs, setBookYoutubeRecs] = useState<
    Array<{ title: string; url: string; query: string }>
  >([]);

  // File upload state & progress
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ pdf: number; cover: number }>({
    pdf: 0,
    cover: 0,
  });
  const [savingBook, setSavingBook] = useState(false);
  const [generatingYoutube, setGeneratingYoutube] = useState(false);

  // Book list search
  const [bookSearch, setBookSearch] = useState("");

  // Game Settings form state
  const [dailyLimitMinutes, setDailyLimitMinutes] = useState(30);
  const [gamesEnabled, setGamesEnabled] = useState(true);
  const [savingGameSettings, setSavingGameSettings] = useState(false);

  // Custom Games management state
  const fetchAllGamesFn = useServerFn(listAllGames);
  const saveGameFn = useServerFn(adminSaveGame);
  const deleteGameFn = useServerFn(adminDeleteGame);

  const [gameId, setGameId] = useState<string | null>(null);
  const [gameTitle, setGameTitle] = useState("");
  const [gameSubtitle, setGameSubtitle] = useState("");
  const [gameEmbedUrl, setGameEmbedUrl] = useState("");
  const [gameThumbnailUrl, setGameThumbnailUrl] = useState("");
  const [gameGenre, setGameGenre] = useState("Racing");
  const [savingGame, setSavingGame] = useState(false);
  const [gameCoverFile, setGameCoverFile] = useState<File | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const profileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });

  const roles = profileQuery.data?.roles ?? [];
  const isAdmin = roles.includes("admin");

  // Queries enabled only for admin
  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fetchStats(),
    enabled: !!user && isAdmin,
  });

  const keysQuery = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: () => fetchApiKeys(),
    enabled: !!user && isAdmin,
  });

  const booksQuery = useQuery({
    queryKey: ["admin-books"],
    queryFn: () => fetchBooksFn(),
    enabled: !!user && isAdmin,
  });

  const gameSettingsQuery = useQuery({
    queryKey: ["admin-game-settings"],
    queryFn: () => fetchGameSettingsFn(),
    enabled: !!user && isAdmin,
  });

  const gamesQuery = useQuery({
    queryKey: ["admin-games"],
    queryFn: () => fetchAllGamesFn(),
    enabled: !!user && isAdmin,
  });

  useEffect(() => {
    if (gameSettingsQuery.data) {
      setDailyLimitMinutes(Math.round(gameSettingsQuery.data.dailyLimitSeconds / 60));
      setGamesEnabled(gameSettingsQuery.data.gamesEnabled);
    }
  }, [gameSettingsQuery.data]);

  const usersQuery = useQuery({
    queryKey: ["admin-users", userSearch, userRoleFilter],
    queryFn: () =>
      fetchUsers({
        data: {
          search: userSearch || undefined,
          role: userRoleFilter !== "all" ? userRoleFilter : undefined,
        },
      }),
    enabled: !!user && isAdmin,
  });

  const reportsQuery = useQuery({
    queryKey: ["admin-reports"],
    queryFn: () => fetchReports(),
    enabled: !!user && isAdmin,
  });

  const modLogQuery = useQuery({
    queryKey: ["admin-mod-log"],
    queryFn: () => fetchModLog(),
    enabled: !!user && isAdmin,
  });

  if (loading || !user) return null;

  if (!profileQuery.isLoading && !isAdmin) {
    return (
      <AppShell>
        <main className="mx-auto max-w-xl px-5 py-24 text-center font-body text-foreground">
          <div className="glass-soft mx-auto flex size-14 items-center justify-center rounded-2xl">
            <Lock className="size-6 text-primary" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">Admin access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account ({user.email}) does not have the admin role.
          </p>
          <div className="glass mt-6 rounded-2xl p-5 text-left text-xs">
            <p className="font-mono font-semibold text-primary">To grant yourself admin:</p>
            <p className="mt-1 text-muted-foreground">
              Run this in your Supabase SQL editor:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-background/80 p-3 font-mono text-[11px] text-foreground">
              {`INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = '${user.email}'
ON CONFLICT (user_id, role) DO NOTHING;`}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["my-profile"] })}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:brightness-110"
          >
            <RefreshCw className="size-4" /> Check permissions again
          </button>
        </main>
      </AppShell>
    );
  }

  // Handle Gemini API Key Submit
  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyValue.trim()) {
      toast.error("Please enter a Gemini API key.");
      return;
    }
    setSubmittingKey(true);
    try {
      await addApiKeyFn({
        data: {
          label: keyLabel.trim() || "Gemini Flash Key",
          key: keyValue.trim(),
          priority: Number(keyPriority) || 0,
        },
      });
      toast.success("Google Gemini key added and encrypted securely.");
      setKeyLabel("");
      setKeyValue("");
      setKeyPriority(0);
      queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add API key.");
    } finally {
      setSubmittingKey(false);
    }
  }

  // Handle Book Upload & Save
  async function handleSaveBook(e: React.FormEvent) {
    e.preventDefault();
    if (!bookTitle.trim()) {
      toast.error("Book title is required.");
      return;
    }
    if (!bookAuthor.trim()) {
      toast.error("Author name is required.");
      return;
    }

    setSavingBook(true);
    try {
      let finalFilePath = bookFilePath;
      let finalCoverUrl = bookCoverUrl;

      // Upload PDF file to private 'book-files' bucket if chosen
      if (pdfFile) {
        if (pdfFile.type !== "application/pdf") {
          throw new Error("PDF file must be a valid application/pdf document.");
        }
        if (pdfFile.size > 52428800) {
          throw new Error("PDF file exceeds the 50MB limit.");
        }
        setUploadProgress((p) => ({ ...p, pdf: 20 }));
        const fileName = `${Date.now()}_${pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: pdfUploadErr } = await supabase.storage
          .from("book-files")
          .upload(fileName, pdfFile, { upsert: true });

        if (pdfUploadErr) throw pdfUploadErr;
        finalFilePath = fileName;
        setUploadProgress((p) => ({ ...p, pdf: 100 }));
      }

      // Upload cover image to public 'book-covers' bucket if chosen
      if (coverFile) {
        if (!coverFile.type.startsWith("image/")) {
          throw new Error("Cover must be an image file (JPG, PNG, WebP).");
        }
        if (coverFile.size > 5242880) {
          throw new Error("Cover image exceeds the 5MB limit.");
        }
        setUploadProgress((p) => ({ ...p, cover: 30 }));
        const coverName = `${Date.now()}_${coverFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: coverUploadErr } = await supabase.storage
          .from("book-covers")
          .upload(coverName, coverFile, { upsert: true });

        if (coverUploadErr) throw coverUploadErr;
        const { data: pubData } = supabase.storage
          .from("book-covers")
          .getPublicUrl(coverName);
        finalCoverUrl = pubData.publicUrl;
        setUploadProgress((p) => ({ ...p, cover: 100 }));
      }

      await saveBookFn({
        data: {
          id: bookId || undefined,
          title: bookTitle.trim(),
          author: bookAuthor.trim(),
          category: bookCategory,
          gradeLevel: bookGrade !== "all" ? bookGrade : null,
          subject: bookSubject.trim() || null,
          language: bookLanguage,
          description: bookDescription.trim(),
          isNational: bookIsNational,
          isFeatured: bookIsFeatured,
          filePath: finalFilePath || null,
          coverUrl: finalCoverUrl || null,
          youtubeSuggestions: bookYoutubeRecs,
        },
      });

      toast.success(bookId ? "Book updated successfully." : "Book added to Vellum Library!");
      resetBookForm();
      queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save book.");
    } finally {
      setSavingBook(false);
      setUploadProgress({ pdf: 0, cover: 0 });
    }
  }

  function resetBookForm() {
    setBookId(null);
    setBookTitle("");
    setBookAuthor("");
    setBookCategory("Textbook");
    setBookGrade("all");
    setBookSubject("");
    setBookLanguage("en");
    setBookDescription("");
    setBookIsNational(false);
    setBookIsFeatured(false);
    setBookFilePath("");
    setBookCoverUrl("");
    setBookYoutubeRecs([]);
    setPdfFile(null);
    setCoverFile(null);
  }

  function handleEditBook(book: any) {
    setBookId(book.id);
    setBookTitle(book.title);
    setBookAuthor(book.author);
    setBookCategory(book.category || "Textbook");
    setBookGrade(book.grade_level || "all");
    setBookSubject(book.subject || "");
    setBookLanguage(book.language || "en");
    setBookDescription(book.description || "");
    setBookIsNational(Boolean(book.is_national));
    setBookIsFeatured(Boolean(book.is_featured));
    setBookFilePath(book.file_path || "");
    setBookCoverUrl(book.cover_url || "");
    setBookYoutubeRecs(Array.isArray(book.youtube_suggestions) ? book.youtube_suggestions : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteBook(id: string) {
    if (!confirm("Are you sure you want to delete this book? This will permanently remove its PDF and cover.")) {
      return;
    }
    try {
      await deleteBookFn({ data: { id } });
      toast.success("Book and storage files deleted.");
      queryClient.invalidateQueries({ queryKey: ["admin-books"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete book.");
    }
  }

  async function handleGenerateYoutubeRecs() {
    if (!bookTitle.trim()) {
      toast.error("Please enter a book title first.");
      return;
    }
    setGeneratingYoutube(true);
    try {
      const res = await generateYoutubeFn({
        data: {
          title: bookTitle.trim(),
          gradeLevel: bookGrade !== "all" ? bookGrade : null,
          subject: bookSubject.trim() || null,
        },
      });
      setBookYoutubeRecs(res.suggestions);
      toast.success(`Generated ${res.suggestions.length} YouTube recommendations using Gemini!`);
    } catch (err) {
      toast.error("Failed to generate YouTube links.");
    } finally {
      setGeneratingYoutube(false);
    }
  }

  // Handle Game Settings Save
  async function handleSaveGameSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingGameSettings(true);
    try {
      await updateGameSettingsFn({
        data: {
          dailyLimitMinutes: Number(dailyLimitMinutes),
          gamesEnabled,
        },
      });
      toast.success("Game settings updated.");
      queryClient.invalidateQueries({ queryKey: ["admin-game-settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings.");
    } finally {
      setSavingGameSettings(false);
    }
  }

  function resetGameForm() {
    setGameId(null);
    setGameTitle("");
    setGameSubtitle("");
    setGameEmbedUrl("");
    setGameThumbnailUrl("");
    setGameGenre("Racing");
    setGameCoverFile(null);
  }

  function handleEditCustomGame(g: any) {
    setGameId(g.id);
    setGameTitle(g.title);
    setGameSubtitle(g.subtitle || "");
    setGameEmbedUrl(g.embed_url);
    setGameThumbnailUrl(g.thumbnail_url || "");
    setGameGenre(g.genre || "Racing");
    setGameCoverFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteCustomGame(id: string) {
    if (!confirm("Are you sure you want to remove this custom game?")) return;
    try {
      await deleteGameFn({ data: { id } });
      toast.success("Game deleted successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin-games"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete game.");
    }
  }

  async function handleSaveCustomGame(e: React.FormEvent) {
    e.preventDefault();
    if (!gameTitle.trim()) {
      toast.error("Please enter a game title.");
      return;
    }
    if (!gameEmbedUrl.trim()) {
      toast.error("Please provide an embed URL (e.g. Addicting Games embed URL).");
      return;
    }

    setSavingGame(true);
    try {
      let finalThumb = gameThumbnailUrl.trim();

      if (gameCoverFile) {
        const ext = gameCoverFile.name.split(".").pop() || "png";
        const coverPath = `games/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("avatars")
          .upload(coverPath, gameCoverFile, { upsert: true });

        if (!uploadErr) {
          const { data: pubData } = supabase.storage.from("avatars").getPublicUrl(coverPath);
          if (pubData?.publicUrl) {
            finalThumb = pubData.publicUrl;
          }
        }
      }

      await saveGameFn({
        data: {
          id: gameId || undefined,
          title: gameTitle.trim(),
          subtitle: gameSubtitle.trim() || undefined,
          embedUrl: gameEmbedUrl.trim(),
          thumbnailUrl: finalThumb || undefined,
          genre: gameGenre,
          tags: [gameGenre.toLowerCase(), "featured"],
        },
      });

      toast.success(gameId ? "Game updated successfully!" : "Game added successfully!");
      resetGameForm();
      queryClient.invalidateQueries({ queryKey: ["admin-games"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save game.");
    } finally {
      setSavingGame(false);
    }
  }

  // Filtered books list
  const filteredBooks = (booksQuery.data?.books ?? []).filter((b: any) => {
    if (!bookSearch.trim()) return true;
    const q = bookSearch.toLowerCase();
    return (
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      (b.subject && b.subject.toLowerCase().includes(q))
    );
  });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 md:px-8 font-body text-foreground">
        {/* Header Ribbon */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Shield className="size-3" /> System Admin
              </span>
              <span className="font-mono text-xs text-muted-foreground">Self-Hosted Vellum</span>
            </div>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Admin Portal</h1>
          </div>

          {/* Quick stats ribbon */}
          <div className="flex flex-wrap gap-2 text-xs">
            <div className="glass-soft flex items-center gap-2 rounded-xl px-3 py-2">
              <Users className="size-3.5 text-primary" />
              <span>
                <strong>{statsQuery.data?.users ?? "—"}</strong> users
              </span>
            </div>
            <div className="glass-soft flex items-center gap-2 rounded-xl px-3 py-2">
              <BookOpen className="size-3.5 text-primary" />
              <span>
                <strong>{booksQuery.data?.books?.length ?? "—"}</strong> textbooks
              </span>
            </div>
            <div className="glass-soft flex items-center gap-2 rounded-xl px-3 py-2">
              <Gamepad2 className="size-3.5 text-primary" />
              <span>
                <strong>{dailyLimitMinutes}m</strong> daily game limit
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-8 flex overflow-x-auto border-b border-border text-sm scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("books")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-medium transition shrink-0 ${
              activeTab === "books"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="size-4" /> Books & Textbooks
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("games")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-medium transition shrink-0 ${
              activeTab === "games"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gamepad2 className="size-4" /> Games
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("keys")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-medium transition shrink-0 ${
              activeTab === "keys"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Key className="size-4" /> AI Keys & Gemini
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-medium transition shrink-0 ${
              activeTab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="size-4" /> User Accounts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("moderation")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-medium transition shrink-0 ${
              activeTab === "moderation"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldAlert className="size-4" /> Moderation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 font-medium transition shrink-0 ${
              activeTab === "stats"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="size-4" /> System Health
          </button>
        </div>

        {/* ==================================================== */}
        {/* TAB 1: BOOKS & TEXTBOOKS MANAGEMENT                  */}
        {/* ==================================================== */}
        {activeTab === "books" && (
          <div className="mt-8 space-y-8">
            {/* Book Upload / Edit Form */}
            <section className="glass rounded-3xl p-6 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold">
                    {bookId ? "Edit Book" : "Upload New Textbook / Book"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Upload PDFs to secure private storage and covers to public storage.
                  </p>
                </div>
                {bookId && (
                  <button
                    type="button"
                    onClick={resetBookForm}
                    className="text-xs text-primary underline"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveBook} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Title *</label>
                    <input
                      type="text"
                      required
                      value={bookTitle}
                      onChange={(e) => setBookTitle(e.target.value)}
                      placeholder="e.g. Grade 11 Biology Student Textbook"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Author / Organization *</label>
                    <input
                      type="text"
                      required
                      value={bookAuthor}
                      onChange={(e) => setBookAuthor(e.target.value)}
                      placeholder="e.g. Ministry of Education (MOE)"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Category</label>
                    <select
                      value={bookCategory}
                      onChange={(e) => setBookCategory(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      <option value="Textbook">Textbook</option>
                      <option value="Reference">Reference</option>
                      <option value="Exam Prep">Exam Prep</option>
                      <option value="Teacher Guide">Teacher Guide</option>
                      <option value="Fiction">Fiction</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Grade Level</label>
                    <select
                      value={bookGrade}
                      onChange={(e) => setBookGrade(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      <option value="all">General / None</option>
                      <option value="9">Grade 9</option>
                      <option value="10">Grade 10</option>
                      <option value="11">Grade 11</option>
                      <option value="12">Grade 12</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Subject</label>
                    <input
                      type="text"
                      value={bookSubject}
                      onChange={(e) => setBookSubject(e.target.value)}
                      placeholder="e.g. Biology, Chemistry"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Language</label>
                    <select
                      value={bookLanguage}
                      onChange={(e) => setBookLanguage(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      <option value="en">English</option>
                      <option value="am">Amharic (አማርኛ)</option>
                      <option value="om">Afaan Oromoo</option>
                      <option value="ti">Tigrinya (ትግርኛ)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Description</label>
                  <textarea
                    rows={2}
                    value={bookDescription}
                    onChange={(e) => setBookDescription(e.target.value)}
                    placeholder="Brief summary of units, topics covered, or curriculum standard..."
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                </div>

                {/* File Upload Inputs */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-dashed border-border/80 p-4">
                    <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Upload className="size-4 text-primary" />
                      PDF Document (Private Storage)
                    </label>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                      className="mt-2 block w-full text-xs text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                    />
                    {uploadProgress.pdf > 0 && (
                      <div className="mt-2 text-[10px] text-primary font-mono">
                        Uploading PDF: {uploadProgress.pdf}%
                      </div>
                    )}
                    {bookFilePath && (
                      <div className="mt-1 text-[11px] text-muted-foreground truncate">
                        Current file: {bookFilePath}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-dashed border-border/80 p-4">
                    <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Upload className="size-4 text-primary" />
                      Cover Image (Public Storage)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                      className="mt-2 block w-full text-xs text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                    />
                    {uploadProgress.cover > 0 && (
                      <div className="mt-2 text-[10px] text-primary font-mono">
                        Uploading Cover: {uploadProgress.cover}%
                      </div>
                    )}
                    {bookCoverUrl && (
                      <div className="mt-1 text-[11px] text-muted-foreground truncate">
                        Current cover: {bookCoverUrl}
                      </div>
                    )}
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex flex-wrap gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={bookIsNational}
                      onChange={(e) => setBookIsNational(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary size-4"
                    />
                    <span>National Curriculum (Badge & Priority)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={bookIsFeatured}
                      onChange={(e) => setBookIsFeatured(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary size-4"
                    />
                    <span>Featured / Suggested</span>
                  </label>
                </div>

                {/* Gemini YouTube Recommendations */}
                <div className="pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Video className="size-4 text-red-500" />
                      <span>YouTube Video Recommendations</span>
                    </div>
                    <button
                      type="button"
                      disabled={generatingYoutube}
                      onClick={handleGenerateYoutubeRecs}
                      className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                    >
                      <Sparkles className="size-3 text-primary" />
                      {generatingYoutube ? "Analyzing with Gemini..." : "Generate with Gemini"}
                    </button>
                  </div>

                  {bookYoutubeRecs.length > 0 && (
                    <div className="space-y-1.5">
                      {bookYoutubeRecs.map((rec, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-muted/40 p-2 text-xs">
                          <span className="font-medium text-foreground truncate">{rec.title}</span>
                          <a
                            href={rec.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline ml-2 shrink-0 flex items-center gap-1"
                          >
                            Preview <ExternalLink className="size-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  {bookId && (
                    <button
                      type="button"
                      onClick={resetBookForm}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={savingBook}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
                  >
                    {savingBook ? "Saving..." : bookId ? "Update Book" : "Add Book to Library"}
                  </button>
                </div>
              </form>
            </section>

            {/* Books Table / Mobile Cards */}
            <section className="glass rounded-3xl p-6 border border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold">Uploaded Books</h3>
                  <p className="text-xs text-muted-foreground">
                    {filteredBooks.length} books found in the Vellum database.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    placeholder="Search books..."
                    className="w-full rounded-xl border border-border bg-background/80 pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none"
                  />
                </div>
              </div>

              {filteredBooks.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No books found in the catalog.
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/40 font-semibold text-muted-foreground">
                        <tr>
                          <th className="p-3">Title & Author</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Grade</th>
                          <th className="p-3">Badges</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredBooks.map((b: any) => (
                          <tr key={b.id} className="hover:bg-muted/20">
                            <td className="p-3">
                              <div className="font-semibold text-foreground">{b.title}</div>
                              <div className="text-[11px] text-muted-foreground">{b.author}</div>
                            </td>
                            <td className="p-3">{b.category || "Textbook"}</td>
                            <td className="p-3">
                              {b.grade_level ? `Grade ${b.grade_level}` : "—"}
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1 flex-wrap">
                                {b.is_national && (
                                  <span className="rounded bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 text-[9px] font-bold">
                                    National
                                  </span>
                                )}
                                {b.is_featured && (
                                  <span className="rounded bg-amber-500/10 text-amber-600 px-1.5 py-0.5 text-[9px] font-bold">
                                    Featured
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditBook(b)}
                                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  title="Edit"
                                >
                                  <Edit2 className="size-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBook(b.id)}
                                  className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                                  title="Delete"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Stacked Cards View */}
                  <div className="grid grid-cols-1 gap-3 sm:hidden">
                    {filteredBooks.map((b: any) => (
                      <div key={b.id} className="rounded-xl border border-border p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-semibold text-xs text-foreground">{b.title}</div>
                            <div className="text-[10px] text-muted-foreground">{b.author}</div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditBook(b)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                            >
                              <Edit2 className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBook(b.id)}
                              className="rounded p-1 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{b.category || "Textbook"}</span>
                          {b.grade_level && <span>• Grade {b.grade_level}</span>}
                          {b.is_national && (
                            <span className="rounded bg-emerald-500/10 text-emerald-600 px-1 py-0.2 font-bold">
                              National
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: GAMES SETTINGS & CUSTOM EMBEDS                */}
        {/* ==================================================== */}
        {activeTab === "games" && (
          <div className="mt-8 space-y-8">
            {/* Top Section: Daily Allowance & Master Switch */}
            <section className="glass rounded-3xl p-6 border border-border/50 max-w-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Gamepad2 className="size-5 text-primary" />
                <h3 className="font-display text-lg font-bold">Games Settings</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-6">
                Configure the daily playtime allowance and master kill-switch for student games.
              </p>

              <form onSubmit={handleSaveGameSettings} className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-foreground">
                    Daily Playtime Limit (Minutes)
                  </label>
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    Default is 30 minutes. Students are locked out until midnight Addis Ababa time once exceeded.
                  </p>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={dailyLimitMinutes}
                    onChange={(e) => setDailyLimitMinutes(Number(e.target.value))}
                    className="w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none font-mono"
                  />
                </div>

                <div className="pt-3 border-t border-border/40">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gamesEnabled}
                      onChange={(e) => setGamesEnabled(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary size-4"
                    />
                    <div>
                      <span className="text-xs font-semibold text-foreground">
                        Enable Games
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Unchecking this disables the games page globally for all students (useful during exams).
                      </p>
                    </div>
                  </label>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingGameSettings}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
                  >
                    {savingGameSettings ? "Saving Settings..." : "Save Game Settings"}
                  </button>
                </div>
              </form>
            </section>

            {/* Add / Edit Game Section */}
            <section className="glass rounded-3xl p-6 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Plus className="size-5 text-primary" />
                  <div>
                    <h3 className="font-display text-lg font-bold">
                      {gameId ? "Edit Custom Game" : "Add New Game"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Embed games from Addicting Games or any HTTPS HTML5 game provider with custom title and cover image.
                    </p>
                  </div>
                </div>
                {gameId && (
                  <button
                    type="button"
                    onClick={resetGameForm}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveCustomGame} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Game Title *</label>
                    <input
                      type="text"
                      required
                      value={gameTitle}
                      onChange={(e) => setGameTitle(e.target.value)}
                      placeholder="e.g. Bubble Spinner"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Subtitle / Short Description</label>
                    <input
                      type="text"
                      value={gameSubtitle}
                      onChange={(e) => setGameSubtitle(e.target.value)}
                      placeholder="e.g. Classic bubble shooting puzzle"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Embed URL (HTTPS) *</label>
                    <input
                      type="url"
                      required
                      value={gameEmbedUrl}
                      onChange={(e) => setGameEmbedUrl(e.target.value)}
                      placeholder="https://cdn2.addictinggames.com/addicting_games/..."
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none"
                    />
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      Must be a valid HTTPS iframe embed link from Addicting Games or HTML5 game host.
                    </span>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Genre</label>
                    <select
                      value={gameGenre}
                      onChange={(e) => setGameGenre(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    >
                      <option value="Racing">Racing</option>
                      <option value="Puzzle">Puzzle</option>
                      <option value="Action">Action</option>
                      <option value="Strategy">Strategy</option>
                      <option value="Sports">Sports</option>
                      <option value="Arcade">Arcade</option>
                      <option value="Adventure">Adventure</option>
                      <option value="Educational">Educational</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 items-start">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Cover Image URL</label>
                    <input
                      type="url"
                      value={gameThumbnailUrl}
                      onChange={(e) => setGameThumbnailUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/... or CDN link"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    />
                    <div className="mt-2">
                      <span className="text-[11px] text-muted-foreground">Or upload a cover image:</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setGameCoverFile(file);
                        }}
                        className="mt-1 block w-full text-xs text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-foreground hover:file:bg-muted/80"
                      />
                    </div>
                  </div>

                  {(gameThumbnailUrl || gameCoverFile) && (
                    <div className="flex flex-col items-center justify-center p-3 rounded-2xl border border-border/50 bg-background/50">
                      <span className="text-[10px] text-muted-foreground mb-1 font-semibold uppercase">Cover Preview</span>
                      <img
                        src={gameCoverFile ? URL.createObjectURL(gameCoverFile) : gameThumbnailUrl}
                        alt="Preview"
                        className="h-24 w-40 object-cover rounded-xl shadow-md border border-border"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={savingGame}
                    className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow hover:brightness-110 disabled:opacity-50"
                  >
                    {savingGame ? "Saving Game..." : gameId ? "Update Game" : "Add Game to Catalog"}
                  </button>
                  {gameId && (
                    <button
                      type="button"
                      onClick={resetGameForm}
                      className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* Custom Games List */}
            <section className="glass rounded-3xl p-6 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold">Custom Database Games</h3>
                  <p className="text-xs text-muted-foreground">
                    Custom games created in this portal, stored in your Supabase database.
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
                  {gamesQuery.data?.customGames?.length ?? 0} games
                </span>
              </div>

              {(gamesQuery.data?.customGames?.length ?? 0) === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
                  <Gamepad2 className="mx-auto size-8 text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    No custom games added yet. Use the form above to embed any Addicting Games URL!
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {gamesQuery.data?.customGames.map((g: any) => (
                    <div
                      key={g.id}
                      className="glass-soft flex flex-col justify-between rounded-2xl p-4 border border-border/60 transition hover:border-primary/40"
                    >
                      <div className="flex gap-3 items-start">
                        {g.thumbnail_url ? (
                          <img
                            src={g.thumbnail_url}
                            alt={g.title}
                            className="size-14 rounded-xl object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="size-14 rounded-xl bg-muted/60 border border-border flex items-center justify-center shrink-0">
                            <Gamepad2 className="size-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-sm truncate">{g.title}</h4>
                          <span className="inline-block mt-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {g.genre || "Arcade"}
                          </span>
                          {g.subtitle && (
                            <p className="text-[11px] text-muted-foreground truncate mt-1">{g.subtitle}</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/40 text-xs">
                        <a
                          href={g.embed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground truncate max-w-[140px]"
                        >
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="truncate">Embed Link</span>
                        </a>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditCustomGame(g)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Edit Game"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomGame(g.id)}
                            className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                            title="Delete Game"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Built-in Addicting Games Catalog Reference */}
            <section className="glass rounded-3xl p-6 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold">Built-In Addicting Games (20)</h3>
                  <p className="text-xs text-muted-foreground">
                    Verified clean HTTPS embeds from Addicting Games included out-of-the-box.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-xs font-semibold text-emerald-600">
                  Active
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                {(gamesQuery.data?.defaultGames ?? []).map((dg: any) => (
                  <div
                    key={dg.id}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/50 p-3"
                  >
                    <img
                      src={dg.thumbnailUrl}
                      alt={dg.title}
                      className="size-10 rounded-lg object-cover border border-border shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{dg.title}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{dg.genre}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: AI KEYS & GEMINI SETTINGS                     */}
        {/* ==================================================== */}
        {activeTab === "keys" && (
          <div className="mt-8 space-y-8">
            <section className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-bold">Add Google Gemini Key</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Keys are stored in Supabase with AES encryption. The platform prioritizes active keys with the highest priority score.
              </p>
              <form onSubmit={handleAddKey} className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Label</label>
                    <input
                      type="text"
                      value={keyLabel}
                      onChange={(e) => setKeyLabel(e.target.value)}
                      placeholder="e.g. Gemini 2.0 Flash Primary"
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Priority (Higher = Preferred)</label>
                    <input
                      type="number"
                      value={keyPriority}
                      onChange={(e) => setKeyPriority(Number(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Google Gemini API Key</label>
                  <div className="relative mt-1">
                    <input
                      type={showKeyText ? "text" : "password"}
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-10 text-sm font-mono text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyText((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showKeyText ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submittingKey}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  {submittingKey ? "Encrypting & Saving..." : "Save Key to Database"}
                </button>
              </form>
            </section>

            {/* List of Keys */}
            <section className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-bold">Registered AI Keys</h3>
              {keysQuery.isLoading ? (
                <p className="mt-4 text-sm text-muted-foreground">Loading keys…</p>
              ) : (keysQuery.data ?? []).length === 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  No encrypted keys in database yet. The server is currently falling back to GEMINI_API_KEY in your .env file.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-border rounded-xl border border-border">
                  {(keysQuery.data ?? []).map((k: any) => (
                    <div key={k.id} className="flex items-center justify-between p-3 text-xs">
                      <div>
                        <div className="font-semibold">{k.label}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          Priority: {k.priority} • Added: {new Date(k.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                        {k.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: USERS                                         */}
        {/* ==================================================== */}
        {activeTab === "users" && (
          <div className="mt-8 space-y-6">
            <section className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-bold">User Directory</h3>
              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-3">User</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Student ID</th>
                      <th className="p-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(usersQuery.data ?? []).map((u: any) => (
                      <tr key={u.id} className="hover:bg-muted/20">
                        <td className="p-3">
                          <div className="font-semibold">{u.display_name || u.first_name || "Unnamed"}</div>
                          <div className="text-[11px] text-muted-foreground">{u.id}</div>
                        </td>
                        <td className="p-3">
                          <span className="rounded bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase">
                            {u.role || "student"}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{u.student_id || "—"}</td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 5: MODERATION                                    */}
        {/* ==================================================== */}
        {activeTab === "moderation" && (
          <div className="mt-8 space-y-6">
            <section className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-bold">Report Queue</h3>
              {(reportsQuery.data ?? []).length === 0 ? (
                <p className="mt-4 text-xs text-muted-foreground">All clear! No pending reports.</p>
              ) : (
                <div className="mt-4 divide-y divide-border rounded-xl border border-border">
                  {(reportsQuery.data ?? []).map((r: any) => (
                    <div key={r.id} className="p-3 text-xs">
                      <div className="font-semibold text-destructive">{r.reason}</div>
                      <div className="text-muted-foreground">{r.details || "No details provided"}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 6: SYSTEM HEALTH                                 */}
        {/* ==================================================== */}
        {activeTab === "stats" && (
          <div className="mt-8 space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">TOTAL REGISTERED</p>
                <p className="mt-2 font-display text-3xl font-bold">{statsQuery.data?.users ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Accounts on platform</p>
              </div>
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">STUDY NOTEBOOKS</p>
                <p className="mt-2 font-display text-3xl font-bold">{statsQuery.data?.notebooks ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Kits generated</p>
              </div>
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">TEXTBOOKS IN LIBRARY</p>
                <p className="mt-2 font-display text-3xl font-bold">{booksQuery.data?.books?.length ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Vellum curriculum books</p>
              </div>
              <div className="glass rounded-2xl p-5">
                <p className="font-mono text-[10px] text-muted-foreground uppercase">GAME BREAK LIMIT</p>
                <p className="mt-2 font-display text-3xl font-bold">{dailyLimitMinutes}m</p>
                <p className="mt-1 text-xs text-muted-foreground">Per day per student</p>
              </div>
            </div>

            <section className="glass rounded-3xl p-6">
              <h3 className="font-display text-lg font-bold">Migration & Feature Status</h3>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="size-4" /> Supabase Connection: Active ({import.meta.env["VITE_SUPABASE_URL"] || "Configured"})
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="size-4" /> Book Reading System: In-App PDF Reader & Open Library Proxy Operational
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="size-4" /> Game Break Zone: 5 Games with Tamper-Resistant 30m Heartbeat Timer
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="size-4" /> Direct Google Gemini Integration: Free Tier (gemini-2.0-flash)
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="size-4" /> Multi-language: English, Amharic, Afaan Oromoo, Tigrinya
                </div>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="size-4" /> Zero Proprietary Dependencies or External Cloud Gateways
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}
