import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface TicketTypeResp {
  items: {
    id: string;
    slug: string;
    name: string;
    prefix: string;
    schema: { fields?: Array<{ key: string; label: string; type: string; required: boolean; options?: { value: string; label: string }[]; defaultValue?: unknown; helpText?: string }> };
  }[];
}

export function NewTicket() {
  const navigate = useNavigate();
  const types = useQuery({
    queryKey: ["ticket-types"],
    queryFn: () => api<TicketTypeResp>("/api/v1/ticket-types"),
  });

  const [typeSlug, setTypeSlug] = useState("incident");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("P3");
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});

  const selectedType = types.data?.items.find((t) => t.slug === typeSlug);

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; ticketNumber: string }>("/api/v1/tickets", {
        method: "POST",
        body: { typeSlug, title, description, priority, customFields, assetIds: [] },
      }),
    onSuccess: (t) => navigate(`/tickets/${t.id}`),
  });

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">New ticket</h1>
      <form
        className="bg-surface-2 border border-edge rounded-lg p-6 space-y-4"
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
      >
        <Field label="Type">
          <select
            value={typeSlug}
            onChange={(e) => { setTypeSlug(e.target.value); setCustomFields({}); }}
            className="input"
          >
            {types.data?.items.map((t) => (
              <option key={t.id} value={t.slug}>{t.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className="input" />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="input"
          />
        </Field>

        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
            <option value="P1">P1 — Critical</option>
            <option value="P2">P2 — High</option>
            <option value="P3">P3 — Normal</option>
            <option value="P4">P4 — Low</option>
          </select>
        </Field>

        {selectedType?.schema?.fields?.map((f) => (
          <Field key={f.key} label={f.label + (f.required ? " *" : "")} helpText={f.helpText}>
            {renderInput(f, customFields[f.key], (v) => setCustomFields({ ...customFields, [f.key]: v }))}
          </Field>
        ))}

        {create.isError && (
          <div className="text-sm text-red-500">{(create.error as Error).message}</div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => navigate(-1)} className="px-3 py-1.5 rounded-md border border-edge text-sm">Cancel</button>
          <button type="submit" disabled={create.isPending} className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm font-medium disabled:opacity-50">
            {create.isPending ? "Creating…" : "Create ticket"}
          </button>
        </div>
      </form>

      <style>{`
        .input { display: block; width: 100%; padding: 8px 10px; background: rgb(var(--surface-1)); border: 1px solid rgb(var(--edge)); border-radius: 6px; color: rgb(var(--ink-1)); font-size: 14px; font-family: inherit; }
        .input:focus { outline: none; border-color: rgb(var(--brand)); }
      `}</style>
    </div>
  );
}

function Field({ label, children, helpText }: { label: string; children: React.ReactNode; helpText?: string }) {
  return (
    <label className="block">
      <span className="block text-sm text-ink-2 mb-1">{label}</span>
      {children}
      {helpText && <span className="block text-xs text-ink-3 mt-1">{helpText}</span>}
    </label>
  );
}

function renderInput(
  f: { type: string; options?: { value: string; label: string }[]; required: boolean },
  value: unknown,
  onChange: (v: unknown) => void,
) {
  if (f.type === "select") {
    return (
      <select
        className="input"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={f.required}
      >
        <option value="">—</option>
        {f.options?.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (f.type === "textarea") {
    return (
      <textarea
        className="input"
        rows={3}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={f.required}
      />
    );
  }
  if (f.type === "number") {
    return (
      <input
        type="number"
        className="input"
        value={(value as number | undefined) ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        required={f.required}
      />
    );
  }
  if (f.type === "date") {
    return (
      <input
        type="date"
        className="input"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={f.required}
      />
    );
  }
  return (
    <input
      type="text"
      className="input"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      required={f.required}
    />
  );
}
