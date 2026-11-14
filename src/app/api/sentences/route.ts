import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { isLanguage } from "@/lib/languages";

export const runtime = "nodejs";

const requestSchema = z.object({ label: z.string().trim().min(1).max(80), language: z.string().refine(isLanguage) });
const responseSchema = z.object({ sentences: z.array(z.object({ text: z.string().trim().min(1).max(180), translation: z.string().trim().min(1).max(180) })).length(3) });

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your-openai-api-key") {
    return Response.json({ error: "Sentence examples are not configured." }, { status: 503 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a named object." }, { status: 400 });
  try {
    const result = await generateText({
      model: openai.responses("gpt-6.1-terra"),
      output: Output.object({ schema: responseSchema }),
      prompt: `Write three short, natural example sentences in ${parsed.data.language} using the exact object word ${JSON.stringify(parsed.data.label)} in each sentence, without changing its spelling or form. Return each sentence and its English translation.`,
    });
    return Response.json(result.output);
  } catch {
    return Response.json({ error: "Could not load sentences." }, { status: 502 });
  }
}
