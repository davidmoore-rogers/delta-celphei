import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";

interface TicketListResp {
  total: number;
  page: number;
  pageSize: number;
  items: {
    id: string;
    ticketNumber: string;
    title: string;
    status: string;
    priority: string;
  }[];
}

export function Dashboard() {
  const { data: me } = useMe();
  const assigned = useQuery({
    queryKey: ["dashboard", "assigned"],
    queryFn: () => api<TicketListResp>("/api/v1/tickets", { query: { scope: "assigned", pageSize: 8 } }),
    enabled: !!me,
  });
  const open = useQuery({
    queryKey: ["dashboard", "open"],
    queryFn: () => api<TicketListResp>("/api/v1/tickets", { query: { status: "Open", pageSize: 8 } }),
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {me?.user.displayName.split(" ")[0]}</h1>
        <p className="text-ink-3 text-sm">Quick overview of what needs attention.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="Open tickets" value={open.data?.total ?? "…"} />
        <Kpi label="Assigned to me" value={assigned.data?.total ?? "…"} />
        <Kpi label="Awaiting approval" value="—" subtitle="Phase 2" />
        <Kpi label="Breached SLA" value="—" subtitle="Phase 4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title={`Assigned to me (${assigned.data?.total ?? 0})`}>
          <TicketRows tickets={assigned.data?.items ?? []} empty="Nothing assigned to you." />
        </Panel>
        <Panel title={`Open tickets (${open.data?.total ?? 0})`}>
          <TicketRows tickets={open.data?.items ?? []} empty="No open tickets." />
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value, subtitle }: { label: string; value: React.ReactNode; subtitle?: string }) {
  return (
    <div className="bg-surface-2 border border-edge rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs text-ink-3 mt-1">{subtitle}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border border-edge rounded-lg">
      <div className="px-4 py-3 border-b border-edge font-medium">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function TicketRows({ tickets, empty }: { tickets: TicketListResp["items"]; empty: string }) {
  if (tickets.length === 0) {
    return <div className="p-8 text-center text-ink-3 text-sm">{empty}</div>;
  }
  return (
    <ul className="divide-y divide-edge">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link
            to={`/tickets/${t.id}`}
            className="flex items-center gap-3 px-4 py-2 hover:bg-surface-3"
          >
            <span className="font-mono text-xs text-ink-3 w-20">{t.ticketNumber}</span>
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-3 border border-edge text-ink-2">
              {t.priority}
            </span>
            <span className="text-xs text-ink-3 w-16 text-right">{t.status}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
