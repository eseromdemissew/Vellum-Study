import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  X,
  BookOpen,
  Star,
  Sparkles,
  Award,
  Video,
  ExternalLink,
  Calendar,
  Layers,
  Globe,
  GraduationCap,
} from "lucide-react";
import type { UnifiedBook } from "@/lib/library.functions";
import { useLanguage } from "@/lib/i18n";

interface BookDetailDrawerProps {
  book: UnifiedBook | null;
  onClose: () => void;
  savedPage?: number | undefined;
}

export function BookDetailDrawer({ book, onClose, savedPage }: BookDetailDrawerProps) {
  const { t } = useLanguage();
  const [imageError, setImageError] = useState(false);

  if (!book) return null;

  // Determine read destination
  const isUploadedUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(book.id);
  const canRead = isUploadedUuid || Boolean(book.ia) || Boolean(book.isReadable);
  const readPath = isUploadedUuid
    ? `/read/${book.id}`
    : `/read/ol/${encodeURIComponent(book.ia || book.id)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in p-0 sm:p-4">
      {/* Backdrop click to dismiss */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />

      {/* Drawer / Bottom sheet card */}
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-3xl sm:rounded-3xl glass-card border border-border/60 bg-card p-6 shadow-2xl overflow-y-auto">
        {/* Mobile handle indicator */}
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted-foreground/30 sm:hidden" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
        >
          <X className="size-5" />
        </button>

        {/* Top Section: Cover + Core Info */}
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Cover image (2:3 aspect ratio) */}
          <div className="relative aspect-[2/3] w-36 sm:w-44 shrink-0 overflow-hidden rounded-2xl bg-muted/40 border border-border/50 mx-auto sm:mx-0 shadow-md">
            {book.coverUrl && !imageError ? (
              <img
                src={book.coverUrl}
                alt={book.title}
                onError={() => setImageError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                <BookOpen className="size-12 text-muted-foreground/50 mb-2" />
                <span className="text-xs text-muted-foreground">Cover preview unavailable</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-1 flex-col justify-between">
            <div>
              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    book.source === "vellum"
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-800 text-slate-200 border border-slate-700"
                  }`}
                >
                  {book.source === "vellum" ? "Vellum Library" : "Open Library"}
                </span>

                {book.isNational && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 text-white px-2 py-0.5 text-[10px] font-bold">
                    <Award className="size-3" /> National Curriculum
                  </span>
                )}
                {book.isFeatured && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/90 text-slate-950 px-2 py-0.5 text-[10px] font-bold">
                    <Sparkles className="size-3" /> Recommended
                  </span>
                )}
              </div>

              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground" translate="no">
                {book.title}
              </h2>
              <p className="mt-1 text-sm font-medium text-primary" translate="no">
                {book.author}
              </p>

              {/* Metadata Grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {book.gradeLevel && (
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="size-3.5 text-primary" />
                    <span>Grade {book.gradeLevel}</span>
                  </div>
                )}
                {book.category && (
                  <div className="flex items-center gap-1.5">
                    <Layers className="size-3.5" />
                    <span className="line-clamp-1">{book.category}</span>
                  </div>
                )}
                {book.publishYear && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    <span>Published {book.publishYear}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Globe className="size-3.5" />
                  <span className="uppercase">{book.language || "English"}</span>
                </div>
                {book.ratingsAverage && (
                  <div className="flex items-center gap-1.5">
                    <Star className="size-3.5 text-amber-500 fill-current" />
                    <span className="font-bold text-foreground">
                      {book.ratingsAverage.toFixed(1)} / 5.0
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Read Button */}
            <div className="mt-6">
              {canRead ? (
                <Link
                  to={readPath}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 active:scale-98"
                >
                  <BookOpen className="size-5" />
                  {savedPage && savedPage > 1
                    ? `${t("lib.page_resume")} ${savedPage}`
                    : t("lib.read_now")}
                </Link>
              ) : (
                <div className="rounded-xl bg-muted/60 p-3 text-center text-xs text-muted-foreground border border-border/50">
                  This Open Library edition is not marked for direct public digital borrowing at this time.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {book.description && (
          <div className="mt-6 pt-5 border-t border-border/50">
            <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground mb-2">
              About this Book
            </h4>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
              {book.description}
            </p>
          </div>
        )}

        {/* Educational YouTube Resources */}
        {book.youtubeSuggestions && book.youtubeSuggestions.length > 0 && (
          <div className="mt-6 pt-5 border-t border-border/50">
            <div className="flex items-center gap-2 text-xs uppercase font-bold tracking-wider text-muted-foreground mb-3">
              <Video className="size-4 text-red-500" />
              <span>{t("lib.resources")}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {book.youtubeSuggestions.map((rec, i) => (
                <a
                  key={i}
                  href={rec.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-xl bg-secondary/50 border border-border/60 p-3 text-xs font-medium text-foreground hover:bg-secondary hover:border-primary/40 transition group"
                >
                  <span className="line-clamp-1 pr-2" translate="no">{rec.title}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
