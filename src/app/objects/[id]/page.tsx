"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ArrowLeft, Checkmark, Plus, Speaker, Trash } from "@/components/lime/icon";
import { Button, Spinner } from "@/components/lime/ui/button";
import { Field, FieldLabel } from "@/components/lime/ui/field";
import { Input } from "@/components/lime/ui/input";
import { categoryEmoji } from "@/lib/category-emoji";
import { useLimePortal } from "@/lib/lime/portal";

const EMOJI_OPTIONS = ["📦", "🍳", "👕", "🛋️", "💻", "🍎", "⚽", "📚", "🧸", "🛠️", "🪴", "💄", "🛁", "📎", "🐾", "🎨", "🧳"];
type Sentence = { text: string; translation: string; audioUrl?: string | null };

function HighlightedSentence({ text, word }: { text: string; word: string }) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const segments = text.split(new RegExp(`(${escaped})`, "gi"));
  return <>{segments.map((segment, index) => segment.toLocaleLowerCase() === word.toLocaleLowerCase() ? <mark key={index} className="rounded-sm bg-accent-wash px-1 text-fg">{segment}</mark> : <span key={index}>{segment}</span>)}</>;
}

export default function ObjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const portal = useLimePortal();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localAudioUrlRef = useRef<string | null>(null);
  const pronunciationRequestRef = useRef<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sentencesPending, setSentencesPending] = useState(false);
  const [sentencesOpen, setSentencesOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCollection, setNewCollection] = useState("");
  const [newEmoji, setNewEmoji] = useState("📦");
  const [audioBusyKey, setAudioBusyKey] = useState<string | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sentencesError, setSentencesError] = useState("");
  const photoResults = useQuery(api.photos.list, ownerId ? { ownerId } : "skip");
  const photo = photoResults?.find((item) => item._id === id) ?? null;
  const categoryResults = useQuery(api.categories.list, ownerId ? { ownerId } : "skip");
  const categories = categoryResults ?? [];
  const setCategoryMembership = useMutation(api.photos.setCategoryMembership);
  const createCategory = useMutation(api.categories.create);
  const removePhoto = useMutation(api.photos.remove);
  const saveSentences = useMutation(api.photos.saveSentences);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const saveAudio = useMutation(api.photos.saveAudio);
  const savePronunciation = useMutation(api.photos.savePronunciation);

  useEffect(() => {
    try { setOwnerId(localStorage.getItem("bcup-owner-id")); }
    catch { setError("Browser storage is required to access this object."); }
    return () => {
      audioRef.current?.pause();
      if (localAudioUrlRef.current) URL.revokeObjectURL(localAudioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ownerId || !photo?.label || photo.pronunciation) return;
    const requestKey = `${photo._id}:${photo.label}:${photo.language}`;
    if (pronunciationRequestRef.current === requestKey) return;
    pronunciationRequestRef.current = requestKey;
    const label = photo.label;
    const language = photo.language;
    const photoId = photo._id;
    void (async () => {
      try {
        const response = await fetch("/api/pronunciation", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, language }),
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("pronunciation" in result) || typeof result.pronunciation !== "string") return;
        await savePronunciation({ ownerId, photoId, label, language, pronunciation: result.pronunciation });
      } catch {
        // Keep the object usable when transcript generation is unavailable.
      }
    })();
  }, [ownerId, photo, savePronunciation]);

  async function changeCategory(categoryId: Id<"categories"> | null, selected: boolean) {
    if (!ownerId || !photo) return;
    try {
      await setCategoryMembership({ ownerId, photoId: photo._id, categoryId, selected });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change collection.");
    }
  }

  async function addCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerId || !photo || !newCollection.trim()) return;
    try {
      const categoryId = await createCategory({ ownerId, value: newCollection, emoji: newEmoji });
      await changeCategory(categoryId, true);
      setNewCollection("");
      setNewEmoji("📦");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create collection.");
    }
  }

  async function openSentences() {
    if (!ownerId || !photo?.label) return;
    setSentencesOpen(true);
    setSentencesError("");
    if (photo.sentences) return;
    setSentencesPending(true);
    try {
      const response = await fetch("/api/sentences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: photo.label, language: photo.language }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("sentences" in result) || !Array.isArray(result.sentences)) {
        throw new Error("Could not load sentences.");
      }
      await saveSentences({ ownerId, photoId: photo._id, label: photo.label, language: photo.language, sentences: result.sentences as Sentence[] });
    } catch (cause) {
      setSentencesError(cause instanceof Error ? cause.message : "Could not load sentences.");
    } finally {
      setSentencesPending(false);
    }
  }

  async function playAudio(text: string, key: string, savedUrl: string | null | undefined, sentenceIndex?: number) {
    if (!ownerId || !photo) return;
    if (playingKey === key) { audioRef.current?.pause(); setPlayingKey(null); return; }
    audioRef.current?.pause();
    if (localAudioUrlRef.current) { URL.revokeObjectURL(localAudioUrlRef.current); localAudioUrlRef.current = null; }
    setPlayingKey(null);
    setError("");
    setSentencesError("");
    setAudioBusyKey(key);
    try {
      let url = savedUrl;
      let blob: Blob | null = null;
      if (!url) {
        const response = await fetch("/api/speech", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language: photo.language }),
        });
        if (!response.ok) throw new Error("Could not create audio.");
        blob = await response.blob();
        url = URL.createObjectURL(blob);
        localAudioUrlRef.current = url;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingKey(null);
      await audio.play();
      setPlayingKey(key);
      setAudioBusyKey(null);
      if (blob) {
        const uploadUrl = await generateUploadUrl({});
        const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "audio/mpeg" }, body: blob });
        if (!upload.ok) throw new Error("Could not save audio.");
        const { storageId } = await upload.json() as { storageId: Id<"_storage"> };
        await saveAudio({ ownerId, photoId: photo._id, storageId, text, sentenceIndex });
      }
    } catch (cause) {
      setAudioBusyKey(null);
      const message = cause instanceof Error ? cause.message : "Could not play audio.";
      if (sentenceIndex === undefined) setError(message);
      else setSentencesError(message);
    }
  }

  async function deleteObject() {
    if (!ownerId || !photo || !window.confirm("Delete this object and its photo?")) return;
    setDeleting(true);
    setError("");
    try {
      await removePhoto({ ownerId, photoId: photo._id });
      router.push("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete object.");
      setDeleting(false);
    }
  }

  const selectedCategories = categories.filter((category) => photo?.categoryIds.includes(category._id));
  const sentences = photo?.sentences as Sentence[] | undefined;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl bg-page px-4 pb-12 pt-4 text-fg sm:px-6 sm:pt-8">
      <header className="flex h-14 items-center justify-between gap-3">
        <Link href="/" aria-label="Back to collections" className="flex size-(--control-lg) items-center justify-center rounded-control text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ArrowLeft aria-hidden="true" width={20} height={20} /></Link>
        <Button variant="danger-ghost" size="icon" pending={deleting} aria-label="Delete object" onClick={() => void deleteObject()}><Trash aria-hidden="true" /></Button>
      </header>
      {!ownerId ? <p role="alert">{error || "This object is unavailable."}</p> : photoResults === undefined || categoryResults === undefined ? null : photo === null ? (
        <div className="pt-8"><h1 className="text-xl font-semibold">Object not found</h1><p className="text-fg-2">This object is no longer available.</p></div>
      ) : (
        <article className="flex flex-col items-center">
          <div className="mt-8 flex aspect-square w-36 items-center justify-center sm:mt-10 sm:w-40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url ?? undefined} alt={photo.label ? `Photo of ${photo.label}` : "Saved object"} className="h-full w-full object-contain" />
          </div>
          <h1 className="mt-5 text-center text-3xl font-semibold leading-tight tracking-tight">{photo.label === null ? "No clear object" : photo.label ?? "Not identified yet"}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-fg-2">
            <span>{photo.pronunciation || "Transcript unavailable"}</span>
            <Button variant="ghost" size="icon-sm" pending={audioBusyKey === "word"} aria-label={`Hear ${photo.label ?? "object"} pronounced`} disabled={!photo.label} onClick={() => { if (photo.label) void playAudio(photo.label, "word", photo.audioUrl); }}><Speaker aria-hidden="true" /></Button>
          </div>
          <Button variant="outline" className="mt-6" pending={sentencesPending} disabled={!photo.label} onClick={() => void openSentences()}>See in sentences</Button>
          {error && <p role="alert" className="mt-5 text-sm text-danger-text">{error}</p>}
          <section className="mt-16 w-full max-w-md sm:mt-20" aria-label="Collections">
            <div className="grid grid-cols-2 gap-4">
              {selectedCategories.length ? selectedCategories.map((category) => <div key={category._id} className="flex aspect-square flex-col items-start justify-between rounded-panel border border-line bg-surface p-4"><span aria-hidden="true" className="text-3xl">{categoryEmoji(category.name, category.emoji)}</span><h2 className="text-lg font-semibold">{category.name}</h2></div>) : <div className="flex aspect-square flex-col items-start justify-between rounded-panel border border-line bg-surface p-4"><span aria-hidden="true" className="text-3xl">{categoryEmoji("Uncategorized")}</span><h2 className="text-lg font-semibold">No collection</h2></div>}
              <div className="flex aspect-square flex-col overflow-hidden rounded-panel border border-line"><Button variant="ghost" size="icon-lg" className="w-full flex-1" aria-label="Edit collections" onClick={() => { setError(""); setCategoryOpen(true); }}><Plus aria-hidden="true" className="size-10" /></Button></div>
            </div>
          </section>
        </article>
      )}
      <Dialog.Root open={categoryOpen} onOpenChange={setCategoryOpen}>
        <Dialog.Portal container={portal}>
          <Dialog.Backdrop className="fixed inset-0 z-(--z-dialog) bg-scrim" />
          <Dialog.Popup className="fixed inset-x-4 top-1/2 z-(--z-dialog) mx-auto flex max-h-[90dvh] w-auto max-w-md -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-sheet bg-raised p-4 shadow-overlay sm:p-6">
            <div className="flex items-start justify-between gap-3"><Dialog.Title className="text-xl font-semibold">Edit collections</Dialog.Title><Dialog.Close className="rounded-control px-3 py-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Done</Dialog.Close></div>
            <div className="flex flex-col gap-2 overflow-y-auto">
              {categories.map((category) => { const selected = photo?.categoryIds.includes(category._id) ?? false; return <Button key={category._id} variant="secondary" className="w-full justify-start" aria-pressed={selected} onClick={() => void changeCategory(category._id, !selected)}><span aria-hidden="true" className="text-xl">{categoryEmoji(category.name, category.emoji)}</span><span>{category.name}</span>{selected && <Checkmark aria-hidden="true" className="ml-auto size-5" />}</Button>; })}
              <Button variant="ghost" className="w-full justify-start" aria-pressed={photo?.categoryIds.length === 0} onClick={() => void changeCategory(null, false)}><span aria-hidden="true" className="text-xl">{categoryEmoji("Uncategorized")}</span><span>No collection</span>{photo?.categoryIds.length === 0 && <Checkmark aria-hidden="true" className="ml-auto size-5" />}</Button>
            </div>
            <form onSubmit={(event) => void addCollection(event)} className="flex flex-col gap-3 border-t border-line pt-4">
              <Field><FieldLabel htmlFor="new-collection">New collection name</FieldLabel><Input id="new-collection" value={newCollection} onChange={(event) => setNewCollection(event.target.value)} /></Field>
              <div><p className="mb-2 text-sm font-medium">Choose an emoji</p><div className="flex flex-wrap gap-1" role="group" aria-label="Collection emoji">{EMOJI_OPTIONS.map((emoji) => <Button key={emoji} type="button" variant={newEmoji === emoji ? "secondary" : "ghost"} size="icon" aria-label={`Choose ${emoji} emoji`} aria-pressed={newEmoji === emoji} onClick={() => setNewEmoji(emoji)}>{emoji}</Button>)}</div></div>
              <Button type="submit" disabled={!newCollection.trim()}>Create collection</Button>
            </form>
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={sentencesOpen} onOpenChange={setSentencesOpen}>
        <Dialog.Portal container={portal}>
          <Dialog.Backdrop className="fixed inset-0 z-(--z-dialog) bg-scrim" />
          <Dialog.Popup className="fixed inset-x-0 bottom-0 z-(--z-dialog) mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-sheet bg-raised p-4 pb-8 shadow-overlay sm:p-6">
            <div className="flex items-start justify-between gap-3"><Dialog.Title className="text-xl font-semibold">{photo?.label} in sentences</Dialog.Title><Dialog.Close className="rounded-control px-3 py-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Close</Dialog.Close></div>
            {sentencesPending && <p role="status" className="flex items-center gap-2 text-sm text-fg-2"><Spinner />Loading sentences…</p>}
            {sentencesError && <div role="alert" className="flex flex-col items-start gap-2 text-sm text-danger-text"><p>{sentencesError}</p><Button variant="outline" size="sm" onClick={() => void openSentences()}>Try again</Button></div>}
            {sentences && <ul className="flex flex-col gap-4">{sentences.map((sentence, index) => <li key={index} className="rounded-panel bg-surface p-4"><div className="flex items-start justify-between gap-3"><p className="text-base"><HighlightedSentence text={sentence.text} word={photo?.label ?? ""} /></p><Button variant="ghost" size="icon-sm" pending={audioBusyKey === `sentence-${index}`} aria-label={`Hear sentence ${index + 1}`} onClick={() => void playAudio(sentence.text, `sentence-${index}`, sentence.audioUrl, index)}><Speaker aria-hidden="true" /></Button></div><p className="mt-2 text-sm text-fg-2">{sentence.translation}</p></li>)}</ul>}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
