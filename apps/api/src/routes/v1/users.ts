import { Router } from "express";
import { CreateUserInput, UpdateUserRolesInput } from "@celphei/shared";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { hashPassword } from "../../auth/passwords.js";
import { getPrisma } from "../../db/prisma.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

usersRouter.get("/me", async (req, res, next) => {
  try {
    const u = await getPrisma().user.findUniqueOrThrow({
      where: { id: req.session!.userId },
      include: { roles: true },
    });
    res.json({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      roles: u.roles.map((r) => r.role),
      isActive: u.isActive,
      federatedFrom: u.federatedFrom,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/", async (req, res, next) => {
  try {
    const q = (req.query.q as string | undefined) ?? "";
    const users = await getPrisma().user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { displayName: "asc" },
      take: 200,
      include: { roles: true },
    });
    res.json({
      items: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        roles: u.roles.map((r) => r.role),
        isActive: u.isActive,
        federatedFrom: u.federatedFrom,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = CreateUserInput.parse(req.body);
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    const user = await getPrisma().user.create({
      data: {
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        passwordHash,
        isActive: true,
        roles: { create: input.roles.map((role) => ({ role })) },
      },
      include: { roles: true },
    });
    res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles.map((r) => r.role),
    });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id/roles", requireRole("Admin"), async (req, res, next) => {
  try {
    const userId = req.params.id as string;
    const input = UpdateUserRolesInput.parse(req.body);
    await getPrisma().$transaction([
      getPrisma().userRoleAssignment.deleteMany({ where: { userId } }),
      getPrisma().userRoleAssignment.createMany({
        data: input.roles.map((role) => ({ userId, role })),
      }),
    ]);
    res.json({ ok: true, roles: input.roles });
  } catch (err) {
    next(err);
  }
});
