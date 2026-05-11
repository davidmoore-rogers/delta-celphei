import { Router } from "express";
import {
  CreateTicketInput,
  ListTicketsQuery,
  UpdateTicketInput,
  CreateTicketCommentInput,
  CreateTaskInput,
  PostDecisionInput,
} from "@celphei/shared";
import { requireAuth } from "../../auth/middleware.js";
import { createTicket, getTicket, listTickets, updateTicket } from "../../services/tickets.js";
import { createTask, listTasksForTicket } from "../../services/tasks.js";
import { getPrisma } from "../../db/prisma.js";
import { emitEvent } from "../../events/bus.js";
import { HttpError, conflict, forbidden, notFound } from "../../middleware/errorHandler.js";
import {
  getTicketApprovalSummary,
  isEligibleApprover,
  recordDecision,
} from "../../approvals/lifecycle.js";

export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

ticketsRouter.get("/", async (req, res, next) => {
  try {
    const q = ListTicketsQuery.parse(req.query);
    const result = await listTickets({ ...q, currentUserId: req.session!.userId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/", async (req, res, next) => {
  try {
    const input = CreateTicketInput.parse(req.body);
    const ticket = await createTicket(input, req.session!.userId);
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.get("/:id", async (req, res, next) => {
  try {
    const ticket = await getTicket(req.params.id);
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.patch("/:id", async (req, res, next) => {
  try {
    const input = UpdateTicketInput.parse(req.body);
    const ticket = await updateTicket(req.params.id, input, req.session!.userId);
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete("/:id", async (req, res, next) => {
  try {
    const t = await getPrisma().ticket.findUnique({ where: { id: req.params.id } });
    if (!t) throw notFound("Ticket");
    await getPrisma().ticket.delete({ where: { id: req.params.id } });
    await emitEvent({
      source: "ticket",
      actorId: req.session!.userId,
      subject: t.ticketNumber,
      message: `Deleted ${t.ticketNumber}`,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Comments
ticketsRouter.get("/:id/comments", async (req, res, next) => {
  try {
    const comments = await getPrisma().ticketComment.findMany({
      where: { ticketId: req.params.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { displayName: true } } },
    });
    res.json({
      items: comments.map((c) => ({
        id: c.id,
        ticketId: c.ticketId,
        authorId: c.authorId,
        authorDisplayName: c.author.displayName,
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/:id/comments", async (req, res, next) => {
  try {
    const input = CreateTicketCommentInput.parse(req.body);
    const ticket = await getPrisma().ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) throw notFound("Ticket");
    const comment = await getPrisma().ticketComment.create({
      data: {
        ticketId: req.params.id,
        authorId: req.session!.userId,
        body: input.body,
        isInternal: input.isInternal,
      },
    });
    await emitEvent({
      source: "ticket",
      actorId: req.session!.userId,
      subject: ticket.ticketNumber,
      message: `Comment on ${ticket.ticketNumber}`,
    });
    res.status(201).json({
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      body: comment.body,
      isInternal: comment.isInternal,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// History
ticketsRouter.get("/:id/history", async (req, res, next) => {
  try {
    const rows = await getPrisma().ticketHistory.findMany({
      where: { ticketId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        actorId: r.actorId,
        action: r.action,
        changes: r.changes,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Linked Polaris assets
ticketsRouter.get("/:id/assets", async (req, res, next) => {
  try {
    const refs = await getPrisma().polarisAssetRef.findMany({
      where: { ticketId: req.params.id },
    });
    res.json({
      items: refs.map((a) => ({
        polarisAssetId: a.polarisAssetId,
        cachedName: a.cachedName,
        cachedType: a.cachedType,
        lastSyncedAt: a.lastSyncedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/:id/assets", async (req, res, next) => {
  try {
    const { polarisAssetId, cachedName, cachedType } = req.body as {
      polarisAssetId: string;
      cachedName?: string;
      cachedType?: string;
    };
    const ref = await getPrisma().polarisAssetRef.upsert({
      where: {
        ticketId_polarisAssetId: { ticketId: req.params.id, polarisAssetId },
      },
      create: {
        ticketId: req.params.id,
        polarisAssetId,
        cachedName: cachedName ?? null,
        cachedType: cachedType ?? null,
      },
      update: {
        cachedName: cachedName ?? undefined,
        cachedType: cachedType ?? undefined,
        lastSyncedAt: new Date(),
      },
    });
    res.status(201).json({ polarisAssetId: ref.polarisAssetId });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.delete("/:id/assets/:assetId", async (req, res, next) => {
  try {
    await getPrisma().polarisAssetRef.deleteMany({
      where: { ticketId: req.params.id, polarisAssetId: req.params.assetId },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Approvals on a ticket
ticketsRouter.get("/:id/approvals", async (req, res, next) => {
  try {
    const ticketId = req.params.id as string;
    const requests = await getPrisma().approvalRequest.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      include: {
        rule: { select: { name: true, approverGroupId: true, approverRole: true } },
        decisions: {
          orderBy: { decidedAt: "asc" },
          include: { approver: { select: { displayName: true } } },
        },
      },
    });
    const groupIds = requests
      .map((r) => r.rule.approverGroupId)
      .filter((x): x is string => !!x);
    const groups = groupIds.length
      ? await getPrisma().group.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } })
      : [];
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

    const summary = await getPrisma().$transaction((tx) => getTicketApprovalSummary(tx, ticketId));

    res.json({
      requests: requests.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        ruleId: r.ruleId,
        ruleName: r.rule.name,
        requiredCount: r.requiredCount,
        state: r.state,
        approverGroupId: r.rule.approverGroupId,
        approverGroupName: r.rule.approverGroupId ? groupNameById.get(r.rule.approverGroupId) ?? null : null,
        approverRole: r.rule.approverRole,
        decisions: r.decisions.map((d) => ({
          id: d.id,
          requestId: d.requestId,
          approverId: d.approverId,
          approverDisplayName: d.approver.displayName,
          decision: d.decision,
          comment: d.comment,
          decidedAt: d.decidedAt.toISOString(),
        })),
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      })),
      ...summary,
    });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/:id/approvals/:requestId/decisions", async (req, res, next) => {
  try {
    const ticketId = req.params.id as string;
    const requestId = req.params.requestId as string;
    const input = PostDecisionInput.parse(req.body);
    const userId = req.session!.userId;
    const userRoles = req.session!.roles;

    const result = await getPrisma().$transaction(async (tx) => {
      const eligible = await isEligibleApprover(tx, { requestId, userId, userRoles });
      if (!eligible) throw forbidden("Not eligible to approve this request");
      // Make sure the request belongs to this ticket (path-mismatch guard).
      const req0 = await tx.approvalRequest.findUnique({ where: { id: requestId } });
      if (!req0 || req0.ticketId !== ticketId) throw notFound("Approval request");
      return recordDecision(tx, {
        requestId,
        approverId: userId,
        decision: input.decision,
        comment: input.comment,
      });
    });

    const ticket = await getPrisma().ticket.findUnique({
      where: { id: ticketId },
      select: { ticketNumber: true },
    });
    await emitEvent({
      source: "approval",
      actorId: userId,
      subject: ticket?.ticketNumber ?? ticketId,
      message: `${input.decision === "Approve" ? "Approved" : "Rejected"} request on ${ticket?.ticketNumber}: ${result.state}`,
    });

    res.json(result);
  } catch (err) {
    if ((err as { code?: string }).code === "already_decided") {
      return next(conflict("You have already decided on this request"));
    }
    if (err instanceof HttpError) return next(err);
    next(err);
  }
});

// Tasks (sub-tickets) under a ticket
ticketsRouter.get("/:id/tasks", async (req, res, next) => {
  try {
    res.json({ items: await listTasksForTicket(req.params.id) });
  } catch (err) {
    next(err);
  }
});

ticketsRouter.post("/:id/tasks", async (req, res, next) => {
  try {
    const input = CreateTaskInput.parse(req.body);
    const task = await createTask(req.params.id, input, req.session!.userId);
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});
