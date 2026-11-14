import { generateText, Output, RetryError } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { isLanguage } from "@/lib/languages";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const identificationSchema = z.object({
  label: z.string().trim().max(80).nullable(),
  category: z.string().trim().max(60).nullable(),
  pronunciation: z.string().trim().max(120).nullable(),
});
const categoriesSchema = z.array(z.string().trim().min(1).max(60)).max(2000);

export async function POST(request: Request) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey || openaiKey === "your-openai-api-key") {
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

  let existingCategories: string[];
  try {
    existingCategories = categoriesSchema.parse(JSON.parse(String(form.get("categories") ?? "[]")));
  } catch {
    return Response.json({ error: "Invalid categories." }, { status: 400 });
  }

  try {
    const result = await generateText({
      model: openai.responses("gpt-6.1-terra"),
      output: Output.object({ schema: identificationSchema }),
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Identify the one most prominent physical object in this image. Return its natural, specific noun as label in ${language}; use Simplified Chinese for Chinese and Brazilian Portuguese for Portuguese. Do not include an article, transliteration, explanation, or punctuation in the label. Return a short Latin-script pronunciation guide in pronunciation (or null if no label). Also return a short, common English category for that object (for example Kitchen, Clothing, Furniture, Electronics, Food, or Sports). Choose an existing category whenever it reasonably fits; otherwise suggest a familiar broad category, not the object's name. Existing categories: ${JSON.stringify(existingCategories)}. If there is no clearly identifiable object, return null for all fields.`,
          },
          { type: "file", data: await photo.arrayBuffer(), mediaType: photo.type },
        ],
      }],
    });

    const label = result.output.label || null;
    return Response.json({ label, category: label ? result.output.category || null : null, pronunciation: label ? result.output.pronunciation || null : null });
  } catch (error) {
    const cause = RetryError.isInstance(error) ? error.lastError : error;
    const name = cause instanceof Error ? cause.name : "UnknownError";
    const statusCode = cause && typeof cause === "object" && "statusCode" in cause &&
      typeof cause.statusCode === "number" ? cause.statusCode : undefined;
    let nested: unknown = cause;
    let networkCode: string | undefined;
    for (let depth = 0; depth < 4 && nested && typeof nested === "object"; depth++) {
      if ("code" in nested && typeof nested.code === "string") networkCode = nested.code;
      nested = "cause" in nested ? nested.cause : null;
    }
    console.error("Photo identification failed", { name, statusCode, networkCode });
    if (networkCode && ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT"].includes(networkCode)) {
      return Response.json({ error: "OpenAI is unreachable. Check the server network." }, { status: 503 });
    }
    if (statusCode === 401) {
      return Response.json({ error: "OpenAI rejected the API key." }, { status: 503 });
    }
    if (statusCode === 403) {
      return Response.json({ error: "OpenAI denied access to this model." }, { status: 503 });
    }
    if (statusCode === 429) {
      return Response.json({ error: "AI is busy. Try again shortly." }, { status: 503 });
    }
    return Response.json({ error: "Could not identify the object." }, { status: 502 });
  }
}
