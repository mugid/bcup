"use client";

import { useEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon, Image } from "@/components/lime/icon";
import { Button } from "@/components/lime/ui/button";
import { CategoryPicker } from "@/components/lime/ui/category-picker";
import { Chip } from "@/components/lime/ui/chip";
import { Dropzone } from "@/components/lime/ui/dropzone";
import { Field, FieldLabel } from "@/components/lime/ui/field";
import { Input } from "@/components/lime/ui/input";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { isLanguage, type Language } from "@/lib/languages";
type Photo = NonNullable<ReturnType<typeof useQuery<typeof api.photos.list>>>[number];
type IdentifiablePhoto = Pick<Photo, "_id" | "url">;

async function resizeForIdentification(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("Invalid image dimensions");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image processing failed")), "image/jpeg", 0.85);
    });
  } finally {
    bitmap.close();
  }
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
  const createCategory = useMutation(api.categories.create);
  const assignPhotoCategory = useMutation(api.photos.assignCategory);
  const applyIdentification = useMutation(api.photos.applyIdentification);
  const identificationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [activeCategory, setActiveCategory] = useState<Id<"categories"> | "all" | "uncategorized">("all");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [createCategoryError, setCreateCategoryError] = useState("");
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [photoErrors, setPhotoErrors] = useState<Record<string, string>>({});
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
      setPhotoErrors((current) => {
        const next = { ...current };
        delete next[photo._id];
        return next;
      });
    } catch (error) {
      setPhotoErrors((current) => ({
        ...current,
        [photo._id]: error instanceof Error ? error.message : "Could not identify the object.",
      }));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(photo._id);
        return next;
      });
    }
  }

  function queueIdentification(photo: IdentifiablePhoto, photoLanguage: Language, sourceFile?: Blob) {
    setPendingIds((current) => new Set(current).add(photo._id));
    setPhotoErrors((current) => {
      const next = { ...current };
      delete next[photo._id];
      return next;
    });
    identificationQueueRef.current = identificationQueueRef.current
      .then(() => identifyPhoto(photo, photoLanguage, sourceFile))
      .catch(() => {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(photo._id);
          return next;
        });
      });
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerId) return;
    try {
      await createCategory({ ownerId, value: categoryName });
      setActiveCategory("all");
      setCategoryName("");
      setCreateCategoryError("");
      setShowCategoryForm(false);
    } catch (cause) {
      setCreateCategoryError(cause instanceof Error ? cause.message : "Could not create category.");
    }
  }

  async function handleCategoryChange(photoId: Id<"photos">, categoryId: Id<"categories"> | null) {
    if (!ownerId) return;
    try {
      await assignPhotoCategory({ ownerId, photoId, categoryId });
      setCategoryErrors((current) => {
        const next = { ...current };
        delete next[photoId];
        return next;
      });
    } catch (cause) {
      setCategoryErrors((current) => ({
        ...current,
        [photoId]: cause instanceof Error ? cause.message : "Could not change category.",
      }));
    }
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

  const visiblePhotos = photos.filter((photo) => activeCategory === "all" ||
    (activeCategory === "uncategorized" ? photo.categoryId == null : photo.categoryId === activeCategory));

  const categoryForm = showCategoryForm && (
    <form onSubmit={handleCreateCategory} className="flex w-full max-w-md flex-col gap-3 rounded-panel bg-surface p-4 text-left">
      <Field>
        <FieldLabel htmlFor="new-category-name">Category name</FieldLabel>
        <Input
          id="new-category-name"
          type="text"
          value={categoryName}
          maxLength={60}
          onChange={(event) => {
            setCategoryName(event.target.value);
            setCreateCategoryError("");
          }}
          placeholder="e.g. Kitchen"
        />
      </Field>
      {createCategoryError && <p role="alert" className="text-sm text-danger-text">{createCategoryError}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="solid" size="sm">Save category</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => {
          setShowCategoryForm(false);
          setCategoryName("");
          setCreateCategoryError("");
        }}>Cancel</Button>
      </div>
    </form>
  );

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
            {!showCategoryForm && <Button variant="secondary" onClick={() => setShowCategoryForm(true)}>Create category</Button>}
            {categoryForm}
            {categories.length > 0 && (
              <p className="max-w-md text-sm text-fg-2">Your categories: {categories.map((category) => category.name).join(", ")}</p>
            )}
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-20">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Your photos</h1>
              <Dropzone onFilesSelected={handlePhotoSelection} />
            </div>
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
            <div className="flex flex-col items-start gap-3">
              {!showCategoryForm && <Button variant="secondary" size="sm" onClick={() => setShowCategoryForm(true)}>Create category</Button>}
              {categoryForm}
            </div>
            <div aria-label="Filter photos by category" className="flex gap-2 overflow-x-auto pb-1">
              <Chip selected={activeCategory === "all"} onClick={() => setActiveCategory("all")}>All photos ({photos.length})</Chip>
              <Chip selected={activeCategory === "uncategorized"} onClick={() => setActiveCategory("uncategorized")}>Uncategorized ({photos.filter((photo) => photo.categoryId == null).length})</Chip>
              {categories.map((category) => (
                <Chip key={category._id} selected={activeCategory === category._id} onClick={() => setActiveCategory(category._id)}>
                  {category.name} ({photos.filter((photo) => photo.categoryId === category._id).length})
                </Chip>
              ))}
            </div>
            {visiblePhotos.length === 0 ? (
              <div className="flex flex-col items-start gap-3 py-8">
                <p className="text-base text-fg-2">No photos in this category yet.</p>
                <Button variant="secondary" size="sm" onClick={() => setActiveCategory("all")}>Show all photos</Button>
              </div>
            ) : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {visiblePhotos.map((photo) => {
                const pending = pendingIds.has(photo._id);
                const photoError = photoErrors[photo._id];
                const categoryError = categoryErrors[photo._id];
                return (
                  <figure key={photo._id} className="flex min-w-0 flex-col gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url ?? undefined}
                      alt={photo.label ? `Photo of ${photo.label}` : "Saved photo"}
                      className="aspect-square w-full rounded-panel bg-surface object-cover"
                    />
                    <figcaption className="flex min-w-0 flex-col items-start gap-1">
                      <p aria-live="polite" className="text-base font-semibold text-fg">
                        {photo.label === null ? "No clear object" : photo.label ??
                          (pending ? "Identifying…" : photoError ? "Could not identify" : "Not identified")}
                      </p>
                      {photo.language && <span className="text-xs text-fg-2">{photo.language}</span>}
                      {photo.label !== undefined && pending && <span className="text-xs text-fg-2">Identifying…</span>}
                      {photoError && <span role="alert" className="text-xs text-danger-text">{photoError}</span>}
                      <span className="mt-2 text-sm text-fg-2">Category</span>
                      <CategoryPicker categories={categories} value={photo.categoryId ?? null} onChange={(categoryId) => void handleCategoryChange(photo._id, categoryId)} />
                      {categoryError && <span role="alert" className="text-sm text-danger-text">{categoryError}</span>}
                      <Button
                        variant="secondary"
                        size="sm"
                        pending={pending}
                        onClick={() => queueIdentification(photo, isLanguage(photo.language) ? photo.language : language)}
                      >
                        {photo.language ? "Retry AI" : "Identify"}
                      </Button>
                    </figcaption>
                  </figure>
                );
              })}
            </div>}
          </div>
        )}
      </main>
    </div>
  );
}
