import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  Clock,
  AlertTriangle,
  BookOpen,
  Sparkles,
  ShieldAlert,
  Search,
} from "lucide-react";

import { AppShell } from "@/components/AppHeader";
import { GameCard, type GameDefinition } from "@/components/games/GameCard";
import {
  getGameRemainingTime,
  recordGameHeartbeat,
  getAddisAbabaDateString,
  getMsUntilNextAddisMidnight,
  listAllGames,
} from "@/lib/games.functions";
import { ADDICTING_GAMES_CATALOG } from "@/lib/games.data";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Study Break Games & Brain Boosters — Vellum" },
      {
        name: "description",
        content:
          "Take a refreshing and balanced study break with casual web games, puzzles, and logic challenges. Daily playtime limits keep your study sessions productive.",
      },
      { property: "og:title", content: "Study Break Games & Brain Boosters — Vellum" },
      {
        property: "og:description",
        content:
          "Engaging educational and logic games designed for focused study breaks with daily limit tracking.",
      },
      { property: "og:url", content: "https://vellumstudy.vercel.app/games" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Study Break Games — Vellum" },
      {
        name: "twitter:description",
        content: "Quick, fun study break games designed to recharge your focus.",
      },
    ],
    links: [{ rel: "canonical", href: "https://vellumstudy.vercel.app/games" }],
  }),
  component: GamesRoute,
});

const GENRES = ["All", "Racing", "Action", "Puzzle", "Strategy", "Educational", "Arcade", "Casual"];

