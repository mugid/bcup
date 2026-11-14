import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { isLanguage } from "@/lib/languages";

export const runtime = "nodejs";

const requestSchema = z.object({ label: z.string().trim().min(1).max(80), language: z.string().refine(isLanguage) });
const responseSchema = z.object({ pronunciation: z.string().trim().min(1).max(120) });

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your-openai-api-key") {
    return Response.json({ error: "Transcript is not configured." }, { status: 503 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a named object." }, { status: 400 });
  try {
    const result = await generateText({
      model: openai.responses("gpt-6.1-terra"),
      output: Output.object({ schema: responseSchema }),
      prompt: `Give a short Latin-script pronunciation guide for the ${parsed.data.language} word ${JSON.stringify(parsed.data.label)}. Return only the pronunciation field.`,
    });
    return Response.json(result.output);
  } catch {
    return Response.json({ error: "Could not load transcript." }, { status: 502 });
  }
}
