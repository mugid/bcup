import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  photos: defineTable({
    ownerId: v.string(),
    storageId: v.id("_storage"),
    language: v.string(),
    label: v.optional(v.union(v.string(), v.null())),
    pronunciation: v.optional(v.union(v.string(), v.null())),
    audioStorageId: v.optional(v.id("_storage")),
    sentences: v.optional(v.array(v.object({ text: v.string(), translation: v.string(), audioStorageId: v.optional(v.id("_storage")) }))),
    categoryIds: v.optional(v.array(v.id("categories"))),
    // Kept for photos created before multiple collections were supported.
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    categorySource: v.optional(v.union(v.literal("ai"), v.literal("manual"))),
  }).index("by_owner", ["ownerId"]),
  categories: defineTable({
    ownerId: v.string(),
    name: v.string(),
    nameKey: v.string(),
    emoji: v.optional(v.string()),
    origin: v.union(v.literal("ai"), v.literal("user")),
  }).index("by_owner", ["ownerId"]).index("by_owner_name", ["ownerId", "nameKey"]),
});