function GamesRoute() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const fetchRemainingTime = useServerFn(getGameRemainingTime);
  const sendHeartbeatFn = useServerFn(recordGameHeartbeat);
  const fetchAllGamesFn = useServerFn(listAllGames);

  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [, setOfflineQueue] = useState<number[]>([]);
  const warned5MinRef = useRef(false);

  // Load games from DB with fallback to verified Addicting Games catalog
  const { data: allGames = ADDICTING_GAMES_CATALOG } = useQuery({
    queryKey: ["all-games"],
    queryFn: () => fetchAllGamesFn(),
    initialData: ADDICTING_GAMES_CATALOG,
  });

  // Today's date in Addis Ababa timezone
  const todayDate = getAddisAbabaDateString();
  const storageKey = `vellum_game_time_${user?.id || "anon"}_${todayDate}`;

  // Initial remaining seconds from localStorage (if exists) for instant UI
  const [localRemainingSeconds, setLocalRemainingSeconds] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved !== null ? parseInt(saved, 10) : 1800;
    } catch {
      return 1800;
    }
  });

  // Query server for canonical game usage
  const { data: serverTimeData } = useQuery({
    queryKey: ["game-remaining-time", user?.id],
    queryFn: () => fetchRemainingTime(),
    refetchInterval: 30000,
    enabled: !!user,
  });

  // Sync server time to local state & localStorage whenever fresh data arrives
  useEffect(() => {
    if (serverTimeData) {
      setLocalRemainingSeconds(serverTimeData.remainingSeconds);
      try {
        localStorage.setItem(storageKey, serverTimeData.remainingSeconds.toString());
      } catch {}
    }
  }, [serverTimeData, storageKey]);

  // Listen for storage events across other tabs (multi-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue !== null) {
        const updated = parseInt(e.newValue, 10);
        if (!isNaN(updated)) {
          setLocalRemainingSeconds(updated);
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [storageKey]);

  // Heartbeat mutation
  const heartbeatMutation = useMutation({
    mutationFn: async (delta: number) => {
      return await sendHeartbeatFn({ data: { deltaSeconds: delta } });
    },
    onSuccess: (res) => {
      setLocalRemainingSeconds(res.remainingSeconds);
      try {
        localStorage.setItem(storageKey, res.remainingSeconds.toString());
      } catch {}
      queryClient.setQueryData(["game-remaining-time", user?.id], res);
    },
    onError: (err, delta) => {
      console.warn("[Game Heartbeat] Server unreachable, queuing heartbeat delta:", delta);
      setOfflineQueue((prev) => [...prev, delta]);
    },
  });

  // Handle game heartbeat ticks from active game
  const handleGameHeartbeat = (deltaSeconds: number) => {
    if (localRemainingSeconds <= 0) {
      setActiveGameId(null);
      return;
    }

    setLocalRemainingSeconds((prev) => {
      const nextVal = Math.max(0, prev - deltaSeconds);
      try {
        localStorage.setItem(storageKey, nextVal.toString());
      } catch {}
      return nextVal;
    });

    if (user) {
      heartbeatMutation.mutate(deltaSeconds);
    }
  };

  // Warn at 5 minutes remaining
  useEffect(() => {
    if (localRemainingSeconds <= 300 && localRemainingSeconds > 270 && !warned5MinRef.current) {
      warned5MinRef.current = true;
      toast.warning("5 minutes remaining for today's games!", {
        description: "Wrap up your game break and get ready to head back to your study notebooks.",
      });
    }
  }, [localRemainingSeconds]);

  // Real-time countdown to midnight Addis Ababa time
  const [unlockTimeStr, setUnlockTimeStr] = useState("");
  useEffect(() => {
    const updateCountdown = () => {
      const ms = getMsUntilNextAddisMidnight();
      const hrs = Math.floor(ms / (1000 * 60 * 60));
      const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((ms % (1000 * 60)) / 1000);
      setUnlockTimeStr(
        `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      );
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLocked = localRemainingSeconds <= 0;
  const isGloballyDisabled = serverTimeData?.gamesEnabled === false;
  const minutesLeft = Math.ceil(localRemainingSeconds / 60);

  // Filter games based on search query and selected genre
  const filteredGames = useMemo(() => {
    return (allGames as GameDefinition[]).filter((g) => {
      const matchesGenre = selectedGenre === "All" || g.genre.toLowerCase() === selectedGenre.toLowerCase();
      if (!matchesGenre) return false;
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        g.title.toLowerCase().includes(query) ||
        g.subtitle.toLowerCase().includes(query) ||
        g.genre.toLowerCase().includes(query) ||
        (Array.isArray(g.tags) && g.tags.some((tag) => tag.toLowerCase().includes(query)))
      );
    });
  }, [allGames, searchQuery, selectedGenre]);

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Hero Banner */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary font-medium text-xs tracking-wider uppercase">
              <Sparkles className="size-3.5" />
              <span>Study Break & Brain Refresh</span>
            </div>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Games
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-xl">
              Take a fun study break with casual games (drifting, balloon shooter, tower defense, and math puzzles). 30 minutes daily limit.
            </p>
          </div>

          {/* Daily Limit Badge */}
          <div className="flex items-center gap-3 rounded-2xl glass-card border border-border/60 px-4 py-2.5 shadow-sm">
            <Clock className={`size-5 ${isLocked ? "text-destructive" : "text-primary"}`} />
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Time Remaining Today
              </div>
              <div className="font-mono text-base font-bold text-foreground">
                {isLocked ? "0 mins" : `${minutesLeft} mins left today`}
              </div>
            </div>
          </div>
        </div>

        {/* Global Disabled State */}
        {isGloballyDisabled && (
          <div className="mb-8 flex items-center gap-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-5 shrink-0" />
            <p className="text-sm">
              Games are temporarily paused by the platform administrator during exam periods.
            </p>
          </div>
        )}

        {/* 5-minute warning banner */}
        {!isLocked && localRemainingSeconds <= 300 && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 p-3.5 text-amber-600 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0" />
            <p className="text-xs font-medium">
              You have less than 5 minutes left today. Wrap up your game break soon!
            </p>
          </div>
        )}

        {/* Daily Time Expired Overlay Banner */}
        {isLocked && (
          <div className="mb-8 rounded-3xl glass-card border border-destructive/30 p-6 sm:p-8 text-center bg-destructive/5 relative overflow-hidden">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-3">
              <Clock className="size-7" />
            </div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              Daily Limit Reached
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              You have enjoyed your 30 minutes of study break games for today. Great job! Your games will reset at midnight Addis Ababa time.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-background/80 px-4 py-2 border border-border/40 font-mono text-sm">
              <span className="text-muted-foreground text-xs">Unlocks in:</span>
              <span className="font-bold text-primary">{unlockTimeStr || "Tomorrow"}</span>
            </div>
            <div className="mt-6">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow hover:brightness-110"
              >
                <BookOpen className="size-4" /> Return to Study Notebooks
              </Link>
            </div>
          </div>
        )}

        {/* Search & Genre Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Genre Pill Filters */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {GENRES.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenre(genre)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                  selectedGenre === genre
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "glass-fill text-muted-foreground hover:text-foreground hover:bg-muted/70"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search games..."
              className="w-full rounded-full border border-border/50 bg-background/80 pl-9 pr-4 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Games Grid */}
        {filteredGames.length === 0 ? (
          <div className="py-20 text-center glass rounded-3xl p-8 border border-border/40">
            <p className="text-base font-semibold text-foreground">No games match your search</p>
            <p className="mt-1 text-xs text-muted-foreground">Try clearing your search query or selecting All genres.</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedGenre("All");
              }}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                isLocked={isLocked || isGloballyDisabled}
                onHeartbeat={handleGameHeartbeat}
                activeGameId={activeGameId}
                setActiveGameId={setActiveGameId}
              />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
