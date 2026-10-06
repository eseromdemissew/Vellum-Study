import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createGeminiClient,
  describeGeminiError,
  extractJsonFromText,
  generateContentWithFallback,
  KitSchema,
  MoreCardsSchema,
  MoreQuizSchema,
} from "./gemini.server";

const TEXT_LIMIT = 60000;

type FilePart = {
  type: "file";
  data: string;
  mediaType: string;
  filename?: string;
};

type TextPart = { type: "text"; text: string };

function toGeminiContentParts(parts: (TextPart | FilePart)[]) {
  return parts.map((p) => {
    if (p.type === "file") {
      return {
        inlineData: {
          data: p.data,
          mimeType: p.mediaType,
        },
      };
    }
    return { text: p.text };
  });
}

const TEXTUAL_MIME = /^(text\/|application\/(json|xml|csv|x-ndjson))/;

/**
 * Create a notebook plus its source rows. The AI generation runs separately so
 * the UI can show the notebook immediately.
 */
export const createNotebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(4000).default(""),
        pastedText: z.string().max(200000).default(""),
        file: z
          .object({
            path: z.string().min(1),
            name: z.string().min(1),
            mimeType: z.string().min(1),
          })
          .nullable()
          .default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: notebook, error } = await supabase
      .from("notebooks")
      .insert({
        user_id: userId,
        title: data.title,
        description: data.description,
        status: "pending",
      })
      .select("id")
      .single();

    if (error || !notebook) {
      throw new Error(error?.message ?? "Could not create the notebook.");
    }

    const rows: {
      notebook_id: string;
      user_id: string;
      kind: string;
      name: string;
      content: string;
      file_path: string | null;
    }[] = [];

    if (data.pastedText.trim()) {
      rows.push({
        notebook_id: notebook.id,
        user_id: userId,
        kind: "TEXT",
        name: "Pasted text",
        content: data.pastedText.trim(),
        file_path: null,
      });
    }
    if (data.file) {
      rows.push({
        notebook_id: notebook.id,
        user_id: userId,
        kind: data.file.mimeType.includes("pdf") ? "PDF" : "FILE",
        name: data.file.name,
        content: "",
        file_path: data.file.path,
      });
    }
    if (data.description.trim() && rows.length === 0) {
      rows.push({
        notebook_id: notebook.id,
        user_id: userId,
        kind: "TOPIC",
        name: data.title,
        content: data.description.trim(),
        file_path: null,
      });
    }

    if (rows.length > 0) {
      const { error: sourceError } = await supabase.from("sources").insert(rows);
      if (sourceError) throw new Error(sourceError.message);
    }

    return { notebookId: notebook.id as string };
  });

/** Read every source for a notebook and turn it into model message parts in parallel. */
async function buildSourceParts(
  supabase: any,
  notebookId: string,
): Promise<{ parts: (TextPart | FilePart)[]; hasFile: boolean }> {
  const { data: sources } = await supabase
    .from("sources")
    .select("kind, name, content, file_path")
    .eq("notebook_id", notebookId);

  const parts: (TextPart | FilePart)[] = [];
  let hasFile = false;

  // Process and download sources concurrently
  const tasks = (sources ?? []).map(async (source: any) => {
    if (source.content) {
      return {
        part: {
          type: "text" as const,
          text: `--- Source: ${source.name} ---\n${String(source.content).slice(0, TEXT_LIMIT)}`,
        },
        hasFile: false,
      };
    }
    if (!source.file_path) return null;

    try {
      const { data: blob, error } = await supabase.storage
        .from("sources")
        .download(source.file_path);
      if (error || !blob) return null;

      const mime = blob.type || "application/octet-stream";
      const buffer = new Uint8Array(await blob.arrayBuffer());

      if (TEXTUAL_MIME.test(mime) || /\.(txt|md|csv|json)$/i.test(source.name)) {
        const text = new TextDecoder().decode(buffer).slice(0, TEXT_LIMIT);
        return {
          part: { type: "text" as const, text: `--- Source: ${source.name} ---\n${text}` },
          hasFile: true,
        };
      }

      let binary = "";
      for (let i = 0; i < buffer.length; i += 0x8000) {
        binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      }
      return {
        part: {
          type: "file" as const,
          data: btoa(binary),
          mediaType: mime,
          filename: source.name,
        },
        hasFile: true,
      };
    } catch {
      return null;
    }
  });

  const downloaded = await Promise.all(tasks);
  for (const item of downloaded) {
    if (item?.part) {
      parts.push(item.part);
      if (item.hasFile) hasFile = true;
    }
  }

  return { parts, hasFile };
}

