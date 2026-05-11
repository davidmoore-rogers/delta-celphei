import { Router } from "express";
import { ListEventsQuery } from "@celphei/shared";
import { Prisma } from "@prisma/client";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";
import { eventBus } from "../../events/bus.js";

export const eventsRouter = Router();

eventsRouter.get("/", requireAuth, requireRole("Admin"), async (req, res, next) => {
  try {
    const q = ListEventsQuery.parse(req.query);
    const where: Prisma.EventWhereInput = {};
    if (q.severity) where.severity = q.severity as Prisma.EventWhereInput["severity"];
    if (q.source) where.source = q.source;
    if (q.actorId) where.actorId = q.actorId;
    if (q.since || q.until) {
      where.occurredAt = {
        ...(q.since ? { gte: new Date(q.since) } : {}),
        ...(q.until ? { lte: new Date(q.until) } : {}),
      };
    }
    if (q.q) {
      where.OR = [
        { message: { contains: q.q, mode: "insensitive" } },
        { subject: { contains: q.q, mode: "insensitive" } },
      ];
    }
    const [items, total] = await Promise.all([
      getPrisma().event.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { displayName: true } } },
      }),
      getPrisma().event.count({ where }),
    ]);
    res.json({
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: items.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt.toISOString(),
        severity: e.severity,
        source: e.source,
        actorId: e.actorId,
        actorDisplayName: e.actor?.displayName ?? null,
        subject: e.subject,
        message: e.message,
        data: e.data,
      })),
    });
  } catch (err) {
    next(err);
  }
});

eventsRouter.get("/stream", requireAuth, requireRole("Admin"), (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`retry: 5000\n\n`);

  const onEvent = (evt: unknown) => {
    res.write(`event: event\ndata: ${JSON.stringify(evt)}\n\n`);
  };
  eventBus.on("event", onEvent);

  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    eventBus.off("event", onEvent);
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
});
