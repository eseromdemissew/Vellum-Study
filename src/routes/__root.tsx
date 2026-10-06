import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "../hooks/useAuth";
import { ThemeProvider, themeBootstrapScript } from "../components/theme";
import { LanguageProvider } from "../lib/i18n";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 font-display text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[Root Error]", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
          >
            Try again
          </button>
          <a
            href="/"
            className="glass-soft inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const SITE_URL = "https://vellumstudy.vercel.app";
const GOOGLE_VERIFICATION =
  (typeof process !== "undefined" && process.env?.VITE_GOOGLE_SITE_VERIFICATION) ||
  import.meta.env.VITE_GOOGLE_SITE_VERIFICATION ||
  "";
const BING_VERIFICATION =
  (typeof process !== "undefined" && process.env?.VITE_BING_SITE_VERIFICATION) ||
  import.meta.env.VITE_BING_SITE_VERIFICATION ||
  "";
const GA_ID =
  (typeof process !== "undefined" && process.env?.VITE_GA_MEASUREMENT_ID) ||
  import.meta.env.VITE_GA_MEASUREMENT_ID ||
  "";
const GTM_ID =
  (typeof process !== "undefined" && process.env?.VITE_GTM_ID) ||
  import.meta.env.VITE_GTM_ID ||
  "";

const jsonLdSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Vellum",
      alternateName: "Vellum AI Study Notebooks",
      description:
        "Turn any document, textbook, or topic into interactive flashcards, unlimited self-testing quizzes, and revision notes.",
      publisher: {
        "@id": `${SITE_URL}/#organization`,
      },
      author: {
        "@type": "Person",
        name: "Eserom Demissew",
        url: "https://eserom.vercel.app",
      },
      creator: {
        "@type": "Person",
        name: "Eserom Demissew",
        url: "https://eserom.vercel.app",
      },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/library?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "EducationalOrganization",
      "@id": `${SITE_URL}/#organization`,
      name: "Vellum",
      url: SITE_URL,
      logo: `${SITE_URL}/vellum-logo.png`,
      sameAs: ["https://twitter.com/VellumStudy"],
      founder: {
        "@type": "Person",
        name: "Eserom Demissew",
        url: "https://eserom.vercel.app",
      },
      description: "AI study notebooks and Ethiopian national curriculum digital library.",
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#application`,
      name: "Vellum",
      url: SITE_URL,
      applicationCategory: "EducationalApplication",
      operatingSystem: "All",
      browserRequirements: "Requires JavaScript. Requires HTML5.",
      author: {
        "@type": "Person",
        name: "Eserom Demissew",
        url: "https://eserom.vercel.app",
      },
      creator: {
        "@type": "Person",
        name: "Eserom Demissew",
        url: "https://eserom.vercel.app",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        ratingCount: "128",
      },
      featureList: [
        "Document to flashcards generator",
        "Unlimited practice quiz creator",
        "Concise study revision notes",
        "Grounded AI document assistant",
        "Ethiopian national curriculum textbooks",
        "Active recall and study break games",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Vellum?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Vellum is an AI-powered study platform that automatically transforms textbooks, PDFs, and notes into interactive flashcards, unlimited practice quizzes, and concise revision summaries.",
          },
        },
        {
          "@type": "Question",
          name: "How does Vellum turn documents into study materials?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Upload any PDF, document, or describe a topic. Vellum analyzes the key concepts and generates question-answer flashcard decks, multiple-choice quizzes with instant reasoning, and structured study notes.",
          },
        },
        {
          "@type": "Question",
          name: "Does Vellum support Ethiopian curriculum textbooks?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, Vellum includes a digital library of Ethiopian national curriculum textbooks for Grades 7 through 12, allowing students to read and convert chapters into study kits instantly.",
          },
        },
        {
          "@type": "Question",
          name: "Is Vellum free to use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, students can sign up for free to access textbooks, create AI study kits, and practice with unlimited quizzes.",
          },
        },
      ],
    },
  ],
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Vellum — AI Study Notebooks, Flashcards & Practice Quizzes" },
      {
        name: "description",
        content:
          "Turn any document, textbook, or topic into interactive flashcards, unlimited practice quizzes, and concise revision notes in seconds. Study with active recall and Ethiopian national curriculum books.",
      },
      {
        name: "keywords",
        content:
          "AI study notebooks, flashcards generator, AI quiz generator, document to flashcards, active recall, spaced repetition, Ethiopian national textbooks, grade 11 biology, grade 12 physics, AI tutor, Vellum study, revision kit, student learning platform",
      },
      { name: "author", content: "Eserom Demissew" },
      { name: "creator", content: "Eserom Demissew" },
      { name: "publisher", content: "Eserom Demissew" },
      { name: "application-name", content: "Vellum" },
      { name: "apple-mobile-web-app-title", content: "Vellum" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#090d16" },
      { name: "color-scheme", content: "dark light" },
      {
        name: "robots",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      {
        name: "googlebot",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      {
        name: "bingbot",
        content: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      },
      { name: "google-site-verification", content: "RpQBzd6utPqU6_-95tCOf9egQ24apLScST_tRsmEdg8" },
      { name: "google-site-verification", content: "google1ac157fb9381075e" },
      { name: "google-site-verification", content: "1ac157fb9381075e" },
      ...(BING_VERIFICATION ? [{ name: "msvalidate.01", content: BING_VERIFICATION }] : []),
      // Open Graph Tags
      { property: "og:site_name", content: "Vellum" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:title", content: "Vellum — AI Study Notebooks, Flashcards & Practice Quizzes" },
      {
        property: "og:description",
        content:
          "Turn any document, textbook, or topic into interactive flashcards, unlimited practice quizzes, and concise revision notes. Learn faster with active recall.",
      },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:secure_url", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Vellum — AI Study Notebooks, Flashcards & Practice Quizzes" },
      { property: "og:locale", content: "en_US" },
      { property: "og:locale:alternate", content: "am_ET" },
      // Twitter Card Tags
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@VellumStudy" },
      { name: "twitter:creator", content: "@VellumStudy" },
      { name: "twitter:title", content: "Vellum — AI Study Notebooks & Flashcards" },
      {
        name: "twitter:description",
        content:
          "Turn any document or topic into flashcards, unlimited quiz questions, and concise revision notes in seconds.",
      },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
      { name: "twitter:image:alt", content: "Vellum AI Study Notebooks Banner" },
    ],
    links: [
      { rel: "canonical", href: SITE_URL },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+Ethiopic:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(jsonLdSchema),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="google-site-verification" content="RpQBzd6utPqU6_-95tCOf9egQ24apLScST_tRsmEdg8" />
        <HeadContent />
        {/* Google Analytics 4 (gtag.js) */}
        {GA_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_ID}', { send_page_view: true });
                `,
              }}
            />
          </>
        )}
        {/* Google Tag Manager (GTM) */}
        {GTM_ID && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${GTM_ID}');
              `,
            }}
          />
        )}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {/* Dynamic language detection & Google Translate Init */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var detected = (navigator.language || navigator.userLanguage || 'en').toLowerCase().split('-')[0];
                  var valid = ['en', 'am', 'om', 'ti', 'ar', 'fr', 'es', 'de', 'sw', 'zh-CN'];
                  if (!localStorage.getItem('vellum_lang')) {
                    var chosen = valid.indexOf(detected) !== -1 ? detected : 'en';
                    localStorage.setItem('vellum_lang', chosen);
                    document.documentElement.lang = chosen;
                  } else {
                    document.documentElement.lang = localStorage.getItem('vellum_lang') || 'en';
                  }
                } catch(e) {}
              })();
              window.googleTranslateElementInit = function() {
                try {
                  if (window.google && window.google.translate) {
                    new window.google.translate.TranslateElement({
                      pageLanguage: 'en',
                      includedLanguages: 'en,am,om,ti,ar,fr,es,de,sw,zh-CN',
                      autoDisplay: false,
                      layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
                    }, 'google_translate_element');
                  }
                } catch(e) {}
              };
            `,
          }}
        />
        <script src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit" async defer />
      </head>
      <body>
        {/* Google Translate Hidden Target */}
        <div id="google_translate_element" style={{ display: "none" }} />
        {/* Google Tag Manager (noscript fallback) */}
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        )}
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
            <Toaster position="top-center" />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
