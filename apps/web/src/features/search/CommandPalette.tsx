import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUIStore } from "../../stores/uiStore";

interface Hit {
  kind: "ticket" | "task" | "user" | "asset";
  id: string;
  url: string;
  [k: string]: unknown;
}
interface SearchResp {
  q: string;
  hits: Hit[];
  groupCounts: Record<string, number>;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQ("");
      setDebounced("");
      setSelectedIdx(0);
    }
  }, [open]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(id);
  }, [q]);

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<SearchResp>("/api/v1/search", { query: { q: debounced } }),
    enabled: open && debounced.length > 0,
  });

  const hits = results.data?.hits ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, hits.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const hit = hits[selectedIdx];
        if (hit) {
          setOpen(false);
          if (hit.kind === "asset") {
            window.open(hit.url, "_blank");
          } else {
            navigate(hit.url);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, hits, selectedIdx, navigate, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-surface-2 border border-edge rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setSelectedIdx(0); }}
          placeholder="Search tickets, tasks, users, assets…"
          className="w-full px-4 py-3 bg-transparent border-b border-edge outline-none text-base"
        />
        <div className="max-h-80 overflow-auto scrollbar-thin">
          {!debounced && (
            <div className="p-8 text-center text-sm text-ink-3">Type to search.</div>
          )}
          {debounced && results.isLoading && (
            <div className="p-8 text-center text-sm text-ink-3">Searching…</div>
          )}
          {debounced && !results.isLoading && hits.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-3">No results.</div>
          )}
          {hits.map((h, i) => (
            <button
              key={`${h.kind}:${h.id}`}
              type="button"
              onMouseEnter={() => setSelectedIdx(i)}
              onClick={() => {
                setOpen(false);
                if (h.kind === "asset") window.open(h.url, "_blank");
                else navigate(h.url);
              }}
              className={`w-full text-left px-4 py-2 flex items-center gap-3 ${i === selectedIdx ? "bg-surface-3" : ""}`}
            >
              <KindBadge kind={h.kind} />
              <span className="flex-1 truncate text-sm">
                {h.kind === "ticket" && (
                  <>
                    <span className="font-mono text-xs text-ink-3 mr-2">{String(h.ticketNumber)}</span>
                    <span>{String(h.title)}</span>
                  </>
                )}
                {h.kind === "task" && (
                  <>
                    <span className="font-mono text-xs text-ink-3 mr-2">{String(h.taskNumber)}</span>
                    <span>{String(h.title)}</span>
                  </>
                )}
                {h.kind === "user" && (
                  <>
                    <span>{String(h.displayName)}</span>
                    <span className="text-ink-3 ml-2 text-xs">{String(h.email)}</span>
                  </>
                )}
                {h.kind === "asset" && (
                  <>
                    <span>{String(h.name)}</span>
                    {h.assetType && <span className="text-ink-3 ml-2 text-xs">{String(h.assetType)}</span>}
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-edge text-xs text-ink-3 flex gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: Hit["kind"] }) {
  const labels: Record<string, string> = {
    ticket: "TKT",
    task: "TSK",
    user: "USR",
    asset: "AST",
  };
  return (
    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-3 border border-edge text-ink-3 w-10 text-center">
      {labels[kind]}
    </span>
  );
}
