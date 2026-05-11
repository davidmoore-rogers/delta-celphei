import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface TicketListResp {
  total: number;
  page: number;
  pageSize: number;
  items: {
    id: string;
    ticketNumber: string;
    typeName: string;
    title: string;
    status: string;
    priority: string;
    updatedAt: string;
    assigneeId: string | null;
  }[];
}

export function TicketList() {
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");
  const [typeSlug, setTypeSlug] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["tickets", { status, priority, typeSlug, q, page }],
    queryFn: () =>
      api<TicketListResp>("/api/v1/tickets", {
        query: { status, priority, typeSlug, q, page, pageSize: 25 },
      }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tickets</h1>
        <Link
          to="/tickets/new"
          className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm font-medium"
        >
          + New ticket
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Filter value={status} onChange={setStatus} label="Status" options={["Open", "InProgress", "Pending", "Resolved", "Closed"]} />
        <Filter value={priority} onChange={setPriority} label="Priority" options={["P1", "P2", "P3", "P4"]} />
        <Filter value={typeSlug} onChange={setTypeSlug} label="Type" options={[{ v: "incident", l: "Incident" }, { v: "change", l: "Change" }, { v: "request", l: "Request" }]} />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search…"
          className="px-3 py-1 text-sm rounded-md bg-surface-2 border border-edge"
        />
      </div>

      <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 text-ink-3 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 w-24">ID</th>
              <th className="text-left px-3 py-2 w-20">Type</th>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2 w-24">Status</th>
              <th className="text-left px-3 py-2 w-16">Pri</th>
              <th className="text-left px-3 py-2 w-32">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {list.data?.items.map((t) => (
              <tr key={t.id} className="hover:bg-surface-3">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link to={`/tickets/${t.id}`} className="text-brand">{t.ticketNumber}</Link>
                </td>
                <td className="px-3 py-2 text-xs">{t.typeName}</td>
                <td className="px-3 py-2 truncate max-w-md">
                  <Link to={`/tickets/${t.id}`} className="hover:underline">{t.title}</Link>
                </td>
                <td className="px-3 py-2 text-xs">{t.status}</td>
                <td className="px-3 py-2 text-xs">{t.priority}</td>
                <td className="px-3 py-2 text-xs text-ink-3">{new Date(t.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-ink-3">No tickets found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {list.data && (
        <div className="flex justify-between text-sm text-ink-3">
          <div>{list.data.total} total</div>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 disabled:opacity-30">Prev</button>
            <span>Page {list.data.page}</span>
            <button
              disabled={list.data.page * list.data.pageSize >= list.data.total}
              onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 disabled:opacity-30"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

type Opt = string | { v: string; l: string };
function Filter({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: Opt[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge"
    >
      <option value="">{label} ▾</option>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.v;
        const l = typeof o === "string" ? o : o.l;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}
