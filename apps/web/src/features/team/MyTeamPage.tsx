import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

interface ManagerReportRow {
  id: string;
  managerId: string;
  managerDisplayName: string;
  reportId: string;
  reportDisplayName: string;
  source: string;
}

interface TicketListResp {
  total: number;
  items: {
    id: string;
    ticketNumber: string;
    title: string;
    status: string;
    priority: string;
    assigneeId: string | null;
  }[];
}

export function MyTeamPage() {
  const reports = useQuery({
    queryKey: ["my-team", "reports"],
    queryFn: () => api<{ items: ManagerReportRow[] }>("/api/v1/manager-reports"),
  });

  const tickets = useQuery({
    queryKey: ["my-team", "tickets", reports.data],
    queryFn: async () => {
      const reportIds = (reports.data?.items ?? []).map((r) => r.reportId);
      if (reportIds.length === 0) return { total: 0, items: [] };
      // Phase 1: fetch tickets for each direct report; Phase 2 will add /tickets?assigneeIn=...
      const results = await Promise.all(
        reportIds.map((rid) => api<TicketListResp>("/api/v1/tickets", { query: { assigneeId: rid, pageSize: 25 } })),
      );
      return {
        total: results.reduce((s, r) => s + r.total, 0),
        items: results.flatMap((r) => r.items),
      };
    },
    enabled: !!reports.data,
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">My Team</h1>
      <p className="text-sm text-ink-3">
        Direct-report links come from the Entra/AD <code>manager</code> attribute when synced, or
        manual overrides by an Admin.
      </p>

      <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-edge font-medium">Direct reports ({reports.data?.items.length ?? 0})</div>
        <ul className="divide-y divide-edge">
          {reports.data?.items.map((r) => (
            <li key={r.id} className="px-4 py-2 text-sm flex items-center justify-between">
              <span>{r.reportDisplayName}</span>
              <span className="text-xs text-ink-3">{r.source}</span>
            </li>
          ))}
          {reports.data?.items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-3">No direct reports configured yet.</li>
          )}
        </ul>
      </div>

      <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-edge font-medium">Team tickets ({tickets.data?.total ?? 0})</div>
        <ul className="divide-y divide-edge">
          {tickets.data?.items.map((t) => (
            <li key={t.id}>
              <Link
                to={`/tickets/${t.id}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-surface-3 text-sm"
              >
                <span className="font-mono text-xs text-ink-3 w-20">{t.ticketNumber}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-surface-3 border border-edge">{t.priority}</span>
                <span className="text-xs text-ink-3 w-16 text-right">{t.status}</span>
              </Link>
            </li>
          ))}
          {tickets.data && tickets.data.items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-3">No tickets assigned to your direct reports.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
