import { generateText, Output } from "ai";
import { z } from "zod";
import { isLanguage } from "@/lib/languages";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const identificationSchema = z.object({
  label: z.string().trim().max(80).nullable(),
});

export async function POST(request: Request) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: "AI identification is not configured." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const photo = form.get("photo");
  const language = form.get("language");
  if (!(photo instanceof File) || !IMAGE_TYPES.has(photo.type) || !isLanguage(language)) {
    return Response.json({ error: "Choose a supported image and language." }, { status: 400 });
  }
  if (photo.size === 0 || photo.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image must be under 5 MB." }, { status: 413 });
  }

  try {
    const result = await generateText({
      model: "openai/gpt-6.1-terra",
      output: Output.object({ schema: identificationSchema }),
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Identify the one most prominent physical object in this image. Return only its natural, specific noun in ${language}; use Simplified Chinese for Chinese and Brazilian Portuguese for Portuguese. Do not include an article, transliteration, explanation, or punctuation. If there is no clearly identifiable object, return null.`,
          },
          { type: "image", image: await photo.arrayBuffer(), mediaType: photo.type },
        ],
      }],
    });

    return Response.json({ label: result.output.label || null });
  } catch {
    return Response.json({ error: "Could not identify the object." }, { status: 502 });
  }
}
