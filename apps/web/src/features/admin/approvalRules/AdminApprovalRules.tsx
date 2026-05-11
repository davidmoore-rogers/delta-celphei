import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { RuleExpression } from "@celphei/shared";
import { api } from "../../../lib/api";
import { queryClient } from "../../../lib/queryClient";
import { ExpressionEditor, emptyExpression } from "./ExpressionEditor";

interface RuleDTO {
  id: string;
  ticketTypeId: string;
  ticketTypeSlug: string;
  name: string;
  conditionExpr: RuleExpression;
  requiredCount: number;
  approverGroupId: string | null;
  approverGroupName: string | null;
  approverRole: string | null;
  order: number;
  isActive: boolean;
}

interface TicketType {
  id: string;
  slug: string;
  name: string;
}

interface GroupSummary {
  id: string;
  name: string;
}

export function AdminApprovalRules() {
  const rules = useQuery({
    queryKey: ["admin", "approval-rules"],
    queryFn: () => api<{ items: RuleDTO[] }>("/api/v1/approval-rules"),
  });
  const types = useQuery({
    queryKey: ["ticket-types"],
    queryFn: () => api<{ items: TicketType[] }>("/api/v1/ticket-types"),
  });
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api<{ items: GroupSummary[] }>("/api/v1/groups"),
  });

  const [editing, setEditing] = useState<Partial<RuleDTO> | null>(null);

  if (rules.isLoading || types.isLoading) return <div className="p-6 text-ink-3">Loading…</div>;
  const byType = new Map<string, RuleDTO[]>();
  for (const r of rules.data?.items ?? []) {
    const list = byType.get(r.ticketTypeId) ?? [];
    list.push(r);
    byType.set(r.ticketTypeId, list);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Approval rules</h1>
      </div>

      {types.data?.items.map((t) => (
        <div key={t.id} className="bg-surface-2 border border-edge rounded-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <div>
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-xs text-ink-3 font-mono">{t.slug}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                setEditing({
                  ticketTypeId: t.id,
                  ticketTypeSlug: t.slug,
                  name: "",
                  conditionExpr: emptyExpression(),
                  requiredCount: 1,
                  approverGroupId: null,
                  approverRole: null,
                  order: (byType.get(t.id)?.length ?? 0),
                  isActive: true,
                })
              }
              className="text-sm text-brand"
            >
              + Add rule
            </button>
          </div>
          {(() => {
            const list = byType.get(t.id) ?? [];
            if (list.length === 0) {
              return <div className="px-4 py-6 text-sm text-ink-3 text-center">No rules.</div>;
            }
            return (
              <ul className="divide-y divide-edge">
                {list.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <RuleRow rule={r} onEdit={() => setEditing(r)} />
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      ))}

      {editing && (
        <RuleEditor
          draft={editing}
          groups={groups.data?.items ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["admin", "approval-rules"] });
          }}
        />
      )}
    </div>
  );
}

function RuleRow({ rule, onEdit }: { rule: RuleDTO; onEdit: () => void }) {
  const del = useMutation({
    mutationFn: () => api(`/api/v1/approval-rules/${rule.id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "approval-rules"] }),
  });
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="font-medium text-sm">{rule.name}</div>
        <div className="text-xs text-ink-3 mt-0.5">
          Requires {rule.requiredCount} approval{rule.requiredCount === 1 ? "" : "s"}
          {rule.approverGroupName && ` from group ${rule.approverGroupName}`}
          {rule.approverRole && ` from role ${rule.approverRole}`}
          {!rule.isActive && " · INACTIVE"}
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="text-sm text-brand">
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete rule "${rule.name}"?`)) del.mutate();
          }}
          className="text-sm text-red-500"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function RuleEditor({
  draft,
  groups,
  onClose,
  onSaved,
}: {
  draft: Partial<RuleDTO>;
  groups: GroupSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(draft.name ?? "");
  const [requiredCount, setRequiredCount] = useState(draft.requiredCount ?? 1);
  const [approverGroupId, setApproverGroupId] = useState(draft.approverGroupId ?? "");
  const [approverRole, setApproverRole] = useState(draft.approverRole ?? "");
  const [order, setOrder] = useState(draft.order ?? 0);
  const [isActive, setIsActive] = useState(draft.isActive ?? true);
  const [expr, setExpr] = useState<RuleExpression>(draft.conditionExpr ?? emptyExpression());

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ticketTypeId: draft.ticketTypeId!,
        name,
        conditionExpr: expr,
        requiredCount,
        approverGroupId: approverGroupId || undefined,
        approverRole: approverRole || undefined,
        order,
        isActive,
      };
      if (draft.id) {
        return api(`/api/v1/approval-rules/${draft.id}`, { method: "PATCH", body });
      }
      return api(`/api/v1/approval-rules`, { method: "POST", body });
    },
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-surface-2 border border-edge rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-edge flex items-center justify-between">
          <div className="font-semibold">
            {draft.id ? "Edit rule" : "New rule"}
            <span className="text-ink-3 text-sm font-normal ml-2">on {draft.ticketTypeSlug}</span>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-ink-3">
            Close
          </button>
        </div>
        <div className="p-4 space-y-4">
          <label className="block">
            <span className="block text-sm text-ink-2 mb-1">Rule name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. High-risk Change requires 2 CAB approvers"
              className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
            />
          </label>

          <div>
            <div className="text-sm text-ink-2 mb-1">Condition</div>
            <ExpressionEditor value={expr} onChange={setExpr} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm text-ink-2 mb-1">Required approvers</span>
              <input
                type="number"
                min={1}
                value={requiredCount}
                onChange={(e) => setRequiredCount(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
              />
            </label>
            <label className="block">
              <span className="block text-sm text-ink-2 mb-1">Order</span>
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
              />
            </label>
            <label className="block">
              <span className="block text-sm text-ink-2 mb-1">From group</span>
              <select
                value={approverGroupId}
                onChange={(e) => setApproverGroupId(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
              >
                <option value="">— Any —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm text-ink-2 mb-1">Or anyone with role</span>
              <select
                value={approverRole}
                onChange={(e) => setApproverRole(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
              >
                <option value="">— None —</option>
                <option value="Admin">Admin</option>
                <option value="Manager">Manager</option>
                <option value="HelpDesk">Help Desk</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active (new tickets evaluate this rule)
          </label>

          {save.isError && (
            <div className="text-sm text-red-500">{(save.error as Error).message}</div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-edge flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md border border-edge text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate()}
            className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
