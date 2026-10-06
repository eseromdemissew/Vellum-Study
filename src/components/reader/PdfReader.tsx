import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  BookOpen,
  ArrowLeft,
  Lock,
  AlertCircle,
  Maximize,
} from "lucide-react";

import { saveReadingProgress } from "@/lib/library.functions";
import { useLanguage } from "@/lib/i18n";

// Configure PDF worker for Vite bundler
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

interface PdfReaderProps {
  url: string;
  bookId: string;
  bookTitle: string;
  initialPage?: number;
  onClose?: () => void;
}

export function PdfReader({
  url,
  bookId,
  bookTitle,
  initialPage = 1,
  onClose,
}: PdfReaderProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const saveProgressFn = useServerFn(saveReadingProgress);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [fitMode, setFitMode] = useState<"custom" | "width" | "page">("width");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [jumpPageInput, setJumpPageInput] = useState<string>(initialPage.toString());

  // Refs for rendering and touch gestures
  const currentRenderTaskRef = useRef<RenderTask | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; dist: number } | null>(null);
  const saveDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced reading progress saver
  const persistProgress = useCallback(
    (page: number) => {
      if (saveDebounceTimeoutRef.current) clearTimeout(saveDebounceTimeoutRef.current);
      saveDebounceTimeoutRef.current = setTimeout(() => {
        saveProgressFn({ data: { bookRef: bookId, page } }).catch((err) => {
          console.warn("[Reading Progress] Auto-save error:", err);
        });
      }, 1000);
    },
    [bookId, saveProgressFn]
  );

  // Load PDF Document
  const loadPdf = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setIsPasswordProtected(false);

    try {
      const loadingTask = pdfjsLib.getDocument({
        url,
        cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
        cMapPacked: true,
      });

      loadingTask.onPassword = (_updatePassword: (pw: string) => void, reason: number) => {
        if (reason === pdfjsLib.PasswordResponses.NEED_PASSWORD) {
          setIsPasswordProtected(true);
          setErrorMsg("This PDF document is encrypted with a password.");
        }
      };

      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      const safePage = Math.min(Math.max(1, initialPage), doc.numPages);
      setCurrentPage(safePage);
      setJumpPageInput(safePage.toString());
      setLoading(false);
    } catch (err: any) {
      console.error("[PDF Reader] Load error:", err);
      setLoading(false);
      if (err?.name === "PasswordException") {
        setIsPasswordProtected(true);
        setErrorMsg("This document is password protected.");
      } else {
        setErrorMsg(
          err?.message?.includes("403") || err?.message?.includes("Expired")
            ? "Your secure reading session has expired. Please refresh to renew access."
            : "Could not load this document. The file may be corrupt or inaccessible."
        );
      }
    }
  }, [url, initialPage]);

  useEffect(() => {
    loadPdf();
    return () => {
      if (saveDebounceTimeoutRef.current) clearTimeout(saveDebounceTimeoutRef.current);
      if (currentRenderTaskRef.current) {
        currentRenderTaskRef.current.cancel();
      }
    };
  }, [loadPdf]);

  // Render Page to Canvas
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      // Cancel ongoing render task
      if (currentRenderTaskRef.current) {
        currentRenderTaskRef.current.cancel();
        currentRenderTaskRef.current = null;
      }

      try {
        const page = await pdfDoc.getPage(pageNum);
        const container = containerRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        // Base unscaled viewport
        const baseViewport = page.getViewport({ scale: 1.0 });

        // Calculate scale based on fit mode
        let effectiveScale = scale;
        const availableWidth = container.clientWidth - 40;
        const availableHeight = container.clientHeight - 80;

        if (fitMode === "width" && availableWidth > 0) {
          effectiveScale = availableWidth / baseViewport.width;
        } else if (fitMode === "page" && availableWidth > 0 && availableHeight > 0) {
          const scaleW = availableWidth / baseViewport.width;
          const scaleH = availableHeight / baseViewport.height;
          effectiveScale = Math.min(scaleW, scaleH);
        }

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: effectiveScale });

        // Set dimensions for high-DPI displays
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport,
        };

        const renderTask = page.render(renderContext);
        currentRenderTaskRef.current = renderTask;
        await renderTask.promise;

        // Prefetch next page for zero lag
        if (pageNum < pdfDoc.numPages) {
          pdfDoc.getPage(pageNum + 1).catch(() => {});
        }
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.warn("[PDF Render] Error:", err);
        }
      }
    },
    [pdfDoc, scale, fitMode]
  );

  // Trigger render whenever page, scale, or fit mode changes
  useEffect(() => {
    if (!loading && pdfDoc) {
      renderPage(currentPage);
      persistProgress(currentPage);
    }
  }, [loading, pdfDoc, currentPage, renderPage, persistProgress]);

  // Page Navigation Handlers
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      const next = currentPage + 1;
      setCurrentPage(next);
      setJumpPageInput(next.toString());
    }
  }, [currentPage, totalPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      const prev = currentPage - 1;
      setCurrentPage(prev);
      setJumpPageInput(prev.toString());
    }
  }, [currentPage]);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p);
    } else {
      setJumpPageInput(currentPage.toString());
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        goToNextPage();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        goToPrevPage();
      } else if (e.key === "+" || e.key === "=") {
        setFitMode("custom");
        setScale((s) => Math.min(3.0, s + 0.2));
      } else if (e.key === "-") {
        setFitMode("custom");
        setScale((s) => Math.max(0.4, s - 0.2));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextPage, goToPrevPage]);

  // Fullscreen support
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen toggle error:", e);
    }
  };

  useEffect(() => {
    const handleFs = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFs);
    return () => document.removeEventListener("fullscreenchange", handleFs);
  }, []);

  // Touch Swipe & Pinch to Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    if (e.touches.length === 1 && t0) {
      touchStartRef.current = { x: t0.clientX, y: t0.clientY, dist: 0 };
    } else if (e.touches.length === 2 && t0 && t1) {
      const dist = Math.hypot(
        t0.clientX - t1.clientX,
        t0.clientY - t1.clientY
      );
      touchStartRef.current = { x: 0, y: 0, dist };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const t = e.changedTouches[0];
    if (e.changedTouches.length === 1 && touchStartRef.current.dist === 0 && t) {
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      if (Math.abs(dx) > 40 && Math.abs(dy) < 50) {
        if (dx < 0) goToNextPage();
        else goToPrevPage();
      }
    }
    touchStartRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    const t1 = e.touches[1];
    if (e.touches.length === 2 && touchStartRef.current && touchStartRef.current.dist > 0 && t0 && t1) {
      const dist = Math.hypot(
        t0.clientX - t1.clientX,
        t0.clientY - t1.clientY
      );
      const ratio = dist / touchStartRef.current.dist;
      if (Math.abs(ratio - 1) > 0.08) {
        setFitMode("custom");
        setScale((s) => Math.min(3.0, Math.max(0.5, s * ratio)));
        touchStartRef.current.dist = dist;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative flex flex-col bg-background select-none ${
        isFullscreen ? "h-screen w-screen fixed inset-0 z-50 p-0" : "min-h-[85vh] rounded-2xl border border-border/50 shadow-xl overflow-hidden"
      }`}
    >
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border/40 bg-card/80 px-4 py-2.5 backdrop-blur-md gap-2">
        {/* Left: Back / Title */}
        <div className="flex items-center gap-3">
          {onClose ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              <ArrowLeft className="size-4" /> {t("reader.back")}
            </button>
          ) : (
            <Link
              to="/library"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              <ArrowLeft className="size-4" /> {t("reader.back")}
            </Link>
          )}

          <h2 className="max-w-[200px] sm:max-w-xs md:max-w-md truncate text-sm font-semibold text-foreground" translate="no">
            {bookTitle}
          </h2>
        </div>

        {/* Center: Page Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition"
            title={t("reader.prev")}
          >
            <ChevronLeft className="size-4" />
          </button>

          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">{t("reader.page")}</span>
            <input
              type="text"
              value={jumpPageInput}
              onChange={(e) => setJumpPageInput(e.target.value)}
              onBlur={() => setJumpPageInput(currentPage.toString())}
              className="w-10 rounded border border-border bg-background px-1.5 py-0.5 text-center font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground">
              {t("reader.of")} {totalPages || "..."}
            </span>
          </form>

          <button
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition"
            title={t("reader.next")}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Right: Zoom & Fullscreen */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setFitMode("custom");
              setScale((s) => Math.max(0.4, s - 0.2));
            }}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            title={t("reader.zoom_out")}
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="font-mono text-[11px] text-muted-foreground min-w-[3rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => {
              setFitMode("custom");
              setScale((s) => Math.min(3.0, s + 0.2));
            }}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            title={t("reader.zoom_in")}
          >
            <ZoomIn className="size-4" />
          </button>

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          <button
            onClick={() => setFitMode("width")}
            className={`hidden sm:inline-flex rounded-lg px-2 py-1 text-xs font-medium transition ${
              fitMode === "width"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t("reader.fit_width")}
          </button>

          <button
            onClick={() => setFitMode("page")}
            className={`hidden sm:inline-flex rounded-lg px-2 py-1 text-xs font-medium transition ${
              fitMode === "page"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t("reader.fit_page")}
          </button>

          <button
            onClick={toggleFullscreen}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition ml-1"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport Area */}
      <div className="relative flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/20">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="size-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground animate-pulse">{t("reader.loading")}</p>
          </div>
        )}

        {errorMsg && (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
            {isPasswordProtected ? (
              <Lock className="size-12 text-amber-500 mb-3" />
            ) : (
              <AlertCircle className="size-12 text-destructive mb-3" />
            )}
            <h3 className="font-display text-lg font-semibold text-foreground">
              {isPasswordProtected ? "Protected PDF" : t("reader.error")}
            </h3>
            <p className="mt-1.5 text-xs text-muted-foreground">{errorMsg}</p>
            {!isPasswordProtected && (
              <button
                onClick={loadPdf}
                className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow transition hover:brightness-110"
              >
                <RotateCcw className="size-3.5" /> {t("reader.retry")}
              </button>
            )}
          </div>
        )}

        {/* The PDF Page Canvas */}
        <canvas
          ref={canvasRef}
          className={`shadow-2xl rounded-sm transition-opacity duration-200 ${
            loading || errorMsg ? "hidden" : "block"
          }`}
        />

        {/* Floating Controls Overlay when in Fullscreen Mode */}
        {isFullscreen && !loading && !errorMsg && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full bg-slate-900/90 border border-slate-700/80 px-5 py-2 shadow-2xl backdrop-blur-md">
            <button
              onClick={goToPrevPage}
              disabled={currentPage <= 1}
              className="rounded-full p-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="font-mono text-xs font-semibold text-slate-200 min-w-[5rem] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={goToNextPage}
              disabled={currentPage >= totalPages}
              className="rounded-full p-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="h-4 w-px bg-slate-700 mx-1" />
            <button
              onClick={toggleFullscreen}
              className="rounded-full p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              title="Exit Fullscreen"
            >
              <Minimize2 className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
