import { describe, it, expect } from "vitest";
import { evaluate, type EvalTicket } from "./expression.js";
import type { RuleExpression } from "@celphei/shared";

const T: EvalTicket = {
  type: "change",
  status: "Open",
  priority: "P2",
  assigneeId: "u1",
  customFields: { risk: "high", impact: "team" },
};

describe("approval expression evaluator", () => {
  it("eq on top-level field", () => {
    const expr: RuleExpression = { op: "eq", field: "type", value: "change" };
    expect(evaluate(expr, T)).toBe(true);
    expect(evaluate({ op: "eq", field: "type", value: "incident" }, T)).toBe(false);
  });

  it("eq on custom field", () => {
    const expr: RuleExpression = { op: "eq", field: "custom.risk", value: "high" };
    expect(evaluate(expr, T)).toBe(true);
  });

  it("neq", () => {
    expect(evaluate({ op: "neq", field: "type", value: "incident" }, T)).toBe(true);
    expect(evaluate({ op: "neq", field: "type", value: "change" }, T)).toBe(false);
  });

  it("in / nin", () => {
    expect(evaluate({ op: "in", field: "priority", value: ["P1", "P2"] }, T)).toBe(true);
    expect(evaluate({ op: "in", field: "priority", value: ["P3", "P4"] }, T)).toBe(false);
    expect(evaluate({ op: "nin", field: "priority", value: ["P3", "P4"] }, T)).toBe(true);
  });

  it("ordered vocabulary: gte on risk", () => {
    expect(evaluate({ op: "gte", field: "custom.risk", value: "high" }, T)).toBe(true);
    expect(evaluate({ op: "gt", field: "custom.risk", value: "high" }, T)).toBe(false);
    expect(evaluate({ op: "gt", field: "custom.risk", value: "medium" }, T)).toBe(true);
    expect(evaluate({ op: "lt", field: "custom.risk", value: "critical" }, T)).toBe(true);
  });

  it("ordered vocabulary: priority P-codes", () => {
    expect(evaluate({ op: "lte", field: "priority", value: "P1" }, T)).toBe(true); // P2 ≤ P1 severity (P1=highest)
    expect(evaluate({ op: "lt", field: "priority", value: "P1" }, T)).toBe(true);
    expect(evaluate({ op: "gt", field: "priority", value: "P3" }, T)).toBe(true);
  });

  it("numeric compare via coercion", () => {
    const t: EvalTicket = { ...T, customFields: { ...T.customFields, score: "42" } };
    expect(evaluate({ op: "gt", field: "custom.score", value: 30 }, t)).toBe(true);
    expect(evaluate({ op: "gt", field: "custom.score", value: 50 }, t)).toBe(false);
  });

  it("exists handles null/empty/missing", () => {
    expect(evaluate({ op: "exists", field: "custom.risk" }, T)).toBe(true);
    expect(evaluate({ op: "exists", field: "custom.absent" }, T)).toBe(false);
    expect(evaluate({ op: "exists", field: "assigneeId" }, T)).toBe(true);
    expect(evaluate({ op: "exists", field: "teamId" }, T)).toBe(false);
  });

  it("and: short-circuits to false when one clause is false", () => {
    const expr: RuleExpression = {
      op: "and",
      clauses: [
        { op: "eq", field: "type", value: "change" },
        { op: "eq", field: "custom.risk", value: "low" },
      ],
    };
    expect(evaluate(expr, T)).toBe(false);
  });

  it("or: short-circuits to true when one clause is true", () => {
    const expr: RuleExpression = {
      op: "or",
      clauses: [
        { op: "eq", field: "type", value: "incident" },
        { op: "eq", field: "custom.risk", value: "high" },
      ],
    };
    expect(evaluate(expr, T)).toBe(true);
  });

  it("not inverts", () => {
    const expr: RuleExpression = {
      op: "not",
      clause: { op: "eq", field: "type", value: "change" },
    };
    expect(evaluate(expr, T)).toBe(false);
  });

  it("nested and+or+not (realistic ITSM rule)", () => {
    // High-risk Change OR (Change AND assignee absent)
    const expr: RuleExpression = {
      op: "or",
      clauses: [
        {
          op: "and",
          clauses: [
            { op: "eq", field: "type", value: "change" },
            { op: "gte", field: "custom.risk", value: "high" },
          ],
        },
        {
          op: "and",
          clauses: [
            { op: "eq", field: "type", value: "change" },
            { op: "not", clause: { op: "exists", field: "assigneeId" } },
          ],
        },
      ],
    };
    expect(evaluate(expr, T)).toBe(true);
    // Same expression on a low-risk change with assignee → false.
    const t2 = { ...T, customFields: { risk: "low" } };
    expect(evaluate(expr, t2)).toBe(false);
  });

  it("malformed leaf returns false (does not throw)", () => {
    // @ts-expect-error — deliberately invalid op
    expect(evaluate({ op: "weird", field: "type", value: "change" }, T)).toBe(false);
  });

  it("missing field returns false on comparisons", () => {
    expect(evaluate({ op: "eq", field: "custom.nope", value: "x" }, T)).toBe(false);
    expect(evaluate({ op: "gt", field: "custom.nope", value: 5 }, T)).toBe(false);
  });
});
