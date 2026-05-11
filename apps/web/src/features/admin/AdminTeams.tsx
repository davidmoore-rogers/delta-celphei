import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  ticketCount: number;
}

export function AdminTeams() {
  const teams = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => api<{ items: TeamRow[] }>("/api/v1/teams"),
  });
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api("/api/v1/teams", { method: "POST", body: { name } }),
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Teams</h1>

      <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New team name"
          className="flex-1 px-3 py-1.5 text-sm rounded-md bg-surface-2 border border-edge"
        />
        <button type="submit" disabled={!name.trim()} className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50">Add</button>
      </form>

      <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 text-ink-3 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2 w-32">Members</th>
              <th className="text-left px-3 py-2 w-32">Tickets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {teams.data?.items.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2 text-ink-3">{t.memberCount}</td>
                <td className="px-3 py-2 text-ink-3">{t.ticketCount}</td>
              </tr>
            ))}
            {teams.data?.items.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-8 text-center text-ink-3">No teams yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
