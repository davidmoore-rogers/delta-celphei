import { Router } from "express";
import { Client as PgClient } from "pg";
import { randomBytes } from "node:crypto";
import { mkdirSync, statfsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Prisma } from "@prisma/client";
import argon2 from "argon2";
import nodemailer from "nodemailer";
import {
  DbConnectionInput,
  FinalizeSetupInput,
  MailSetupInput,
  PolarisSetupInput,
  DirectorySetupInput,
} from "@celphei/shared";
import { logger } from "../observability/logger.js";
import { ENV_FILE, SETUP_COMPLETE_MARKER, STATE_DIR, API_ROOT } from "../utils/paths.js";

export function buildSetupRouter(): Router {
  const router = Router();

  router.get("/state", (_req, res) => {
    res.json({ state: "needs-setup", marker: null, databaseUrlFromEnv: false });
  });

  router.post("/test-connection", async (req, res) => {
    const parsed = DbConnectionInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid DB input" });
    }
    const cfg = parsed.data;
    const result = await testPgConnection(cfg);
    return res.json(result);
  });

  router.post("/preflight", (_req, res) => {
    const warnings: string[] = [];
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      const stats = statfsSync(STATE_DIR);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      const freeMB = Math.floor(freeBytes / (1024 * 1024));
      if (freeMB < 500) {
        warnings.push(`Low disk space in state dir: ${freeMB} MB free`);
      }
    } catch (err) {
      warnings.push(`Could not stat state dir: ${(err as Error).message}`);
    }
    res.json({ ok: true, warnings });
  });

  router.post("/generate-secret", (_req, res) => {
    res.json({
      sessionSecret: randomBytes(48).toString("base64url"),
      encryptionKey: randomBytes(32).toString("base64url"),
      healthToken: randomBytes(24).toString("base64url"),
      metricsToken: randomBytes(24).toString("base64url"),
    });
  });

  router.post("/test-polaris", async (req, res) => {
    const parsed = PolarisSetupInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid Polaris input" });
    }
    const { baseUrl, apiToken } = parsed.data;
    try {
      const r = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/assets?limit=1`, {
        headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
      });
      if (!r.ok) {
        return res.json({
          ok: false,
          message: `Polaris responded ${r.status} ${r.statusText}`,
        });
      }
      return res.json({ ok: true, message: "Polaris reachable" });
    } catch (err) {
      return res.json({ ok: false, message: (err as Error).message });
    }
  });

  router.post("/test-directory", async (req, res) => {
    const parsed = DirectorySetupInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid directory input" });
    }
    const cfg = parsed.data;
    if (cfg.kind === "entra") {
      try {
        const tokenRes = await fetch(
          `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: cfg.clientId,
              client_secret: cfg.clientSecret,
              scope: "https://graph.microsoft.com/.default",
              grant_type: "client_credentials",
            }),
          },
        );
        if (!tokenRes.ok) {
          const text = await tokenRes.text();
          return res.json({ ok: false, message: `Entra token failed: ${text.slice(0, 200)}` });
        }
        return res.json({ ok: true, message: "Entra credentials accepted" });
      } catch (err) {
        return res.json({ ok: false, message: (err as Error).message });
      }
    }
    return res.json({
      ok: true,
      message: "LDAP config accepted (bind test runs at first sync)",
    });
  });

  router.post("/test-smtp", async (req, res) => {
    const parsed = MailSetupInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid SMTP input" });
    }
    const cfg = parsed.data;
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        requireTLS: cfg.useTLS,
        auth: cfg.username ? { user: cfg.username, pass: cfg.password ?? "" } : undefined,
      });
      await transporter.verify();
      return res.json({ ok: true, message: "SMTP server reachable" });
    } catch (err) {
      return res.json({ ok: false, message: (err as Error).message });
    }
  });

  router.post("/finalize", async (req, res) => {
    const parsed = FinalizeSetupInput.safeParse(req.body);
    if (!parsed.success) {
      logger.warn({ err: parsed.error.flatten() }, "finalize payload invalid");
      return res.status(400).json({ ok: false, message: "Invalid setup payload" });
    }
    const payload = parsed.data;
    try {
      const result = await finalizeSetup(payload);
      res.json(result);
      // Exit after response flushes so container/devloop restarts us into normal mode.
      setTimeout(() => {
        logger.info("setup finalized; exiting to restart into normal mode");
        process.exit(0);
      }, 250);
      return;
    } catch (err) {
      logger.error({ err }, "finalize failed");
      return res.status(500).json({ ok: false, message: (err as Error).message });
    }
  });

  return router;
}

