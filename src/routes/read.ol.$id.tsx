import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  AlertCircle,
  RotateCcw,
  BookOpen,
} from "lucide-react";

import { AppShell } from "@/components/AppHeader";
import { saveReadingProgress } from "@/lib/library.functions";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/read/ol/$id")({
  component: ReadOpenLibraryRoute,
});

function ReadOpenLibraryRoute() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const saveProgressFn = useServerFn(saveReadingProgress);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Save "last opened" in reading_progress with book_ref = 'ol:<id>'
  useEffect(() => {
    if (user && id) {
      saveProgressFn({ data: { bookRef: `ol:${id}`, page: 1 } }).catch(() => {});
    }
  }, [user, id, saveProgressFn]);

  // Fullscreen support
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen toggle error:", err);
    }
  };

  useEffect(() => {
    const handleFs = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFs);
    return () => document.removeEventListener("fullscreenchange", handleFs);
  }, []);

  // Embed timeout fallback (10 seconds)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        // Did not finish loading in 10s
        console.warn("[Internet Archive Embed] Timeout loading ia:", id);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading, id]);

  const cleanId = id.replace(/^ol:/i, "");
  const embedUrl = `https://archive.org/embed/${encodeURIComponent(cleanId)}`;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8 py-4">
        <div
          ref={containerRef}
          className={`flex flex-col bg-background rounded-2xl border border-border/50 shadow-xl overflow-hidden ${
            isFullscreen ? "fixed inset-0 z-50 h-screen w-screen rounded-none p-0" : "min-h-[85vh]"
          }`}
        >
          {/* Reader Top Toolbar */}
          <div className="flex items-center justify-between border-b border-border/40 bg-card/80 px-4 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <Link
                to="/library"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <ArrowLeft className="size-4" /> {t("reader.back")}
              </Link>
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-semibold">
                  Open Library Archive
                </span>
                <span className="font-mono text-xs text-muted-foreground hidden sm:inline" translate="no">
                  {id}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="size-3.5" /> Exit Fullscreen
                  </>
                ) : (
                  <>
                    <Maximize2 className="size-3.5" /> Fullscreen
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Embed Viewport */}
          <div className="relative flex-1 bg-slate-950/40">
            {loading && !loadError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 z-10">
                <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
                <span className="text-xs text-muted-foreground">Connecting to Internet Archive digital library...</span>
              </div>
            )}

            {loadError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-card">
                <AlertCircle className="size-12 text-destructive mb-3" />
                <h3 className="font-display text-lg font-semibold text-foreground">
                  Could not load digital archive embed
                </h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                  The Internet Archive viewer refused to render in this browser session or the book is temporarily reserved.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => {
                      setLoadError(false);
                      setLoading(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
                  >
                    <RotateCcw className="size-3.5" /> {t("reader.retry")}
                  </button>
                  <Link
                    to="/library"
                    className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Back to Library
                  </Link>
                </div>
              </div>
            ) : (
              <iframe
                src={embedUrl}
                title={`Open Library ${id}`}
                className="h-full w-full min-h-[80vh] border-0"
                allow="fullscreen; autoplay"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setLoadError(true);
                }}
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
