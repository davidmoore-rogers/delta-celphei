import { Router } from "express";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";

export const managerReportsRouter = Router();
managerReportsRouter.use(requireAuth);

managerReportsRouter.get("/", async (req, res, next) => {
  try {
    const isAdmin = req.session!.roles.includes("Admin");
    const where = isAdmin ? {} : { managerId: req.session!.userId };
    const rows = await getPrisma().managerReport.findMany({
      where,
      include: {
        manager: { select: { id: true, displayName: true, email: true } },
        report: { select: { id: true, displayName: true, email: true } },
      },
    });
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        managerId: r.managerId,
        managerDisplayName: r.manager.displayName,
        reportId: r.reportId,
        reportDisplayName: r.report.displayName,
        source: r.source,
      })),
    });
  } catch (err) {
    next(err);
  }
});

managerReportsRouter.post("/", requireRole("Admin"), async (req, res, next) => {
  try {
    const { managerId, reportId } = req.body as { managerId: string; reportId: string };
    const row = await getPrisma().managerReport.upsert({
      where: { managerId_reportId: { managerId, reportId } },
      create: { managerId, reportId, source: "manual" },
      update: { source: "manual" },
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

managerReportsRouter.delete("/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await getPrisma().managerReport.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
