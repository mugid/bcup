"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ArrowLeft, Speaker, Trash } from "@/components/lime/icon";
import { Button } from "@/components/lime/ui/button";

export default function ClipPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const clips = useQuery(api.clips.list, ownerId ? { ownerId } : "skip");
  const clip = clips?.find((item) => item._id === id);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const saveAudio = useMutation(api.clips.saveAudio);
  const remove = useMutation(api.clips.remove);

  useEffect(() => {
    try { setOwnerId(localStorage.getItem("bcup-owner-id")); }
    catch { setError("Browser storage is required to open clips."); }
    return () => { audioRef.current?.pause(); if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current); };
  }, []);

  async function play(index: number) {
    if (!ownerId || !clip || busyIndex !== null) return;
    audioRef.current?.pause();
    if (localUrlRef.current) { URL.revokeObjectURL(localUrlRef.current); localUrlRef.current = null; }
    setBusyIndex(index);
    setError("");
    try {
      const item = clip.descriptions[index];
      let url = item.audioUrl;
      let blob: Blob | null = null;
      if (!url) {
        const response = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: item.text, language: clip.language }) });
        if (!response.ok) throw new Error("Could not create audio.");
        blob = await response.blob();
        url = URL.createObjectURL(blob);
        localUrlRef.current = url;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();
      setBusyIndex(null);
      if (blob) {
        const uploadUrl = await generateUploadUrl({});
        const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "audio/mpeg" }, body: blob });
        if (!upload.ok) throw new Error("Could not save audio.");
        const { storageId } = await upload.json() as { storageId: Id<"_storage"> };
        await saveAudio({ ownerId, clipId: clip._id, index, text: item.text, storageId });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not play audio.");
    } finally { setBusyIndex(null); }
  }

  async function deleteClip() {
    if (!ownerId || !clip || !window.confirm("Delete this video and its descriptions?")) return;
    try { await remove({ ownerId, clipId: clip._id }); router.push("/?tab=videos"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this video."); }
  }

  return <main className="mx-auto min-h-dvh w-full max-w-2xl bg-page px-4 pb-12 pt-4 text-fg sm:px-6 sm:pt-8">
    <header className="flex h-14 items-center justify-between gap-3"><Link href="/?tab=videos" aria-label="Back to video memories" className="flex size-(--control-lg) items-center justify-center rounded-control text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ArrowLeft aria-hidden="true" /></Link>{clip && <Button variant="danger-ghost" size="icon" aria-label="Delete video" onClick={() => void deleteClip()}><Trash aria-hidden="true" /></Button>}</header>
    {!ownerId ? <p role="alert" className="text-sm text-danger-text">{error || "This video is unavailable."}</p> : clips === undefined ? null : !clip ? <h1 className="text-xl font-semibold">Video not found</h1> : <article className="flex flex-col gap-8 pt-6">
      <div className="flex flex-col gap-3"><h1 className="text-2xl font-semibold">{clip.title}</h1><p className="text-sm text-fg-2">{clip.language}</p><video src={clip.url ?? undefined} poster={clip.posterUrl ?? undefined} controls playsInline preload="metadata" className="aspect-video w-full rounded-panel bg-surface object-contain" aria-label={clip.title} /></div>
      <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Describe what happens</h2><ol className="flex flex-col gap-3">{clip.descriptions.map((item, index) => <li key={index} className="rounded-panel bg-surface p-4"><div className="flex items-start justify-between gap-3"><p className="text-base font-medium">{item.text}</p><Button variant="ghost" size="icon-sm" pending={busyIndex === index} aria-label={`Hear description ${index + 1}`} onClick={() => void play(index)}><Speaker aria-hidden="true" /></Button></div><p className="mt-2 text-sm text-fg-2">{item.translation}</p></li>)}</ol><p className="text-sm text-fg-2">Audio is AI-generated.</p></section>
      <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Useful words and phrases</h2><ul className="flex flex-wrap gap-2">{clip.words.map((word, index) => <li key={index} className="rounded-control border border-line bg-surface px-3 py-2"><span className="font-medium">{word.text}</span><span className="ml-2 text-sm text-fg-2">{word.translation}</span></li>)}</ul><Link href="/?tab=practice" className="self-start rounded-control px-3 py-2 text-sm font-medium text-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Practice words</Link></section>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
    </article>}
  </main>;
}
