import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import {
  Search,
  BookOpen,
  Sparkles,
  Shuffle,
  ChevronRight,
  Filter,
  BookmarkCheck,
  Award,
} from "lucide-react";

import { AppShell } from "@/components/AppHeader";
import { BookCard } from "@/components/library/BookCard";
import { BookDetailDrawer } from "@/components/library/BookDetailDrawer";
import { getLibraryCatalog, type UnifiedBook } from "@/lib/library.functions";
import { getMyProfile } from "@/lib/platform.functions";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "National Curriculum & Textbooks Library — Vellum" },
      {
        name: "description",
        content:
          "Browse Ethiopian national curriculum textbooks for Grades 7 to 12 in Biology, Chemistry, Physics, Mathematics, and Social Sciences. Turn any chapter into flashcards and quizzes.",
      },
      {
        name: "keywords",
        content:
          "Ethiopian textbooks, grade 11 biology, grade 12 physics, grade 10 chemistry, Ethiopian curriculum, digital library, study kits, secondary school textbooks",
      },
      { property: "og:title", content: "National Curriculum & Textbooks Library — Vellum" },
      {
        property: "og:description",
        content:
          "Browse Ethiopian national curriculum textbooks for Grades 7 to 12. Turn any textbook or chapter into interactive study kits.",
      },
      { property: "og:url", content: "https://vellumstudy.vercel.app/library" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "National Curriculum & Textbooks Library — Vellum" },
      {
        name: "twitter:description",
        content:
          "Read official Ethiopian textbooks and turn them into flashcards, quizzes, and revision notes instantly.",
      },
    ],
    links: [{ rel: "canonical", href: "https://vellumstudy.vercel.app/library" }],
  }),
  component: LibraryRoute,
});

// Seeded pseudorandom number generator for daily deterministic shuffle
function seededRandom(seedStr: string) {
  let h = 0xdeadbeef;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 2654435761);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h >>> 0) / 4294967296;
  };
}

