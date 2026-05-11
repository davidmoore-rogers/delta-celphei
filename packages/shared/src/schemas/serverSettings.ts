import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Time / NTP
// ────────────────────────────────────────────────────────────────────────────

export const NtpServerDTO = z.object({
  id: z.string(),
  host: z.string(),
  priority: z.number().int(),
  isEnabled: z.boolean(),
  lastCheckAt: z.string().datetime().nullable(),
  lastStatus: z.string().nullable(),
});
export type NtpServerDTO = z.infer<typeof NtpServerDTO>;

export const CreateNtpServerInput = z.object({
  host: z.string().min(1).max(255),
  priority: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
});
export type CreateNtpServerInput = z.infer<typeof CreateNtpServerInput>;

export const TimeNtpStateDTO = z.object({
  defaultTimeZone: z.string(),
  serverTime: z.string().datetime(),
  servers: z.array(NtpServerDTO),
});
export type TimeNtpStateDTO = z.infer<typeof TimeNtpStateDTO>;

export const UpdateTimeZoneInput = z.object({
  defaultTimeZone: z.string().min(1).max(80),
});
export type UpdateTimeZoneInput = z.infer<typeof UpdateTimeZoneInput>;

// ────────────────────────────────────────────────────────────────────────────
// Certificates (read-only: shows TLS termination state)
// ────────────────────────────────────────────────────────────────────────────

export const CertificateInfoDTO = z.object({
  /** Where TLS is terminated for this deployment, inferred from env. */
  termination: z.enum(["reverse-proxy", "direct", "unknown"]),
  trustProxy: z.boolean(),
  protocol: z.string(),
  notes: z.string().array(),
});
export type CertificateInfoDTO = z.infer<typeof CertificateInfoDTO>;

// ────────────────────────────────────────────────────────────────────────────
// Maintenances
// ────────────────────────────────────────────────────────────────────────────

export const MaintenanceDTO = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  severity: z.enum(["info", "warn", "error"]),
  createdById: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MaintenanceDTO = z.infer<typeof MaintenanceDTO>;

export const CreateMaintenanceInput = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    severity: z.enum(["info", "warn", "error"]).default("info"),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreateMaintenanceInput = z.infer<typeof CreateMaintenanceInput>;

export const UpdateMaintenanceInput = z
  .object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    severity: z.enum(["info", "warn", "error"]).optional(),
  })
  .refine(
    (v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt),
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );
export type UpdateMaintenanceInput = z.infer<typeof UpdateMaintenanceInput>;
