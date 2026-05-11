import { config as dotenvConfig } from "dotenv";
import { existsSync } from "node:fs";
import { z } from "zod";
import { ENV_FILE } from "../utils/paths.js";

// Load state/.env first (written by setup wizard), then fall back to process env.
// state/.env wins because it represents committed config; process env wins for explicit overrides.
if (existsSync(ENV_FILE)) {
  dotenvConfig({ path: ENV_FILE });
}
dotenvConfig(); // .env in cwd, if present

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  TRUST_PROXY: z
    .union([z.literal("true"), z.literal("false")])
    .default("false")
    .transform((v) => v === "true"),
  METRICS_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),

  DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  ENCRYPTION_KEY: z.string().min(32).optional(),
  HEALTH_TOKEN: z.string().optional(),
  METRICS_TOKEN: z.string().optional(),

  POLARIS_BASE_URL: z.string().url().optional(),
  POLARIS_API_TOKEN: z.string().optional(),

  STATE_DIR: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

export function hasDatabaseUrl(): boolean {
  return typeof env.DATABASE_URL === "string" && env.DATABASE_URL.length > 0;
}

export function requireProductionSecrets(): void {
  if (env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!env.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (!env.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required secrets in production: ${missing.join(", ")}. ` +
        "Run the setup wizard to provision these, or set them in the environment.",
    );
  }
}