export const generateStudyKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ notebookId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: notebook, error: notebookError } = await supabase
      .from("notebooks")
      .select("id, user_id, title, description, status")
      .eq("id", data.notebookId)
      .single();

    if (notebookError || !notebook) throw new Error("Notebook not found.");
    if (notebook.user_id && notebook.user_id !== userId) {
      throw new Error("Only the creator of this notebook can regenerate the study kit.");
    }

    await supabase
      .from("notebooks")
      .update({ status: "generating", error_message: null })
      .eq("id", notebook.id);

    try {
      const { genAI } = await createGeminiClient();

      const { parts } = await buildSourceParts(supabase, notebook.id);

      const briefText = [
        `Study notebook title: ${notebook.title}`,
        notebook.description ? `Learner's description: ${notebook.description}` : "",
        parts.length === 0
          ? "There is no uploaded material. Build the study kit from your own knowledge of this topic."
          : "Use the attached source material below as the single source of truth.",
      ]
        .filter(Boolean)
        .join("\n");

      const instructionText = `Generate an elite, high-yield study kit. Reply strictly with ONLY a JSON object.

Format:
{
  "subject_code": "e.g. BIO-101 or HISTORY (uppercase tag, max 10 chars)",
  "summary": "1 crisp, high-impact paragraph summary of the core concepts (max 400 chars)",
  "flashcards": [{"question": "focused question", "answer": "precise, self-contained answer"}],
  "quiz": [{"question": "conceptual question", "options": ["Option A", "Option B", "Option C", "Option D"], "correct_index": 0, "explanation": "concise 1-sentence reasoning"}],
  "notes": [{"heading": "key concept heading", "body": "2-3 crisp revision bullet sentences"}]
}

Kit Requirements:
- flashcards: exactly 10 high-yield, exam-targeted question & answer cards
- quiz: exactly 6 conceptual multiple-choice questions with 4 distinct options and concise explanations
- notes: exactly 5 structured revision note blocks with clear headings and essential takeaways
- Be concise, direct, accurate, and fast. Avoid unnecessary fluff or repetition.`;

      const promptParts = [
        { text: briefText },
        ...toGeminiContentParts(parts),
        { text: instructionText },
      ];

      const { text: rawText } = await generateContentWithFallback(
        genAI,
        {
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
          systemInstruction:
            "You are Vellum, an elite academic AI tutor. Generate clean, highly accurate, exam-focused study kits in valid JSON format. Be concise, rigorous, and fast.",
        },
        promptParts
      );
      const kit = KitSchema.parse(extractJsonFromText(rawText));

      // Clear existing in parallel
      await Promise.all([
        supabase.from("flashcards").delete().eq("notebook_id", notebook.id),
        supabase.from("quiz_questions").delete().eq("notebook_id", notebook.id),
        supabase.from("notes").delete().eq("notebook_id", notebook.id),
      ]);

      // Insert all kit components in parallel
      const insertPromises: Promise<any>[] = [];

      if (kit.flashcards.length) {
        insertPromises.push(
          supabase.from("flashcards").insert(
            kit.flashcards.map((card, index) => ({
              notebook_id: notebook.id,
              user_id: userId,
              question: card.question,
              answer: card.answer,
              position: index,
            }))
          )
        );
      }

      if (kit.quiz.length) {
        insertPromises.push(
          supabase.from("quiz_questions").insert(
            kit.quiz.map((item, index) => ({
              notebook_id: notebook.id,
              user_id: userId,
              question: item.question,
              options: item.options,
              correct_index: Math.min(
                Math.max(item.correct_index, 0),
                Math.max(item.options.length - 1, 0),
              ),
              explanation: item.explanation,
              position: index,
            }))
          )
        );
      }

      if (kit.notes.length) {
        insertPromises.push(
          supabase.from("notes").insert(
            kit.notes.map((note, index) => ({
              notebook_id: notebook.id,
              user_id: userId,
              heading: note.heading,
              body: note.body,
              position: index,
            }))
          )
        );
      }

      await Promise.all(insertPromises);

      await supabase
        .from("notebooks")
        .update({
          status: "ready",
          subject_code: kit.subject_code.slice(0, 10).toUpperCase() || "STUDY",
          description: notebook.description || kit.summary,
          error_message: null,
        })
        .eq("id", notebook.id);

      return { ok: true as const };
    } catch (error) {
      const message = describeGeminiError(error);
      console.error("[generateStudyKit]", error);
      await supabase
        .from("notebooks")
        .update({ status: "failed", error_message: message })
        .eq("id", notebook.id);
      throw new Error(message);
    }
  });

