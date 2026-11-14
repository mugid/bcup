"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Image } from "@/components/lime/icon";
import { Dropzone } from "@/components/lime/ui/dropzone";
import { LanguagePicker, LANGUAGES, type Language } from "@/components/lime/ui/language-picker";

const DATABASE_NAME = "bcup-photos";
const STORE_NAME = "photos";

type SavedPhoto = { id: number; file: Blob };
type DisplayPhoto = { id: number; url: string };

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

function savePhotos(database: IDBDatabase, files: FileList): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        transaction.objectStore(STORE_NAME).add({ file });
      }
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export default function Home() {
  const databaseRef = useRef<IDBDatabase | null>(null);
  const urlsRef = useRef<string[]>([]);
  const [photos, setPhotos] = useState<DisplayPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("Spanish");

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
          id: photo.id,
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

  async function handlePhotoSelection(files: FileList) {
    const database = databaseRef.current;
    if (!database) return;

    try {
      await savePhotos(database, files);
      const saved = await readPhotos(database);
      const displayed = saved.map((photo) => ({
        id: photo.id,
        url: URL.createObjectURL(photo.file),
      }));
      urlsRef.current.forEach(URL.revokeObjectURL);
      urlsRef.current = displayed.map((photo) => photo.url);
      setPhotos(displayed);
      setError("");
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
            <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              No photos yet
            </h1>
            <p className="max-w-md text-base text-fg-2">
              Add your first photo to see it here.
            </p>
          </div>
          <Dropzone size="lg" onFilesSelected={handlePhotoSelection} />
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-6 pt-20">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              Your photos
            </h1>
            <Dropzone onFilesSelected={handlePhotoSelection} />
          </div>
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              // Local object URLs need a plain image element.
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