function LibraryRoute() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const fetchCatalog = useServerFn(getLibraryCatalog);
  const fetchProfile = useServerFn(getMyProfile);

  // User profile (for student grade level)
  const { data: profileData } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });

  const userGradeLevel = (profileData?.profile as any)?.grade_level || null;

  // Filter & Search states
  const [sourceFilter, setSourceFilter] = useState<"all" | "vellum" | "openlibrary">("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [sortBy, setSortBy] = useState<"recommended" | "title" | "newest" | "popular">("recommended");

  // Selected book for drawer
  const [activeBook, setActiveBook] = useState<UnifiedBook | null>(null);

  // Shuffle seed modifier
  const [shuffleSalt, setShuffleSalt] = useState(0);
  const [seeAllSuggested, setSeeAllSuggested] = useState(false);

  // 400ms Search Debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Query unified library catalog
  const { data: catalogData, isLoading } = useQuery({
    queryKey: [
      "library-catalog",
      sourceFilter,
      debouncedSearch,
      selectedCategory,
      selectedGrade,
      selectedSubject,
      selectedLanguage,
      sortBy,
    ],
    queryFn: () =>
      fetchCatalog({
        data: {
          search: debouncedSearch,
          source: sourceFilter,
          category: selectedCategory,
          gradeLevel: selectedGrade,
          subject: selectedSubject,
          language: selectedLanguage,
          sortBy,
        },
      }),
    enabled: true,
  });

  const allBooks = catalogData?.books || [];
  const progressRows = catalogData?.progress || [];

  // Map progress to quick lookup
  const progressMap = useMemo(() => {
    const map = new Map<string, number>();
    progressRows.forEach((p: { book_ref: string; page: number }) => {
      map.set(p.book_ref, p.page);
    });
    return map;
  }, [progressRows]);

  // 1. "Continue Reading" Books
  const continueReadingBooks = useMemo(() => {
    if (progressRows.length === 0) return [];
    const readRefMap = new Map(progressRows.map((p: any) => [p.book_ref, p.page]));
    return allBooks
      .filter((b) => readRefMap.has(b.id) || (b.ia && readRefMap.has(`ol:${b.ia}`)))
      .slice(0, 6);
  }, [allBooks, progressRows]);

  // 2. "Suggested for You" Books:
  // - National curriculum matching grade_level first
  // - Admin featured books
  // - Top rated Open Library books
  const suggestedBooks = useMemo(() => {
    const list = [...allBooks];
    list.sort((a, b) => {
      const aGradeMatch = userGradeLevel && a.gradeLevel === userGradeLevel ? 1 : 0;
      const bGradeMatch = userGradeLevel && b.gradeLevel === userGradeLevel ? 1 : 0;
      if (aGradeMatch !== bGradeMatch) return bGradeMatch - aGradeMatch;

      if (a.isNational && !b.isNational) return -1;
      if (!a.isNational && b.isNational) return 1;

      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;

      return (b.ratingsAverage || 0) - (a.ratingsAverage || 0);
    });
    return list.slice(0, 10);
  }, [allBooks, userGradeLevel]);

  // 3. "Discover: Handpicked Random" Books:
  // - Quality filtered (has cover, readable, ratings_average >= 3.5 or edition_count >= 10)
  // - Daily seeded shuffle (seed = date + user_id + shuffleSalt)
  const discoverBooks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const seed = `${today}_${user?.id || "guest"}_${shuffleSalt}`;
    const rng = seededRandom(seed);

    // Quality filter
    const qualityFiltered = allBooks.filter(
      (b) =>
        Boolean(b.coverUrl) &&
        b.isReadable &&
        ((b.ratingsAverage && b.ratingsAverage >= 3.5) ||
          (b.editionCount && b.editionCount >= 10) ||
          b.source === "vellum")
    );

    // Fisher-Yates shuffle with seeded rng
    const shuffled = [...qualityFiltered];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const itemI = shuffled[i];
      const itemJ = shuffled[j];
      if (itemI !== undefined && itemJ !== undefined) {
        shuffled[i] = itemJ;
        shuffled[j] = itemI;
      }
    }
    return shuffled;
  }, [allBooks, user?.id, shuffleSalt]);

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-primary font-medium text-xs tracking-wider uppercase">
            <BookOpen className="size-3.5" />
            <span>Digital Library & Ethiopian Curriculum</span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("lib.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            {t("lib.subtitle")}
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="mb-8 flex flex-col gap-4 rounded-2xl glass-card border border-border/50 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("lib.search_placeholder")}
                className="w-full rounded-xl border border-border bg-background/80 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Source Chips */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-muted/60 p-1 border border-border/40">
              <button
                type="button"
                onClick={() => setSourceFilter("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sourceFilter === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("lib.all_sources")}
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter("vellum")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sourceFilter === "vellum"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("lib.vellum_source")}
              </button>
              <button
                type="button"
                onClick={() => setSourceFilter("openlibrary")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sourceFilter === "openlibrary"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("lib.open_library")}
              </button>
            </div>
          </div>

          {/* Secondary Filter Controls */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/40 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Filter className="size-3.5" />
              <span>Filters:</span>
            </div>

            {/* Category */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">{t("lib.category_all")}</option>
              <option value="Textbook">Textbook</option>
              <option value="Reference">Reference</option>
              <option value="Exam Prep">Exam Prep</option>
              <option value="Science">Science</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Literature">Literature</option>
              <option value="History">History</option>
            </select>

            {/* Grade */}
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">{t("lib.grade_all")}</option>
              <option value="9">Grade 9</option>
              <option value="10">Grade 10</option>
              <option value="11">Grade 11</option>
              <option value="12">Grade 12</option>
            </select>

            {/* Language */}
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">{t("lib.lang_all")}</option>
              <option value="en">English</option>
              <option value="am">Amharic (አማርኛ)</option>
              <option value="om">Afaan Oromoo</option>
              <option value="ti">Tigrinya (ትግርኛ)</option>
            </select>

            {/* Sort */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
              >
                <option value="recommended">Recommended</option>
                <option value="title">Title (A-Z)</option>
                <option value="popular">Popularity</option>
                <option value="newest">Publish Year</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 my-8">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col rounded-2xl glass-card border border-border/40 p-3 animate-pulse">
                <div className="aspect-[2/3] w-full rounded-xl bg-muted/60 mb-3" />
                <div className="h-4 w-3/4 rounded bg-muted/60 mb-2" />
                <div className="h-3 w-1/2 rounded bg-muted/40" />
              </div>
            ))}
          </div>
        )}

        {/* 1. Continue Reading Section (If user has progress) */}
        {!isLoading && continueReadingBooks.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <BookmarkCheck className="size-5 text-primary" />
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                {t("lib.continue")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {continueReadingBooks.map((book) => (
                <BookCard
                  key={`continue-${book.id}`}
                  book={book}
                  userGradeLevel={userGradeLevel}
                  onSelect={setActiveBook}
                  savedPage={progressMap.get(book.id) || (book.ia ? progressMap.get(`ol:${book.ia}`) : undefined)}
                />
              ))}
            </div>
          </section>
        )}

        {/* 2. "Suggested for You" Section */}
        {!isLoading && suggestedBooks.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-amber-500" />
                <div>
                  <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                    {t("lib.suggested")}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    National curriculum textbooks and top-rated subjects for your level.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSeeAllSuggested((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {seeAllSuggested ? "Carousel View" : "See all"}
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            {seeAllSuggested ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {suggestedBooks.map((book) => (
                  <BookCard
                    key={`suggested-${book.id}`}
                    book={book}
                    userGradeLevel={userGradeLevel}
                    onSelect={setActiveBook}
                  />
                ))}
              </div>
            ) : (
              /* Horizontal Snap-scroll Carousel */
              <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-none">
                {suggestedBooks.map((book) => (
                  <div
                    key={`carousel-${book.id}`}
                    className="w-40 sm:w-48 shrink-0 snap-start"
                  >
                    <BookCard
                      book={book}
                      userGradeLevel={userGradeLevel}
                      onSelect={setActiveBook}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 3. "Discover: Handpicked Random" Section */}
        {!isLoading && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                  {t("lib.discover")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Quality-filtered reading material with a daily seeded shuffle.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShuffleSalt((s) => s + 1)}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
              >
                <Shuffle className="size-3.5 text-primary" />
                <span>{t("lib.shuffle")}</span>
              </button>
            </div>

            {discoverBooks.length === 0 ? (
              <div className="rounded-2xl glass-card border border-border/50 p-12 text-center my-6">
                <BookOpen className="size-12 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="font-display text-base font-semibold text-foreground">
                  {t("lib.empty")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try clearing your search terms or filter selections.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {discoverBooks.map((book) => (
                  <BookCard
                    key={`discover-${book.id}`}
                    book={book}
                    userGradeLevel={userGradeLevel}
                    onSelect={setActiveBook}
                    savedPage={progressMap.get(book.id) || (book.ia ? progressMap.get(`ol:${book.ia}`) : undefined)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Book Detail Drawer Modal / Bottom Sheet */}
        <BookDetailDrawer
          book={activeBook}
          onClose={() => setActiveBook(null)}
          savedPage={activeBook ? progressMap.get(activeBook.id) || (activeBook.ia ? progressMap.get(`ol:${activeBook.ia}`) : undefined) : undefined}
        />
      </main>
    </AppShell>
  );
}
