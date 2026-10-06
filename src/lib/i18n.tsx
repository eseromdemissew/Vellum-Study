import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dictionaries } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";

export type LanguageCode = "en" | "am" | "om" | "ti";

export interface LanguageInfo {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "am", label: "Amharic", nativeLabel: "አማርኛ" },
  { code: "om", label: "Afaan Oromoo", nativeLabel: "Afaan Oromoo" },
  { code: "ti", label: "Tigrinya", nativeLabel: "ትግርኛ" },
];

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
  return match && match[3] ? decodeURIComponent(match[3]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function detectInitialLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  try {
    // 1. LocalStorage
    const local = localStorage.getItem("vellum_lang") as LanguageCode | null;
    if (local && ["en", "am", "om", "ti"].includes(local)) return local;

    // 2. Cookie
    const cookie = getCookie("vellum_lang") as LanguageCode | null;
    if (cookie && ["en", "am", "om", "ti"].includes(cookie)) return cookie;

    // 3. Browser Language
    const navLangs = navigator.languages ? [...navigator.languages] : [navigator.language];
    for (const raw of navLangs) {
      if (!raw) continue;
      const lower = raw.toLowerCase();
      if (lower.startsWith("am")) return "am";
      if (lower.startsWith("om")) return "om";
      if (lower.startsWith("ti")) return "ti";
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
    // When Google Translate replaces text nodes directly, React crashes trying to removeChild / insertBefore.
    // Monkey-patching handles this seamlessly.
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
    }
  }, [language]);

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
        if (!error && data?.language && ["en", "am", "om", "ti"].includes(data.language)) {
          if (active) {
            const profileLang = data.language as LanguageCode;
            setLanguageState(profileLang);
            try {
              localStorage.setItem("vellum_lang", profileLang);
              setCookie("vellum_lang", profileLang);
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

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useI18n();

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <label htmlFor="vellum-language-select" className="sr-only">
        Select Language
      </label>
      <div className="relative flex items-center min-h-[44px] min-w-[44px]">
        <select
          id="vellum-language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value as LanguageCode)}
          aria-label="Select Language"
          className="glass-soft min-h-[44px] min-w-[44px] rounded-xl px-3 py-2 font-sans text-xs font-semibold text-foreground outline-none transition hover:bg-muted/80 focus:ring-2 focus:ring-primary/60 cursor-pointer border border-border/50 shadow-sm"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} className="bg-background text-foreground py-1">
              {l.nativeLabel} ({l.code.toUpperCase()})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
