import { z } from "zod";
import { ALL_ROLES, Role } from "../enums.js";

/**
 * Rule-engine expression tree. JSONB column on ApprovalRule.conditionExpr.
 *
 * Leaf node: { op: "eq"|"neq"|"in"|"nin"|"gt"|"gte"|"lt"|"lte"|"exists", field: "<path>", value: <any> }
 * Combinator: { op: "and"|"or", clauses: [Expr, ...] }
 * Negation:   { op: "not", clause: Expr }
 *
 * Field paths:
 *   - Top-level ticket fields: "type", "status", "priority", "requesterId", "assigneeId", "teamId"
 *   - Custom fields: "custom.<key>"
 *   - Type slug shortcut: "type" resolves to TicketType.slug (not id)
 */
export const RULE_LEAF_OPS = ["eq", "neq", "in", "nin", "gt", "gte", "lt", "lte", "exists"] as const;
export type RuleLeafOp = (typeof RULE_LEAF_OPS)[number];

export const RuleLeaf: z.ZodType<{
  op: RuleLeafOp;
  field: string;
  value?: unknown;
}> = z.object({
  op: z.enum(RULE_LEAF_OPS),
  field: z.string().min(1),
  value: z.unknown().optional(),
});

export type RuleExpression =
  | { op: RuleLeafOp; field: string; value?: unknown }
  | { op: "and" | "or"; clauses: RuleExpression[] }
  | { op: "not"; clause: RuleExpression };

export const RuleExpression: z.ZodType<RuleExpression> = z.lazy(() =>
  z.union([
    RuleLeaf,
    z.object({
      op: z.enum(["and", "or"]),
      clauses: z.array(RuleExpression).min(1),
    }),
    z.object({
      op: z.literal("not"),
      clause: RuleExpression,
    }),
  ]),
);

export const ApprovalState = {
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
} as const;
export type ApprovalState = (typeof ApprovalState)[keyof typeof ApprovalState];

export const ApprovalDecisionKind = {
  Approve: "Approve",
  Reject: "Reject",
} as const;
export type ApprovalDecisionKind = (typeof ApprovalDecisionKind)[keyof typeof ApprovalDecisionKind];

// ────────────────────────────────────────────────────────────────────────────
// Rule CRUD (admin)
// ────────────────────────────────────────────────────────────────────────────

export const ApprovalRuleDTO = z.object({
  id: z.string(),
  ticketTypeId: z.string(),
  ticketTypeSlug: z.string().optional(),
  name: z.string(),
  conditionExpr: RuleExpression,
  requiredCount: z.number().int().min(1),
  approverGroupId: z.string().nullable(),
  approverGroupName: z.string().nullable().optional(),
  approverRole: z.enum(ALL_ROLES as [Role, ...Role[]]).nullable(),
  order: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ApprovalRuleDTO = z.infer<typeof ApprovalRuleDTO>;

export const CreateApprovalRuleInput = z.object({
  ticketTypeId: z.string().min(1),
  name: z.string().min(1).max(120),
  conditionExpr: RuleExpression,
  requiredCount: z.number().int().min(1).default(1),
  approverGroupId: z.string().optional(),
  approverRole: z.enum(ALL_ROLES as [Role, ...Role[]]).optional(),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CreateApprovalRuleInput = z.infer<typeof CreateApprovalRuleInput>;

export const UpdateApprovalRuleInput = CreateApprovalRuleInput.partial();
export type UpdateApprovalRuleInput = z.infer<typeof UpdateApprovalRuleInput>;

// ────────────────────────────────────────────────────────────────────────────
// Per-ticket approval state (read + decide)
// ────────────────────────────────────────────────────────────────────────────

export const ApprovalDecisionDTO = z.object({
  id: z.string(),
  requestId: z.string(),
  approverId: z.string(),
  approverDisplayName: z.string().optional(),
  decision: z.enum([ApprovalDecisionKind.Approve, ApprovalDecisionKind.Reject]),
  comment: z.string().nullable(),
  decidedAt: z.string().datetime(),
});
export type ApprovalDecisionDTO = z.infer<typeof ApprovalDecisionDTO>;

export const ApprovalRequestDTO = z.object({
  id: z.string(),
  ticketId: z.string(),
  ruleId: z.string(),
  ruleName: z.string().optional(),
  requiredCount: z.number().int(),
  state: z.enum([
    ApprovalState.Pending,
    ApprovalState.Approved,
    ApprovalState.Rejected,
    ApprovalState.Cancelled,
  ]),
  approverGroupId: z.string().nullable().optional(),
  approverGroupName: z.string().nullable().optional(),
  approverRole: z.string().nullable().optional(),
  decisions: z.array(ApprovalDecisionDTO),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type ApprovalRequestDTO = z.infer<typeof ApprovalRequestDTO>;

export const PostDecisionInput = z.object({
  decision: z.enum([ApprovalDecisionKind.Approve, ApprovalDecisionKind.Reject]),
  comment: z.string().max(2000).optional(),
});
export type PostDecisionInput = z.infer<typeof PostDecisionInput>;

export const TicketApprovalSummary = z.object({
  requests: z.array(ApprovalRequestDTO),
  /** True when at least one request exists and ALL non-cancelled requests are Approved. */
  approved: z.boolean(),
  /** Total non-cancelled requests. */
  total: z.number(),
  pendingCount: z.number(),
  approvedCount: z.number(),
  rejectedCount: z.number(),
});
export type TicketApprovalSummary = z.infer<typeof TicketApprovalSummary>;
