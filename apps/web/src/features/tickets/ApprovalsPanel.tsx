import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface DecisionDTO {
  id: string;
  approverId: string;
  approverDisplayName?: string;
  decision: "Approve" | "Reject";
  comment: string | null;
  decidedAt: string;
}

interface RequestDTO {
  id: string;
  ticketId: string;
  ruleId: string;
  ruleName?: string;
  requiredCount: number;
  state: "Pending" | "Approved" | "Rejected" | "Cancelled";
  approverGroupId: string | null;
  approverGroupName: string | null;
  approverRole: string | null;
  decisions: DecisionDTO[];
  createdAt: string;
  resolvedAt: string | null;
}

interface ApprovalsResp {
  requests: RequestDTO[];
  approved: boolean;
  total: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

export function ApprovalsPanel({ ticketId }: { ticketId: string }) {
  const approvals = useQuery({
    queryKey: ["ticket", ticketId, "approvals"],
    queryFn: () => api<ApprovalsResp>(`/api/v1/tickets/${ticketId}/approvals`),
  });

  if (approvals.isLoading) return null;
  const data = approvals.data;
  if (!data || data.requests.length === 0) {
    return (
      <div className="bg-surface-2 border border-edge rounded-lg p-4 text-sm text-ink-3">
        No approvals required for this ticket.
      </div>
    );
  }

  return (
    <div className="bg-surface-2 border border-edge rounded-lg">
      <div className="px-4 py-3 border-b border-edge flex items-center justify-between">
        <h3 className="font-semibold">Approvals</h3>
        <Summary {...data} />
      </div>
      <ul className="divide-y divide-edge">
        {data.requests.map((r) => (
          <li key={r.id} className="p-4">
            <RequestRow ticketId={ticketId} request={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Summary(s: ApprovalsResp) {
  if (s.approved) {
    return <span className="text-xs text-green-500">✓ All approved</span>;
  }
  if (s.rejectedCount > 0) {
    return <span className="text-xs text-red-500">✗ Rejected ({s.rejectedCount})</span>;
  }
  return (
    <span className="text-xs text-ink-3">
      {s.approvedCount}/{s.total} approved · {s.pendingCount} pending
    </span>
  );
}

function RequestRow({ ticketId, request }: { ticketId: string; request: RequestDTO }) {
  const [comment, setComment] = useState("");
  const decide = useMutation({
    mutationFn: (decision: "Approve" | "Reject") =>
      api(`/api/v1/tickets/${ticketId}/approvals/${request.id}/decisions`, {
        method: "POST",
        body: { decision, comment: comment.trim() || undefined },
      }),
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId, "approvals"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
  });

  const approvalsSoFar = request.decisions.filter((d) => d.decision === "Approve").length;
  const alreadyRejected = request.decisions.some((d) => d.decision === "Reject");

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium text-sm">{request.ruleName ?? request.ruleId}</div>
          <div className="text-xs text-ink-3 mt-1">
            <StateChip state={request.state} />
            <span className="ml-2">
              {approvalsSoFar} of {request.requiredCount} approval
              {request.requiredCount === 1 ? "" : "s"}
            </span>
            {request.approverGroupName && (
              <span className="ml-2">· Group: {request.approverGroupName}</span>
            )}
            {request.approverRole && <span className="ml-2">· Role: {request.approverRole}</span>}
          </div>
        </div>
      </div>

      {request.decisions.length > 0 && (
        <ul className="mt-3 ml-2 space-y-1 text-sm">
          {request.decisions.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              {d.decision === "Approve" ? (
                <span className="text-green-500">✓</span>
              ) : (
                <span className="text-red-500">✗</span>
              )}
              <span className="text-ink-2">{d.approverDisplayName ?? d.approverId}</span>
              {d.comment && <span className="text-ink-3 text-xs">— {d.comment}</span>}
              <span className="ml-auto text-xs text-ink-3">
                {new Date(d.decidedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {request.state === "Pending" && !alreadyRejected && (
        <div className="mt-3 flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment"
            className="flex-1 px-2 py-1 text-sm rounded-md bg-surface-1 border border-edge"
          />
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate("Approve")}
            className="px-3 py-1 rounded-md bg-green-600 text-white text-sm disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate("Reject")}
            className="px-3 py-1 rounded-md bg-red-600 text-white text-sm disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
      {decide.isError && (
        <div className="mt-2 text-xs text-red-500">{(decide.error as Error).message}</div>
      )}
    </div>
  );
}

function StateChip({ state }: { state: RequestDTO["state"] }) {
  const map: Record<RequestDTO["state"], string> = {
    Pending: "text-amber-500 border-amber-500/40",
    Approved: "text-green-500 border-green-500/40",
    Rejected: "text-red-500 border-red-500/40",
    Cancelled: "text-ink-3 border-edge",
  };
  return <span className={`px-1.5 py-0.5 rounded border text-xs ${map[state]}`}>{state}</span>;
}
