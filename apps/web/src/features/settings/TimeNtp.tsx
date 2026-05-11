import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface NtpServer {
  id: string;
  host: string;
  priority: number;
  isEnabled: boolean;
  lastCheckAt: string | null;
  lastStatus: string | null;
}
interface TimeNtpState {
  defaultTimeZone: string;
  serverTime: string;
  servers: NtpServer[];
}

export function TimeNtp() {
  const state = useQuery({
    queryKey: ["settings", "time-ntp"],
    queryFn: () => api<TimeNtpState>("/api/v1/settings/time-ntp"),
    refetchInterval: 10_000,
  });

  const [tz, setTz] = useState("");
  useEffect(() => {
    if (state.data?.defaultTimeZone && tz === "") setTz(state.data.defaultTimeZone);
  }, [state.data, tz]);

  const saveTz = useMutation({
    mutationFn: () =>
      api("/api/v1/settings/time-ntp", { method: "PATCH", body: { defaultTimeZone: tz } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "time-ntp"] }),
  });

  const [host, setHost] = useState("");
  const [priority, setPriority] = useState(0);
  const addServer = useMutation({
    mutationFn: () =>
      api("/api/v1/settings/time-ntp/servers", {
        method: "POST",
        body: { host, priority, isEnabled: true },
      }),
    onSuccess: () => {
      setHost("");
      setPriority(0);
      queryClient.invalidateQueries({ queryKey: ["settings", "time-ntp"] });
    },
  });

  const delServer = useMutation({
    mutationFn: (id: string) => api(`/api/v1/settings/time-ntp/servers/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "time-ntp"] }),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-medium">Time &amp; NTP</h2>

      <div className="bg-surface-1 border border-edge rounded-md p-3">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-ink-3">Server time</span>
          <span className="font-mono text-sm">
            {state.data ? new Date(state.data.serverTime).toLocaleString() : "—"}
          </span>
        </div>
      </div>

      <form
        className="flex gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (tz.trim()) saveTz.mutate();
        }}
      >
        <label className="flex-1 block">
          <span className="block text-sm text-ink-2 mb-1">Default time zone (IANA)</span>
          <input
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="UTC, America/Chicago, Europe/London…"
            className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
          />
        </label>
        <button
          type="submit"
          disabled={!tz.trim() || saveTz.isPending}
          className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
        >
          {saveTz.isPending ? "Saving…" : "Save"}
        </button>
      </form>

      <div>
        <h3 className="font-medium mb-2">NTP servers</h3>
        <form
          className="flex gap-2 mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (host.trim()) addServer.mutate();
          }}
        >
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="ntp.example.com"
            className="flex-1 px-3 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
          />
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            placeholder="priority"
            className="w-24 px-3 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
          />
          <button
            type="submit"
            disabled={!host.trim() || addServer.isPending}
            className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <ul className="bg-surface-1 border border-edge rounded-md overflow-hidden divide-y divide-edge">
          {state.data?.servers.map((s) => (
            <li key={s.id} className="flex items-center px-3 py-2 text-sm">
              <span className="font-mono flex-1">{s.host}</span>
              <span className="text-xs text-ink-3 w-20">priority {s.priority}</span>
              <span className="text-xs text-ink-3 w-32">
                {s.lastStatus ?? (s.isEnabled ? "enabled" : "disabled")}
              </span>
              <button
                type="button"
                onClick={() => delServer.mutate(s.id)}
                className="text-xs text-red-500"
              >
                Remove
              </button>
            </li>
          ))}
          {state.data?.servers.length === 0 && (
            <li className="px-3 py-4 text-center text-ink-3 text-sm">No NTP servers configured.</li>
          )}
        </ul>
        <p className="text-xs text-ink-3 mt-2">
          The list is consultative — the host OS still controls the actual clock. Celphei records
          these servers so admins can audit which NTP sources should be authoritative.
        </p>
      </div>
    </div>
  );
}
