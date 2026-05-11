import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface EventRow {
  id: string;
  occurredAt: string;
  severity: string;
  source: string;
  actorDisplayName: string | null;
  subject: string | null;
  message: string;
}
interface EventsResp {
  total: number;
  page: number;
  pageSize: number;
  items: EventRow[];
}

export function EventsPage() {
  const [live, setLive] = useState(false);
  const [streamed, setStreamed] = useState<EventRow[]>([]);
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");

  const list = useQuery({
    queryKey: ["events", { severity, source }],
    queryFn: () =>
      api<EventsResp>("/api/v1/events", { query: { severity, source, pageSize: 100 } }),
    refetchInterval: live ? false : 5000,
  });

  const esRef = useRef<EventSource | null>(null);
  useEffect(() => {
    if (!live) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }
    setStreamed([]);
    const es = new EventSource("/api/v1/events/stream", { withCredentials: true });
    esRef.current = es;
    es.addEventListener("event", (ev) => {
      try {
        const evt = JSON.parse((ev as MessageEvent).data) as EventRow & { occurredAt: string | Date };
        const normalized: EventRow = {
          id: evt.id,
          occurredAt: typeof evt.occurredAt === "string" ? evt.occurredAt : new Date(evt.occurredAt).toISOString(),
          severity: evt.severity,
          source: evt.source,
          actorDisplayName: evt.actorDisplayName ?? null,
          subject: evt.subject ?? null,
          message: evt.message,
        };
        setStreamed((s) => [normalized, ...s].slice(0, 500));
      } catch {
        /* ignore */
      }
    });
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [live]);

  const rows = live ? streamed : list.data?.items ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Events</h1>
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className={`px-3 py-1.5 text-sm rounded-md border ${
            live ? "border-green-500 text-green-500" : "border-edge text-ink-2"
          }`}
        >
          {live ? "● Live" : "○ Static"}
        </button>
      </div>

      <div className="flex gap-2">
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge">
          <option value="">Severity ▾</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge">
          <option value="">Source ▾</option>
          <option value="auth">Auth</option>
          <option value="ticket">Ticket</option>
          <option value="task">Task</option>
          <option value="approval">Approval</option>
          <option value="system">System</option>
        </select>
      </div>

      <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 text-ink-3 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 w-44">Time</th>
              <th className="text-left px-3 py-2 w-20">Severity</th>
              <th className="text-left px-3 py-2 w-28">Source</th>
              <th className="text-left px-3 py-2 w-32">Actor</th>
              <th className="text-left px-3 py-2 w-28">Subject</th>
              <th className="text-left px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {rows.map((e) => (
              <tr key={e.id} className="hover:bg-surface-3">
                <td className="px-3 py-2 text-xs font-mono text-ink-3">{new Date(e.occurredAt).toLocaleTimeString()}</td>
                <td className="px-3 py-2 text-xs"><SeverityChip severity={e.severity} /></td>
                <td className="px-3 py-2 text-xs">{e.source}</td>
                <td className="px-3 py-2 text-xs">{e.actorDisplayName ?? "—"}</td>
                <td className="px-3 py-2 text-xs font-mono">{e.subject ?? "—"}</td>
                <td className="px-3 py-2">{e.message}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-ink-3">No events.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const color =
    severity === "error" ? "text-red-500 border-red-500/40" :
    severity === "warn" ? "text-amber-500 border-amber-500/40" :
    "text-ink-3 border-edge";
  return <span className={`px-1.5 py-0.5 rounded border ${color}`}>{severity}</span>;
}
