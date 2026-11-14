"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Image } from "@/components/lime/icon";
import { Button } from "@/components/lime/ui/button";
import { Dropzone } from "@/components/lime/ui/dropzone";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { isLanguage, type Language } from "@/lib/languages";

const DATABASE_NAME = "bcup-photos";
const STORE_NAME = "photos";

type SavedPhoto = { id: number; file: Blob; language?: Language; label?: string | null };
type DisplayPhoto = SavedPhoto & { url: string };

function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, {
        keyPath: "id",
        autoIncrement: true,
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readPhotos(database: IDBDatabase): Promise<SavedPhoto[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as SavedPhoto[]);
    request.onerror = () => reject(request.error);
  });
}

function savePhotos(database: IDBDatabase, files: File[], language: Language): Promise<SavedPhoto[]> {
  return new Promise((resolve, reject) => {
    const saved: SavedPhoto[] = [];
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const file of files) {
      const request = store.add({ file, language });
      request.onsuccess = () => saved.push({ id: request.result as number, file, language });
    }
    transaction.oncomplete = () => resolve(saved);
    transaction.onerror = () => reject(transaction.error);
  });
}

function updatePhoto(database: IDBDatabase, id: number, changes: { language: Language; label?: string | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const photo = request.result as SavedPhoto | undefined;
      if (photo) store.put({ ...photo, ...changes });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

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
        const saved = await readPhotos(opened);
        if (!active) return;
        const displayed = saved.map((photo) => ({
          ...photo,
          url: URL.createObjectURL(photo.file),
        }));
        urlsRef.current = displayed.map((photo) => photo.url);
        setPhotos(displayed);
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
      if (!photo.language) {
        await updatePhoto(database, photo.id, { language: photoLanguage });
        setPhotos((current) => current.map((item) => item.id === photo.id
          ? { ...item, language: photoLanguage }
          : item));
      }
      const resized = await resizeForIdentification(photo.file);
      if (!databaseRef.current) return;
      const form = new FormData();
      form.append("photo", resized, "photo.jpg");
      form.append("language", photoLanguage);
      const response = await fetch("/api/identify", { method: "POST", body: form });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result &&
          typeof result.error === "string" ? result.error : "Identification request failed.";
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("label" in result)) {
        throw new Error("Invalid identification result");
      }
      const label = result.label;
      if (!(typeof label === "string" || label === null)) throw new Error("Invalid identification result");
      await updatePhoto(database, photo.id, { language: photoLanguage, label });
      setPhotos((current) => current.map((item) => item.id === photo.id
        ? { ...item, language: photoLanguage, label }
        : item));
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
      .then(() => identifyPhoto(photo, photoLanguage));
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
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-6 pt-20">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Your photos</h1>
              <Dropzone onFilesSelected={handlePhotoSelection} />
            </div>
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {photos.map((photo) => {
                const pending = pendingIds.has(photo.id);
                const photoError = photoErrors[photo.id];
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
