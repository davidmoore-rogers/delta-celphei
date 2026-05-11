import { z } from "zod";

export const GroupDTO = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int().optional(),
  createdAt: z.string().datetime(),
});
export type GroupDTO = z.infer<typeof GroupDTO>;

export const CreateGroupInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});
export type CreateGroupInput = z.infer<typeof CreateGroupInput>;

export const UpdateGroupInput = CreateGroupInput.partial();
export type UpdateGroupInput = z.infer<typeof UpdateGroupInput>;

export const GroupMemberDTO = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  addedAt: z.string().datetime(),
});
export type GroupMemberDTO = z.infer<typeof GroupMemberDTO>;
