import { z } from "zod";

export const SetupStateResponse = z.object({
  state: z.enum(["configured", "locked", "needs-setup"]),
  marker: z.string().nullable(),
  databaseUrlFromEnv: z.boolean(),
});
export type SetupStateResponse = z.infer<typeof SetupStateResponse>;

export const DbConnectionInput = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  username: z.string().min(1),
  password: z.string().default(""),
  database: z.string().min(1),
  ssl: z.boolean().default(false),
  sslAllowSelfSigned: z.boolean().default(false),
});
export type DbConnectionInput = z.infer<typeof DbConnectionInput>;

export const AdminAccountInput = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  password: z.string().min(8),
});
export type AdminAccountInput = z.infer<typeof AdminAccountInput>;

export const AppSettingsInput = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  sessionSecret: z.string().min(32),
  encryptionKey: z.string().min(32),
  healthToken: z.string().min(16),
  metricsToken: z.string().min(16),
});
export type AppSettingsInput = z.infer<typeof AppSettingsInput>;

export const OrgSetupInput = z.object({
  orgName: z.string().min(1).max(120),
  primaryColor: z.string().default("#4a9eff"),
  loginBanner: z.string().default(""),
  ticketPrefixes: z
    .object({
      incident: z.string().min(1).max(8).default("INC"),
      change: z.string().min(1).max(8).default("CHG"),
      request: z.string().min(1).max(8).default("REQ"),
    })
    .default({ incident: "INC", change: "CHG", request: "REQ" }),
});
export type OrgSetupInput = z.infer<typeof OrgSetupInput>;

export const PolarisSetupInput = z.object({
  baseUrl: z.string().url(),
  apiToken: z.string().min(1),
});
export type PolarisSetupInput = z.infer<typeof PolarisSetupInput>;

export const DirectorySetupInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("entra"),
    tenantId: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  }),
  z.object({
    kind: z.literal("ldap"),
    url: z.string().min(1),
    bindDN: z.string().min(1),
    bindPassword: z.string().min(1),
    userBase: z.string().min(1),
    userFilter: z.string().default("(objectClass=user)"),
  }),
]);
export type DirectorySetupInput = z.infer<typeof DirectorySetupInput>;

export const MailSetupInput = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
  from: z.string().email(),
  useTLS: z.boolean().default(true),
});
export type MailSetupInput = z.infer<typeof MailSetupInput>;

export const FinalizeSetupInput = z.object({
  db: DbConnectionInput,
  admin: AdminAccountInput,
  app: AppSettingsInput,
  org: OrgSetupInput.optional(),
  polaris: PolarisSetupInput.optional(),
  directory: DirectorySetupInput.optional(),
  mail: MailSetupInput.optional(),
});
export type FinalizeSetupInput = z.infer<typeof FinalizeSetupInput>;

export const TestConnectionResponse = z.object({
  ok: z.boolean(),
  version: z.string().optional(),
  databaseExists: z.boolean().optional(),
  message: z.string(),
});
export type TestConnectionResponse = z.infer<typeof TestConnectionResponse>;

export const FinalizeSetupResponse = z.object({
  ok: z.boolean(),
  healthToken: z.string().optional(),
  message: z.string().optional(),
});
export type FinalizeSetupResponse = z.infer<typeof FinalizeSetupResponse>;
