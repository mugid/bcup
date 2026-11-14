"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon, Image } from "@/components/lime/icon";
import { Spinner } from "@/components/lime/ui/button";
import { Dropzone } from "@/components/lime/ui/dropzone";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { isLanguage, type Language } from "@/lib/languages";
import { categoryEmoji } from "@/lib/category-emoji";
import { cropTransparentObject } from "@/lib/cutout";
import { resizeForIdentification } from "@/lib/resize-for-identification";
import { useLimePortal } from "@/lib/lime/portal";
type Photo = NonNullable<ReturnType<typeof useQuery<typeof api.photos.list>>>[number];
type IdentifiablePhoto = Pick<Photo, "_id" | "url">;

function CategoryCard({ name, emoji: savedEmoji, photos }: { name: string; emoji?: string; photos: Photo[] }) {
  const [open, setOpen] = useState(false);
  const portal = useLimePortal();
  const emoji = categoryEmoji(name, savedEmoji);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="flex w-full flex-col gap-4 rounded-panel border border-line bg-surface p-4 text-left transition-[background-color] duration-(--dur-fast) hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="flex w-full items-start justify-between gap-3">
          <span className="min-w-0 text-lg font-semibold text-fg">{emoji} {name}</span>
          <span className="shrink-0 text-sm text-fg-2">{photos.length} {photos.length === 1 ? "object" : "objects"}</span>
        </span>
        <span className="grid w-full grid-cols-3 gap-2">
          {photos.slice(0, 3).map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo._id} src={photo.url ?? undefined} alt="" className="aspect-square w-full rounded-field object-contain" />
          ))}
        </span>
      </Dialog.Trigger>
      <Dialog.Portal container={portal}>
        <Dialog.Backdrop className="fixed inset-0 z-(--z-dialog) bg-scrim" />
        <Dialog.Popup className="fixed left-4 top-1/2 z-(--z-dialog) flex max-h-[90dvh] inset-x-4 sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-overlay sm:-translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-sheet bg-raised p-4 shadow-overlay sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-xl font-semibold text-fg">{emoji} {name}</Dialog.Title>
            <Dialog.Close className="rounded-control px-3 py-2 text-sm text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Close</Dialog.Close>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto">
            {photos.map((photo) => (
              <Link key={photo._id} href={`/objects/${photo._id}`} className="flex items-center gap-3 rounded-panel p-2 text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url ?? undefined} alt="" className="size-(--control-lg) shrink-0 rounded-field object-contain" />
                <span className="min-w-0 truncate text-base font-medium">{photo.label === null ? "No clear object" : photo.label ?? "Identifying…"}</span>
                <span aria-hidden="true" className="ml-auto text-fg-2">›</span>
              </Link>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function Home() {
  const convex = useConvex();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const photoResults = useQuery(api.photos.list, ownerId ? { ownerId } : "skip");
  const categoryResults = useQuery(api.categories.list, ownerId ? { ownerId } : "skip");
  const photos = photoResults ?? [];
  const categories = categoryResults ?? [];
  const dataReady = photoResults !== undefined && categoryResults !== undefined;
  const createPhoto = useMutation(api.photos.create);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const applyIdentification = useMutation(api.photos.applyIdentification);
  const identificationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isPreparing, setIsPreparing] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("Spanish");

  useEffect(() => {
    try {
      let saved = localStorage.getItem("bcup-owner-id");
      if (!saved) {
        saved = crypto.randomUUID();
        localStorage.setItem("bcup-owner-id", saved);
      }
      setOwnerId(saved);
    } catch {
      setError("Browser storage is required to access your photos.");
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bcup-language");
      if (isLanguage(saved)) setLanguage(saved);
    } catch {
      // Keep the default when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!photoResults) return;
    setPendingIds((current) => {
      const completed = photoResults.filter((photo) => photo.label !== undefined && current.has(photo._id));
      if (completed.length === 0) return current;
      const next = new Set(current);
      for (const photo of completed) next.delete(photo._id);
      return next;
    });
  }, [photoResults]);

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage);
    try {
      localStorage.setItem("bcup-language", nextLanguage);
    } catch {
      // The selection still works for the current visit.
    }
  }

  async function identifyPhoto(photo: IdentifiablePhoto, photoLanguage: Language, sourceFile?: Blob) {
    try {
      if (!ownerId) return;
      const file = sourceFile ?? (photo.url
        ? await fetch(photo.url).then((response) => {
          if (!response.ok) throw new Error("Photo could not be loaded.");
          return response.blob();
        })
        : null);
      if (!file) throw new Error("Photo could not be loaded.");
      const resized = await resizeForIdentification(file);
      const form = new FormData();
      form.append("photo", resized, "photo.jpg");
      form.append("language", photoLanguage);
      const currentCategories = await convex.query(api.categories.list, { ownerId });
      form.append("categories", JSON.stringify(currentCategories.map((category) => category.name)));
      const response = await fetch("/api/identify", { method: "POST", body: form });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result &&
          typeof result.error === "string" ? result.error : "Identification request failed.";
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("label" in result) || !("category" in result)) {
        throw new Error("Invalid identification result");
      }
      const label = result.label;
      const suggestedCategory = result.category;
      if (!(typeof label === "string" || label === null) ||
          !(typeof suggestedCategory === "string" || suggestedCategory === null)) {
        throw new Error("Invalid identification result");
      }
      const pronunciation = "pronunciation" in result && typeof result.pronunciation === "string" ? result.pronunciation : null;
      await applyIdentification({ ownerId, photoId: photo._id, language: photoLanguage, label, suggestedCategory, pronunciation });
      setError("");
    } catch (cause) {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(photo._id);
        return next;
      });
      setError(cause instanceof Error ? cause.message : "Could not identify the object.");
    }
  }

  function queueIdentification(photo: IdentifiablePhoto, photoLanguage: Language, sourceFile?: Blob) {
    setPendingIds((current) => new Set(current).add(photo._id));
    identificationQueueRef.current = identificationQueueRef.current
      .then(() => identifyPhoto(photo, photoLanguage, sourceFile));
  }

  async function handlePhotoSelection(files: File[]) {
    if (!ownerId || isPreparing) return;
    const selected = files.filter((file) => file.type.startsWith("image/"));
    if (selected.length === 0) {
      setError("Choose a photo to add.");
      return;
    }

    setIsPreparing(true);
    try {
      for (const file of selected) {
        const form = new FormData();
        form.append("photo", await resizeForIdentification(file, 1024), "photo.jpg");
        const removalResponse = await fetch("/api/remove-background", { method: "POST", body: form });
        if (!removalResponse.ok) {
          const result: unknown = await removalResponse.json().catch(() => null);
          throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string"
            ? result.error : "Could not remove the background.");
        }
        const cutout = await cropTransparentObject(await removalResponse.blob());
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: cutout });
        if (!response.ok) throw new Error("Upload failed.");
        const { storageId } = await response.json() as { storageId: Id<"_storage"> };
        const photoId = await createPhoto({ ownerId, storageId, language });
        queueIdentification({ _id: photoId, url: null }, language, file);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photos could not be saved. Please try again.");
    } finally {
      setIsPreparing(false);
    }
  }

  const readyPhotos = photos.filter((photo) => photo.label !== undefined);
  const needsIdentification = photos.filter((photo) => photo.label === undefined && !pendingIds.has(photo._id));
  const groupedPhotos: { id: string; name: string; emoji?: string; photos: Photo[] }[] = categories.map((category) => ({
    id: category._id,
    name: category.name,
    emoji: category.emoji,
    photos: readyPhotos.filter((photo) => photo.categoryIds.includes(category._id)),
  })).filter((group) => group.photos.length > 0);
  const uncategorized = readyPhotos.filter((photo) => !photo.categoryIds.some((id) => categories.some((category) => category._id === id)));
  if (uncategorized.length > 0) groupedPhotos.push({ id: "uncategorized", name: "Uncategorized", photos: uncategorized });

  return (
    <div className="relative min-h-dvh bg-page text-fg">
      <div className="absolute left-4 top-4 z-10">
        <LanguagePicker value={language} onChange={handleLanguageChange} />
      </div>
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:px-6">
        {!ownerId ? <p role="alert" className="pt-20 text-sm text-danger-text">{error}</p> : !dataReady ? null : photos.length === 0 && !isPreparing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <Icon icon={Image} size={48} className="text-fg-2" />
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">No photos yet</h1>
              <p className="max-w-md text-base text-fg-2">Add your first photo to see it here.</p>
            </div>
            <Dropzone size="lg" onFilesSelected={handlePhotoSelection} disabled={isPreparing} />
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-20">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Your photos</h1>
              <Dropzone onFilesSelected={handlePhotoSelection} disabled={isPreparing} />
            </div>
            {(isPreparing || pendingIds.size > 0) && (
              <p role="status" className="flex items-center gap-2 text-sm text-fg-2">
                <Spinner size={16} />
                {isPreparing ? "Preparing photos…" : "Identifying photos…"}
              </p>
            )}
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {groupedPhotos.map((group) => <CategoryCard key={group.id} name={group.name} emoji={group.emoji} photos={group.photos} />)}
            </div>
            {needsIdentification.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">Needs identification</h2>
                {needsIdentification.map((photo) => (
                  <Link key={photo._id} href={`/objects/${photo._id}`} className="flex items-center gap-3 rounded-panel p-2 text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url ?? undefined} alt="" className="size-(--control-lg) shrink-0 rounded-field object-contain" />
                    <span className="text-sm">Open photo to retry</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
