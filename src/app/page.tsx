"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon, Image } from "@/components/lime/icon";
import { Dropzone } from "@/components/lime/ui/dropzone";
import { LanguagePicker, LANGUAGES, type Language } from "@/components/lime/ui/language-picker";

const DATABASE_NAME = "bcup-photos";
const STORE_NAME = "photos";
const OWNER_TOKEN_KEY = "bcup-photo-owner";
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type SavedPhoto = { id: number; file: Blob };

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

function deleteLegacyPhoto(database: IDBDatabase, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export default function Home() {
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("Spanish");
  const photos = useQuery(api.photos.list, ownerToken ? { ownerToken } : "skip");
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const savePhoto = useMutation(api.photos.save);

  useEffect(() => {
    let active = true;
    try {
      const saved = localStorage.getItem("bcup-language");
      if (LANGUAGES.some((option) => option === saved)) {
        queueMicrotask(() => {
          if (active) setLanguage(saved as Language);
        });
      }
    } catch {
      // Keep the default when browser storage is unavailable.
    }
    return () => { active = false; };
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
    try {
      let token = localStorage.getItem(OWNER_TOKEN_KEY);
      if (!token) {
        token = crypto.randomUUID();
        localStorage.setItem(OWNER_TOKEN_KEY, token);
      }
      queueMicrotask(() => { if (active) setOwnerToken(token); });
    } catch {
      queueMicrotask(() => {
        if (active) setError("Browser storage is required to save photos.");
      });
    }
    return () => { active = false; };
  }, []);

  async function uploadPhoto(file: Blob, selectedLanguage: Language, legacyId?: number) {
    if (!ownerToken) throw new Error("Photo storage is not ready");
    if (!file.type.startsWith("image/") || file.size > MAX_PHOTO_BYTES) {
      throw new Error("Only images up to 10 MB can be saved.");
    }

    const uploadUrl = await generateUploadUrl({ ownerToken });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Photo upload failed. Please try again.");

    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("storageId" in result) || typeof result.storageId !== "string") {
      throw new Error("Photo upload failed. Please try again.");
    }
    const saved = await savePhoto({
      ownerToken,
      storageId: result.storageId as Id<"_storage">,
      language: selectedLanguage,
      legacyId,
    });
    if (!saved.ok) throw new Error(saved.message);
  }

  useEffect(() => {
    if (!ownerToken) return;
    let active = true;
    let database: IDBDatabase | null = null;

    async function migrateLegacyPhotos() {
      try {
        database = await openPhotoDatabase();
        const saved = await readPhotos(database);
        for (const photo of saved) {
          await uploadPhoto(photo.file, language, photo.id);
          await deleteLegacyPhoto(database, photo.id);
        }
      } catch {
        if (active) setError("Some earlier photos could not be transferred. Please try again later.");
      } finally {
        database?.close();
        if (active) setMigrating(false);
      }
    }

    void migrateLegacyPhotos();
    return () => { active = false; };
    // The migration runs when the browser identity is ready; the current language is captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerToken]);

  async function handlePhotoSelection(files: FileList) {
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        await uploadPhoto(file, language);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photos could not be saved. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const loading = !error && (!ownerToken || photos === undefined || migrating);

  return (
    <div className="relative min-h-dvh bg-page text-fg">
      <div className="absolute left-4 top-4 z-10">
        <LanguagePicker value={language} onChange={handleLanguageChange} />
      </div>
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:px-6">
      {loading ? null : !photos?.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <Icon icon={Image} size={48} className="text-fg-2" />
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              No photos yet
            </h1>
            <p className="max-w-md text-base text-fg-2">
              Add your first photo to see it here.
            </p>
          </div>
          <Dropzone size="lg" disabled={!ownerToken || migrating} pending={uploading} onFilesSelected={handlePhotoSelection} />
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-6 pt-20">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              Your photos
            </h1>
            <Dropzone pending={uploading} onFilesSelected={handlePhotoSelection} />
          </div>
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              // Convex serves the saved photo from its file storage URL.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={photo.url}
                alt="Saved photo"
                className="aspect-square w-full rounded-panel bg-surface object-cover"
              />
            ))}
          </div>
        </div>
      )}
      </main>
    </div>
  );
}
