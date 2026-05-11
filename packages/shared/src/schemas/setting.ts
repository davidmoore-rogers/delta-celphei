import { z } from "zod";

export const SettingDTO = z.object({
  orgName: z.string(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string(),
  loginBanner: z.string(),
  defaultTimeZone: z.string(),
  setupCompleted: z.boolean(),
});
export type SettingDTO = z.infer<typeof SettingDTO>;

export const UpdateSettingInput = z.object({
  orgName: z.string().min(1).max(120).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  loginBanner: z.string().max(2000).optional(),
  defaultTimeZone: z.string().optional(),
});
export type UpdateSettingInput = z.infer<typeof UpdateSettingInput>;

export const ApiTokenDTO = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApiTokenDTO = z.infer<typeof ApiTokenDTO>;

export const CreateApiTokenInput = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
});
export type CreateApiTokenInput = z.infer<typeof CreateApiTokenInput>;

export const CreateApiTokenResponse = z.object({
  token: z.object(ApiTokenDTO.shape),
  secret: z.string(),
});
export type CreateApiTokenResponse = z.infer<typeof CreateApiTokenResponse>;
