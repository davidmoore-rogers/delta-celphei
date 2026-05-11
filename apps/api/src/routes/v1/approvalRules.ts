import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { CreateApprovalRuleInput, UpdateApprovalRuleInput } from "@celphei/shared";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { getPrisma } from "../../db/prisma.js";
import { notFound } from "../../middleware/errorHandler.js";

export const approvalRulesRouter = Router();
approvalRulesRouter.use(requireAuth);

approvalRulesRouter.get("/", async (req, res, next) => {
  try {
    const ticketTypeId = req.query.ticketTypeId as string | undefined;
    const rules = await getPrisma().approvalRule.findMany({
      where: ticketTypeId ? { ticketTypeId } : undefined,
      orderBy: [{ ticketTypeId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      include: {
        ticketType: { select: { slug: true } },
        group: { select: { name: true } },
      },
    });
    res.json({
      items: rules.map((r) => ({
        id: r.id,
        ticketTypeId: r.ticketTypeId,
        ticketTypeSlug: r.ticketType.slug,
        name: r.name,
        conditionExpr: r.conditionExpr,
        requiredCount: r.requiredCount,
        approverGroupId: r.approverGroupId,
        approverGroupName: r.group?.name ?? null,
        approverRole: r.approverRole,
        order: r.order,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

approvalRulesRouter.post("/", requireRole("Admin"), async (req, res, next) => {
  try {
    const input = CreateApprovalRuleInput.parse(req.body);
    const rule = await getPrisma().approvalRule.create({
      data: {
        ticketTypeId: input.ticketTypeId,
        name: input.name,
        conditionExpr: input.conditionExpr as Prisma.InputJsonValue,
        requiredCount: input.requiredCount,
        approverGroupId: input.approverGroupId,
        approverRole: input.approverRole,
        order: input.order,
        isActive: input.isActive,
      },
    });
    res.status(201).json({ id: rule.id });
  } catch (err) {
    next(err);
  }
});

approvalRulesRouter.patch("/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const input = UpdateApprovalRuleInput.parse(req.body);
    const updated = await getPrisma().approvalRule.update({
      where: { id },
      data: {
        name: input.name,
        conditionExpr:
          input.conditionExpr !== undefined
            ? (input.conditionExpr as Prisma.InputJsonValue)
            : undefined,
        requiredCount: input.requiredCount,
        approverGroupId: input.approverGroupId,
        approverRole: input.approverRole,
        order: input.order,
        isActive: input.isActive,
      },
    });
    res.json({ id: updated.id });
  } catch (err) {
    next(err);
  }
});

approvalRulesRouter.delete("/:id", requireRole("Admin"), async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const rule = await getPrisma().approvalRule.findUnique({ where: { id } });
    if (!rule) throw notFound("Approval rule");
    await getPrisma().approvalRule.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
