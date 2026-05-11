import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  isActive: boolean;
  federatedFrom: string | null;
  lastLoginAt: string | null;
}

const ROLES = ["Admin", "Manager", "HelpDesk", "User"] as const;

export function AdminUsers() {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () => api<{ items: UserRow[] }>("/api/v1/users", { query: { q } }),
  });

  const updateRoles = useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: string[] }) =>
      api(`/api/v1/users/${userId}/roles`, { method: "PATCH", body: { roles } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or email…"
        className="px-3 py-1.5 text-sm rounded-md bg-surface-2 border border-edge w-72"
      />

      <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 text-ink-3 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Roles</th>
              <th className="text-left px-3 py-2 w-32">Source</th>
              <th className="text-left px-3 py-2 w-40">Last login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {list.data?.items.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.displayName}</td>
                <td className="px-3 py-2 text-ink-3">{u.email}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {ROLES.map((r) => {
                      const on = u.roles.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            const next = on ? u.roles.filter((x) => x !== r) : [...u.roles, r];
                            if (next.length === 0) return; // require at least one
                            updateRoles.mutate({ userId: u.id, roles: next });
                          }}
                          className={`text-xs px-1.5 py-0.5 rounded border ${
                            on
                              ? "bg-brand text-brand-fg border-brand"
                              : "bg-surface-1 text-ink-3 border-edge"
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-ink-3">{u.federatedFrom ?? "local"}</td>
                <td className="px-3 py-2 text-xs text-ink-3">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-3">No users.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
