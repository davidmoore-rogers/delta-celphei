import { z } from "zod";
import { ALL_ROLES, Role } from "../enums.js";

export const UserDTO = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  roles: z.array(z.enum(ALL_ROLES as [Role, ...Role[]])),
  isActive: z.boolean(),
  federatedFrom: z.string().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type UserDTO = z.infer<typeof UserDTO>;

export const CreateUserInput = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  password: z.string().min(8).optional(),
  roles: z.array(z.enum(ALL_ROLES as [Role, ...Role[]])).default([Role.User]),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserRolesInput = z.object({
  roles: z.array(z.enum(ALL_ROLES as [Role, ...Role[]])).min(1),
});
export type UpdateUserRolesInput = z.infer<typeof UpdateUserRolesInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  providerId: z.string().optional(),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const PASSWORD_RULES = {
  minLength: 8,
  requireUpper: true,
  requireLower: true,
  requireNumber: true,
  requireSpecial: true,
};

export function validatePasswordComplexity(pw: string): {
  ok: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  if (pw.length < PASSWORD_RULES.minLength) failures.push("min-length");
  if (PASSWORD_RULES.requireUpper && !/[A-Z]/.test(pw)) failures.push("upper");
  if (PASSWORD_RULES.requireLower && !/[a-z]/.test(pw)) failures.push("lower");
  if (PASSWORD_RULES.requireNumber && !/[0-9]/.test(pw)) failures.push("number");
  if (PASSWORD_RULES.requireSpecial && !/[^A-Za-z0-9]/.test(pw)) failures.push("special");
  return { ok: failures.length === 0, failures };
}
