import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  photos: defineTable({
    ownerId: v.string(),
    storageId: v.id("_storage"),
    language: v.string(),
    label: v.optional(v.union(v.string(), v.null())),
    categoryId: v.optional(v.union(v.id("categories"), v.null())),
    categorySource: v.optional(v.union(v.literal("ai"), v.literal("manual"))),
  }).index("by_owner", ["ownerId"]),
  categories: defineTable({
    ownerId: v.string(),
    name: v.string(),
    nameKey: v.string(),
    origin: v.union(v.literal("ai"), v.literal("user")),
  }).index("by_owner", ["ownerId"]).index("by_owner_name", ["ownerId", "nameKey"]),
});
