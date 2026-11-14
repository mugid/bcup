import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const photos = await ctx.db.query("photos").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return Promise.all(photos.map(async (photo) => ({ ...photo, url: await ctx.storage.getUrl(photo.storageId) })));
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

export const assignCategory = mutation({
  args: { ownerId: v.string(), photoId: v.id("photos"), categoryId: v.union(v.id("categories"), v.null()) },
  handler: async (ctx, { ownerId, photoId, categoryId }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    if (categoryId !== null) {
      const category = await ctx.db.get(categoryId);
      if (!category || category.ownerId !== ownerId) throw new Error("Category was not found.");
    }
    await ctx.db.patch(photoId, { categoryId, categorySource: "manual" });
  },
});

export const applyIdentification = mutation({
  args: {
    ownerId: v.string(), photoId: v.id("photos"), language: v.string(),
    label: v.union(v.string(), v.null()), suggestedCategory: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { ownerId, photoId, language, label, suggestedCategory }) => {
    const photo = await ctx.db.get(photoId);
    if (!photo || photo.ownerId !== ownerId) throw new Error("Photo was not found.");
    if (photo.categorySource === "manual") {
      await ctx.db.patch(photoId, { language, label });
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
    await ctx.db.patch(photoId, { language, label, categoryId, categorySource: "ai" });
  },
});
