import { z } from "zod";

export const SearchScope = {
  All: "all",
  Tickets: "tickets",
  Tasks: "tasks",
  Users: "users",
  Assets: "assets",
  Events: "events",
} as const;
export type SearchScope = (typeof SearchScope)[keyof typeof SearchScope];

export const SearchHitDTO = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ticket"),
    id: z.string(),
    ticketNumber: z.string(),
    title: z.string(),
    status: z.string(),
    priority: z.string(),
    url: z.string(),
  }),
  z.object({
    kind: z.literal("task"),
    id: z.string(),
    taskNumber: z.string(),
    title: z.string(),
    ticketNumber: z.string(),
    status: z.string(),
    url: z.string(),
  }),
  z.object({
    kind: z.literal("user"),
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    url: z.string(),
  }),
  z.object({
    kind: z.literal("asset"),
    id: z.string(),
    name: z.string(),
    assetType: z.string().optional(),
    url: z.string(),
  }),
]);
export type SearchHitDTO = z.infer<typeof SearchHitDTO>;

export const SearchResponse = z.object({
  q: z.string(),
  scope: z.string(),
  hits: z.array(SearchHitDTO),
  groupCounts: z.record(z.number()),
});
export type SearchResponse = z.infer<typeof SearchResponse>;
