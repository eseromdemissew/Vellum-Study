import React, { useState } from "react";
import { BookOpen, Star, Sparkles, Award } from "lucide-react";
import type { UnifiedBook } from "@/lib/library.functions";

interface BookCardProps {
  book: UnifiedBook;
  userGradeLevel?: string | null | undefined;
  onSelect: (book: UnifiedBook) => void;
  savedPage?: number | undefined;
}

export function BookCard({ book, userGradeLevel, onSelect, savedPage }: BookCardProps) {
  const [imageError, setImageError] = useState(false);
  const isUserGrade = userGradeLevel && book.gradeLevel === userGradeLevel;

  return (
    <div
      onClick={() => onSelect(book)}
      className="group relative flex flex-col cursor-pointer overflow-hidden rounded-2xl glass-card border border-border/50 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
    >
      {/* Cover Image Container (2:3 Aspect Ratio) */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted/40">
        {book.coverUrl && !imageError ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            loading="lazy"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* Graceful Fallback Placeholder */
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-card via-muted/30 to-card border-b border-border/40">
            <BookOpen className="size-10 text-muted-foreground/60 mb-2" />
            <span className="line-clamp-3 text-xs font-semibold text-foreground/80" translate="no">
              {book.title}
            </span>
            <span className="mt-1 text-[10px] text-muted-foreground" translate="no">
              {book.author}
            </span>
          </div>
        )}

        {/* Source & Special Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          {book.isNational && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 text-white px-2 py-0.5 text-[10px] font-bold shadow-md backdrop-blur-sm">
              <Award className="size-3" /> National Curriculum
            </span>
          )}
          {book.isFeatured && !book.isNational && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/90 text-primary-foreground px-2 py-0.5 text-[10px] font-bold shadow-md backdrop-blur-sm">
              <Sparkles className="size-3" /> Recommended
            </span>
          )}
          {isUserGrade && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-600/90 text-white px-2 py-0.5 text-[10px] font-bold shadow-md backdrop-blur-sm">
              Your Grade
            </span>
          )}
        </div>

        {/* Source Badge (Bottom-Right) */}
        <div className="absolute bottom-2 right-2 z-10">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold shadow-sm backdrop-blur-md uppercase tracking-wider ${
              book.source === "vellum"
                ? "bg-primary text-primary-foreground"
                : "bg-slate-900/85 text-slate-200 border border-slate-700/60"
            }`}
          >
            {book.source === "vellum" ? "Vellum" : "Open Library"}
          </span>
        </div>

        {/* Progress resume pill */}
        {savedPage && savedPage > 1 && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="rounded-md bg-background/90 text-foreground border border-border/60 px-2 py-0.5 text-[10px] font-mono font-semibold shadow-sm backdrop-blur-md">
              p. {savedPage}
            </span>
          </div>
        )}
      </div>

      {/* Book Metadata Area */}
      <div className="flex flex-1 flex-col justify-between p-3">
        <div>
          <h3
            className="line-clamp-2 font-display text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary transition-colors"
            translate="no"
          >
            {book.title}
          </h3>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground" translate="no">
            {book.author}
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
          <span className="line-clamp-1 max-w-[100px]">
            {book.gradeLevel ? `Grade ${book.gradeLevel}` : book.category || "Education"}
          </span>
          {book.ratingsAverage ? (
            <span className="flex items-center gap-0.5 font-mono text-amber-500 font-bold">
              <Star className="size-3 fill-current" />
              {book.ratingsAverage.toFixed(1)}
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase">
              {book.language?.toUpperCase() || "EN"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
