import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const phrase = v.object({ text: v.string(), translation: v.string() });

export const list = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const clips = await ctx.db.query("clips").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return Promise.all(clips.map(async (clip) => ({
      ...clip,
      url: await ctx.storage.getUrl(clip.storageId),
      posterUrl: await ctx.storage.getUrl(clip.posterStorageId),
      descriptions: await Promise.all(clip.descriptions.map(async (item) => ({
        ...item,
        audioUrl: item.audioStorageId ? await ctx.storage.getUrl(item.audioStorageId) : null,
      }))),
    })));
  },
});

export const create = mutation({
  args: {
    ownerId: v.string(), storageId: v.id("_storage"), posterStorageId: v.id("_storage"),
    language: v.string(), title: v.string(), descriptions: v.array(phrase), words: v.array(phrase),
  },
  handler: async (ctx, args) => {
    const video = await ctx.storage.getMetadata(args.storageId);
    const poster = await ctx.storage.getMetadata(args.posterStorageId);
    if (!video || !["video/mp4", "video/webm", "video/quicktime"].includes(video.contentType ?? "") || video.size > 20 * 1024 * 1024 ||
        !poster || poster.contentType !== "image/jpeg" || poster.size > 1_000_000) throw new Error("Invalid clip upload.");
    if (!args.title.trim() || args.title.length > 80 || args.descriptions.length < 3 || args.descriptions.length > 5 ||
        args.words.length < 1 || args.words.length > 8 ||
        [...args.descriptions, ...args.words].some(({ text, translation }) => !text.trim() || !translation.trim() || text.length > 180 || translation.length > 180)) {
      throw new Error("Invalid clip description.");
    }
    return ctx.db.insert("clips", args);
  },
});

export const saveAudio = mutation({
  args: { ownerId: v.string(), clipId: v.id("clips"), index: v.number(), text: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { ownerId, clipId, index, text, storageId }) => {
    const clip = await ctx.db.get(clipId);
    const audio = await ctx.storage.getMetadata(storageId);
    if (!clip || clip.ownerId !== ownerId || !Number.isInteger(index) || clip.descriptions[index]?.text !== text) throw new Error("Description changed.");
    if (!audio || audio.contentType !== "audio/mpeg" || audio.size > 2_000_000) throw new Error("Invalid audio upload.");
    if (clip.descriptions[index].audioStorageId) { await ctx.storage.delete(storageId); return; }
    await ctx.db.patch(clipId, { descriptions: clip.descriptions.map((item, itemIndex) => itemIndex === index ? { ...item, audioStorageId: storageId } : item) });
  },
});

export const remove = mutation({
  args: { ownerId: v.string(), clipId: v.id("clips") },
  handler: async (ctx, { ownerId, clipId }) => {
    const clip = await ctx.db.get(clipId);
    if (!clip || clip.ownerId !== ownerId) throw new Error("Clip was not found.");
    for (const item of clip.descriptions) if (item.audioStorageId) await ctx.storage.delete(item.audioStorageId);
    await ctx.storage.delete(clip.storageId);
    await ctx.storage.delete(clip.posterStorageId);
    await ctx.db.delete(clipId);
  },
});