async function testPgConnection(cfg: import("@celphei/shared").DbConnectionInput) {
  const adminClient = new PgClient({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: cfg.password,
    database: "postgres",
    ssl: cfg.ssl ? { rejectUnauthorized: !cfg.sslAllowSelfSigned } : false,
    connectionTimeoutMillis: 5000,
  });
  try {
    await adminClient.connect();
    const versionRes = await adminClient.query("SELECT version() AS v");
    const version = versionRes.rows[0]?.v as string;
    const existsRes = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [cfg.database],
    );
    const exists = (existsRes.rowCount ?? 0) > 0;
    return {
      ok: true,
      version: version.split(" ").slice(0, 2).join(" "),
      databaseExists: exists,
      message: exists ? "Connected; database exists" : "Connected; database will be created",
    };
  } catch (err) {
    const message = (err as Error).message;
    if (/ECONNREFUSED/i.test(message)) {
      return { ok: false, message: "Connection refused — is Postgres running on this host/port?" };
    }
    if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
      return { ok: false, message: "Host not found" };
    }
    if (/password authentication failed|SASL/i.test(message)) {
      return { ok: false, message: "Authentication failed" };
    }
    return { ok: false, message };
  } finally {
    await adminClient.end().catch(() => undefined);
  }
}

async function finalizeSetup(payload: import("@celphei/shared").FinalizeSetupInput) {
  const { db, admin, app, org, polaris, directory, mail } = payload;

  // 1. Create target database if absent.
  await ensureDatabase(db);

  // 2. Build DATABASE_URL.
  const databaseUrl = buildDatabaseUrl(db);

  // 3. Write state/.env atomically.
  mkdirSync(STATE_DIR, { recursive: true });
  const envContent = renderEnvFile({
    DATABASE_URL: databaseUrl,
    PORT: String(app.port),
    NODE_ENV: "production",
    LOG_LEVEL: "info",
    SESSION_SECRET: app.sessionSecret,
    ENCRYPTION_KEY: app.encryptionKey,
    HEALTH_TOKEN: app.healthToken,
    METRICS_TOKEN: app.metricsToken,
  });
  writeFileSync(ENV_FILE, envContent, { mode: 0o600 });

  // 4. Set in-process env so prisma migrate deploy + initial seed can run.
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = app.sessionSecret;
  process.env.ENCRYPTION_KEY = app.encryptionKey;
  process.env.HEALTH_TOKEN = app.healthToken;
  process.env.METRICS_TOKEN = app.metricsToken;

  // 5. Run prisma migrate deploy.
  runPrismaMigrateDeploy();

  // 6. Open a Prisma client (deferred import so it picks up the new DATABASE_URL).
  const { getPrisma } = await import("../db/prisma.js");
  const prisma = getPrisma();

  // 7. Transactional inserts: admin user, settings, integrations.
  const passwordHash = await argon2.hash(admin.password, { type: argon2.argon2id });
  await prisma.$transaction(async (tx) => {
    const adminUser = await tx.user.create({
      data: {
        email: admin.email,
        displayName: admin.displayName,
        passwordHash,
        isActive: true,
      },
    });
    await tx.userRoleAssignment.create({
      data: { userId: adminUser.id, role: "Admin" },
    });
    await tx.userRoleAssignment.create({
      data: { userId: adminUser.id, role: "User" },
    });

    await tx.setting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        orgName: org?.orgName ?? "Celphei",
        primaryColor: org?.primaryColor ?? "#4a9eff",
        loginBanner: org?.loginBanner ?? "",
        setupCompleted: true,
      },
      update: {
        orgName: org?.orgName ?? undefined,
        primaryColor: org?.primaryColor ?? undefined,
        loginBanner: org?.loginBanner ?? undefined,
        setupCompleted: true,
      },
    });

    if (org?.ticketPrefixes) {
      for (const [slug, prefix] of Object.entries(org.ticketPrefixes)) {
        await tx.ticketType.updateMany({ where: { slug }, data: { prefix } });
      }
    }

    if (polaris) {
      await tx.integrationConnection.create({
        data: {
          kind: "polaris",
          name: "Polaris",
          config: encryptIntegrationConfigJson({ baseUrl: polaris.baseUrl, apiToken: polaris.apiToken }, app.encryptionKey),
          isEnabled: true,
        },
      });
    }

    if (directory) {
      await tx.integrationConnection.create({
        data: {
          kind: directory.kind,
          name: directory.kind === "entra" ? "Microsoft Entra ID" : "Active Directory (LDAP)",
          config: encryptIntegrationConfigJson(directory, app.encryptionKey),
          isEnabled: true,
        },
      });
    }

    if (mail) {
      await tx.integrationConnection.create({
        data: {
          kind: "smtp",
          name: "Outbound mail",
          config: encryptIntegrationConfigJson(mail, app.encryptionKey),
          isEnabled: true,
        },
      });
    }
  });

  // 8. Run seed (built-in ticket types) — idempotent.
  try {
    const { seedBuiltInTicketTypes } = await import("../seed/builtInTypes.js");
    await seedBuiltInTicketTypes(prisma);
  } catch (err) {
    logger.warn({ err }, "seed step skipped");
  }

  // 9. Write the marker LAST — a crash before this leaves us in needs-setup.
  writeFileSync(
    SETUP_COMPLETE_MARKER,
    JSON.stringify({ configuredAt: new Date().toISOString() }, null, 2),
  );

  await prisma.$disconnect();

  return { ok: true, healthToken: app.healthToken };
}

