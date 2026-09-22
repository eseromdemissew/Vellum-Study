import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createLovableAiGatewayProvider,
  describeAiError,
  requireLovableApiKey,
} from "./ai-gateway.server";

const MODEL = "google/gemini-3.8-flash";
const TEXT_LIMIT = 60000;

type FilePart = {
  type: "file";
  data: string;
  mediaType: string;
  filename?: string;
};

type TextPart = { type: "text"; text: string };

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in model output");
  return JSON.parse(body.slice(start, end + 1));
}

const KitSchema = z.object({
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
      }),
    )
    .default([]),
  notes: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .default([]),
});

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

/** Read every source for a notebook and turn it into model message parts. */
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

  for (const source of sources ?? []) {
    if (source.content) {
      parts.push({
        type: "text",
        text: `--- Source: ${source.name} ---\n${String(source.content).slice(0, TEXT_LIMIT)}`,
      });
      continue;
    }
    if (!source.file_path) continue;

    const { data: blob, error } = await supabase.storage
      .from("sources")
      .download(source.file_path);
    if (error || !blob) continue;

    const mime = blob.type || "application/octet-stream";
    const buffer = new Uint8Array(await blob.arrayBuffer());

    if (TEXTUAL_MIME.test(mime) || /\.(txt|md|csv|json)$/i.test(source.name)) {
      const text = new TextDecoder().decode(buffer).slice(0, TEXT_LIMIT);
      parts.push({ type: "text", text: `--- Source: ${source.name} ---\n${text}` });
      hasFile = true;
      continue;
    }

    let binary = "";
    for (let i = 0; i < buffer.length; i += 0x8000) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    }
    parts.push({
      type: "file",
      data: btoa(binary),
      mediaType: mime,
      filename: source.name,
    });
    hasFile = true;
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
      .select("id, title, description, status")
      .eq("id", data.notebookId)
      .single();

    if (notebookError || !notebook) throw new Error("Notebook not found.");

    await supabase
      .from("notebooks")
      .update({ status: "generating", error_message: null })
      .eq("id", notebook.id);

    try {
      const apiKey = requireLovableApiKey();
      const gateway = createLovableAiGatewayProvider(apiKey);
      const { parts } = await buildSourceParts(supabase, notebook.id);

      const brief: TextPart = {
        type: "text",
        text: [
          `Study notebook title: ${notebook.title}`,
          notebook.description ? `Learner's description: ${notebook.description}` : "",
          parts.length === 0
            ? "There is no uploaded material. Build the study kit from your own knowledge of this topic."
            : "Use the attached source material below as the single source of truth.",
        ]
          .filter(Boolean)
          .join("\n"),
      };

      const instruction: TextPart = {
        type: "text",
        text: `Produce a complete study kit and reply with ONLY a JSON object, no prose, no markdown fences.

Shape:
{
  "subject_code": short uppercase tag, max 10 characters, e.g. "BIO-204" or "HISTORY",
  "summary": one paragraph overview, max 400 characters,
  "flashcards": array of 14 to 20 objects { "question", "answer" },
  "quiz": array of 8 to 12 objects { "question", "options" (exactly 4 strings), "correct_index" (0-3), "explanation" },
  "notes": array of 5 to 8 objects { "heading", "body" } where body is 2-4 sentences of crisp revision notes
}

Rules: cover the whole material evenly, no duplicate questions, answers must be self-contained, keep language clear and exam-focused.`,
      };

      const result = streamText({
        model: gateway(MODEL),
        messages: [
          {
            role: "system",
            content:
              "You are Vellum, an expert study-kit generator. You always reply with strict, valid JSON only.",
          },
          { role: "user", content: [brief, ...parts, instruction] as any },
        ],
      });

      const raw = await result.text;
      const kit = KitSchema.parse(extractJson(raw));

      await supabase.from("flashcards").delete().eq("notebook_id", notebook.id);
      await supabase.from("quiz_questions").delete().eq("notebook_id", notebook.id);
      await supabase.from("notes").delete().eq("notebook_id", notebook.id);

      if (kit.flashcards.length) {
        await supabase.from("flashcards").insert(
          kit.flashcards.map((card, index) => ({
            notebook_id: notebook.id,
            user_id: userId,
            question: card.question,
            answer: card.answer,
            position: index,
          })),
        );
      }
      if (kit.quiz.length) {
        await supabase.from("quiz_questions").insert(
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
          })),
        );
      }
      if (kit.notes.length) {
        await supabase.from("notes").insert(
          kit.notes.map((note, index) => ({
            notebook_id: notebook.id,
            user_id: userId,
            heading: note.heading,
            body: note.body,
            position: index,
          })),
        );
      }

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
      const message = describeAiError(error);
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
      .select("id, title, description")
      .eq("id", data.notebookId)
      .single();
    if (error || !notebook) throw new Error("Notebook not found.");

    await supabase.from("chat_messages").insert({
      notebook_id: notebook.id,
      user_id: userId,
      role: "user",
      content: data.question,
    });

    try {
      const apiKey = requireLovableApiKey();
      const gateway = createLovableAiGatewayProvider(apiKey);
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

      const result = streamText({
        model: gateway(MODEL),
        system: `You are Vellum, a study assistant answering strictly from the learner's own material for the notebook "${notebook.title}". Cite the source name in parentheses when you use it. If the material does not answer the question, say so plainly, then give a short general answer clearly marked as outside the sources. Keep answers under 140 words.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Reference material for this notebook:\n${context_text}`,
              },
              ...parts,
              {
                type: "text",
                text: "Acknowledge the material silently and answer the questions that follow.",
              },
            ] as any,
          },
          { role: "assistant", content: "Understood. Ask away." },
          ...(history ?? []).map((m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          })),
        ],
      });

      const answer = (await result.text).trim() || "I could not find an answer in your material.";

      await supabase.from("chat_messages").insert({
        notebook_id: notebook.id,
        user_id: userId,
        role: "assistant",
        content: answer,
      });

      return { answer };
    } catch (error) {
      const message = describeAiError(error);
      console.error("[askSources]", error);
      throw new Error(message);
    }
  });
