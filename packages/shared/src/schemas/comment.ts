import { z } from "zod";

export const TicketCommentDTO = z.object({
  id: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  authorDisplayName: z.string().optional(),
  body: z.string(),
  isInternal: z.boolean(),
  createdAt: z.string().datetime(),
});
export type TicketCommentDTO = z.infer<typeof TicketCommentDTO>;

export const CreateTicketCommentInput = z.object({
  body: z.string().min(1).max(20_000),
  isInternal: z.boolean().default(false),
});
export type CreateTicketCommentInput = z.infer<typeof CreateTicketCommentInput>;

export const TicketHistoryDTO = z.object({
  id: z.string(),
  ticketId: z.string(),
  actorId: z.string().nullable(),
  action: z.string(),
  changes: z.unknown(),
  createdAt: z.string().datetime(),
});
export type TicketHistoryDTO = z.infer<typeof TicketHistoryDTO>;
