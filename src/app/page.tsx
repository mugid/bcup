"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Image } from "@/components/lime/icon";
import { Button } from "@/components/lime/ui/button";
import { CategoryPicker } from "@/components/lime/ui/category-picker";
import { Chip } from "@/components/lime/ui/chip";
import { Dropzone } from "@/components/lime/ui/dropzone";
import { Field, FieldLabel } from "@/components/lime/ui/field";
import { Input } from "@/components/lime/ui/input";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { isLanguage, type Language } from "@/lib/languages";
import {
  applyIdentification,
  assignPhotoCategory,
  createCategory,
  openPhotoDatabase,
  readCategories,
  readPhotos,
  savePhotos,
  type Category,
  type SavedPhoto,
} from "@/lib/photo-store";

type DisplayPhoto = SavedPhoto & { url: string };

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
  const databaseRef = useRef<IDBDatabase | null>(null);
  const urlsRef = useRef<string[]>([]);
  const identificationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | "all" | "uncategorized">("all");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [createCategoryError, setCreateCategoryError] = useState("");
  const [categoryErrors, setCategoryErrors] = useState<Record<number, string>>({});
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [photoErrors, setPhotoErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("Spanish");

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

  useEffect(() => {
    let active = true;
    let database: IDBDatabase | null = null;

    openPhotoDatabase()
      .then(async (opened) => {
        database = opened;
        if (!active) {
          opened.close();
          return;
        }
        databaseRef.current = opened;
        const [saved, storedCategories] = await Promise.all([
          readPhotos(opened),
          readCategories(opened),
        ]);
        if (!active) return;
        const displayed = saved.map((photo) => ({
          ...photo,
          url: URL.createObjectURL(photo.file),
        }));
        urlsRef.current = displayed.map((photo) => photo.url);
        setPhotos(displayed);
        setCategories(storedCategories);
      })
      .catch(() => {
        if (active) setError("Photos could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      database?.close();
      databaseRef.current = null;
      urlsRef.current.forEach(URL.revokeObjectURL);
      urlsRef.current = [];
    };
  }, []);

  async function identifyPhoto(photo: SavedPhoto, photoLanguage: Language) {
    try {
      const database = databaseRef.current;
      if (!database) return;
      const resized = await resizeForIdentification(photo.file);
      if (!databaseRef.current) return;
      const form = new FormData();
      form.append("photo", resized, "photo.jpg");
      form.append("language", photoLanguage);
      const existingCategories = await readCategories(database);
      form.append("categories", JSON.stringify(existingCategories.map((category) => category.name)));
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
      const updated = await applyIdentification(database, photo.id, photoLanguage, label, suggestedCategory);
      setPhotos((current) => current.map((item) => item.id === photo.id
        ? {
          ...item,
          language: photoLanguage,
          label,
          categoryId: item.categorySource === "manual" ? item.categoryId : updated.photo.categoryId,
          categorySource: item.categorySource === "manual" ? "manual" : updated.photo.categorySource,
        }
        : item));
      if (updated.category) setCategories(await readCategories(database));
      setPhotoErrors((current) => {
        const next = { ...current };
        delete next[photo.id];
        return next;
      });
    } catch (error) {
      if (!databaseRef.current) return;
      setPhotoErrors((current) => ({
        ...current,
        [photo.id]: error instanceof Error ? error.message : "Could not identify the object.",
      }));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(photo.id);
        return next;
      });
    }
  }

  function queueIdentification(photo: SavedPhoto, photoLanguage: Language) {
    setPendingIds((current) => new Set(current).add(photo.id));
    setPhotoErrors((current) => {
      const next = { ...current };
      delete next[photo.id];
      return next;
    });
    identificationQueueRef.current = identificationQueueRef.current
      .then(() => identifyPhoto(photo, photoLanguage))
      .catch(() => {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(photo.id);
          return next;
        });
      });
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const database = databaseRef.current;
    if (!database) return;
    try {
      await createCategory(database, categoryName);
      setCategories(await readCategories(database));
      setActiveCategory("all");
      setCategoryName("");
      setCreateCategoryError("");
      setShowCategoryForm(false);
    } catch (cause) {
      setCreateCategoryError(cause instanceof Error ? cause.message : "Could not create category.");
    }
  }

  async function handleCategoryChange(photoId: number, categoryId: number | null) {
    const database = databaseRef.current;
    if (!database) return;
    try {
      const updated = await assignPhotoCategory(database, photoId, categoryId);
      setPhotos((current) => current.map((photo) => photo.id === photoId
        ? { ...photo, categoryId: updated.categoryId, categorySource: "manual" }
        : photo));
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
    const database = databaseRef.current;
    if (!database) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (selected.length === 0) {
      setError("Choose a photo to add.");
      return;
    }

    try {
      const saved = await savePhotos(database, selected, language);
      const displayed = saved.map((photo) => ({ ...photo, url: URL.createObjectURL(photo.file) }));
      urlsRef.current.push(...displayed.map((photo) => photo.url));
      setPhotos((current) => [...current, ...displayed]);
      setError("");
      saved.forEach((photo) => queueIdentification(photo, language));
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
        {loading ? null : photos.length === 0 ? (
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
                <Chip key={category.id} selected={activeCategory === category.id} onClick={() => setActiveCategory(category.id)}>
                  {category.name} ({photos.filter((photo) => photo.categoryId === category.id).length})
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
                const pending = pendingIds.has(photo.id);
                const photoError = photoErrors[photo.id];
                const categoryError = categoryErrors[photo.id];
                return (
                  <figure key={photo.id} className="flex min-w-0 flex-col gap-2">
                    {/* Local object URLs need a plain image element. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
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
                      <CategoryPicker categories={categories} value={photo.categoryId ?? null} onChange={(categoryId) => void handleCategoryChange(photo.id, categoryId)} />
                      {categoryError && <span role="alert" className="text-sm text-danger-text">{categoryError}</span>}
                      <Button
                        variant="secondary"
                        size="sm"
                        pending={pending}
                        onClick={() => queueIdentification(photo, photo.language ?? language)}
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
