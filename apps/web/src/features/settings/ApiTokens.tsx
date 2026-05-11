import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface TokenRow {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function ApiTokens() {
  const list = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api<{ items: TokenRow[] }>("/api/v1/api-tokens"),
  });

  const [newName, setNewName] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<{ token: TokenRow; secret: string }>("/api/v1/api-tokens", {
        method: "POST",
        body: { name: newName, scopes: [] },
      }),
    onSuccess: (data) => {
      setNewName("");
      setRevealed(data.secret);
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/v1/api-tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-tokens"] }),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-medium">API Tokens</h2>

      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(); }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Token name (e.g., CI integration)"
          className="flex-1 px-3 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
        />
        <button
          type="submit"
          disabled={!newName.trim() || create.isPending}
          className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create token"}
        </button>
      </form>

      {revealed && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-md p-3 text-sm">
          <div className="font-medium mb-1">Save this token — it won&apos;t be shown again:</div>
          <code className="block font-mono break-all text-xs bg-surface-1 p-2 rounded border border-edge">
            {revealed}
          </code>
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="text-xs text-ink-3 mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-surface-1 border border-edge rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 text-ink-3 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2 w-40">Last used</th>
              <th className="text-left px-3 py-2 w-40">Created</th>
              <th className="text-right px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {list.data?.items.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2 text-xs text-ink-3">
                  {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}
                </td>
                <td className="px-3 py-2 text-xs text-ink-3">
                  {new Date(t.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => revoke.mutate(t.id)}
                    className="text-xs text-red-500"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-ink-3">No tokens.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