export const askSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        notebookId: z.string().uuid(),
        question: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: notebook, error } = await supabase
      .from("notebooks")
      .select("id, user_id, title, description, is_shared")
      .eq("id", data.notebookId)
      .single();
    if (error || !notebook) throw new Error("Notebook not found.");
    if (notebook.user_id !== userId && !notebook.is_shared) {
      throw new Error("This notebook is private and can only be accessed by the creator.");
    }

    await supabase.from("chat_messages").insert({
      notebook_id: notebook.id,
      user_id: userId,
      role: "user",
      content: data.question,
    });

    try {
      const { genAI } = await createGeminiClient();

      const { parts } = await buildSourceParts(supabase, notebook.id);

      const { data: history } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("notebook_id", notebook.id)
        .order("created_at", { ascending: true })
        .limit(20);

      const { data: notes } = await supabase
        .from("notes")
        .select("heading, body")
        .eq("notebook_id", notebook.id)
        .order("position");

      const context_text = (notes ?? [])
        .map((n: { heading: string; body: string }) => `${n.heading}: ${n.body}`)
        .join("\n");

      const historyFormatted = (history ?? [])
        .map((m: { role: string; content: string }) => `${m.role === "assistant" ? "Assistant" : "Student"}: ${m.content}`)
        .join("\n");

      const promptParts = [
        { text: `Reference notes for this notebook:\n${context_text}` },
        ...toGeminiContentParts(parts),
        { text: `Conversation history so far:\n${historyFormatted}\n\nStudent asks: ${data.question}\nProvide a concise, direct answer based strictly on the material above.` },
      ];

      const { text: answerText } = await generateContentWithFallback(
        genAI,
        {
          generationConfig: {
            temperature: 0.4,
          },
          systemInstruction: `You are Vellum, a study assistant answering strictly from the learner's own material for the notebook "${notebook.title}". Cite the source name in parentheses when you use it. If the material does not answer the question, say so plainly, then give a short general answer clearly marked as outside the sources. Keep answers under 140 words. Formatting: write plainly — no markdown headings or bullet symbols, and NEVER any LaTeX or dollar signs. Write formulas and chemistry plainly like CO2, H2O, NADP+; use **bold** only for one or two key terms per answer.`,
        },
        promptParts
      );
      const answer = answerText.trim() || "I could not find an answer in your material.";

      await supabase.from("chat_messages").insert({
        notebook_id: notebook.id,
        user_id: userId,
        role: "assistant",
        content: answer,
      });

      return { answer };
    } catch (error) {
      const message = describeGeminiError(error);
      console.error("[askSources]", error);
      throw new Error(message);
    }
  });

/* ---------------------------------------------------------------
 * Unlimited generation: top up a notebook with brand-new questions
 * or flashcards on demand, never repeating what is already stored.
 * ------------------------------------------------------------- */

async function notebookContext(supabase: any, notebookId: string, userId: string) {
  const { data: notebook, error } = await supabase
    .from("notebooks")
    .select("id, user_id, title, description, is_shared")
    .eq("id", notebookId)
    .single();
  if (error || !notebook) throw new Error("Notebook not found.");
  if (notebook.user_id !== userId && !notebook.is_shared) {
    throw new Error("This notebook is private and can only be accessed by the creator.");
  }

  const { parts } = await buildSourceParts(supabase, notebook.id);
  const { data: notes } = await supabase
    .from("notes")
    .select("heading, body")
    .eq("notebook_id", notebook.id)
    .order("position");

  const notesText = (notes ?? [])
    .map((n: { heading: string; body: string }) => `${n.heading}: ${n.body}`)
    .join("\n");

  return { notebook, parts, notesText };
}

