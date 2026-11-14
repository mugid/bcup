import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function validateOwnerToken(ownerToken: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerToken)) {
    throw new Error("Invalid photo owner token");
  }
}

export const list = query({
  args: { ownerToken: v.string() },
  handler: async (ctx, { ownerToken }) => {
    validateOwnerToken(ownerToken);
    const photos = await ctx.db
      .query("photos")
      .withIndex("by_owner", (q) => q.eq("ownerToken", ownerToken))
      .order("desc")
      .collect();

    const resolved = await Promise.all(
      photos.map(async (photo) => ({
        id: photo._id,
        url: await ctx.storage.getUrl(photo.storageId),
        language: photo.language,
      })),
    );
    return resolved.flatMap((photo) =>
      photo.url ? [{ ...photo, url: photo.url }] : [],
    );
  },
});

export const generateUploadUrl = mutation({
  args: { ownerToken: v.string() },
  handler: async (ctx, { ownerToken }) => {
    validateOwnerToken(ownerToken);
    return ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    ownerToken: v.string(),
    storageId: v.id("_storage"),
    language: v.string(),
    legacyId: v.optional(v.number()),
  },
  handler: async (ctx, { ownerToken, storageId, language, legacyId }) => {
    validateOwnerToken(ownerToken);
    const metadata = await ctx.storage.getMetadata(storageId);
    if (!metadata || !metadata.contentType?.startsWith("image/") || metadata.size > MAX_PHOTO_BYTES) {
      await ctx.storage.delete(storageId);
      return { ok: false as const, message: "Only images up to 10 MB can be saved." };
    }

    if (legacyId !== undefined) {
      const existing = await ctx.db
        .query("photos")
        .withIndex("by_owner_legacy", (q) => q.eq("ownerToken", ownerToken).eq("legacyId", legacyId))
        .unique();
      if (existing) {
        await ctx.storage.delete(storageId);
        return { ok: true as const, id: existing._id };
      }
    }

    const id = await ctx.db.insert("photos", { ownerToken, storageId, language, legacyId });
    return { ok: true as const, id };
  },
});
