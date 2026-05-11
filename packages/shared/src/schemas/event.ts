import { z } from "zod";
import { EventSeverity, EventSource } from "../enums.js";

const SeverityValues = Object.values(EventSeverity) as [string, ...string[]];
const SourceValues = Object.values(EventSource) as [string, ...string[]];

export const EventDTO = z.object({
  id: z.string(),
  occurredAt: z.string().datetime(),
  severity: z.enum(SeverityValues),
  source: z.enum(SourceValues),
  actorId: z.string().nullable(),
  actorDisplayName: z.string().nullable().optional(),
  subject: z.string().nullable(),
  message: z.string(),
  data: z.unknown(),
});
export type EventDTO = z.infer<typeof EventDTO>;

export const ListEventsQuery = z.object({
  q: z.string().optional(),
  severity: z.enum(SeverityValues).optional(),
  source: z.enum(SourceValues).optional(),
  actorId: z.string().optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListEventsQuery = z.infer<typeof ListEventsQuery>;
