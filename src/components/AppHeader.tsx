import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import {
  LogOut,
  Menu,
  X,
  User,
  Settings,
  Shield,
  Users,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import { AmbientField } from "./AmbientField";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./theme";
import { LanguageSwitcher, useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { getMyProfile } from "@/lib/platform.functions";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: profileData } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => fetchProfile(),
    enabled: !!user,
  });

  const profile = profileData?.profile;
  const roles = profileData?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isParent = roles.includes("parent");
  const isStudent = !isAdmin && !isParent;

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }
    if (profileDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileDropdownOpen]);

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "User";
  const avatarUrl = profile?.avatar_url;
  const initial = (displayName[0] || user?.email?.[0] || "U").toUpperCase();
  const studentId = profile?.student_id;

  function copyStudentId() {
    if (!studentId) return;
    navigator.clipboard.writeText(studentId);
    setCopiedId(true);
    toast.success("Student ID copied to clipboard!");
    setTimeout(() => setCopiedId(false), 2000);
  }

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 md:px-8">
      <div className="glass-soft flex items-center justify-between rounded-2xl px-4 py-2 backdrop-blur-xl border border-border/40 shadow-sm relative">
        {/* Left: Brand Logo (Vellum with .no-translate) */}
        <div className="flex items-center justify-start flex-1 min-w-0">
          <BrandMark to={user ? "/dashboard" : "/"} />
        </div>

        {/* Center: Clean Typographic Nav Links (Centered between Logo & Right controls) */}
        <nav className="hidden md:flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-background/50 border border-border/30 backdrop-blur-md shadow-xs mx-auto">
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
                activeProps={{ className: "text-foreground font-semibold bg-background/80 shadow-xs" }}
              >
                {t("nav.notebooks")}
              </Link>

              <Link
                to="/library"
                className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
                activeProps={{ className: "text-foreground font-semibold bg-background/80 shadow-xs" }}
              >
                {t("nav.library")}
              </Link>

              <Link
                to="/chat"
                className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
                activeProps={{ className: "text-foreground font-semibold bg-background/80 shadow-xs" }}
              >
                Chat
              </Link>

              {/* Games is student-only: hidden for Parent and Admin */}
              {!isAdmin && !isParent && (
                <Link
                  to="/games"
                  className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
                  activeProps={{ className: "text-foreground font-semibold bg-background/80 shadow-xs" }}
                >
                  Games
                </Link>
              )}

              {isParent && (
                <Link
                  to="/parent"
                  className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
                  activeProps={{ className: "text-foreground font-semibold bg-background/80 shadow-xs" }}
                >
                  Parent
                </Link>
              )}
            </>
          ) : (
            <>
              <a
                href="/#how"
                className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
              >
                {t("nav.how_it_works")}
              </a>
              <a
                href="/#outputs"
                className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
              >
                {t("nav.outputs")}
              </a>
              <Link
                to="/library"
                className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
                activeProps={{ className: "text-foreground font-semibold bg-background/80 shadow-xs" }}
              >
                {t("nav.library")}
              </Link>
              <Link
                to="/games"
                className="rounded-full px-3.5 py-1.5 text-xs lg:text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/60"
                activeProps={{ className: "text-foreground font-semibold bg-background/80 shadow-xs" }}
              >
                Games
              </Link>
            </>
          )}
        </nav>

        {/* Right actions: Language Switcher, Theme Toggle & Profile Dropdown */}
        <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0">
          {/* Dynamic Language Switcher */}
          <LanguageSwitcher />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Profile Avatar with Interactive Dropdown (Desktop) */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-full p-0.5 border border-border/50 hover:border-primary/50 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer shadow-xs"
                aria-label="User profile menu"
                aria-expanded={profileDropdownOpen}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="size-8 rounded-full object-cover border border-background shadow-xs"
                  />
                ) : (
                  <div className="size-8 rounded-full bg-gradient-to-tr from-primary to-primary/60 text-primary-foreground font-semibold text-xs flex items-center justify-center shadow-xs">
                    {initial}
                  </div>
                )}
                <ChevronDown className="size-3 text-muted-foreground hidden sm:block mr-1" />
              </button>

              {/* Floating Profile Dropdown Card */}
              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl glass-card border border-border/50 bg-background/95 p-3 shadow-xl backdrop-blur-2xl z-50 animate-in fade-in-0 zoom-in-95">
                  {/* User Profile Summary Header */}
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-muted/40 border border-border/30">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="size-10 rounded-full object-cover border border-primary/30"
                      />
                    ) : (
                      <div className="size-10 rounded-full bg-gradient-to-tr from-primary to-primary/60 text-primary-foreground font-bold text-sm flex items-center justify-center">
                        {initial}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="rounded-full bg-primary/15 text-primary text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                          {isAdmin ? "Admin" : isParent ? "Parent" : "Student"}
                        </span>
                        {profile?.grade_level && (
                          <span className="text-[10px] text-muted-foreground">
                            • Grade {profile.grade_level}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Student ID Badge with Copy (For students) */}
                  {studentId && (
                    <div className="mt-2 flex items-center justify-between rounded-xl px-2.5 py-1.5 bg-background/60 border border-border/40 text-[11px]">
                      <div>
                        <span className="text-[9px] font-mono uppercase text-muted-foreground block">
                          Student ID
                        </span>
                        <span className="font-mono font-semibold text-primary">{studentId}</span>
                      </div>
                      <button
                        type="button"
                        onClick={copyStudentId}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer"
                        title="Copy Student ID"
                      >
                        {copiedId ? (
                          <>
                            <Check className="size-3 text-emerald-500" />
                            <span className="text-emerald-500 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Dropdown Menu Items */}
                  <div className="mt-2 space-y-0.5 border-t border-border/40 pt-2 text-xs">
                    <Link
                      to="/settings"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-foreground/90 hover:text-foreground hover:bg-muted/70 transition font-medium"
                    >
                      <Settings className="size-4 text-muted-foreground" />
                      <span>{t("nav.settings")} & Profile</span>
                    </Link>

                    {isParent && (
                      <Link
                        to="/parent"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-foreground/90 hover:text-foreground hover:bg-muted/70 transition font-medium"
                      >
                        <Users className="size-4 text-primary" />
                        <span>Parent Dashboard</span>
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-primary hover:bg-primary/10 transition font-bold"
                      >
                        <Shield className="size-4 text-primary" />
                        <span>{t("nav.admin")} Portal</span>
                      </Link>
                    )}

                    <div className="pt-1.5 border-t border-border/40">
                      <button
                        type="button"
                        onClick={async () => {
                          setProfileDropdownOpen(false);
                          await signOut();
                          navigate({ to: "/" });
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-destructive hover:bg-destructive/10 transition font-medium cursor-pointer"
                      >
                        <LogOut className="size-4" />
                        <span>{t("nav.sign_out")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition hover:text-foreground min-h-[36px] flex items-center"
              >
                {t("nav.sign_in")}
              </Link>
              <Link
                to="/signup"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 min-h-[36px] flex items-center shadow-xs"
              >
                {t("nav.open_vellum")}
              </Link>
            </div>
          )}

          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="flex sm:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="mt-2 rounded-2xl glass-card border border-border/50 p-4 sm:hidden animate-in slide-in-from-top-2">
          {user && (
            <div className="mb-3 flex items-center gap-3 border-b border-border/40 pb-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="size-9 rounded-full object-cover border border-primary/30"
                />
              ) : (
                <div className="size-9 rounded-full bg-gradient-to-tr from-primary to-primary/60 text-primary-foreground font-bold text-xs flex items-center justify-center">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
                {studentId && (
                  <p className="text-[10px] font-mono text-primary font-semibold">{studentId}</p>
                )}
              </div>
            </div>
          )}

          <nav className="flex flex-col gap-2 text-sm font-medium">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
                >
                  {t("nav.notebooks")}
                </Link>
                <Link
                  to="/library"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
                >
                  {t("nav.library")}
                </Link>
                <Link
                  to="/chat"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
                >
                  Chat & Channels
                </Link>
                {!isAdmin && !isParent && (
                  <Link
                    to="/games"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
                  >
                    Games
                  </Link>
                )}
                {isParent && (
                  <Link
                    to="/parent"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-2.5 py-2 hover:bg-muted text-foreground"
                  >
                    Parent Dashboard
                  </Link>
                )}
                <div className="pt-2 border-t border-border/40 space-y-1">
                  <Link
                    to="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Settings className="size-4" />
                    <span>{t("nav.settings")} & Profile</span>
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-primary font-semibold hover:bg-primary/10"
                    >
                      <Shield className="size-4" />
                      <span>{t("nav.admin")} Portal</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      setMobileMenuOpen(false);
                      await signOut();
                      navigate({ to: "/" });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="size-4" />
                    <span>{t("nav.sign_out")}</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-2.5 py-2.5 hover:bg-muted text-foreground min-h-[44px] flex items-center"
                >
                  {t("nav.sign_in")}
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg bg-primary px-3 py-2.5 text-center text-sm font-semibold text-primary-foreground min-h-[44px] flex items-center justify-center"
                >
                  {t("nav.open_vellum")}
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
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
