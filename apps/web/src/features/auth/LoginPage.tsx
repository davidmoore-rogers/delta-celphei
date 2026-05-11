import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, setCsrfToken } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";

interface LoginResp {
  user: { id: string; email: string; displayName: string; roles: string[] };
  csrfToken: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () =>
      api<LoginResp>("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
      }),
    onSuccess: (data) => {
      setCsrfToken(data.csrfToken);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/");
    },
    onError: (err) => {
      setError((err as Error).message);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-surface-2 border border-edge rounded-lg p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-brand text-xl">◆</span>
          <h1 className="text-lg font-semibold">Sign in to Celphei</h1>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            login.mutate();
          }}
        >
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </Field>
          {error && <div className="text-sm text-red-500">{error}</div>}
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full px-4 py-2 rounded-md bg-brand text-brand-fg font-medium disabled:opacity-50"
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <style>{`
        .input {
          display: block;
          width: 100%;
          padding: 8px 10px;
          background: rgb(var(--surface-1));
          border: 1px solid rgb(var(--edge));
          border-radius: 6px;
          color: rgb(var(--ink-1));
          font-size: 14px;
        }
        .input:focus { outline: none; border-color: rgb(var(--brand)); }
      `}</style>
    </div>
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
