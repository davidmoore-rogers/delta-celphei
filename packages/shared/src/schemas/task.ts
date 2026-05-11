import { z } from "zod";
import { TaskStatus } from "../enums.js";

const TaskStatusValues = Object.values(TaskStatus) as [string, ...string[]];

export const TaskDTO = z.object({
  id: z.string(),
  taskNumber: z.string(),
  ticketId: z.string(),
  ticketNumber: z.string().optional(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(TaskStatusValues),
  assigneeId: z.string().nullable(),
  teamId: z.string().nullable(),
  dueAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdById: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskDTO = z.infer<typeof TaskDTO>;

export const CreateTaskInput = z.object({
  title: z.string().min(1).max(280),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  teamId: z.string().optional(),
  dueAt: z.string().datetime().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const UpdateTaskInput = CreateTaskInput.partial().extend({
  status: z.enum(TaskStatusValues).optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;
