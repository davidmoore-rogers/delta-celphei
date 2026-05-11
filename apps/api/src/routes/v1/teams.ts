import { Router } from "express";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";

export const teamsRouter = Router();
teamsRouter.use(requireAuth);

teamsRouter.get("/", async (_req, res, next) => {
  try {
    const teams = await getPrisma().team.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true, tickets: true } } },
    });
    res.json({
      items: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        memberCount: t._count.members,
        ticketCount: t._count.tickets,
      })),
    });
  } catch (err) {
    next(err);
  }
});

teamsRouter.post("/", requireRole("Admin"), async (req, res, next) => {
  try {
    const { name, description } = req.body as { name: string; description?: string };
    const team = await getPrisma().team.create({ data: { name, description } });
    res.status(201).json(team);
  } catch (err) {
    next(err);
  }
});

teamsRouter.get("/:id/members", async (req, res, next) => {
  try {
    const teamId = req.params.id as string;
    const members = await getPrisma().teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    res.json({
      items: members.map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        email: m.user.email,
        addedAt: m.addedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

teamsRouter.post("/:id/members", requireRole("Admin"), async (req, res, next) => {
  try {
    const teamId = req.params.id as string;
    const { userId } = req.body as { userId: string };
    await getPrisma().teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {},
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

teamsRouter.delete("/:id/members/:userId", requireRole("Admin"), async (req, res, next) => {
  try {
    const teamId = req.params.id as string;
    const userId = req.params.userId as string;
    await getPrisma().teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