async function ensureDatabase(cfg: import("@celphei/shared").DbConnectionInput) {
  const adminClient = new PgClient({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: cfg.password,
    database: "postgres",
    ssl: cfg.ssl ? { rejectUnauthorized: !cfg.sslAllowSelfSigned } : false,
    connectionTimeoutMillis: 5000,
  });
  await adminClient.connect();
  try {
    const exists = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [cfg.database]);
    if ((exists.rowCount ?? 0) === 0) {
      // Postgres does not allow parameterized CREATE DATABASE; quote-escape manually.
      const safe = cfg.database.replace(/"/g, '""');
      await adminClient.query(`CREATE DATABASE "${safe}"`);
      logger.info({ database: cfg.database }, "created database");
    }
  } finally {
    await adminClient.end();
  }
}

function buildDatabaseUrl(cfg: import("@celphei/shared").DbConnectionInput): string {
  const params = new URLSearchParams();
  params.set("schema", "public");
  if (cfg.ssl) {
    params.set("sslmode", cfg.sslAllowSelfSigned ? "no-verify" : "require");
  }
  const auth = `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password)}`;
  return `postgresql://${auth}@${cfg.host}:${cfg.port}/${encodeURIComponent(cfg.database)}?${params.toString()}`;
}

function renderEnvFile(vars: Record<string, string>): string {
  const header = `# Generated by Celphei setup wizard at ${new Date().toISOString()}\n# Do not edit by hand while the app is running.\n`;
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${quoteIfNeeded(v)}`);
  return header + lines.join("\n") + "\n";
}

function quoteIfNeeded(v: string): string {
  return /[\s"'$#]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function runPrismaMigrateDeploy() {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    {
      cwd: API_ROOT,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    throw new Error("prisma migrate deploy failed");
  }
}

function encryptIntegrationConfigJson(obj: unknown, _encryptionKey: string): Prisma.InputJsonValue {
  // Stub — proper AES-256-GCM encryption with ENCRYPTION_KEY ships in Phase 3.
  return { _encryption: "none", payload: obj as Prisma.InputJsonValue };
}