export const generateMoreQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        notebookId: z.string().uuid(),
        count: z.number().int().min(1).max(15).default(8),
        difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const { genAI } = await createGeminiClient();

      const { notebook, parts, notesText } = await notebookContext(
        supabase,
        data.notebookId,
        userId,
      );

      const { data: existing } = await supabase
        .from("quiz_questions")
        .select("question, position")
        .eq("notebook_id", notebook.id)
        .order("position", { ascending: false })
        .limit(80);

      const asked = (existing ?? []).map((q: { question: string }) => q.question);
      const nextPosition =
        ((existing ?? [])[0]?.position ?? -1) + 1;

      const promptParts = [
        {
          text: `Notebook: ${notebook.title}\n${notebook.description ?? ""}\n\nKey notes:\n${notesText}`,
        },
        ...toGeminiContentParts(parts),
        {
          text: `Write ${data.count} BRAND NEW multiple-choice questions at ${data.difficulty} difficulty.

Already asked (never repeat these or paraphrase them):
${asked.map((q: string) => `- ${q}`).join("\n") || "- (nothing yet)"}

Reply with ONLY this JSON:
{"quiz":[{"question":"...","options":["optA","optB","optC","optD"],"correct_index":0,"explanation":"why the answer is right and the others are wrong, 1-3 sentences"}]}

Rules: exactly 4 options each, plausible distractors, explore angles not yet covered, stay faithful to the material. Plain text only — no LaTeX or dollar signs; write formulas plainly like CO2, NADP+.`,
        },
      ];

      const { text: rawText } = await generateContentWithFallback(
        genAI,
        {
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
          systemInstruction:
            "You are Vellum, an expert exam-question writer. You always reply with strict, valid JSON only, no markdown fences.",
        },
        promptParts
      );
      const parsed = MoreQuizSchema.parse(extractJsonFromText(rawText));
      const rows = parsed.quiz
        .filter((q) => q.options.length >= 2)
        .map((q, index) => ({
          notebook_id: notebook.id,
          user_id: userId,
          question: q.question,
          options: q.options,
          correct_index: Math.min(
            Math.max(q.correct_index, 0),
            q.options.length - 1,
          ),
          explanation: q.explanation,
          position: nextPosition + index,
        }));

      if (rows.length === 0) throw new Error("empty generation");
      const { error } = await supabase.from("quiz_questions").insert(rows);
      if (error) throw new Error(error.message);

      return { added: rows.length };
    } catch (error) {
      console.error("[generateMoreQuestions]", error);
      throw new Error(describeGeminiError(error));
    }
  });

export const generateMoreFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        notebookId: z.string().uuid(),
        count: z.number().int().min(1).max(20).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    try {
      const { genAI } = await createGeminiClient();

      const { notebook, parts, notesText } = await notebookContext(
        supabase,
        data.notebookId,
        userId,
      );

      const { data: existing } = await supabase
        .from("flashcards")
        .select("question, position")
        .eq("notebook_id", notebook.id)
        .order("position", { ascending: false })
        .limit(80);

      const asked = (existing ?? []).map((c: { question: string }) => c.question);
      const nextPosition = ((existing ?? [])[0]?.position ?? -1) + 1;

      const promptParts = [
        {
          text: `Notebook: ${notebook.title}\n${notebook.description ?? ""}\n\nKey notes:\n${notesText}`,
        },
        ...toGeminiContentParts(parts),
        {
          text: `Write ${data.count} BRAND NEW flashcards.

Already covered (never repeat or paraphrase):
${asked.map((q: string) => `- ${q}`).join("\n") || "- (nothing yet)"}

Reply with ONLY this JSON: {"flashcards":[{"question":"...","answer":"..."}]}
Answers must be self-contained and exam-focused. Plain text only — no LaTeX or dollar signs; write formulas plainly like CO2, NADP+.`,
        },
      ];

      const { text: rawText } = await generateContentWithFallback(
        genAI,
        {
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json",
          },
          systemInstruction:
            "You are Vellum, an expert flashcard writer. You always reply with strict, valid JSON only, no markdown fences.",
        },
        promptParts
      );
      const parsed = MoreCardsSchema.parse(extractJsonFromText(rawText));
      const rows = parsed.flashcards.map((c, index) => ({
        notebook_id: notebook.id,
        user_id: userId,
        question: c.question,
        answer: c.answer,
        position: nextPosition + index,
      }));

      if (rows.length === 0) throw new Error("empty generation");
      const { error } = await supabase.from("flashcards").insert(rows);
      if (error) throw new Error(error.message);

      return { added: rows.length };
    } catch (error) {
      console.error("[generateMoreFlashcards]", error);
      throw new Error(describeGeminiError(error));
    }
  });

export const toggleNotebookShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        notebookId: z.string().uuid(),
        isShared: z.boolean(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify ownership
    const { data: nb, error } = await supabase
      .from("notebooks")
      .select("id, user_id, title")
      .eq("id", data.notebookId)
      .single();

    if (error || !nb) throw new Error("Notebook not found.");
    if (nb.user_id !== userId) throw new Error("Only the creator of this notebook can change sharing permissions.");

    const { error: updateError } = await supabase
      .from("notebooks")
      .update({ is_shared: data.isShared })
      .eq("id", data.notebookId);

    if (updateError) {
      if (updateError.message.includes("is_shared") || updateError.message.includes("column")) {
        throw new Error("Sharing requires the 'is_shared' column in your Supabase database. Please run: ALTER TABLE public.notebooks ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT false; in Supabase SQL editor.");
      }
      throw new Error(updateError.message);
    }

    return { ok: true, isShared: data.isShared };
  });
