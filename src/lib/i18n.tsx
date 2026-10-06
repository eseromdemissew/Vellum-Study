import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { dictionaries } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Check, ChevronDown, Search, X, Sparkles, Languages } from "lucide-react";
import { toast } from "sonner";

export type LanguageCode =
  | "en"
  | "am"
  | "om"
  | "ti"
  | "ar"
  | "fr"
  | "es"
  | "de"
  | "sw"
  | "zh-CN";

export interface LanguageInfo {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  flag: string;
  region: string;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇺🇸", region: "Global / United States" },
  { code: "am", label: "Amharic", nativeLabel: "አማርኛ", flag: "🇪🇹", region: "Ethiopia (ኢትዮጵያ)" },
  { code: "om", label: "Afaan Oromoo", nativeLabel: "Afaan Oromoo", flag: "🇪🇹", region: "Ethiopia / Oromia" },
  { code: "ti", label: "Tigrinya", nativeLabel: "ትግርኛ", flag: "🇪🇹", region: "Ethiopia / Tigray" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", flag: "🇸🇦", region: "Middle East & N. Africa" },
  { code: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷", region: "France & Francophonie" },
  { code: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸", region: "Spain & Latin America" },
  { code: "de", label: "German", nativeLabel: "Deutsch", flag: "🇩🇪", region: "Germany / Europe" },
  { code: "sw", label: "Swahili", nativeLabel: "Kiswahili", flag: "🇰🇪", region: "East Africa (Kenya, Tanzania)" },
  { code: "zh-CN", label: "Chinese", nativeLabel: "简体中文", flag: "🇨🇳", region: "China / Asia" },
];

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
  return match && match[3] ? decodeURIComponent(match[3]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const domain = window.location.hostname;
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  if (domain && domain !== "localhost") {
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; domain=${domain}; SameSite=Lax`;
  }
}

/**
 * Configure and trigger Google Translate to translate every DOM node across all pages
 */
export function applyGoogleTranslate(targetLang: LanguageCode) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const domain = window.location.hostname;
  const isEnglish = targetLang === "en";

  const domains = ["", domain, `.${domain}`];
  if (domain.includes(".")) {
    const parts = domain.split(".");
    if (parts.length >= 2) {
      domains.push(`.${parts.slice(-2).join(".")}`);
    }
  }

  if (isEnglish) {
    // Clear Google Translate cookies
    for (const d of domains) {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; ${d ? `domain=${d};` : ""}`;
    }

    // Attempt to trigger reset in Google combo if active
    const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (combo) {
      combo.value = "en";
      combo.dispatchEvent(new Event("change"));
    }
  } else {
    // Set Google Translate cookie
    const cookieVal = `/en/${targetLang}`;
    for (const d of domains) {
      document.cookie = `googtrans=${cookieVal}; path=/; ${d ? `domain=${d};` : ""}`;
    }

    // If Google combo select is rendered in DOM, trigger change immediately
    const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (combo) {
      combo.value = targetLang;
      combo.dispatchEvent(new Event("change"));
    }
  }
}

function detectInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  try {
    // 1. LocalStorage
    const local = localStorage.getItem("vellum_lang") as LanguageCode | null;
    if (local && SUPPORTED_LANGUAGES.some((l) => l.code === local)) return local;

    // 2. Google Translate cookie
    const goog = getCookie("googtrans");
    if (goog) {
      const parts = goog.split("/");
      const candidate = parts[parts.length - 1] as LanguageCode;
      if (candidate && SUPPORTED_LANGUAGES.some((l) => l.code === candidate)) return candidate;
    }

    // 3. Cookie
    const cookie = getCookie("vellum_lang") as LanguageCode | null;
    if (cookie && SUPPORTED_LANGUAGES.some((l) => l.code === cookie)) return cookie;

    // 4. Browser Language
    const navLangs = navigator.languages ? [...navigator.languages] : [navigator.language];
    for (const raw of navLangs) {
      if (!raw) continue;
      const lower = raw.toLowerCase();
      if (lower.startsWith("am")) return "am";
      if (lower.startsWith("om")) return "om";
      if (lower.startsWith("ti")) return "ti";
      if (lower.startsWith("ar")) return "ar";
      if (lower.startsWith("fr")) return "fr";
      if (lower.startsWith("es")) return "es";
      if (lower.startsWith("de")) return "de";
      if (lower.startsWith("sw")) return "sw";
      if (lower.startsWith("zh")) return "zh-CN";
      if (lower.startsWith("en")) return "en";
    }
  } catch {}
  return "en";
}

interface I18nContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode, persistToProfile?: boolean) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key, fallback) => fallback || key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(detectInitialLanguage);

  useEffect(() => {
    // Sync html lang tag
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }

    // Google Translate Crash Guard for React 19:
    // When Google Translate replaces text nodes with <font> elements directly,
    // React's reconciler throws on removeChild / insertBefore / replaceChild.
    // Monkey-patching Node prototype makes React 19 impervious to translation mutations.
    if (typeof window !== "undefined") {
      const originalRemoveChild = Node.prototype.removeChild;
      Node.prototype.removeChild = function <T extends Node>(child: T): T {
        try {
          return originalRemoveChild.call(this, child) as T;
        } catch (e) {
          if (child.parentNode !== this) {
            return child;
          }
          throw e;
        }
      };

      const originalInsertBefore = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
        try {
          return originalInsertBefore.call(this, newNode, referenceNode) as T;
        } catch (e) {
          if (referenceNode && referenceNode.parentNode !== this) {
            return this.appendChild(newNode) as T;
          }
          throw e;
        }
      };

      const originalReplaceChild = Node.prototype.replaceChild;
      Node.prototype.replaceChild = function <T extends Node>(newChild: Node, oldChild: T): T {
        try {
          return originalReplaceChild.call(this, newChild, oldChild) as T;
        } catch (e) {
          if (oldChild.parentNode !== this) {
            return oldChild;
          }
          throw e;
        }
      };
    }
  }, [language]);

  // Ensure Google Translate reflects the active language upon initial mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      applyGoogleTranslate(language);
    }
  }, []);

  // Sync profile language on auth change
  useEffect(() => {
    let active = true;

    async function checkProfileLanguage(userId: string) {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("language")
          .eq("id", userId)
          .single();
        if (!error && data?.language && SUPPORTED_LANGUAGES.some((l) => l.code === data.language)) {
          if (active) {
            const profileLang = data.language as LanguageCode;
            setLanguageState(profileLang);
            try {
              localStorage.setItem("vellum_lang", profileLang);
              setCookie("vellum_lang", profileLang);
              applyGoogleTranslate(profileLang);
            } catch {}
          }
        }
      } catch {}
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        checkProfileLanguage(session.user.id);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        checkProfileLanguage(data.session.user.id);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setLanguage = (lang: LanguageCode, persistToProfile = true) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("vellum_lang", lang);
      setCookie("vellum_lang", lang);
      if (typeof document !== "undefined") {
        document.documentElement.lang = lang;
      }
    } catch {}

    // Apply Google Translate full-DOM translation engine
    applyGoogleTranslate(lang);

    // If combo isn't present in DOM (e.g. initial cold load), trigger smooth reload to ensure 100% full-page translation
    if (typeof window !== "undefined") {
      const combo = document.querySelector<HTMLSelectElement>(".goog-te-combo");
      if (!combo) {
        setTimeout(() => {
          window.location.reload();
        }, 180);
      }
    }

    if (persistToProfile) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          supabase
            .from("profiles")
            .update({ language: lang })
            .eq("id", data.session.user.id)
            .then(() => {});
        }
      });
    }
  };

  const t = (key: string, fallback?: string): string => {
    const dict = dictionaries[language] || dictionaries.en;
    if (dict && dict[key]) return dict[key];
    const enDict = dictionaries.en;
    if (enDict && enDict[key]) return enDict[key];
    return fallback || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const LanguageProvider = I18nProvider;

export function useI18n() {
  return useContext(I18nContext);
}

export const useLanguage = useI18n;

/**
 * World-class, interactive Language Switcher popover with search and live translation trigger
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = useMemo(() => {
    return SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];
  }, [language]);

  const filteredLanguages = useMemo(() => {
    if (!search.trim()) return SUPPORTED_LANGUAGES;
    const q = search.toLowerCase().trim();
    return SUPPORTED_LANGUAGES.filter(
      (l) =>
        l.label.toLowerCase().includes(q) ||
        l.nativeLabel.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q) ||
        l.region.toLowerCase().includes(q)
    );
  }, [search]);

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (lang: LanguageInfo) => {
    setLanguage(lang.code, true);
    setOpen(false);
    setSearch("");
    if (lang.code === "en") {
      toast.success("Restored English original.");
    } else {
      toast.success(`Switching to ${lang.nativeLabel} (${lang.label}) — Translating page...`);
    }
  };

  return (
    <div className={`relative inline-flex items-center notranslate no-translate ${className}`} translate="no" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="glass-soft flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-foreground transition-all duration-150 hover:bg-muted/80 hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer border border-border/40 shadow-xs"
        aria-label="Select website language"
        aria-expanded={open}
        title={`Current Language: ${currentLang.nativeLabel} (${currentLang.label})`}
      >
        <span className="text-base leading-none select-none">{currentLang.flag}</span>
        <span className="font-display font-bold uppercase tracking-wider text-[11px] text-foreground">
          {currentLang.code === "zh-CN" ? "中文" : currentLang.code.toUpperCase()}
        </span>
        <ChevronDown className={`size-3 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Floating Language Menu */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl glass-card border border-border/50 bg-background/95 p-3 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in-0 zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-border/40 px-1">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Languages className="size-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Choose Language</p>
                <p className="text-[10px] text-muted-foreground">Translates entire page dynamically</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative mt-2.5 mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search language or country..."
              className="w-full rounded-xl bg-muted/50 border border-border/40 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
              autoFocus
            />
          </div>

          {/* Languages List */}
          <div className="max-h-64 overflow-y-auto space-y-1 pr-1 overscroll-contain">
            {filteredLanguages.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No languages found</p>
            ) : (
              filteredLanguages.map((l) => {
                const isSelected = l.code === language;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => handleSelect(l)}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? "bg-primary/15 border border-primary/40 text-primary font-bold shadow-xs"
                        : "hover:bg-muted/60 text-foreground border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg leading-none shrink-0">{l.flag}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold truncate leading-snug">
                            {l.nativeLabel}
                          </p>
                          <span className="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded bg-muted/60 text-muted-foreground">
                            {l.code}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate leading-snug">
                          {l.label} • {l.region}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="size-4 shrink-0 text-primary ml-2 animate-in zoom-in-50" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footnote */}
          <div className="mt-2.5 pt-2 border-t border-border/30 px-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Sparkles className="size-3 text-primary" /> Full-page live translation
            </span>
            <span className="font-mono text-[9px] opacity-70">Vellum i18n</span>
          </div>
        </div>
      )}
    </div>
  );
}
