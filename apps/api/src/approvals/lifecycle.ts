import type { Prisma } from "@prisma/client";
import { ApprovalState, type RuleExpression } from "@celphei/shared";
import { getPrisma } from "../db/prisma.js";
import { emitEvent } from "../events/bus.js";
import { evaluate, type EvalTicket } from "./expression.js";

type Tx = Prisma.TransactionClient;

interface MatchedRule {
  id: string;
  requiredCount: number;
}

/**
 * Evaluate all active rules for a ticket's type. Returns the rules that match.
 * Pure-ish: reads from the DB but writes nothing.
 */
export async function evaluateRulesForTicket(
  tx: Tx,
  ticketRow: {
    id: string;
    typeId: string;
    type?: { slug: string } | null;
    status: string;
    priority: string;
    requesterId: string;
    assigneeId: string | null;
    teamId: string | null;
    customFields: unknown;
  },
): Promise<MatchedRule[]> {
  const typeSlug: string =
    ticketRow.type?.slug ??
    ((
      await tx.ticketType.findUnique({
        where: { id: ticketRow.typeId },
        select: { slug: true },
      })
    )?.slug ?? "");

  const evalCtx: EvalTicket = {
    type: typeSlug,
    status: ticketRow.status,
    priority: ticketRow.priority,
    requesterId: ticketRow.requesterId,
    assigneeId: ticketRow.assigneeId,
    teamId: ticketRow.teamId,
    customFields: (ticketRow.customFields as Record<string, unknown>) ?? {},
  };

  const rules = await tx.approvalRule.findMany({
    where: { ticketTypeId: ticketRow.typeId, isActive: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const matched: MatchedRule[] = [];
  for (const r of rules) {
    try {
      if (evaluate(r.conditionExpr as RuleExpression, evalCtx)) {
        matched.push({ id: r.id, requiredCount: r.requiredCount });
      }
    } catch {
      // Malformed expression → skip this rule, don't fail the ticket op.
    }
  }
  return matched;
}

/**
 * Reconcile a ticket's ApprovalRequest rows against the set of currently-matching rules.
 *
 *   - matched, no existing pending/resolved request → create Pending
 *   - matched, existing request (any state) → leave alone (preserves in-flight decisions)
 *   - not matched + existing Pending → Cancel
 *   - not matched + existing Approved/Rejected → keep as history
 *
 * Returns whether any pending requests were touched (created or cancelled).
 */
export async function reconcileApprovalsForTicket(
  tx: Tx,
  ticketRow: Parameters<typeof evaluateRulesForTicket>[1],
  actorId: string,
): Promise<{ created: number; cancelled: number }> {
  const matched = await evaluateRulesForTicket(tx, ticketRow);
  const matchedIds = new Set(matched.map((m) => m.id));

  const existing = await tx.approvalRequest.findMany({
    where: { ticketId: ticketRow.id },
  });
  const existingByRule = new Map(existing.map((r) => [r.ruleId, r]));

  let created = 0;
  let cancelled = 0;

  for (const m of matched) {
    if (existingByRule.has(m.id)) continue;
    await tx.approvalRequest.create({
      data: {
        ticketId: ticketRow.id,
        ruleId: m.id,
        requiredCount: m.requiredCount,
        state: ApprovalState.Pending,
      },
    });
    created++;
  }

  for (const req of existing) {
    if (req.state !== ApprovalState.Pending) continue;
    if (matchedIds.has(req.ruleId)) continue;
    await tx.approvalRequest.update({
      where: { id: req.id },
      data: { state: ApprovalState.Cancelled, resolvedAt: new Date() },
    });
    cancelled++;
  }

  if (created > 0 || cancelled > 0) {
    // Fire-and-forget event outside the transaction would be cleaner, but the
    // tx is short-lived here and emitEvent opens its own connection; calling
    // it here is fine.
    await emitEvent({
      source: "approval",
      actorId,
      subject: ticketRow.id,
      message: `Approvals reconciled: +${created} pending, -${cancelled} cancelled`,
    });
  }

  return { created, cancelled };
}

/**
 * Apply a decision and recompute the request's state.
 * Returns the new state and (if it just resolved) the resolution timestamp.
 */
export async function recordDecision(
  tx: Tx,
  args: {
    requestId: string;
    approverId: string;
    decision: "Approve" | "Reject";
    comment?: string;
  },
): Promise<{ state: ApprovalState; resolved: boolean }> {
  const request = await tx.approvalRequest.findUnique({
    where: { id: args.requestId },
    include: { decisions: true, rule: { select: { name: true } } },
  });
  if (!request) throw new Error("approval request not found");
  if (request.state !== ApprovalState.Pending) {
    return { state: request.state as ApprovalState, resolved: false };
  }

  // One decision per approver per request.
  const already = request.decisions.find((d) => d.approverId === args.approverId);
  if (already) {
    throw Object.assign(new Error("Already decided on this request"), {
      status: 409,
      code: "already_decided",
    });
  }

  await tx.approvalDecision.create({
    data: {
      requestId: request.id,
      approverId: args.approverId,
      decision: args.decision,
      comment: args.comment ?? null,
    },
  });

  // Recompute.
  const decisions = [
    ...request.decisions,
    {
      id: "",
      requestId: request.id,
      approverId: args.approverId,
      decision: args.decision,
      comment: args.comment ?? null,
      decidedAt: new Date(),
    },
  ];
  const anyReject = decisions.some((d) => d.decision === "Reject");
  const approvals = decisions.filter((d) => d.decision === "Approve").length;

  let newState: ApprovalState = ApprovalState.Pending;
  if (anyReject) newState = ApprovalState.Rejected;
  else if (approvals >= request.requiredCount) newState = ApprovalState.Approved;

  if (newState !== ApprovalState.Pending) {
    await tx.approvalRequest.update({
      where: { id: request.id },
      data: { state: newState, resolvedAt: new Date() },
    });
  }

  return { state: newState, resolved: newState !== ApprovalState.Pending };
}

/**
 * Compute the rolled-up approval state for a ticket.
 * "approved" = at least one non-cancelled request AND all non-cancelled requests are Approved.
 */
export async function getTicketApprovalSummary(
  tx: Tx,
  ticketId: string,
): Promise<{
  total: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  approved: boolean;
}> {
  const requests = await tx.approvalRequest.findMany({
    where: { ticketId, state: { not: ApprovalState.Cancelled } },
    select: { state: true },
  });
  const total = requests.length;
  const pendingCount = requests.filter((r) => r.state === ApprovalState.Pending).length;
  const approvedCount = requests.filter((r) => r.state === ApprovalState.Approved).length;
  const rejectedCount = requests.filter((r) => r.state === ApprovalState.Rejected).length;
  const approved = total > 0 && approvedCount === total;
  return { total, pendingCount, approvedCount, rejectedCount, approved };
}

/**
 * Check whether `userId` is eligible to act on a given approval request.
 * Admin role → always yes (Admins can override).
 * Otherwise: must be a member of the rule's approverGroup OR hold approverRole.
 */
export async function isEligibleApprover(
  tx: Tx,
  args: {
    requestId: string;
    userId: string;
    userRoles: string[];
  },
): Promise<boolean> {
  if (args.userRoles.includes("Admin")) return true;
  const request = await tx.approvalRequest.findUnique({
    where: { id: args.requestId },
    include: { rule: true },
  });
  if (!request) return false;
  const { approverGroupId, approverRole } = request.rule;
  if (approverRole && args.userRoles.includes(approverRole)) return true;
  if (approverGroupId) {
    const member = await tx.groupMember.findFirst({
      where: { groupId: approverGroupId, userId: args.userId },
    });
    if (member) return true;
  }
  // No restrictions configured? Treat as "anyone with a role can decide" (Phase 2 behavior;
  // Phase 3 may tighten this). Empty group + null role on the rule means "any authenticated user".
  return !approverGroupId && !approverRole;
}
