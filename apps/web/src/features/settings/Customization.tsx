import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface SettingResp {
  orgName: string;
  primaryColor: string;
  loginBanner: string;
  defaultTimeZone: string;
  setupCompleted: boolean;
  logoUrl: string | null;
}

export function Customization() {
  const settings = useQuery({
    queryKey: ["settings", "customization"],
    queryFn: () => api<SettingResp>("/api/v1/settings/customization"),
  });

  const [draft, setDraft] = useState<Partial<SettingResp>>({});

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      api<SettingResp>("/api/v1/settings/customization", { method: "PATCH", body: draft }),
    onSuccess: (data) => {
      setDraft(data);
      queryClient.invalidateQueries({ queryKey: ["settings", "customization"] });
    },
  });

  return (
    <form
      className="space-y-4 max-w-xl"
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
    >
      <h2 className="text-lg font-medium">Customization</h2>

      <Field label="Organization name">
        <input
          value={draft.orgName ?? ""}
          onChange={(e) => setDraft({ ...draft, orgName: e.target.value })}
          className="input"
        />
      </Field>

      <Field label="Primary color">
        <input
          type="color"
          value={draft.primaryColor ?? "#4a9eff"}
          onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}
          className="w-16 h-10 rounded border border-edge bg-surface-1"
        />
      </Field>

      <Field label="Login banner">
        <textarea
          value={draft.loginBanner ?? ""}
          onChange={(e) => setDraft({ ...draft, loginBanner: e.target.value })}
          rows={3}
          className="input"
        />
      </Field>

      <Field label="Default time zone">
        <input
          value={draft.defaultTimeZone ?? "UTC"}
          onChange={(e) => setDraft({ ...draft, defaultTimeZone: e.target.value })}
          className="input"
        />
      </Field>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={save.isPending}
          className="px-3 py-1.5 rounded-md bg-brand text-brand-fg text-sm disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <style>{`
        .input { display: block; width: 100%; padding: 8px 10px; background: rgb(var(--surface-1)); border: 1px solid rgb(var(--edge)); border-radius: 6px; color: rgb(var(--ink-1)); font-size: 14px; font-family: inherit; }
        .input:focus { outline: none; border-color: rgb(var(--brand)); }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}
