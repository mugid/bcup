"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ArrowLeft } from "@/components/lime/icon";
import { Button } from "@/components/lime/ui/button";
import { VideoPicker } from "@/components/lime/ui/dropzone";
import { Field, FieldLabel } from "@/components/lime/ui/field";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { extractClipFrames } from "@/lib/clip-frames";
import { isLanguage, type Language } from "@/lib/languages";

type Description = { text: string; translation: string };
type Analysis = { title: string; descriptions: Description[]; words: Description[] };

export default function NewClipPage() {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("Spanish");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const createClip = useMutation(api.clips.create);

  useEffect(() => {
    try {
      let saved = localStorage.getItem("bcup-owner-id");
      if (!saved) { saved = crypto.randomUUID(); localStorage.setItem("bcup-owner-id", saved); }
      setOwnerId(saved);
      const savedLanguage = localStorage.getItem("bcup-language");
      if (isLanguage(savedLanguage)) setLanguage(savedLanguage);
    } catch { setError("Browser storage is required to save clips."); }
  }, []);
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function upload(blob: Blob): Promise<Id<"_storage">> {
    const url = await generateUploadUrl({});
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    if (!response.ok) throw new Error("Could not upload the video. Try again.");
    const result = await response.json() as { storageId: Id<"_storage"> };
    return result.storageId;
  }

  async function save() {
    if (!ownerId || !file || busy) return;
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) { setError("Choose an MP4, WebM, or MOV video."); return; }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) { setError("Choose a video under 20 MB."); return; }
    setBusy(true);
    setError("");
    try {
      const { frames } = await extractClipFrames(file);
      const form = new FormData();
      form.append("language", language);
      frames.forEach((frame, index) => form.append("frames", frame, `frame-${index}.jpg`));
      const response = await fetch("/api/describe-clip", { method: "POST", body: form });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Could not describe this clip.");
      if (!data || typeof data !== "object" || !("title" in data) || !("descriptions" in data) || !("words" in data) ||
          typeof data.title !== "string" || !Array.isArray(data.descriptions) || !Array.isArray(data.words)) throw new Error("Invalid description response.");
      const analysis = data as Analysis;
      const [storageId, posterStorageId] = await Promise.all([upload(file), upload(frames[0])]);
      const clipId = await createClip({ ownerId, storageId, posterStorageId, language, ...analysis });
      router.push(`/clips/${clipId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this clip.");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-dvh w-full max-w-2xl bg-page px-4 pb-8 pt-4 text-fg sm:px-6 sm:pt-8">
    <header className="flex h-14 items-center gap-3"><Link href="/" aria-label="Back to home" className="flex size-(--control-lg) items-center justify-center rounded-control text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ArrowLeft aria-hidden="true" /></Link><h1 className="text-xl font-semibold sm:text-2xl">Add a video</h1></header>
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 pt-8">
      <p className="text-base text-fg-2">Film an everyday action. Get simple sentences in the language you’re learning.</p>
      <Field><FieldLabel htmlFor="clip-language">Language</FieldLabel><div id="clip-language" className="flex items-center gap-3"><LanguagePicker value={language} onChange={setLanguage} /><span>{language}</span></div></Field>
      <Field><FieldLabel htmlFor="clip-file">Short video</FieldLabel><VideoPicker disabled={busy} selected={Boolean(file)} onFileSelected={(selected) => { setFile(selected); setError(""); }} /><p className="text-sm text-fg-2">1–15 seconds, MP4, WebM, or MOV, under 20 MB.</p></Field>
      {previewUrl && <video src={previewUrl} controls playsInline preload="metadata" className="aspect-video w-full rounded-panel bg-surface object-contain" aria-label="Selected video preview" />}
      {file && <p className="text-sm text-fg-2">{file.name}</p>}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {busy && <p role="status" className="text-sm text-fg-2">Reading the clip, writing sentences, and saving it…</p>}
      <Button size="lg" pending={busy} disabled={!file || !ownerId} onClick={() => void save()}>Describe this video</Button>
    </div>
  </main>;
}
