import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface MaintenanceRow {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  severity: "info" | "warn" | "error";
  createdAt: string;
}

export function Maintenances() {
  const list = useQuery({
    queryKey: ["settings", "maintenances"],
    queryFn: () => api<{ items: MaintenanceRow[] }>("/api/v1/settings/maintenances"),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [severity, setSeverity] = useState<MaintenanceRow["severity"]>("info");

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/settings/maintenances", {
        method: "POST",
        body: {
          title,
          description: description || undefined,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          severity,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setStartsAt("");
      setEndsAt("");
      queryClient.invalidateQueries({ queryKey: ["settings", "maintenances"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/api/v1/settings/maintenances/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "maintenances"] }),
  });

  const now = new Date();
  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-lg font-medium">Maintenances</h2>

      <form
        className="bg-surface-1 border border-edge rounded-md p-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && startsAt && endsAt) create.mutate();
        }}
      >
        <div className="text-sm font-medium mb-1">Schedule a maintenance window</div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Database failover practice)"
          className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-2 border border-edge"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Description (optional)"
          className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-2 border border-edge"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="block text-xs">
            <span className="text-ink-3">Starts</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full mt-0.5 px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge"
            />
          </label>
          <label className="block text-xs">
            <span className="text-ink-3">Ends</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full mt-0.5 px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge"
            />
          </label>
          <label className="block text-xs">
            <span className="text-ink-3">Severity</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as MaintenanceRow["severity"])}
              className="w-full mt-0.5 px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge"
            >
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!title.trim() || !startsAt || !endsAt || create.isPending}
            className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
          >
            {create.isPending ? "Scheduling…" : "Schedule"}
          </button>
        </div>
        {create.isError && (
          <div className="text-xs text-red-500">{(create.error as Error).message}</div>
        )}
      </form>

      <div>
        <h3 className="font-medium mb-2">Scheduled</h3>
        <ul className="bg-surface-1 border border-edge rounded-md overflow-hidden divide-y divide-edge">
          {list.data?.items.map((m) => {
            const start = new Date(m.startsAt);
            const end = new Date(m.endsAt);
            const active = start <= now && now <= end;
            const past = end < now;
            return (
              <li key={m.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                <SeverityChip severity={m.severity} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    {active && <span className="text-xs text-amber-500">ACTIVE</span>}
                    {past && <span className="text-xs text-ink-3">past</span>}
                  </div>
                  {m.description && (
                    <div className="text-xs text-ink-3 mt-0.5">{m.description}</div>
                  )}
                  <div className="text-xs text-ink-3 mt-0.5">
                    {start.toLocaleString()} → {end.toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => del.mutate(m.id)}
                  className="text-xs text-red-500"
                >
                  Delete
                </button>
              </li>
            );
          })}
          {list.data?.items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-ink-3">
              No maintenance windows scheduled.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: MaintenanceRow["severity"] }) {
  const color =
    severity === "error"
      ? "text-red-500 border-red-500/40"
      : severity === "warn"
        ? "text-amber-500 border-amber-500/40"
        : "text-ink-3 border-edge";
  return <span className={`px-1.5 py-0.5 rounded border text-xs h-fit ${color}`}>{severity}</span>;
}
