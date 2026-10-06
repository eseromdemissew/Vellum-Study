import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, AlertCircle, RotateCcw, BookOpen } from "lucide-react";
import { useEffect } from "react";

import { AppShell } from "@/components/AppHeader";
import { PdfReader } from "@/components/reader/PdfReader";
import { getVellumSignedUrl, getReadingProgress } from "@/lib/library.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/read/$bookId")({
  component: ReadVellumBookRoute,
});

function ReadVellumBookRoute() {
  const { bookId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookId);

  const fetchSignedUrl = useServerFn(getVellumSignedUrl);
  const fetchProgress = useServerFn(getReadingProgress);

  // Fetch signed PDF URL
  const {
    data: bookData,
    isLoading: isLoadingUrl,
    error: urlError,
    refetch,
  } = useQuery({
    queryKey: ["vellum-book-signed-url", bookId],
    queryFn: () => fetchSignedUrl({ data: { bookId } }),
    enabled: !!user,
  });

  // Automatically transition curated/archive books to interactive archive reader
  useEffect(() => {
    if (bookData?.ia && !isUuid) {
      navigate({ to: `/read/ol/${encodeURIComponent(bookData.ia)}` });
    }
  }, [bookData, isUuid, navigate]);

  // Fetch saved reading progress
  const { data: progressData } = useQuery({
    queryKey: ["reading-progress", bookId],
    queryFn: () => fetchProgress({ data: { bookRef: bookId } }),
    enabled: !!user,
  });

  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md py-20 px-4 text-center">
          <h2 className="font-display text-xl font-bold">Sign in required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to read books from the Vellum Library.
          </p>
          <Link
            to="/auth"
            className="mt-5 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8 py-4">
        {isLoadingUrl ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
            <div className="size-10 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Preparing secure book reader...</p>
          </div>
        ) : urlError || !bookData?.signedUrl ? (
          <div className="mx-auto max-w-md rounded-2xl glass-card border border-destructive/30 p-8 text-center my-12">
            <AlertCircle className="size-12 text-destructive mx-auto mb-3" />
            <h3 className="font-display text-lg font-semibold text-foreground">
              Unable to open book
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {(urlError as Error)?.message || "Failed to generate secure access to this document."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {bookData?.ia && (
                <Link
                  to={`/read/ol/${encodeURIComponent(bookData.ia)}`}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
                >
                  <BookOpen className="size-3.5" /> Open Digital Archive Reader
                </Link>
              )}
              <button
                onClick={() => refetch()}
                className="flex items-center gap-1.5 rounded-xl bg-secondary px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition"
              >
                <RotateCcw className="size-3.5" /> Try Again
              </button>
              <Link
                to="/library"
                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition"
              >
                <ArrowLeft className="size-3.5" /> Back to Library
              </Link>
            </div>
          </div>
        ) : (
          <PdfReader
            url={bookData.signedUrl}
            bookId={bookId}
            bookTitle={bookData.title}
            initialPage={progressData?.page || 1}
          />
        )}
      </div>
    </AppShell>
  );
}
