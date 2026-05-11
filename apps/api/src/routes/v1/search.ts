import { Router } from "express";
import { requireAuth } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";
import { searchAssets } from "../../integrations/polaris.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get("/", async (req, res, next): Promise<void> => {
  try {
    const q = ((req.query.q as string | undefined) ?? "").trim();
    const scope = (req.query.scope as string | undefined) ?? "all";
    if (!q) {
      res.json({ q, scope, hits: [], groupCounts: {} });
      return;
    }
    const include = (s: string) => scope === "all" || scope === s;
    const limit = 8;

    const tasks: Array<Promise<unknown>> = [];
    const out: { kind: string; [k: string]: unknown }[] = [];
    const groupCounts: Record<string, number> = {};

    if (include("tickets")) {
      tasks.push(
        getPrisma()
          .ticket.findMany({
            where: {
              OR: [
                { ticketNumber: { contains: q, mode: "insensitive" } },
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
          })
          .then((rows) => {
            groupCounts.tickets = rows.length;
            rows.forEach((t) =>
              out.push({
                kind: "ticket",
                id: t.id,
                ticketNumber: t.ticketNumber,
                title: t.title,
                status: t.status,
                priority: t.priority,
                url: `/tickets/${t.id}`,
              }),
            );
          }),
      );
    }

    if (include("tasks")) {
      tasks.push(
        getPrisma()
          .task.findMany({
            where: {
              OR: [
                { taskNumber: { contains: q, mode: "insensitive" } },
                { title: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: { updatedAt: "desc" },
            take: limit,
            include: { ticket: { select: { ticketNumber: true, id: true } } },
          })
          .then((rows) => {
            groupCounts.tasks = rows.length;
            rows.forEach((t) =>
              out.push({
                kind: "task",
                id: t.id,
                taskNumber: t.taskNumber,
                title: t.title,
                ticketNumber: t.ticket.ticketNumber,
                status: t.status,
                url: `/tickets/${t.ticket.id}?task=${t.id}`,
              }),
            );
          }),
      );
    }

    if (include("users")) {
      tasks.push(
        getPrisma()
          .user.findMany({
            where: {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { displayName: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: { displayName: "asc" },
            take: limit,
          })
          .then((rows) => {
            groupCounts.users = rows.length;
            rows.forEach((u) =>
              out.push({
                kind: "user",
                id: u.id,
                email: u.email,
                displayName: u.displayName,
                url: `/admin/users/${u.id}`,
              }),
            );
          }),
      );
    }

    if (include("assets")) {
      tasks.push(
        searchAssets(q, limit).then((items) => {
          groupCounts.assets = items.length;
          items.forEach((a) =>
            out.push({
              kind: "asset",
              id: a.id,
              name: (a.name as string) ?? a.id,
              assetType: (a.type as string) ?? undefined,
              url: `/api/v1/polaris/assets/${a.id}`,
            }),
          );
        }),
      );
    }

    await Promise.all(tasks);

    res.json({ q, scope, hits: out, groupCounts });
  } catch (err) {
    next(err);
  }
});
