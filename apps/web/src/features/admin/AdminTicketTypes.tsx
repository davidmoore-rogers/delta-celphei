import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface Field {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "date" | "user" | "asset";
  required: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  helpText?: string;
}

interface TicketType {
  id: string;
  slug: string;
  name: string;
  prefix: string;
  isBuiltIn: boolean;
  isActive: boolean;
  tasksBlockClose: boolean;
  schema: { fields?: Field[] };
}

const FIELD_TYPES: Field["type"][] = ["text", "textarea", "number", "select", "date", "user", "asset"];

export function AdminTicketTypes() {
  const types = useQuery({
    queryKey: ["admin", "ticket-types"],
    queryFn: () => api<{ items: TicketType[] }>("/api/v1/ticket-types"),
  });
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSlug && types.data?.items[0]) {
      setSelectedSlug(types.data.items[0].slug);
    }
  }, [types.data, selectedSlug]);

  if (types.isLoading) return <div className="p-6 text-ink-3">Loading…</div>;
  const selected = types.data?.items.find((t) => t.slug === selectedSlug) ?? null;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Ticket types</h1>
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
        <div className="bg-surface-2 border border-edge rounded-lg overflow-hidden">
          <ul className="divide-y divide-edge">
            {types.data?.items.map((t) => (
              <li
                key={t.id}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  selectedSlug === t.slug ? "bg-surface-3" : "hover:bg-surface-3"
                }`}
                onClick={() => setSelectedSlug(t.slug)}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-ink-3 mt-0.5">
                  <span className="font-mono">{t.prefix}</span>
                  {t.isBuiltIn && <span className="ml-2">· built-in</span>}
                  {!t.isActive && <span className="ml-2 text-red-500">· inactive</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-surface-2 border border-edge rounded-lg p-4">
          {selected ? <TypeEditor type={selected} /> : <div className="text-ink-3 text-sm">No ticket types.</div>}
        </div>
      </div>
    </div>
  );
}

function TypeEditor({ type }: { type: TicketType }) {
  const [name, setName] = useState(type.name);
  const [tasksBlockClose, setTasksBlockClose] = useState(type.tasksBlockClose);
  const [isActive, setIsActive] = useState(type.isActive);
  const [fields, setFields] = useState<Field[]>(type.schema?.fields ?? []);

  useEffect(() => {
    setName(type.name);
    setTasksBlockClose(type.tasksBlockClose);
    setIsActive(type.isActive);
    setFields(type.schema?.fields ?? []);
  }, [type.slug, type.name, type.tasksBlockClose, type.isActive, type.schema]);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/v1/ticket-types/${type.slug}`, {
        method: "PATCH",
        body: {
          name,
          tasksBlockClose,
          isActive,
          schema: { fields },
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "ticket-types"] }),
  });

  function patchField(i: number, patch: Partial<Field>) {
    const next = fields.slice();
    next[i] = { ...next[i]!, ...patch };
    setFields(next);
  }
  function removeField(i: number) {
    setFields(fields.filter((_, j) => j !== i));
  }
  function addField() {
    setFields([
      ...fields,
      { key: `field${fields.length + 1}`, label: "New field", type: "text", required: false },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm text-ink-2 mb-1">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge"
          />
        </label>
        <label className="block">
          <span className="block text-sm text-ink-2 mb-1">Prefix</span>
          <input
            value={type.prefix}
            disabled
            title="Prefix is locked once tickets exist (would break ticketNumber uniqueness)."
            className="w-full px-2 py-1.5 text-sm rounded-md bg-surface-1 border border-edge opacity-60"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={tasksBlockClose}
            onChange={(e) => setTasksBlockClose(e.target.checked)}
          />
          Tasks block ticket close
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Custom fields</h3>
          <button type="button" onClick={addField} className="text-sm text-brand">
            + Field
          </button>
        </div>
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <li key={i} className="bg-surface-1 border border-edge rounded-md p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="block text-xs">
                  <span className="text-ink-3">Key</span>
                  <input
                    value={f.key}
                    onChange={(e) => patchField(i, { key: e.target.value })}
                    className="w-full mt-0.5 px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge font-mono"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-ink-3">Label</span>
                  <input
                    value={f.label}
                    onChange={(e) => patchField(i, { label: e.target.value })}
                    className="w-full mt-0.5 px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-ink-3">Type</span>
                  <select
                    value={f.type}
                    onChange={(e) => patchField(i, { type: e.target.value as Field["type"] })}
                    className="w-full mt-0.5 px-2 py-1 text-sm rounded-md bg-surface-2 border border-edge"
                  >
                    {FIELD_TYPES.map((ft) => (
                      <option key={ft} value={ft}>{ft}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-3 items-center text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => patchField(i, { required: e.target.checked })}
                  />
                  Required
                </label>
                <input
                  value={f.helpText ?? ""}
                  onChange={(e) => patchField(i, { helpText: e.target.value })}
                  placeholder="Help text (optional)"
                  className="flex-1 px-2 py-1 rounded-md bg-surface-2 border border-edge"
                />
                <button
                  type="button"
                  onClick={() => removeField(i)}
                  className="text-red-500"
                >
                  Remove
                </button>
              </div>
              {f.type === "select" && (
                <SelectOptionsEditor
                  options={f.options ?? []}
                  onChange={(options) => patchField(i, { options })}
                />
              )}
            </li>
          ))}
          {fields.length === 0 && (
            <li className="text-center text-ink-3 text-sm py-4">No custom fields.</li>
          )}
        </ul>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-edge">
        {save.isError && (
          <span className="text-sm text-red-500 mr-auto">{(save.error as Error).message}</span>
        )}
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (next: { value: string; label: string }[]) => void;
}) {
  return (
    <div className="ml-2 mt-1 space-y-1">
      <div className="text-xs text-ink-3 mb-1">Options</div>
      {options.map((o, i) => (
        <div key={i} className="flex gap-2 text-xs">
          <input
            value={o.value}
            onChange={(e) => {
              const next = options.slice();
              next[i] = { ...next[i]!, value: e.target.value };
              onChange(next);
            }}
            placeholder="value"
            className="w-1/3 px-2 py-1 rounded-md bg-surface-2 border border-edge font-mono"
          />
          <input
            value={o.label}
            onChange={(e) => {
              const next = options.slice();
              next[i] = { ...next[i]!, label: e.target.value };
              onChange(next);
            }}
            placeholder="label"
            className="flex-1 px-2 py-1 rounded-md bg-surface-2 border border-edge"
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="text-red-500"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, { value: "", label: "" }])}
        className="text-xs text-brand"
      >
        + option
      </button>
    </div>
  );
}
