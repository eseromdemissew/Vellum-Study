import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

export const DEFAULT_MODEL = process.env["GEMINI_MODEL"] || "gemini-flash-latest";

// Robust cascade of verified active models on Google Generative AI (auto-aliased & latest)
export const FALLBACK_MODELS = Array.from(
  new Set([
    process.env["GEMINI_MODEL"] || "gemini-flash-latest",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
  ])
);

function decryptApiKey(encryptedBase64: string, pepper: string): string {
  try {
    const buf = Buffer.from(encryptedBase64, "base64");
    if (pepper) {
      const pepperData = new TextEncoder().encode(pepper);
      const decrypted = new Uint8Array(buf.length);
      for (let i = 0; i < buf.length; i++) {
        decrypted[i] = (buf[i] ?? 0) ^ (pepperData[i % pepperData.length] ?? 0);
      }
      return new TextDecoder().decode(decrypted);
    }
    return buf.toString("utf-8");
  } catch {
    return encryptedBase64;
  }
}

export async function getActiveGeminiApiKey(): Promise<{ key: string; keyId?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pepper = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

    const { data: keys } = await supabaseAdmin
      .from("ai_api_keys")
      .select("id, key_encrypted, status, usage_count")
      .eq("provider", "gemini")
      .eq("status", "active")
      .order("priority", { ascending: true })
      .order("usage_count", { ascending: true })
      .limit(1);

    if (keys && keys.length > 0 && keys[0]?.key_encrypted) {
      const active = keys[0];
      const decrypted = decryptApiKey(active.key_encrypted, pepper);
      if (decrypted && decrypted.trim().length > 5) {
        supabaseAdmin
          .from("ai_api_keys")
          .update({
            usage_count: (active.usage_count ?? 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", active.id)
          .then();

        return { key: decrypted.trim(), keyId: active.id };
      }
    }
  } catch (err) {
    console.warn("[Gemini] Could not fetch DB API key, falling back to env:", err);
  }

  const envKey = process.env["GEMINI_API_KEY"];
  if (envKey && envKey.trim().length > 5) {
    return { key: envKey.trim() };
  }

  throw new Error(
    "No Google Gemini API key is configured. Please add your Gemini API key in the Admin portal (Settings -> AI Keys) or set GEMINI_API_KEY in your server .env file."
  );
}

export function extractJsonFromText(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("The AI model did not return a valid JSON structure. Please try again.");
  }
  return JSON.parse(body.slice(start, end + 1));
}

export function describeGeminiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/503|service unavailable|high demand/i.test(raw)) {
    return "Google Gemini is currently experiencing temporary high demand across models. Please wait a moment and try again.";
  }
  if (/quota|429|resource exhausted|rate limit/i.test(raw)) {
    return "Google Gemini free rate limit reached. Please wait a minute and try again.";
  }
  if (/API_KEY_INVALID|401|403|unregistered/i.test(raw)) {
    return "The configured Google Gemini API key is invalid or expired. Please check your key in the Admin portal.";
  }
  if (/blocked|safety|harmful/i.test(raw)) {
    return "The content was blocked by Gemini safety filters. Please refine the source material or query.";
  }
  return "AI processing could not complete. " + (error instanceof Error ? error.message : "Please try again.");
}

export const KitSchema = z.object({
  subject_code: z.string().default("STUDY"),
  summary: z.string().default(""),
  flashcards: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()),
        correct_index: z.number(),
        explanation: z.string().default(""),
      })
    )
    .default([]),
  notes: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .default([]),
});

export const MoreQuizSchema = z.object({
  quiz: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      correct_index: z.number(),
      explanation: z.string().default(""),
    })
  ),
});

export const MoreCardsSchema = z.object({
  flashcards: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    })
  ),
});

export async function createGeminiClient() {
  const { key } = await getActiveGeminiApiKey();
  const genAI = new GoogleGenerativeAI(key);
  return { genAI, modelName: DEFAULT_MODEL };
}

// Generate with automatic retry + fallback cascade for 503 high demand or 404 deprecated models
export async function generateContentWithFallback(
  genAI: GoogleGenerativeAI,
  config: any,
  contents: any
): Promise<{ text: string; modelUsed: string }> {
  let lastError: any = null;

  for (const candidateModel of FALLBACK_MODELS) {
    // Up to 2 tries per model in case of a transient 503 spike
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          ...config,
          model: candidateModel,
        });
        const res = await model.generateContent(contents);
        return { text: res.response.text(), modelUsed: candidateModel };
      } catch (err: any) {
        lastError = err;
        const isTemporarySpike =
          err?.status === 503 ||
          err?.status === 429 ||
          err?.message?.includes("503") ||
          err?.message?.includes("high demand") ||
          err?.message?.includes("Service Unavailable") ||
          err?.message?.includes("temporarily");

        const isDeprecatedOrNotFound =
          err?.status === 404 ||
          err?.message?.includes("404") ||
          err?.message?.includes("not found") ||
          err?.message?.includes("no longer available") ||
          err?.message?.includes("is not found for API version");

        if (isTemporarySpike && attempt === 0) {
          console.warn(`[Gemini] Model '${candidateModel}' 503 spike, brief 600ms backoff before retry...`);
          await new Promise((r) => setTimeout(r, 600));
          continue; // retry same model once
        }

        if (isTemporarySpike || isDeprecatedOrNotFound || err?.status === 500) {
          console.warn(`[Gemini] Model '${candidateModel}' unavailable (${err.message}). Trying fallback cascade...`);
          break; // move to next model candidate
        }

        throw err;
      }
    }
  }

  throw lastError || new Error("All candidate Gemini models failed.");
}

export async function askGemini(prompt: string, options?: { temperature?: number }): Promise<string> {
  const { genAI } = await createGeminiClient();
  const res = await generateContentWithFallback(
    genAI,
    {
      generationConfig: {
        temperature: options?.temperature ?? 0.3,
      },
    },
    prompt
  );
  return res.text;
}

// Fetch list of active models directly from Google Generative AI
export async function listAvailableGeminiModels(): Promise<Array<{ name: string; displayName: string }>> {
  try {
    const { key } = await getActiveGeminiApiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const models = Array.isArray(json.models) ? json.models : [];
    return models
      .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => ({
        name: m.name.replace("models/", ""),
        displayName: m.displayName || m.name,
      }));
  } catch (err) {
    console.warn("[Gemini] listAvailableGeminiModels error:", err);
    return [
      { name: "gemini-flash-latest", displayName: "Gemini Flash (Latest & Fast)" },
      { name: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash" },
      { name: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash" },
      { name: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash Lite" },
      { name: "gemini-flash-lite-latest", displayName: "Gemini Flash Lite (Latest)" },
    ];
  }
}
