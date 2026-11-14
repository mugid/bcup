import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const photos = await ctx.db.query("photos").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return Promise.all(photos.map(async (photo) => ({
      ...photo,
      categoryIds: photo.categoryIds ?? (photo.categoryId ? [photo.categoryId] : []),
      url: await ctx.storage.getUrl(photo.storageId),
      audioUrl: photo.audioStorageId ? await ctx.storage.getUrl(photo.audioStorageId) : null,
      sentences: photo.sentences ? await Promise.all(photo.sentences.map(async (sentence) => ({
        ...sentence,
        audioUrl: sentence.audioStorageId ? await ctx.storage.getUrl(sentence.audioStorageId) : null,
      }))) : undefined,
    })));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: (ctx) => ctx.storage.generateUploadUrl(),
});

export const create = mutation({
  args: { ownerId: v.string(), storageId: v.id("_storage"), language: v.string() },
  handler: async (ctx, args) => ctx.db.insert("photos", args),
});

export const setCategoryMembership = mutation({
  args: { ownerId: v.string(), photoId: v.id("photos"), categoryId: v.union(v.id("categories"), v.null()), selected: v.boolean() },
  handler: async (ctx, { ownerId, photoId, categoryId, selected }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    const current = photo.categoryIds ?? (photo.categoryId ? [photo.categoryId] : []);
    if (categoryId !== null) {
      const category = await ctx.db.get(categoryId);
      if (!category || category.ownerId !== ownerId) throw new Error("Category was not found.");
    }
    const categoryIds = categoryId === null ? [] : selected
      ? [...new Set([...current, categoryId])]
      : current.filter((id) => id !== categoryId);
    await ctx.db.patch(photoId, { categoryIds, categoryId: undefined, categorySource: "manual" });
  },
});

export const remove = mutation({
  args: { ownerId: v.string(), photoId: v.id("photos") },
  handler: async (ctx, { ownerId, photoId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    if (photo.audioStorageId) await ctx.storage.delete(photo.audioStorageId);
    for (const sentence of photo.sentences ?? []) {
      if (sentence.audioStorageId) await ctx.storage.delete(sentence.audioStorageId);
    }
    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(photoId);
  },
});

export const saveSentences = mutation({
  args: {
    ownerId: v.string(), photoId: v.id("photos"), label: v.string(), language: v.string(),
    sentences: v.array(v.object({ text: v.string(), translation: v.string() })),
  },
  handler: async (ctx, { ownerId, photoId, label, language, sentences }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    if (photo.label !== label || photo.language !== language) throw new Error("The object changed. Open it again.");
    if (photo.sentences) return;
    if (sentences.length !== 3 || sentences.some(({ text, translation }) => !text.trim() || !translation.trim() || text.length > 180 || translation.length > 180)) {
      throw new Error("Invalid sentence examples.");
    }
    await ctx.db.patch(photoId, { sentences });
  },
});

export const saveAudio = mutation({
  args: {
    ownerId: v.string(), photoId: v.id("photos"), storageId: v.id("_storage"),
    text: v.string(), sentenceIndex: v.optional(v.number()),
  },
  handler: async (ctx, { ownerId, photoId, storageId, text, sentenceIndex }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    const metadata = await ctx.storage.getMetadata(storageId);
    if (!metadata || metadata.contentType !== "audio/mpeg" || metadata.size > 2_000_000) throw new Error("Invalid audio upload.");
    if (sentenceIndex === undefined) {
      if (photo.label !== text) throw new Error("The object changed. Open it again.");
      if (photo.audioStorageId) { await ctx.storage.delete(storageId); return; }
      await ctx.db.patch(photoId, { audioStorageId: storageId });
      return;
    }
    const sentence = photo.sentences?.[sentenceIndex];
    if (!Number.isInteger(sentenceIndex) || !sentence || sentence.text !== text) throw new Error("The sentence changed. Open it again.");
    if (sentence.audioStorageId) { await ctx.storage.delete(storageId); return; }
    await ctx.db.patch(photoId, { sentences: photo.sentences!.map((item, index) => index === sentenceIndex ? { ...item, audioStorageId: storageId } : item) });
  },
});

export const savePronunciation = mutation({
  args: { ownerId: v.string(), photoId: v.id("photos"), label: v.string(), language: v.string(), pronunciation: v.string() },
  handler: async (ctx, { ownerId, photoId, label, language, pronunciation }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    if (photo.label !== label || photo.language !== language) throw new Error("The object changed. Open it again.");
    if (photo.pronunciation) return;
    if (!pronunciation.trim() || pronunciation.length > 120) throw new Error("Invalid transcript.");
    await ctx.db.patch(photoId, { pronunciation });
  },
});

export const applyIdentification = mutation({
  args: {
    ownerId: v.string(), photoId: v.id("photos"), language: v.string(),
    label: v.union(v.string(), v.null()), suggestedCategory: v.union(v.string(), v.null()),
    pronunciation: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { ownerId, photoId, language, label, suggestedCategory, pronunciation }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    if (photo.categorySource === "manual") {
      if (photo.audioStorageId) await ctx.storage.delete(photo.audioStorageId);
      for (const sentence of photo.sentences ?? []) if (sentence.audioStorageId) await ctx.storage.delete(sentence.audioStorageId);
      await ctx.db.patch(photoId, { language, label, pronunciation: pronunciation ?? null, sentences: undefined, audioStorageId: undefined, categoryIds: photo.categoryIds ?? (photo.categoryId ? [photo.categoryId] : []), categoryId: undefined });
      return;
    }
    let categoryId = null;
    if (label && suggestedCategory) {
      const name = suggestedCategory.normalize("NFC").trim().replace(/\s+/g, " ");
      if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("Invalid category name.");
      const nameKey = name.toLocaleLowerCase("en-US");
      const existing = await ctx.db.query("categories").withIndex("by_owner_name", (q) => q.eq("ownerId", ownerId).eq("nameKey", nameKey)).unique();
      categoryId = existing?._id ?? await ctx.db.insert("categories", { ownerId, name, nameKey, origin: "ai" });
    }
    if (photo.audioStorageId) await ctx.storage.delete(photo.audioStorageId);
    for (const sentence of photo.sentences ?? []) if (sentence.audioStorageId) await ctx.storage.delete(sentence.audioStorageId);
    await ctx.db.patch(photoId, { language, label, pronunciation: pronunciation ?? null, sentences: undefined, audioStorageId: undefined, categoryIds: categoryId ? [categoryId] : [], categoryId: undefined, categorySource: "ai" });
  },
});
