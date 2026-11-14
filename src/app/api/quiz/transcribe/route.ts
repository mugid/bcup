import { isLanguage, type Language } from "@/lib/languages";

export const runtime = "nodejs";

const LANGUAGE_CODES: Record<Language, string> = {
  Spanish: "es", Chinese: "zh", French: "fr", German: "de",
  Japanese: "ja", Korean: "ko", Portuguese: "pt", Russian: "ru",
};

export async function POST(request: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === "your-openai-api-key") {
    return Response.json({ error: "Speech recognition is not configured." }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const language = form?.get("language");
  if (!(audio instanceof File) || !isLanguage(language) || audio.size === 0 || audio.size > 10_000_000 || !audio.type.startsWith("audio/")) {
    return Response.json({ error: "Record a short answer and try again." }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, audio.name || "answer.webm");
  upstream.append("model", "gpt-4o-mini-transcribe");
  upstream.append("language", LANGUAGE_CODES[language]);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
    });
    if (!response.ok) return Response.json({ error: "Could not recognize your answer. Try again." }, { status: 502 });
    const result: unknown = await response.json();
    const text = result && typeof result === "object" && "text" in result && typeof result.text === "string" ? result.text.trim() : "";
    return Response.json({ text });
  } catch {
    return Response.json({ error: "Could not recognize your answer. Try again." }, { status: 502 });
  }
}
