export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) {
    return Response.json({ error: "Background removal is not configured." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const photo = form.get("photo");
  if (!(photo instanceof File) || !IMAGE_TYPES.has(photo.type) || photo.size === 0 || photo.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Choose a JPEG, PNG, or WebP image under 5 MB." }, { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.append("image_file", photo);
  upstreamForm.append("size", "auto");
  try {
    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: upstreamForm,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.error("Background removal failed", { status: response.status });
      return Response.json({ error: response.status === 429 ? "Background removal is busy. Try again." : "Could not remove the background." }, { status: 502 });
    }
    return new Response(await response.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Background removal is unavailable. Try again." }, { status: 502 });
  }
}
