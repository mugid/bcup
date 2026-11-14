import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  photos: defineTable({
    ownerToken: v.string(),
    storageId: v.id("_storage"),
    language: v.string(),
    legacyId: v.optional(v.number()),
  })
    .index("by_owner", ["ownerToken"])
    .index("by_owner_legacy", ["ownerToken", "legacyId"]),
});
