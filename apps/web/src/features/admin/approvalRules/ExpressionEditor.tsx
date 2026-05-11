import type { RuleExpression } from "@celphei/shared";

const LEAF_OPS = ["eq", "neq", "in", "nin", "gt", "gte", "lt", "lte", "exists"] as const;
type LeafOp = (typeof LEAF_OPS)[number];

const FIELDS = [
  { value: "type", label: "Ticket type (slug)" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "requesterId", label: "Requester ID" },
  { value: "assigneeId", label: "Assignee ID" },
  { value: "teamId", label: "Team ID" },
  // Custom-field keys are free-form; the editor lets users type any "custom.*" path.
];

interface Props {
  value: RuleExpression;
  onChange: (next: RuleExpression) => void;
  /** Pass true at top of nested trees so we don't render the "Remove" button on root. */
  onRemove?: () => void;
  depth?: number;
}

function defaultLeaf(): RuleExpression {
  return { op: "eq", field: "type", value: "" };
}

function isCombinator(e: RuleExpression): e is { op: "and" | "or"; clauses: RuleExpression[] } {
  return e.op === "and" || e.op === "or";
}

function isNot(e: RuleExpression): e is { op: "not"; clause: RuleExpression } {
  return e.op === "not";
}

export function ExpressionEditor({ value, onChange, onRemove, depth = 0 }: Props) {
  if (isCombinator(value)) {
    return (
      <div
        className="rounded-md border border-edge p-2"
        style={{ background: depth % 2 === 0 ? "rgb(var(--surface-3))" : "rgb(var(--surface-2))" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <select
            value={value.op}
            onChange={(e) => onChange({ ...value, op: e.target.value as "and" | "or" })}
            className="px-2 py-0.5 text-xs rounded-md bg-surface-1 border border-edge font-semibold uppercase"
          >
            <option value="and">ALL of (AND)</option>
            <option value="or">ANY of (OR)</option>
          </select>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto text-xs text-red-500"
            >
              Remove
            </button>
          )}
        </div>
        <ul className="space-y-2">
          {value.clauses.map((c, i) => (
            <li key={i}>
              <ExpressionEditor
                value={c}
                depth={depth + 1}
                onChange={(next) => {
                  const clauses = value.clauses.slice();
                  clauses[i] = next;
                  onChange({ ...value, clauses });
                }}
                onRemove={
                  value.clauses.length > 1
                    ? () => {
                        const clauses = value.clauses.filter((_, j) => j !== i);
                        onChange({ ...value, clauses });
                      }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange({ ...value, clauses: [...value.clauses, defaultLeaf()] })}
            className="px-2 py-0.5 rounded-md border border-edge text-ink-2"
          >
            + Condition
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                clauses: [...value.clauses, { op: "and", clauses: [defaultLeaf()] }],
              })
            }
            className="px-2 py-0.5 rounded-md border border-edge text-ink-2"
          >
            + Group
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                clauses: [...value.clauses, { op: "not", clause: defaultLeaf() }],
              })
            }
            className="px-2 py-0.5 rounded-md border border-edge text-ink-2"
          >
            + NOT
          </button>
        </div>
      </div>
    );
  }

  if (isNot(value)) {
    return (
      <div
        className="rounded-md border border-edge p-2"
        style={{ background: depth % 2 === 0 ? "rgb(var(--surface-3))" : "rgb(var(--surface-2))" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 text-xs rounded-md bg-surface-1 border border-edge font-semibold uppercase">
            NOT
          </span>
          {onRemove && (
            <button type="button" onClick={onRemove} className="ml-auto text-xs text-red-500">
              Remove
            </button>
          )}
        </div>
        <ExpressionEditor
          value={value.clause}
          depth={depth + 1}
          onChange={(next) => onChange({ ...value, clause: next })}
        />
      </div>
    );
  }

  // Leaf
  return <LeafEditor leaf={value as Extract<RuleExpression, { field: string }>} onChange={onChange} onRemove={onRemove} />;
}

function LeafEditor({
  leaf,
  onChange,
  onRemove,
}: {
  leaf: { op: LeafOp; field: string; value?: unknown };
  onChange: (next: RuleExpression) => void;
  onRemove?: () => void;
}) {
  const isCustomField = leaf.field.startsWith("custom.");
  const isMultiValue = leaf.op === "in" || leaf.op === "nin";
  const noValue = leaf.op === "exists";

  return (
    <div className="flex items-center gap-2 flex-wrap p-2 bg-surface-2 rounded-md border border-edge">
      {/* Field */}
      {isCustomField ? (
        <input
          value={leaf.field.slice("custom.".length)}
          onChange={(e) => onChange({ ...leaf, field: `custom.${e.target.value}` })}
          placeholder="custom field key"
          className="px-2 py-1 text-xs rounded-md bg-surface-1 border border-edge w-40"
        />
      ) : (
        <select
          value={leaf.field}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__custom__") onChange({ ...leaf, field: "custom." });
            else onChange({ ...leaf, field: v });
          }}
          className="px-2 py-1 text-xs rounded-md bg-surface-1 border border-edge"
        >
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
          <option value="__custom__">Custom field…</option>
        </select>
      )}
      {isCustomField && (
        <button
          type="button"
          onClick={() => onChange({ ...leaf, field: "type" })}
          className="text-xs text-ink-3"
          title="Switch back to a top-level field"
        >
          ←
        </button>
      )}

      {/* Op */}
      <select
        value={leaf.op}
        onChange={(e) => onChange({ ...leaf, op: e.target.value as LeafOp })}
        className="px-2 py-1 text-xs rounded-md bg-surface-1 border border-edge"
      >
        {LEAF_OPS.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>

      {/* Value */}
      {!noValue &&
        (isMultiValue ? (
          <input
            value={Array.isArray(leaf.value) ? leaf.value.join(",") : ""}
            onChange={(e) =>
              onChange({
                ...leaf,
                value: e.target.value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
            placeholder="comma,separated,values"
            className="flex-1 min-w-[160px] px-2 py-1 text-xs rounded-md bg-surface-1 border border-edge"
          />
        ) : (
          <input
            value={typeof leaf.value === "string" || typeof leaf.value === "number" ? String(leaf.value) : ""}
            onChange={(e) => onChange({ ...leaf, value: e.target.value })}
            placeholder="value"
            className="flex-1 min-w-[160px] px-2 py-1 text-xs rounded-md bg-surface-1 border border-edge"
          />
        ))}

      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-red-500">
          Remove
        </button>
      )}
    </div>
  );
}

export function emptyExpression(): RuleExpression {
  return { op: "and", clauses: [defaultLeaf()] };
}
