"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/lime/ui/button";
import { CategoryPicker } from "@/components/lime/ui/category-picker";
import { isLanguage, type Language } from "@/lib/languages";
import { resizeForIdentification } from "@/lib/resize-for-identification";

export default function ObjectPage() {
  const { id } = useParams<{ id: string }>();
  const convex = useConvex();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const photoResults = useQuery(api.photos.list, ownerId ? { ownerId } : "skip");
  const photo = photoResults?.find((item) => item._id === id) ?? null;
  const categoryResults = useQuery(api.categories.list, ownerId ? { ownerId } : "skip");
  const categories = categoryResults ?? [];
  const assignCategory = useMutation(api.photos.assignCategory);
  const applyIdentification = useMutation(api.photos.applyIdentification);

  useEffect(() => {
    try {
      setOwnerId(localStorage.getItem("bcup-owner-id"));
    } catch {
      setError("Browser storage is required to access this object.");
    }
  }, []);

  async function changeCategory(categoryId: Id<"categories"> | null) {
    if (!ownerId || !photo) return;
    try {
      await assignCategory({ ownerId, photoId: photo._id, categoryId });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change category.");
    }
  }

  async function retryIdentification() {
    if (!ownerId || !photo?.url) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(photo.url);
      if (!response.ok) throw new Error("Photo could not be loaded.");
      const resized = await resizeForIdentification(await response.blob());
      const language: Language = isLanguage(photo.language) ? photo.language : "Spanish";
      const currentCategories = await convex.query(api.categories.list, { ownerId });
      const form = new FormData();
      form.append("photo", resized, "photo.jpg");
      form.append("language", language);
      form.append("categories", JSON.stringify(currentCategories.map((category) => category.name)));
      const resultResponse = await fetch("/api/identify", { method: "POST", body: form });
      const result: unknown = await resultResponse.json();
      if (!resultResponse.ok || !result || typeof result !== "object" || !("label" in result) || !("category" in result)) {
        throw new Error("Identification request failed.");
      }
      const { label, category } = result;
      if (!(typeof label === "string" || label === null) || !(typeof category === "string" || category === null)) {
        throw new Error("Invalid identification result.");
      }
      await applyIdentification({ ownerId, photoId: photo._id, language, label, suggestedCategory: category });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not identify the object.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8 text-fg sm:px-6">
      <Link href="/" className="w-fit rounded-field text-sm text-fg-2 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">← Back to categories</Link>
      {!ownerId ? <p role="alert">{error || "This object is unavailable."}</p> : photoResults === undefined || categoryResults === undefined ? null : photo === null ? (
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Object not found</h1>
          <p className="text-fg-2">This object is no longer available.</p>
        </div>
      ) : (
        <article className="flex flex-col gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url ?? undefined} alt={photo.label ? `Photo of ${photo.label}` : "Saved photo"} className="aspect-square w-full rounded-panel object-contain" />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold leading-tight">{photo.label === null ? "No clear object" : photo.label ?? "Not identified yet"}</h1>
            <p className="text-sm text-fg-2">{photo.language}</p>
          </div>
          <div className="flex max-w-md flex-col gap-2">
            <label className="text-sm font-medium text-fg">Category</label>
            <CategoryPicker categories={categories} value={photo.categoryId ?? null} onChange={(categoryId) => void changeCategory(categoryId)} />
          </div>
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          <Button className="w-fit" pending={pending} onClick={() => void retryIdentification()}>{photo.label === undefined ? "Identify object" : "Retry AI"}</Button>
        </article>
      )}
    </main>
  );
}
