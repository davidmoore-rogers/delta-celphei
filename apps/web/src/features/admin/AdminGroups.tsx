import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

interface UserRow {
  id: string;
  email: string;
  displayName: string;
}

interface MemberRow {
  userId: string;
  displayName: string;
  email: string;
  addedAt: string;
}

export function AdminGroups() {
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api<{ items: GroupRow[] }>("/api/v1/groups"),
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api("/api/v1/groups", {
        method: "POST",
        body: { name, description: description || undefined },
      }),
    onSuccess: () => {
      setName("");
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/api/v1/groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setSelected(null);
    },
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Groups</h1>
      <p className="text-sm text-ink-3">
        Groups are used by approval rules to scope which users can approve. A user can belong to
        multiple groups.
      </p>

      <form
        className="flex gap-2 max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name (e.g. CAB)"
          className="px-3 py-1.5 text-sm rounded-md bg-surface-2 border border-edge"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="flex-1 px-3 py-1.5 text-sm rounded-md bg-surface-2 border border-edge"
        />
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "Add group"}
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4">
        <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-edge font-medium">Groups</div>
          <ul className="divide-y divide-edge">
            {groups.data?.items.map((g) => (
              <li
                key={g.id}
                className={`flex items-center justify-between px-4 py-2 text-sm cursor-pointer ${
                  selected === g.id ? "bg-surface-3" : "hover:bg-surface-3"
                }`}
                onClick={() => setSelected(g.id)}
              >
                <div>
                  <div className="font-medium">{g.name}</div>
                  {g.description && (
                    <div className="text-xs text-ink-3">{g.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-3">{g.memberCount} members</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete group "${g.name}"?`)) del.mutate(g.id);
                    }}
                    className="text-xs text-red-500"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {groups.data?.items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-3">No groups yet.</li>
            )}
          </ul>
        </div>

        <div className="bg-surface-2 border border-edge rounded-lg">
          {selected ? <GroupMembers groupId={selected} /> : <div className="p-6 text-sm text-ink-3 text-center">Select a group to manage members.</div>}
        </div>
      </div>
    </div>
  );
}

function GroupMembers({ groupId }: { groupId: string }) {
  const members = useQuery({
    queryKey: ["groups", groupId, "members"],
    queryFn: () => api<{ items: MemberRow[] }>(`/api/v1/groups/${groupId}/members`),
  });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ items: UserRow[] }>("/api/v1/users"),
  });

  const [picker, setPicker] = useState("");

  const add = useMutation({
    mutationFn: (userId: string) =>
      api(`/api/v1/groups/${groupId}/members`, { method: "POST", body: { userId } }),
    onSuccess: () => {
      setPicker("");
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });

  const remove = useMutation({
    mutationFn: (userId: string) =>
      api(`/api/v1/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups", groupId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
  });

  const memberIds = new Set((members.data?.items ?? []).map((m) => m.userId));
  const available = (users.data?.items ?? []).filter((u) => !memberIds.has(u.id));

  return (
    <div>
      <div className="px-4 py-3 border-b border-edge font-medium">Members</div>
      <div className="p-3 flex gap-2 border-b border-edge">
        <select
          value={picker}
          onChange={(e) => setPicker(e.target.value)}
          className="flex-1 px-2 py-1 text-sm rounded-md bg-surface-1 border border-edge"
        >
          <option value="">Add user…</option>
          {available.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName} ({u.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!picker || add.isPending}
          onClick={() => add.mutate(picker)}
          className="px-3 py-1 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
        >
          Add
        </button>
      </div>
      <ul className="divide-y divide-edge">
        {members.data?.items.map((m) => (
          <li key={m.userId} className="flex items-center justify-between px-4 py-2 text-sm">
            <div>
              <span className="font-medium">{m.displayName}</span>
              <span className="text-ink-3 ml-2 text-xs">{m.email}</span>
            </div>
            <button
              type="button"
              onClick={() => remove.mutate(m.userId)}
              className="text-xs text-red-500"
            >
              Remove
            </button>
          </li>
        ))}
        {members.data?.items.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-ink-3">No members.</li>
        )}
      </ul>
    </div>
  );
}
