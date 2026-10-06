import React, { useState, useEffect, useRef } from "react";
import { Play, Maximize, Minimize, AlertCircle, RefreshCw, Pause, Gamepad2, Sparkles } from "lucide-react";

export interface GameDefinition {
  id: string;
  title: string;
  subtitle: string;
  embedUrl: string;
  thumbnailUrl?: string;
  genre: string;
  aspectRatio?: "4/3" | "16/9" | "1/1";
  tags: string[];
  is3D?: boolean;
}

interface GameCardProps {
  game: GameDefinition;
  isLocked: boolean;
  onHeartbeat: (deltaSeconds: number) => void;
  activeGameId: string | null;
  setActiveGameId: (id: string | null) => void;
}

export function GameCard({
  game,
  isLocked,
  onHeartbeat,
  activeGameId,
  setActiveGameId,
}: GameCardProps) {
  const isPlaying = activeGameId === game.id && !isLocked;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isTabFocused, setIsTabFocused] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  // Track fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      const isCurrentFs = document.fullscreenElement === containerRef.current;
      setIsFullscreen(isCurrentFs);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Track window focus and tab visibility
  useEffect(() => {
    const handleVisibility = () => {
      const focused = !document.hidden && document.hasFocus();
      setIsTabFocused(focused);
    };

    window.addEventListener("focus", handleVisibility);
    window.addEventListener("blur", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleVisibility);
      window.removeEventListener("blur", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Heartbeat timer: runs every 15s ONLY while playing, tab is visible, and window has focus
  useEffect(() => {
    if (!isPlaying || !isTabFocused) return;

    const interval = setInterval(() => {
      if (!document.hidden && document.hasFocus()) {
        onHeartbeat(15);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [isPlaying, isTabFocused, onHeartbeat]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen request error:", err);
    }
  };

  const handleStartPlaying = () => {
    if (isLocked) return;
    setIframeError(false);
    setIframeLoading(true);
    setActiveGameId(game.id);
  };

  const handleStopPlaying = () => {
    setActiveGameId(null);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleRestart = () => {
    setIframeLoading(true);
    setIframeError(false);
    setIframeKey((prev) => prev + 1);
  };

  // Iframe load timeout fallback (10 seconds)
  useEffect(() => {
    if (!isPlaying) return;

    const timeout = setTimeout(() => {
      if (iframeLoading) {
        setIframeLoading(false);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [isPlaying, iframeLoading]);

  return (
    <div
      ref={containerRef}
      className={`glass-card group relative flex flex-col overflow-hidden rounded-3xl border border-border/40 transition-all hover:border-primary/40 hover:shadow-xl ${
        isFullscreen ? "h-screen w-screen p-0 rounded-none bg-background z-50 fixed inset-0" : ""
      }`}
    >
      {/* Game Window Area */}
      <div
        className={`relative w-full bg-slate-950/90 overflow-hidden ${
          isFullscreen
            ? "flex-1"
            : game.aspectRatio === "1/1"
            ? "aspect-square"
            : "aspect-[16/10]"
        }`}
      >
        {!isPlaying ? (
          /* Idle Poster Card with Pro Graphics */
          <div className="group relative h-full w-full overflow-hidden">
            {game.thumbnailUrl ? (
              <img
                src={game.thumbnailUrl}
                alt={game.title}
                loading="lazy"
                className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : null}

            {/* Gradient Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/20" />

            {/* Genre Badge */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-slate-950/70 px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase text-primary border border-primary/20 backdrop-blur-md">
              <Sparkles className="size-3" />
              <span>{game.genre}</span>
            </div>

            {/* Tag Badge */}
            {game.genre && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase text-primary border border-primary/30 backdrop-blur-md shadow-xs">
                <span>Play Free</span>
              </div>
            )}

            {/* Content & Play Button */}
            <div className="absolute inset-0 flex flex-col justify-end p-5 text-left z-10">
              <h3 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight leading-snug drop-shadow-md" translate="no">
                {game.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs text-slate-300/90 leading-relaxed max-w-sm">
                {game.subtitle}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={handleStartPlaying}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Play className="size-4 fill-current" />
                  <span>{isLocked ? "Daily Limit Reached" : "Play Now"}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Active Playing State */
          <div className="relative h-full w-full">
            {/* Tab Inactive Warning banner */}
            {!isTabFocused && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-amber-500/95 px-3 py-1 text-xs font-semibold text-slate-950 shadow-lg backdrop-blur-sm animate-in fade-in">
                <Pause className="size-3.5" /> Paused (tab inactive)
              </div>
            )}

            {iframeError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-card">
                <AlertCircle className="size-10 text-destructive mb-2" />
                <h4 className="font-display font-semibold text-foreground">
                  Game load interrupted
                </h4>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  Could not establish connection to the game stream. Please click retry or select another game.
                </p>
                <button
                  onClick={handleRestart}
                  className="mt-4 flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 cursor-pointer"
                >
                  <RefreshCw className="size-3.5" /> Retry
                </button>
              </div>
            ) : (
              <>
                {iframeLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 z-20">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-xs font-medium text-slate-300">Loading {game.title}...</span>
                    </div>
                  </div>
                )}
                <iframe
                  key={iframeKey}
                  src={game.embedUrl}
                  title={game.title}
                  className="h-full w-full border-0"
                  allow="fullscreen; autoplay; gamepad; encrypted-media; xr-spatial-tracking; camera; microphone"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock"
                  onLoad={() => setIframeLoading(false)}
                  onError={() => {
                    setIframeError(true);
                    setIframeLoading(false);
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Card Footer Bar */}
      <div className="flex items-center justify-between border-t border-border/40 bg-card/60 px-4 py-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="font-display text-xs sm:text-sm font-semibold text-foreground truncate" translate="no">
            {game.title}
          </span>
          <div className="hidden sm:flex gap-1">
            {game.tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isPlaying && (
            <>
              <button
                type="button"
                onClick={handleRestart}
                className="flex min-h-[36px] items-center gap-1 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground hover:bg-muted/40 cursor-pointer"
                title="Restart game"
              >
                <RefreshCw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleStopPlaying}
                className="flex min-h-[36px] items-center rounded-lg bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80 cursor-pointer"
              >
                Stop
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground hover:bg-muted/40 cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Play Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize className="size-3.5" /> <span className="hidden sm:inline">Exit</span>
              </>
            ) : (
              <>
                <Maximize className="size-3.5" /> <span className="hidden sm:inline">Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
