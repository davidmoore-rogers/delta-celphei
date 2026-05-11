import type { RuleExpression } from "@celphei/shared";

/**
 * Pure evaluator for approval-rule expressions. No DB, no side effects.
 *
 * Ticket shape (the only fields we read):
 *   - type: string (TicketType.slug)
 *   - status, priority: strings
 *   - requesterId, assigneeId, teamId: strings | null
 *   - customFields: Record<string, unknown>
 *
 * The engine is intentionally small and total — any operator/field combo that
 * doesn't make sense returns `false` rather than throwing, so admins can't
 * crash ticket creation by saving a malformed rule.
 */
export interface EvalTicket {
  type: string;
  status?: string;
  priority?: string;
  requesterId?: string | null;
  assigneeId?: string | null;
  teamId?: string | null;
  customFields?: Record<string, unknown>;
}

export function evaluate(expr: RuleExpression, ticket: EvalTicket): boolean {
  switch (expr.op) {
    case "and":
      return expr.clauses.every((c) => evaluate(c, ticket));
    case "or":
      return expr.clauses.some((c) => evaluate(c, ticket));
    case "not":
      return !evaluate(expr.clause, ticket);
    default:
      return evalLeaf(expr, ticket);
  }
}

function evalLeaf(
  leaf: { op: string; field: string; value?: unknown },
  ticket: EvalTicket,
): boolean {
  const actual = readField(leaf.field, ticket);
  switch (leaf.op) {
    case "eq":
      return looseEq(actual, leaf.value);
    case "neq":
      return !looseEq(actual, leaf.value);
    case "in":
      return Array.isArray(leaf.value) && leaf.value.some((v) => looseEq(actual, v));
    case "nin":
      return !(Array.isArray(leaf.value) && leaf.value.some((v) => looseEq(actual, v)));
    case "gt":
      return compare(actual, leaf.value) > 0;
    case "gte":
      return compare(actual, leaf.value) >= 0;
    case "lt":
      return compare(actual, leaf.value) < 0;
    case "lte":
      return compare(actual, leaf.value) <= 0;
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    default:
      return false;
  }
}

function readField(path: string, ticket: EvalTicket): unknown {
  if (path.startsWith("custom.")) {
    return ticket.customFields?.[path.slice("custom.".length)];
  }
  switch (path) {
    case "type":
      return ticket.type;
    case "status":
      return ticket.status;
    case "priority":
      return ticket.priority;
    case "requesterId":
      return ticket.requesterId;
    case "assigneeId":
      return ticket.assigneeId;
    case "teamId":
      return ticket.teamId;
    default:
      // Nested top-level paths are not supported in Phase 2; reject silently.
      return undefined;
  }
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  // Numeric vs string ("3" === 3): only honor when both can be coerced to finite numbers.
  if (typeof a !== typeof b) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return false;
}

/**
 * Ordering for gt/gte/lt/lte:
 *  - Both numeric (or both numeric-castable strings) → numeric compare.
 *  - Otherwise, both ordered ranks (e.g. "low" < "medium" < "high") if the value
 *    appears in `ORDERED_VOCABULARIES`; else lexicographic string compare.
 *  - Returns `NaN`-equivalent (always false) when either side is null/undefined.
 */
function compare(a: unknown, b: unknown): number {
  if (a == null || b == null) return Number.NaN;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  for (const vocab of ORDERED_VOCABULARIES) {
    const ia = vocab.indexOf(sa);
    const ib = vocab.indexOf(sb);
    if (ia !== -1 && ib !== -1) return ia - ib;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Ordered ordinal scales the engine understands. Each entry must be lowercase.
 * Admins can phrase rules as "risk gte high" and the engine will treat
 * "medium" < "high" as expected, not lexicographically.
 *
 * Adding to this list is safe (the same value won't appear in two scales here
 * by accident). New scales should be lowercase, ordered low-to-high.
 */
const ORDERED_VOCABULARIES: ReadonlyArray<ReadonlyArray<string>> = [
  ["low", "medium", "high", "critical"],
  ["p4", "p3", "p2", "p1"],
  ["info", "warn", "error"],
];
