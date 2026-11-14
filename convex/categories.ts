import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const categories = await ctx.db.query("categories").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return categories.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: { ownerId: v.string(), value: v.string(), emoji: v.optional(v.string()) },
  handler: async (ctx, { ownerId, value, emoji }) => {
    const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error("Enter a category name of up to 60 characters.");
    }
    const nameKey = name.toLocaleLowerCase("en-US");
    const existing = await ctx.db.query("categories").withIndex("by_owner_name", (q) => q.eq("ownerId", ownerId).eq("nameKey", nameKey)).unique();
    if (existing) throw new Error("This category already exists.");
    if (emoji && ([...emoji].length > 8 || /[\u0000-\u001f\u007f]/.test(emoji))) throw new Error("Choose a valid emoji.");
    return ctx.db.insert("categories", { ownerId, name, nameKey, emoji, origin: "user" });
  },
});
