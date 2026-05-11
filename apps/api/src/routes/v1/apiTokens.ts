import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { CreateApiTokenInput } from "@celphei/shared";
import { requireAuth } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";
import { notFound } from "../../middleware/errorHandler.js";

export const apiTokensRouter = Router();
apiTokensRouter.use(requireAuth);

apiTokensRouter.get("/", async (req, res, next) => {
  try {
    const tokens = await getPrisma().apiToken.findMany({
      where: { userId: req.session!.userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      items: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        scopes: t.scopes,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        expiresAt: t.expiresAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

apiTokensRouter.post("/", async (req, res, next) => {
  try {
    const input = CreateApiTokenInput.parse(req.body);
    const secret = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(secret).digest("hex");
    const token = await getPrisma().apiToken.create({
      data: {
        userId: req.session!.userId,
        name: input.name,
        tokenHash,
        scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    res.status(201).json({
      token: {
        id: token.id,
        name: token.name,
        scopes: token.scopes,
        lastUsedAt: null,
        expiresAt: token.expiresAt?.toISOString() ?? null,
        createdAt: token.createdAt.toISOString(),
      },
      secret, // shown ONCE, never retrievable again
    });
  } catch (err) {
    next(err);
  }
});

apiTokensRouter.delete("/:id", async (req, res, next) => {
  try {
    const token = await getPrisma().apiToken.findUnique({ where: { id: req.params.id } });
    if (!token || token.userId !== req.session!.userId) throw notFound("API token");
    await getPrisma().apiToken.update({
      where: { id: req.params.id },
      data: { revokedAt: new Date() },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
