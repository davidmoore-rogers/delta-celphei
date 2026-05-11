import { Router } from "express";
import {
  CreateMaintenanceInput,
  CreateNtpServerInput,
  UpdateMaintenanceInput,
  UpdateSettingInput,
  UpdateTimeZoneInput,
} from "@celphei/shared";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";
import { notFound } from "../../middleware/errorHandler.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get("/customization", async (_req, res, next) => {
  try {
    const s = await getPrisma().setting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    res.json({
      orgName: s.orgName,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      loginBanner: s.loginBanner,
      defaultTimeZone: s.defaultTimeZone,
      setupCompleted: s.setupCompleted,
    });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch("/customization", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = UpdateSettingInput.parse(req.body);
    const s = await getPrisma().setting.update({
      where: { id: 1 },
      data: {
        orgName: input.orgName,
        primaryColor: input.primaryColor,
        loginBanner: input.loginBanner,
        defaultTimeZone: input.defaultTimeZone,
      },
    });
    res.json({
      orgName: s.orgName,
      logoUrl: s.logoUrl,
      primaryColor: s.primaryColor,
      loginBanner: s.loginBanner,
      defaultTimeZone: s.defaultTimeZone,
      setupCompleted: s.setupCompleted,
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Time / NTP
// ────────────────────────────────────────────────────────────────────────────

settingsRouter.get("/time-ntp", async (_req, res, next) => {
  try {
    const setting = await getPrisma().setting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    const servers = await getPrisma().ntpServer.findMany({
      orderBy: [{ priority: "asc" }, { host: "asc" }],
    });
    res.json({
      defaultTimeZone: setting.defaultTimeZone,
      serverTime: new Date().toISOString(),
      servers: servers.map((s) => ({
        id: s.id,
        host: s.host,
        priority: s.priority,
        isEnabled: s.isEnabled,
        lastCheckAt: s.lastCheckAt?.toISOString() ?? null,
        lastStatus: s.lastStatus,
      })),
    });
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch("/time-ntp", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = UpdateTimeZoneInput.parse(req.body);
    const s = await getPrisma().setting.update({
      where: { id: 1 },
      data: { defaultTimeZone: input.defaultTimeZone },
    });
    res.json({ defaultTimeZone: s.defaultTimeZone });
  } catch (err) {
    next(err);
  }
});

settingsRouter.post("/time-ntp/servers", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = CreateNtpServerInput.parse(req.body);
    const row = await getPrisma().ntpServer.upsert({
      where: { host: input.host },
      create: input,
      update: { priority: input.priority, isEnabled: input.isEnabled },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

settingsRouter.delete("/time-ntp/servers/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await getPrisma().ntpServer.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Certificates (read-only — TLS termination info)
// ────────────────────────────────────────────────────────────────────────────

settingsRouter.get("/certificates", (_req, res) => {
  const trustProxy = env.TRUST_PROXY;
  const termination: "reverse-proxy" | "direct" | "unknown" = trustProxy
    ? "reverse-proxy"
    : "direct";
  const notes: string[] = [];
  notes.push(
    trustProxy
      ? "TRUST_PROXY=true — TLS is terminated by an upstream reverse proxy (Nginx, Caddy, ELB, etc.). Manage certificates there."
      : "TRUST_PROXY=false — Celphei is serving plain HTTP. Put it behind a reverse proxy with a TLS certificate before exposing to the network.",
  );
  notes.push(
    "Celphei does not currently manage TLS certificates in-app. Renewal, rotation, and OCSP are upstream concerns.",
  );
  res.json({
    termination,
    trustProxy,
    protocol: trustProxy ? "https (terminated upstream)" : "http",
    notes,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Maintenances
// ────────────────────────────────────────────────────────────────────────────

settingsRouter.get("/maintenances", async (_req, res, next) => {
  try {
    const rows = await getPrisma().maintenance.findMany({
      orderBy: { startsAt: "desc" },
    });
    res.json({
      items: rows.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        startsAt: m.startsAt.toISOString(),
        endsAt: m.endsAt.toISOString(),
        severity: m.severity,
        createdById: m.createdById,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

settingsRouter.post("/maintenances", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = CreateMaintenanceInput.parse(req.body);
    const row = await getPrisma().maintenance.create({
      data: {
        title: input.title,
        description: input.description,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        severity: input.severity,
        createdById: req.session!.userId,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

settingsRouter.patch("/maintenances/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const input = UpdateMaintenanceInput.parse(req.body);
    const row = await getPrisma().maintenance.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        severity: input.severity,
      },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

settingsRouter.delete("/maintenances/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const row = await getPrisma().maintenance.findUnique({ where: { id } });
    if (!row) throw notFound("Maintenance");
    await getPrisma().maintenance.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
