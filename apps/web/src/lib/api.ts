let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function api<T = unknown>(pathname: string, opts: ApiOptions = {}): Promise<T> {
  const { body, headers = {}, query, method = "GET", ...rest } = opts;
  const isMutation = method !== "GET" && method !== "HEAD";

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (isMutation && csrfToken) {
    finalHeaders["X-CSRF-Token"] = csrfToken;
  }

  const url = buildUrl(pathname, query);
  const r = await fetch(url, {
    ...rest,
    method,
    credentials: "include",
    headers: finalHeaders,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });

  if (r.status === 204) return undefined as T;

  const contentType = r.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (!r.ok) throw new ApiError(r.status, "non_json_error", await r.text());
    return undefined as T;
  }

  const data = (await r.json()) as { error?: { code: string; message: string; details?: unknown } };
  if (!r.ok) {
    const e = data.error ?? { code: "unknown", message: r.statusText };
    throw new ApiError(r.status, e.code, e.message, e.details);
  }
  return data as T;
}

function buildUrl(pathname: string, query?: Record<string, unknown>): string {
  if (!query) return pathname;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
