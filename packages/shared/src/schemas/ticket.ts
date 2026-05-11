import { z } from "zod";
import { Priority, TicketStatus } from "../enums.js";

const PriorityValues = Object.values(Priority) as [string, ...string[]];
const StatusValues = Object.values(TicketStatus) as [string, ...string[]];

export const PolarisAssetRefDTO = z.object({
  polarisAssetId: z.string().uuid(),
  cachedName: z.string().nullable(),
  cachedType: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
});
export type PolarisAssetRefDTO = z.infer<typeof PolarisAssetRefDTO>;

export const TicketDTO = z.object({
  id: z.string(),
  ticketNumber: z.string(),
  typeId: z.string(),
  typeSlug: z.string(),
  typeName: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(StatusValues),
  priority: z.enum(PriorityValues),
  requesterId: z.string(),
  assigneeId: z.string().nullable(),
  teamId: z.string().nullable(),
  customFields: z.record(z.unknown()),
  assets: z.array(PolarisAssetRefDTO).default([]),
  taskCounts: z
    .object({
      total: z.number(),
      open: z.number(),
      done: z.number(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});
export type TicketDTO = z.infer<typeof TicketDTO>;

export const CreateTicketInput = z.object({
  typeSlug: z.string().min(1),
  title: z.string().min(1).max(280),
  description: z.string().default(""),
  priority: z.enum(PriorityValues).default(Priority.P3),
  assigneeId: z.string().optional(),
  teamId: z.string().optional(),
  customFields: z.record(z.unknown()).default({}),
  assetIds: z.array(z.string().uuid()).default([]),
});
export type CreateTicketInput = z.infer<typeof CreateTicketInput>;

export const UpdateTicketInput = CreateTicketInput.partial().extend({
  status: z.enum(StatusValues).optional(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketInput>;

export const ListTicketsQuery = z.object({
  q: z.string().optional(),
  status: z.enum(StatusValues).optional(),
  priority: z.enum(PriorityValues).optional(),
  typeSlug: z.string().optional(),
  assigneeId: z.string().optional(),
  requesterId: z.string().optional(),
  teamId: z.string().optional(),
  scope: z.enum(["all", "mine", "assigned", "team"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTicketsQuery = z.infer<typeof ListTicketsQuery>;

export const TicketTypeFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "number", "select", "date", "user", "asset"]),
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  defaultValue: z.unknown().optional(),
  helpText: z.string().optional(),
});
export type TicketTypeFieldSchema = z.infer<typeof TicketTypeFieldSchema>;

export const TicketTypeDTO = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  prefix: z.string(),
  isBuiltIn: z.boolean(),
  isActive: z.boolean(),
  tasksBlockClose: z.boolean(),
  schema: z.object({
    fields: z.array(TicketTypeFieldSchema).default([]),
  }),
  workflowConfig: z.unknown().optional(),
});
export type TicketTypeDTO = z.infer<typeof TicketTypeDTO>;
