import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { isLanguage } from "@/lib/languages";

export const runtime = "nodejs";

const phrase = z.object({ text: z.string().trim().min(1).max(180), translation: z.string().trim().min(1).max(180) });
const resultSchema = z.object({
  title: z.string().trim().min(1).max(80),
  descriptions: z.array(phrase).min(3).max(5),
  words: z.array(phrase).min(1).max(8),
});

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your-openai-api-key") {
    return Response.json({ error: "Video descriptions are not configured." }, { status: 503 });
  }
  const form = await request.formData().catch(() => null);
  const language = form?.get("language");
  const frames = form?.getAll("frames") ?? [];
  if (!isLanguage(language) || frames.length !== 4 || frames.some((frame) => !(frame instanceof File) || frame.type !== "image/jpeg" || frame.size === 0 || frame.size > 1_000_000)) {
    return Response.json({ error: "Choose a supported clip and language." }, { status: 400 });
  }
  try {
    const content: Array<{ type: "text"; text: string } | { type: "file"; data: ArrayBuffer; mediaType: "image/jpeg" }> = [
      { type: "text", text: `These four still frames are in chronological order from a short silent video. Describe only actions that are visibly supported by the frames. Write 3 to 5 short, connected, beginner-level sentences in ${language}, each with an English translation. Use simple present tense and a consistent subject when visible. Do not infer speech, sound, intent, ingredients, or unseen intermediate actions. If an action is ambiguous, use a safe visible description. Provide a short English title and 3 to 8 useful distinct words or short verb phrases from those sentences, each translated to English. Use Simplified Chinese for Chinese and Brazilian Portuguese for Portuguese.` },
    ];
    for (const frame of frames) content.push({ type: "file", data: await (frame as File).arrayBuffer(), mediaType: "image/jpeg" });
    const result = await generateText({
      model: openai.responses("gpt-6.1-terra"),
      output: Output.object({ schema: resultSchema }),
      messages: [{ role: "user", content }],
    });
    return Response.json(result.output);
  } catch {
    return Response.json({ error: "Could not describe this clip. Try another short video." }, { status: 502 });
  }
}
