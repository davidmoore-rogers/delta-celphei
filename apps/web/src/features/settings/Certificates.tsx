import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface CertInfo {
  termination: "reverse-proxy" | "direct" | "unknown";
  trustProxy: boolean;
  protocol: string;
  notes: string[];
}

export function Certificates() {
  const info = useQuery({
    queryKey: ["settings", "certificates"],
    queryFn: () => api<CertInfo>("/api/v1/settings/certificates"),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-medium">Certificates</h2>
      {info.data && (
        <div className="bg-surface-1 border border-edge rounded-md p-4 space-y-3">
          <div className="grid grid-cols-[160px_1fr] gap-2 text-sm">
            <span className="text-ink-3">Protocol</span>
            <span className="font-mono">{info.data.protocol}</span>
            <span className="text-ink-3">TLS termination</span>
            <span>
              <Chip termination={info.data.termination} />
            </span>
            <span className="text-ink-3">TRUST_PROXY</span>
            <span className="font-mono">{info.data.trustProxy ? "true" : "false"}</span>
          </div>
          <ul className="space-y-2 text-sm">
            {info.data.notes.map((n, i) => (
              <li key={i} className="border-l-2 border-edge pl-3 text-ink-2">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-sm text-ink-3">
        Celphei is designed to live behind a reverse proxy (Nginx, Caddy, an upstream load balancer)
        that terminates TLS and forwards plain HTTP. In-app certificate management is intentionally
        out of scope so cert renewal and rotation stay with the platform tooling you already use.
      </div>
    </div>
  );
}

function Chip({ termination }: { termination: CertInfo["termination"] }) {
  const map = {
    "reverse-proxy": "text-green-500 border-green-500/40",
    direct: "text-amber-500 border-amber-500/40",
    unknown: "text-ink-3 border-edge",
  } as const;
  const label = {
    "reverse-proxy": "Reverse proxy",
    direct: "Direct (no upstream)",
    unknown: "Unknown",
  } as const;
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs ${map[termination]}`}>
      {label[termination]}
    </span>
  );
}
