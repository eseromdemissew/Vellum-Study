import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { AmbientField } from "./AmbientField";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./theme";
import { useAuth } from "@/hooks/useAuth";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 px-5 pt-4 md:px-8">
      <div className="glass-soft flex items-center justify-between rounded-2xl px-4 py-2.5">
        <BrandMark to={user ? "/dashboard" : "/"} />

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {user ? (
            <Link
              to="/dashboard"
              className="transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              Notebooks
            </Link>
          ) : (
            <>
              <a href="/#how" className="transition-colors hover:text-foreground">
                How it works
              </a>
              <a href="/#outputs" className="transition-colors hover:text-foreground">
                Outputs
              </a>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          ) : (
            <>
              <Link
                to="/auth"
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
              >
                Open Vellum
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen font-body text-foreground">
      <AmbientField />
      <AppHeader />
      {children}
    </div>
  );
}
