import type { Language } from "@/lib/languages";

const DATABASE_NAME = "bcup-photos";
const PHOTO_STORE = "photos";
const CATEGORY_STORE = "categories";

export type SavedPhoto = {
  id: number;
  file: Blob;
  language?: Language;
  label?: string | null;
  categoryId?: number | null;
  categorySource?: "ai" | "manual";
};

export type Category = {
  id: number;
  name: string;
  nameKey: string;
  origin: "ai" | "user";
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  const complete = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  void complete.catch(() => {});
  return complete;
}

export function cleanCategoryName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function categoryKey(name: string): string {
  return cleanCategoryName(name).toLocaleLowerCase("en-US");
}

export function validateCategoryName(value: string): string {
  const name = cleanCategoryName(value);
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("Enter a category name of up to 60 characters.");
  }
  return name;
}

export function openPhotoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!database.objectStoreNames.contains(CATEGORY_STORE)) {
        const categories = database.createObjectStore(CATEGORY_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        categories.createIndex("by_name_key", "nameKey", { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other tabs and reload to update photo storage."));
  });
}

export async function readPhotos(database: IDBDatabase): Promise<SavedPhoto[]> {
  return requestResult(database.transaction(PHOTO_STORE).objectStore(PHOTO_STORE).getAll());
}

export async function readCategories(database: IDBDatabase): Promise<Category[]> {
  const categories = await requestResult<Category[]>(
    database.transaction(CATEGORY_STORE).objectStore(CATEGORY_STORE).getAll(),
  );
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function savePhotos(database: IDBDatabase, files: File[], language: Language): Promise<SavedPhoto[]> {
  const transaction = database.transaction(PHOTO_STORE, "readwrite");
  const complete = transactionComplete(transaction);
  const store = transaction.objectStore(PHOTO_STORE);
  const requests = files.map((file) => requestResult(store.add({ file, language })));
  const ids = await Promise.all(requests);
  await complete;
  return files.map((file, index) => ({ id: ids[index] as number, file, language }));
}

export async function createCategory(database: IDBDatabase, value: string): Promise<Category> {
  const name = validateCategoryName(value);
  const nameKey = categoryKey(name);
  const transaction = database.transaction(CATEGORY_STORE, "readwrite");
  const complete = transactionComplete(transaction);
  const store = transaction.objectStore(CATEGORY_STORE);
  const existing = await requestResult<Category | undefined>(store.index("by_name_key").get(nameKey));
  if (existing) {
    await complete;
    throw new Error("This category already exists.");
  }
  const id = await requestResult(store.add({ name, nameKey, origin: "user" })) as number;
  await complete;
  return { id, name, nameKey, origin: "user" };
}

export async function assignPhotoCategory(
  database: IDBDatabase,
  photoId: number,
  categoryId: number | null,
): Promise<SavedPhoto> {
  const transaction = database.transaction([PHOTO_STORE, CATEGORY_STORE], "readwrite");
  const complete = transactionComplete(transaction);
  const photos = transaction.objectStore(PHOTO_STORE);
  const photo = await requestResult<SavedPhoto | undefined>(photos.get(photoId));
  if (!photo) throw new Error("Photo was not found.");
  if (categoryId !== null) {
    const category = await requestResult<Category | undefined>(
      transaction.objectStore(CATEGORY_STORE).get(categoryId),
    );
    if (!category) throw new Error("Category was not found.");
  }
  const updated: SavedPhoto = { ...photo, categoryId, categorySource: "manual" };
  photos.put(updated);
  await complete;
  return updated;
}

export async function applyIdentification(
  database: IDBDatabase,
  photoId: number,
  language: Language,
  label: string | null,
  suggestedCategory: string | null,
): Promise<{ photo: SavedPhoto; category?: Category }> {
  const transaction = database.transaction([PHOTO_STORE, CATEGORY_STORE], "readwrite");
  const complete = transactionComplete(transaction);
  const photos = transaction.objectStore(PHOTO_STORE);
  const photo = await requestResult<SavedPhoto | undefined>(photos.get(photoId));
  if (!photo) throw new Error("Photo was not found.");

  let category: Category | undefined;
  let categoryId: number | null = null;
  if (photo.categorySource !== "manual" && label && suggestedCategory) {
    const name = validateCategoryName(suggestedCategory);
    const nameKey = categoryKey(name);
    const categories = transaction.objectStore(CATEGORY_STORE);
    category = await requestResult<Category | undefined>(categories.index("by_name_key").get(nameKey));
    if (!category) {
      const id = await requestResult(categories.add({ name, nameKey, origin: "ai" })) as number;
      category = { id, name, nameKey, origin: "ai" };
    }
    categoryId = category.id;
  }

  const updated: SavedPhoto = photo.categorySource === "manual"
    ? { ...photo, language, label }
    : { ...photo, language, label, categoryId, categorySource: "ai" };
  photos.put(updated);
  await complete;
  return { photo: updated, category };
}
