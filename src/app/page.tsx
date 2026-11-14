"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon, Image } from "@/components/lime/icon";
import { Dropzone } from "@/components/lime/ui/dropzone";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { isLanguage, type Language } from "@/lib/languages";
import { categoryEmoji } from "@/lib/category-emoji";
import { resizeForIdentification } from "@/lib/resize-for-identification";
import { useLimePortal } from "@/lib/lime/portal";
type Photo = NonNullable<ReturnType<typeof useQuery<typeof api.photos.list>>>[number];
type IdentifiablePhoto = Pick<Photo, "_id" | "url">;

function CategoryCard({ name, photos }: { name: string; photos: Photo[] }) {
  const [open, setOpen] = useState(false);
  const portal = useLimePortal();
  const emoji = categoryEmoji(name);

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
            <img key={photo._id} src={photo.url ?? undefined} alt="" className="aspect-square w-full rounded-field bg-surface-2 object-cover" />
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
                <img src={photo.url ?? undefined} alt="" className="size-(--control-lg) shrink-0 rounded-field bg-surface-2 object-cover" />
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
      await applyIdentification({ ownerId, photoId: photo._id, language: photoLanguage, label, suggestedCategory });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not identify the object.");
    }
  }

  function queueIdentification(photo: IdentifiablePhoto, photoLanguage: Language, sourceFile?: Blob) {
    identificationQueueRef.current = identificationQueueRef.current
      .then(() => identifyPhoto(photo, photoLanguage, sourceFile));
  }

  async function handlePhotoSelection(files: FileList) {
    if (!ownerId) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (selected.length === 0) {
      setError("Choose a photo to add.");
      return;
    }

    try {
      for (const file of selected) {
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error("Upload failed.");
        const { storageId } = await response.json() as { storageId: Id<"_storage"> };
        const photoId = await createPhoto({ ownerId, storageId, language });
        queueIdentification({ _id: photoId, url: null }, language, file);
      }
      setError("");
    } catch {
      setError("Photos could not be saved. Please try again.");
    }
  }

  const groupedPhotos: { id: string; name: string; photos: Photo[] }[] = categories.map((category) => ({
    id: category._id,
    name: category.name,
    photos: photos.filter((photo) => photo.categoryId === category._id),
  })).filter((group) => group.photos.length > 0);
  const uncategorized = photos.filter((photo) => !photo.categoryId || !categories.some((category) => category._id === photo.categoryId));
  if (uncategorized.length > 0) groupedPhotos.push({ id: "uncategorized", name: "Uncategorized", photos: uncategorized });

  return (
    <div className="relative min-h-dvh bg-page text-fg">
      <div className="absolute left-4 top-4 z-10">
        <LanguagePicker value={language} onChange={handleLanguageChange} />
      </div>
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:px-6">
        {!ownerId ? <p role="alert" className="pt-20 text-sm text-danger-text">{error}</p> : !dataReady ? null : photos.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <Icon icon={Image} size={48} className="text-fg-2" />
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">No photos yet</h1>
              <p className="max-w-md text-base text-fg-2">Add your first photo to see it here.</p>
            </div>
            <Dropzone size="lg" onFilesSelected={handlePhotoSelection} />
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-20">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Your photos</h1>
              <Dropzone onFilesSelected={handlePhotoSelection} />
            </div>
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {groupedPhotos.map((group) => <CategoryCard key={group.id} name={group.name} photos={group.photos} />)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
