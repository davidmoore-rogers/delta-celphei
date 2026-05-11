import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";
import { ApprovalsPanel } from "./ApprovalsPanel";

interface TicketDTO {
  id: string;
  ticketNumber: string;
  typeName: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requesterId: string;
  assigneeId: string | null;
  teamId: string | null;
  customFields: Record<string, unknown>;
  assets: { polarisAssetId: string; cachedName: string | null; cachedType: string | null }[];
  taskCounts?: { total: number; open: number; done: number };
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

interface TaskDTO {
  id: string;
  taskNumber: string;
  ticketId: string;
  title: string;
  status: string;
  assigneeId: string | null;
  teamId: string | null;
}

interface CommentDTO {
  id: string;
  authorId: string;
  authorDisplayName?: string;
  body: string;
  createdAt: string;
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();

  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api<TicketDTO>(`/api/v1/tickets/${id}`),
    enabled: !!id,
  });

  const tasks = useQuery({
    queryKey: ["ticket", id, "tasks"],
    queryFn: () => api<{ items: TaskDTO[] }>(`/api/v1/tickets/${id}/tasks`),
    enabled: !!id,
  });

  const comments = useQuery({
    queryKey: ["ticket", id, "comments"],
    queryFn: () => api<{ items: CommentDTO[] }>(`/api/v1/tickets/${id}/comments`),
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      api<TicketDTO>(`/api/v1/tickets/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket", id] }),
  });

  if (ticket.isLoading) return <div className="p-8 text-ink-3">Loading…</div>;
  if (ticket.isError || !ticket.data) return <div className="p-8 text-red-500">Ticket not found.</div>;

  const t = ticket.data;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <span className="font-mono">{t.ticketNumber}</span>
            <span>·</span>
            <span>{t.typeName}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">{t.title}</h1>
        </div>

        {t.description && (
          <div className="bg-surface-2 border border-edge rounded-lg p-4">
            <h3 className="text-sm font-semibold text-ink-2 mb-2">Description</h3>
            <p className="whitespace-pre-wrap text-sm">{t.description}</p>
          </div>
        )}

        <TasksPanel ticketId={t.id} tasks={tasks.data?.items ?? []} />

        <ApprovalsPanel ticketId={t.id} />

        <CommentsPanel ticketId={t.id} comments={comments.data?.items ?? []} />
      </div>

      <aside className="space-y-3">
        <SidebarBlock title="Status">
          <select
            value={t.status}
            onChange={(e) => updateStatus.mutate(e.target.value)}
            className="text-sm w-full px-2 py-1 rounded-md bg-surface-1 border border-edge"
          >
            {["Open", "InProgress", "Pending", "Resolved", "Closed", "Cancelled"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {updateStatus.isError && (
            <p className="text-xs text-red-500 mt-2">{(updateStatus.error as Error).message}</p>
          )}
        </SidebarBlock>
        <SidebarBlock title="Priority"><div className="text-sm">{t.priority}</div></SidebarBlock>
        <SidebarBlock title="Type"><div className="text-sm">{t.typeName}</div></SidebarBlock>
        <SidebarBlock title="Linked Polaris assets">
          {t.assets.length === 0 ? (
            <div className="text-sm text-ink-3">No assets linked.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {t.assets.map((a) => (
                <li key={a.polarisAssetId}>
                  <span className="font-medium">{a.cachedName ?? a.polarisAssetId}</span>
                  {a.cachedType && <span className="text-ink-3 ml-1">· {a.cachedType}</span>}
                </li>
              ))}
            </ul>
          )}
        </SidebarBlock>
      </aside>
    </div>
  );
}

function TasksPanel({ ticketId, tasks }: { ticketId: string; tasks: TaskDTO[] }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<TaskDTO>(`/api/v1/tickets/${ticketId}/tasks`, {
        method: "POST",
        body: { title },
      }),
    onSuccess: () => {
      setTitle("");
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
  });

  const toggle = useMutation({
    mutationFn: (task: TaskDTO) =>
      api<TaskDTO>(`/api/v1/tasks/${task.id}`, {
        method: "PATCH",
        body: { status: task.status === "Done" ? "Open" : "Done" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
  });

  return (
    <div className="bg-surface-2 border border-edge rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h3 className="font-semibold">Tasks ({tasks.length})</h3>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="text-sm text-brand"
        >
          {adding ? "Cancel" : "+ Add task"}
        </button>
      </div>
      {adding && (
        <form
          className="flex gap-2 p-3 border-b border-edge"
          onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(); }}
        >
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="flex-1 px-3 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
          />
          <button type="submit" disabled={!title.trim() || create.isPending} className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50">
            Add
          </button>
        </form>
      )}
      <ul className="divide-y divide-edge">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={task.status === "Done"}
              onChange={() => toggle.mutate(task)}
            />
            <span className="font-mono text-xs text-ink-3 w-20">{task.taskNumber}</span>
            <span className={task.status === "Done" ? "flex-1 line-through text-ink-3" : "flex-1"}>{task.title}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-3 border border-edge">
              {task.status}
            </span>
          </li>
        ))}
        {tasks.length === 0 && !adding && (
          <li className="text-center text-sm text-ink-3 py-6">No tasks yet.</li>
        )}
      </ul>
    </div>
  );
}

function CommentsPanel({ ticketId, comments }: { ticketId: string; comments: CommentDTO[] }) {
  const [body, setBody] = useState("");
  const post = useMutation({
    mutationFn: () =>
      api(`/api/v1/tickets/${ticketId}/comments`, {
        method: "POST",
        body: { body, isInternal: false },
      }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["ticket", ticketId, "comments"] });
    },
  });

  return (
    <div className="bg-surface-2 border border-edge rounded-lg">
      <div className="px-4 py-3 border-b border-edge font-semibold">Comments ({comments.length})</div>
      <ul className="divide-y divide-edge max-h-[480px] overflow-auto scrollbar-thin">
        {comments.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <div className="text-xs text-ink-3 mb-1">
              <span className="font-medium text-ink-2">{c.authorDisplayName ?? c.authorId}</span>
              <span> · {new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
        {comments.length === 0 && (
          <li className="text-center text-sm text-ink-3 py-6">No comments yet.</li>
        )}
      </ul>
      <form
        className="p-3 border-t border-edge flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (body.trim()) post.mutate(); }}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          className="flex-1 px-3 py-1.5 text-sm rounded-md bg-surface-1 border border-edge font-sans"
        />
        <button
          type="submit"
          disabled={!body.trim() || post.isPending}
          className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50 self-end"
        >
          Post
        </button>
      </form>
    </div>
  );
}

function SidebarBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border border-edge rounded-lg p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-3 mb-2">{title}</div>
      {children}
    </div>
  );
}
