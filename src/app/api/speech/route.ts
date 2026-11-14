import { z } from "zod";
import { isLanguage } from "@/lib/languages";

export const runtime = "nodejs";

const requestSchema = z.object({
  text: z.string().trim().min(1).max(180),
  language: z.string().refine(isLanguage),
});

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "your-openai-api-key") {
    return Response.json({ error: "Audio is not configured." }, { status: 503 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose text to hear." }, { status: 400 });

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: parsed.data.text,
        instructions: `Speak naturally in ${parsed.data.language}, clearly and at a comfortable learning pace.`,
      }),
    });
    if (!response.ok) return Response.json({ error: "Could not create audio." }, { status: 502 });
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return Response.json({ error: "Could not create audio." }, { status: 502 });
  }
}
