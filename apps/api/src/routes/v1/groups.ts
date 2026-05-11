import { Router } from "express";
import { CreateGroupInput, UpdateGroupInput } from "@celphei/shared";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";
import { notFound } from "../../middleware/errorHandler.js";

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

groupsRouter.get("/", async (_req, res, next) => {
  try {
    const groups = await getPrisma().group.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true } } },
    });
    res.json({
      items: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        memberCount: g._count.members,
        createdAt: g.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

groupsRouter.post("/", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = CreateGroupInput.parse(req.body);
    const g = await getPrisma().group.create({
      data: { name: input.name, description: input.description },
    });
    res.status(201).json(g);
  } catch (err) {
    next(err);
  }
});

groupsRouter.patch("/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const input = UpdateGroupInput.parse(req.body);
    const g = await getPrisma().group.update({
      where: { id },
      data: { name: input.name, description: input.description },
    });
    res.json(g);
  } catch (err) {
    next(err);
  }
});

groupsRouter.delete("/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const g = await getPrisma().group.findUnique({ where: { id } });
    if (!g) throw notFound("Group");
    await getPrisma().group.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

groupsRouter.get("/:id/members", async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const members = await getPrisma().groupMember.findMany({
      where: { groupId: id },
      include: { group: false },
    });
    // GroupMember.user isn't on the model; fetch the users separately.
    const users = await getPrisma().user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, displayName: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({
      items: members
        .map((m) => {
          const u = byId.get(m.userId);
          if (!u) return null;
          return {
            userId: m.userId,
            displayName: u.displayName,
            email: u.email,
            addedAt: m.addedAt.toISOString(),
          };
        })
        .filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

groupsRouter.post("/:id/members", requireRole("Admin"), async (req, res, next) => {
  try {
    const groupId = req.params.id as string;
    const { userId } = req.body as { userId: string };
    await getPrisma().groupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId },
      update: {},
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

groupsRouter.delete("/:id/members/:userId", requireRole("Admin"), async (req, res, next) => {
  try {
    const groupId = req.params.id as string;
    const userId = req.params.userId as string;
    await getPrisma().groupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
